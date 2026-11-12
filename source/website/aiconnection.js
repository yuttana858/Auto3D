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
    if (!response.ok) { throw new Error (response.status === 400 ? 'Enter a valid Meshy API key without spaces.' : response.status === 401 ? 'Sign in again to manage your Meshy key.' : response.status === 503 ? 'Secure Meshy key storage is unavailable. Contact your administrator.' : 'Could not update Meshy connection. Retry or contact your administrator.'); }
    let result;
    try { result = await response.json (); } catch { throw new Error ('Meshy connection status is unavailable.'); }
    Account (website, owner, false);
    return { saved : result.saved === true, ...(typeof result.available === 'boolean' ? { available : result.available } : {}) };
}
// Organization key used by every account without a personal key. Any account can read whether it is saved;
// saving and removal are administrator-only on the server. The key is never returned.
export async function SharedMeshyCredentialRequest (website, method = 'GET', key)
{
    const owner = website.auth?.user?.id; Account (website, owner, method !== 'GET');
    const response = await fetch ('/api/ai/shared-credential', {
        method, credentials : 'same-origin', cache : 'no-store', redirect : 'error', signal : AbortSignal.timeout (15000),
        headers : { 'X-Auto3D-Account' : owner, ...(method === 'PUT' ? { 'Content-Type' : 'application/json' } : {}) },
        ...(method === 'PUT' ? { body : JSON.stringify ({ key }) } : {})
    });
    Account (website, owner, false);
    if (!response.ok) { throw new Error (response.status === 400 ? 'Enter a valid Meshy API key without spaces.' : response.status === 403 ? 'Only an administrator can change the shared Meshy key.' : response.status === 401 ? 'Sign in again to manage the shared Meshy key.' : response.status === 503 ? 'Secure Meshy key storage is unavailable. Contact your administrator.' : 'Could not update the shared Meshy key. Retry shortly.'); }
    let result;
    try { result = await response.json (); } catch { throw new Error ('Shared Meshy key status is unavailable.'); }
    Account (website, owner, false);
    return { saved : result.saved === true, ...(typeof result.available === 'boolean' ? { available : result.available } : {}) };
}
function SharedKeySection (website, owner, isClosed)
{
    const section = document.createElement ('section'); section.className = 'ai_shared_key_section'; section.hidden = true;
    const heading = document.createElement ('strong'); heading.textContent = 'Shared key for all accounts (administrator)';
    const note = document.createElement ('p'); note.textContent = 'Every signed-in account without its own key generates with this key and its credits, up to 20 generations per account per hour. Each account sees only its own creations. The key is encrypted on the server and cannot be shown again.';
    const label = document.createElement ('label'); label.textContent = 'Shared Meshy API key';
    const input = document.createElement ('input'); input.type = 'password'; input.autocomplete = 'new-password'; input.spellcheck = false; input.maxLength = 512; input.setAttribute ('aria-label', 'Shared Meshy API key'); input.setAttribute ('autocapitalize', 'none'); label.appendChild (input);
    const actions = document.createElement ('div'); actions.className = 'mode_buttons';
    const save = document.createElement ('button'); save.type = 'button'; save.textContent = 'Save shared key';
    const remove = document.createElement ('button'); remove.type = 'button'; remove.textContent = 'Remove shared key';
    const status = document.createElement ('p'); status.setAttribute ('role', 'status');
    actions.append (save, remove); section.append (heading, note, label, actions, status);
    let busy = false, saved = false, available = false;
    const refresh = () => { input.disabled = busy; save.disabled = busy || !available || !input.value; remove.disabled = busy || !saved; };
    const run = async action => { if (busy || isClosed ()) { return; } busy = true; refresh (); try { Account (website, owner, true); await action (); } catch (error) { if (!isClosed ()) { status.textContent = error.message; } } finally { busy = false; if (!isClosed ()) { refresh (); } } };
    const apply = result => { saved = result.saved; if (result.available !== undefined) { available = result.available; } website.aiWorkspace.lastBalance = null; website.aiWorkspace.RefreshConnection (); refresh (); };
    input.addEventListener ('input', refresh);
    save.addEventListener ('click', () => { const key = input.value; input.value = ''; if (!key) { return; } run (async () => { const result = await SharedMeshyCredentialRequest (website, 'PUT', key); if (!isClosed ()) { apply (result); status.textContent = 'Shared key saved. Every account without its own key now uses it.'; } }); });
    remove.addEventListener ('click', () => { input.value = ''; run (async () => { const result = await SharedMeshyCredentialRequest (website, 'DELETE'); if (!isClosed ()) { apply (result); status.textContent = 'Shared key removed. Accounts without their own key can no longer generate.'; } }); });
    refresh ();
    // Show only to administrators; the server enforces the same check on every write.
    Promise.resolve (website.accountAdmin?.Refresh?.()).then (data => {
        if (isClosed () || !data?.isAdmin || website.auth?.user?.id !== owner) { return; }
        section.hidden = false; return run (async () => { const result = await SharedMeshyCredentialRequest (website); if (!isClosed ()) { apply (result); status.textContent = result.saved ? 'A shared key is saved. Enter a new key to replace it.' : 'No shared key saved.'; } });
    }).catch (() => {});
    return { section, clear : () => { input.value = ''; } };
}
export function OpenMeshyConnection (website)
{
    const owner = website.auth?.user?.id; Account (website, owner, true);
    const dialog = WorkspaceDialog ('Meshy connection'); dialog.setAttribute ('data-capture-private', '');
    const form = document.createElement ('form'); form.className = 'workspace_save_form'; form.autocomplete = 'off';
    const note = document.createElement ('p'); note.textContent = 'Optional: use your own Meshy credits instead of the shared organization key. Your key is encrypted on the server for your Auto3D account and is never included in saved projects. Removing it here does not revoke it at Meshy.';
    const label = document.createElement ('label'); label.textContent = 'Meshy API key';
    const input = document.createElement ('input'); input.type = 'password'; input.autocomplete = 'new-password'; input.spellcheck = false; input.maxLength = 512; input.setAttribute ('aria-label', 'Meshy API key'); input.setAttribute ('autocapitalize', 'none'); label.appendChild (input);
    const actions = document.createElement ('div'); actions.className = 'mode_buttons';
    const save = document.createElement ('button'); save.type = 'submit'; save.textContent = 'Save key';
    const testEntered = document.createElement ('button'); testEntered.type = 'button'; testEntered.textContent = 'Test entered key';
    const test = document.createElement ('button'); test.type = 'button'; test.textContent = 'Test saved connection';
    const remove = document.createElement ('button'); remove.type = 'button'; remove.textContent = 'Remove key';
    const status = document.createElement ('p'); status.setAttribute ('role', 'status'); status.textContent = 'Loading connection…';
    actions.append (save, testEntered, test, remove); form.append (note, label, actions, status); dialog.appendChild (form);
    let closed = false, busy = false, available = false, saved = false;
    const shared = SharedKeySection (website, owner, () => closed); dialog.appendChild (shared.section);
    const refresh = () => { input.disabled = busy; save.disabled = busy || !available || !input.value; testEntered.disabled = busy || !input.value; remove.disabled = busy || !saved; test.disabled = busy; };
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
    remove.addEventListener ('click', () => { input.value = ''; run (async () => { const result = await MeshyCredentialRequest (website, 'DELETE'); if (!closed) { apply (result); status.textContent = 'Your saved key was removed. The shared organization key is used when one is saved.'; } }); });
    testEntered.addEventListener ('click', () => { const key = input.value; if (!key) { return; } run (async () => {
        status.textContent = 'Testing entered key without saving…'; Account (website, owner, true);
        const response = await fetch ('/api/ai/credential-test', { method : 'POST', credentials : 'same-origin', cache : 'no-store', redirect : 'error', signal : AbortSignal.timeout (20000), headers : { 'Content-Type' : 'application/json', 'X-Auto3D-Account' : owner }, body : JSON.stringify ({ key }) });
        Account (website, owner, false); if (!response.ok) { throw new Error (response.status === 401 || response.status === 403 ? 'Meshy rejected this key. Check the key and any Meshy IP restrictions.' : response.status === 429 ? 'Meshy is rate limiting requests. Try again later.' : response.status === 400 ? 'Enter a valid Meshy API key without spaces.' : 'Could not test this Meshy key. Try again shortly.'); }
        let result; try { result = await response.json (); } catch { throw new Error ('Could not verify the Meshy response.'); } Account (website, owner, false); if (result?.valid !== true) { throw new Error ('Could not verify the Meshy response.'); }
        if (!closed) { status.textContent = 'Meshy accepted the entered key. Save it to use it in Auto3D.'; }
    }); });
    test.addEventListener ('click', () => run (async () => {
        status.textContent = 'Testing saved connection…';
        try { const result = await website.aiWorkspace.TestConnection (); if (!closed) { status.textContent = Number.isFinite (result.balance) ? 'Connected · ' + result.balance + ' credits available.' : 'Connection succeeded.'; } }
        catch (error) {
            const messages = { MESHY_KEY_MISSING : 'No Meshy key is configured. Save your key above and test again.', MESHY_KEY_REJECTED : 'Meshy rejected the saved key. Check the key and any Meshy IP restrictions.', MESHY_STORAGE_UNAVAILABLE : 'Secure Meshy key storage is unavailable. Contact your administrator.', MESHY_REQUEST_FAILED : 'Could not reach Meshy. Try again shortly.' };
            throw new Error (messages[error.code] || 'Meshy connection failed. Check your saved key and try again.');
        }
    }));
    const unsubscribe = website.auth.Subscribe (() => { if (website.auth?.user?.id !== owner) { input.value = ''; shared.clear (); dialog.close (); } });
    dialog.addEventListener ('close', () => { closed = true; input.value = ''; shared.clear (); unsubscribe (); }, { once : true });
    refresh ();
    run (async () => { const result = await MeshyCredentialRequest (website); if (!closed) { apply (result); status.textContent = result.saved ? 'A key is saved for your account. Enter a new key to replace it.' : result.available ? 'No personal key saved. You can generate with the shared organization key when an administrator has saved one.' : 'Personal key storage needs administrator setup.'; } });
    return { opened : true, interactive : true };
}
