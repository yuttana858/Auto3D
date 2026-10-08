import { WorkspaceDialog } from './modellibrary.js';

function Element (tag, text, parent)
{
    const element = document.createElement (tag); if (text) { element.textContent = text; } parent?.appendChild (element); return element;
}

export class AccountAdmin
{
    constructor (auth)
    {
        this.auth = auth; this.isAdmin = false; this.dialog = null;
        auth.Subscribe (() => { this.isAdmin = false; if (this.dialog?.isConnected) { this.dialog.close (); } this.Refresh ().catch (() => {}); });
    }
    async Request (action, body)
    {
        const response = await fetch ('/api/accounts/' + action, { method : body ? 'POST' : 'GET', credentials : 'same-origin', headers : { 'Content-Type' : 'application/json' }, ...(body ? { body : JSON.stringify (body) } : {}) });
        const data = await response.json ();
        if (!response.ok) { throw Object.assign (new Error (data.error || 'Account service unavailable.'), { status : response.status }); }
        return data;
    }
    async Refresh ()
    {
        if (!this.auth.user) { this.isAdmin = false; return { isAdmin : false, requests : [] }; }
        const id = this.auth.user.id;
        try { const data = await this.Request ('admin'); if (this.auth.user?.id !== id) { return { isAdmin : false, requests : [] }; } this.isAdmin = data.isAdmin; return data; }
        catch (error) { this.isAdmin = false; if ([401, 403].includes (error.status)) { return { isAdmin : false, requests : [] }; } throw error; }
    }
    Review (id, decision, password) { return this.Request ('review', { id, decision, ...(password ? { password } : {}) }); }
    OpenRequest ()
    {
        const dialog = WorkspaceDialog ('Request an Auto3D account');
        const form = Element ('form', null, dialog); form.className = 'workspace_save_form';
        const fields = {};
        for (const [key, title, max] of [['name', 'Name', 100], ['email', 'Email', 254], ['reason', 'Reason for access', 1000]]) {
            const label = Element ('label', title, form); const input = Element (key === 'reason' ? 'textarea' : 'input', null, label);
            if (key !== 'reason') { input.type = key === 'email' ? 'email' : 'text'; input.required = true; }
            input.maxLength = max; fields[key] = input;
        }
        const submit = Element ('button', 'Submit account request', form); submit.type = 'submit';
        const status = Element ('p', 'Requests require administrator approval. No account is created until approved.', form); status.setAttribute ('role', 'status');
        form.addEventListener ('submit', async (event) => {
            event.preventDefault (); if (submit.disabled) { return; } submit.disabled = true;
            try { const data = await this.Request ('request', Object.fromEntries (Object.entries (fields).map (([key, input]) => [key, input.value]))); status.textContent = data.message; for (const input of Object.values (fields)) { input.disabled = true; } }
            catch (error) { status.textContent = error.message; submit.disabled = false; }
        });
        return { opened : true };
    }
    async Open (requestId = null)
    {
        const data = await this.Refresh ();
        if (!data.isAdmin) { throw new Error ('Sign in with an approved administrator account.'); }
        if (this.dialog?.isConnected) { this.dialog.focus (); return { opened : true }; }
        const dialog = WorkspaceDialog ('Account administration'); this.dialog = dialog;
        const status = Element ('p', 'Approve or reject account requests. Share initial passwords through your secure process.', dialog); status.setAttribute ('role', 'status');
        const dashboard = Element ('a', 'Supabase user administration', dialog); dashboard.href = 'https://supabase.com/dashboard/project/iesepcoxqochycckbwoh/auth/users'; dashboard.target = '_blank'; dashboard.rel = 'noopener noreferrer';
        const refresh = Element ('button', 'Refresh requests', dialog);
        const list = Element ('div', null, dialog); list.className = 'account_request_list';
        const render = (requests) => {
            list.replaceChildren ();
            if (!requests.length) { Element ('p', 'No account requests yet.', list); }
            for (const request of requests) {
                const row = Element ('section', null, list); row.className = 'account_request_row';
                Element ('strong', request.name + ' · ' + request.email, row);
                Element ('p', request.reason || 'No reason supplied.', row);
                Element ('p', 'Status: ' + request.status, row);
                if (request.status !== 'pending') { continue; }
                const label = Element ('label', 'Initial password', row); const password = Element ('input', null, label); password.type = 'password'; password.autocomplete = 'new-password'; password.minLength = 12; password.maxLength = 1024;
                const approve = Element ('button', 'Approve account', row); const reject = Element ('button', 'Reject request', row);
                const review = async (decision) => {
                    if (approve.disabled) { return; }
                    if (decision === 'approve' && password.value.length < 12) { status.textContent = 'Enter an initial password of at least 12 characters.'; password.focus (); return; }
                    approve.disabled = reject.disabled = true;
                    try { const result = await this.Review (request.id, decision, decision === 'approve' ? password.value : null); status.textContent = result.message || 'Request rejected.'; password.value = ''; render ((await this.Refresh ()).requests); }
                    catch (error) { status.textContent = error.message; password.value = ''; approve.disabled = reject.disabled = false; }
                };
                approve.addEventListener ('click', () => review ('approve')); reject.addEventListener ('click', () => review ('reject'));
            }
        };
        refresh.addEventListener ('click', async () => { refresh.disabled = true; try { render ((await this.Refresh ()).requests); } catch (error) { status.textContent = error.message; } finally { refresh.disabled = false; } });
        dialog.addEventListener ('close', () => { list.querySelectorAll ('input').forEach ((input) => { input.value = ''; }); this.dialog = null; }, { once : true });
        render (requestId ? data.requests.filter ((request) => request.id === requestId) : data.requests); return { opened : true };
    }
}
