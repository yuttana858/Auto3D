import { WorkspaceDialog } from './modellibrary.js';

function Account (website, owner, mutates)
{
    if (typeof window !== 'undefined' && !window.isSecureContext) { throw new Error ('Use HTTPS to manage your Meshy key.'); }
    if (!owner || website.auth?.user?.id !== owner || website.auth.loggedOut || website.accountReady === false) { throw new Error ('Account changed. Reopen AI connections.'); }
    if (mutates && website.sessionEditor?.readOnly) { throw new Error ('Meshy key changes are unavailable in a read-only session.'); }
}
export async function MeshyCredentialRequest (website, method = 'GET', key)
{
    const owner = website.auth?.user?.id; Account (website, owner, method !== 'GET');
    const response = await fetch ('/api/ai/credentials', {
        method, credentials : 'same-origin', cache : 'no-store', redirect : 'error', signal : AbortSignal.timeout (15000),
        headers : { 'X-Auto3D-Account' : owner, ...(method === 'PUT' ? { 'Content-Type' : 'application/json' } : {}) },
        ...(method === 'PUT' ? { body : JSON.stringify ({ key }) } : {})
    });
    Account (website, owner, false);
    // Deliberately ignore response error text: credentials must never appear in logs/UI.
    if (!response.ok) { throw new Error (response.status === 400 ? 'Enter a valid Meshy API key without spaces.' : response.status === 401 ? 'Sign in again to manage your Meshy key.' : 'Could not update Meshy connection. Retry or contact your administrator.'); }
    let result;
    try { result = await response.json (); } catch { throw new Error ('Meshy connection status is unavailable.'); }
    Account (website, owner, false);
    return { saved : result.saved === true, ...(typeof result.available === 'boolean' ? { available : result.available } : {}) };
}
export function OpenMeshyConnection (website)
{
    const owner = website.auth?.user?.id; Account (website, owner, true);
    const dialog = WorkspaceDialog ('Meshy connection'); dialog.setAttribute ('data-capture-private', '');
    const form = document.createElement ('form'); form.className = 'workspace_save_form'; form.autocomplete = 'off';
    const note = document.createElement ('p'); note.textContent = 'Use your own Meshy credits. Your key is encrypted on the server for your Auto3D account and is never included in saved projects. Removing it here does not revoke it at Meshy.';
    const label = document.createElement ('label'); label.textContent = 'Meshy API key';
    const input = document.createElement ('input'); input.type = 'password'; input.autocomplete = 'new-password'; input.spellcheck = false; input.maxLength = 512; input.setAttribute ('aria-label', 'Meshy API key'); input.setAttribute ('autocapitalize', 'none'); label.appendChild (input);
    const actions = document.createElement ('div'); actions.className = 'mode_buttons';
    const save = document.createElement ('button'); save.type = 'submit'; save.textContent = 'Save key';
    const test = document.createElement ('button'); test.type = 'button'; test.textContent = 'Test saved connection';
    const remove = document.createElement ('button'); remove.type = 'button'; remove.textContent = 'Remove key';
    const status = document.createElement ('p'); status.setAttribute ('role', 'status'); status.textContent = 'Loading connection…';
    actions.append (save, test, remove); form.append (note, label, actions, status); dialog.appendChild (form);
    let closed = false, busy = false, available = false, saved = false;
    const refresh = () => { input.disabled = busy || !available; save.disabled = busy || !available || !input.value; remove.disabled = busy || !saved; test.disabled = busy; };
    const apply = result => { saved = result.saved; if (result.available !== undefined) { available = result.available; } website.aiWorkspace.lastBalance = null; website.aiWorkspace.RefreshConnection (); refresh (); };
    const run = async action => {
        if (busy || closed) { return; } busy = true; refresh ();
        try { Account (website, owner, true); await action (); }
        catch (error) { if (!closed && website.auth?.user?.id === owner) { status.textContent = error.message; } }
        finally { busy = false; if (!closed) { refresh (); } }
    };
    input.addEventListener ('input', refresh);
    form.addEventListener ('submit', event => {
        event.preventDefault (); if (busy || !available || !input.value) { return; }
        const key = input.value; input.value = '';
        run (async () => { const result = await MeshyCredentialRequest (website, 'PUT', key); if (!closed) { apply (result); status.textContent = 'Key saved. Test the saved connection to check it with Meshy.'; } });
    });
    remove.addEventListener ('click', () => { input.value = ''; run (async () => { const result = await MeshyCredentialRequest (website, 'DELETE'); if (!closed) { apply (result); status.textContent = 'Your saved key was removed. An administrator connection may still be available.'; } }); });
    test.addEventListener ('click', () => run (async () => {
        status.textContent = 'Testing saved connection…';
        try { const result = await website.aiWorkspace.TestConnection (); if (!closed) { status.textContent = Number.isFinite (result.balance) ? 'Connected · ' + result.balance + ' credits available.' : 'Connection succeeded.'; } }
        catch { throw new Error ('Meshy connection failed. Check your saved key and try again.'); }
    }));
    const unsubscribe = website.auth.Subscribe (() => { if (website.auth?.user?.id !== owner) { input.value = ''; dialog.close (); } });
    dialog.addEventListener ('close', () => { closed = true; input.value = ''; unsubscribe (); }, { once : true });
    refresh ();
    run (async () => { const result = await MeshyCredentialRequest (website); if (!closed) { apply (result); status.textContent = result.saved ? 'A key is saved for your account. Enter a new key to replace it.' : result.available ? 'No personal key saved.' : 'Personal key storage needs administrator setup.'; } });
    return { opened : true, interactive : true };
}
