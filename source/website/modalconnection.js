import { WorkspaceDialog } from './modellibrary.js';
import { AgentError } from '../../mcp/common.js';

function ConnectionError (code, message) { return Object.assign (AgentError (code, message), { code, displayMessage : message }); }

// Static client messages: never render raw database/provider errors or credential responses.
const messages = {
    MODAL_PROFILE_MISSING : 'An administrator must select the server’s Modal profile.',
    MODAL_STORAGE_UNAVAILABLE : 'Modal credential storage is unavailable. Contact your administrator.',
    MODAL_INVALID_SETTINGS : 'Check the workspace, environment, app and Modal endpoint.',
    MODAL_TOKEN_TYPE : 'Enter the complete matching token pair for the selected purpose.',
    MODAL_CONFLICT : 'This connection changed. Close and reopen this dialog before making changes.',
    MODAL_NOT_CONFIGURED : 'Save an app connection first.',
    MODAL_AUTH_REJECTED : 'Modal rejected the saved app tokens. Check the pair and workspace.',
    MODAL_ENDPOINT_UNAVAILABLE : 'The Modal gateway is not available at this endpoint.',
    MODAL_NETWORK_FAILED : 'Auto3D’s server could not reach Modal. Check the network route and endpoint.',
    MODAL_TARGET_MISMATCH : 'The gateway’s workspace, environment or app does not match the saved connection.',
    MODAL_RESPONSE_INVALID : 'This endpoint did not return a supported Cloud 3D Studio response.'
};
function Account (website, owner, mutates)
{
    if (typeof window !== 'undefined' && !window.isSecureContext) { throw ConnectionError ('permission_required', 'Use HTTPS to manage Modal connections.'); }
    if (!owner || website.auth?.user?.id !== owner || website.auth.loggedOut || website.accountReady === false) { throw ConnectionError ('session_changed', 'Sign in again to manage Modal connections.'); }
    if (mutates && website.sessionEditor?.readOnly) { throw ConnectionError ('command_failed', 'Modal connection changes are unavailable in a read-only session.'); }
}
export async function ModalConnectionRequest (website, method = 'GET', body)
{
    const owner = website.auth?.user?.id; Account (website, owner, method !== 'GET' && method !== 'POST');
    let response;
    try {
        response = await fetch ('/api/connections/modal', {
            method, credentials : 'same-origin', cache : 'no-store', redirect : 'error', signal : AbortSignal.timeout (45000),
            headers : { 'X-Auto3D-Account' : owner, ...(body !== undefined ? { 'Content-Type' : 'application/json' } : {}) },
            ...(body !== undefined ? { body : JSON.stringify (body) } : {})
        });
    } catch { throw ConnectionError ('unavailable', 'The Auto3D connection service could not be reached.'); }
    Account (website, owner, false);
    let result; try { result = await response.json (); } catch { throw ConnectionError ('unavailable', 'Modal connection status is unavailable.'); }
    Account (website, owner, false);
    if (!response.ok) {
        const message = response.status === 403 ? 'Administrator access required.' : response.status === 401 ? 'Sign in again.' : messages[result?.code] || 'Modal connection service is unavailable.';
        throw ConnectionError (response.status === 403 ? 'permission_required' : response.status === 401 ? 'session_changed' : response.status === 409 ? 'conflict' : response.status === 400 ? 'invalid_arguments' : 'unavailable', message);
    }
    // Return only the public contract, even when the server mistakenly includes extra fields.
    const info = value => value ? { saved : value.saved === true, revision : value.revision ?? null, ...Object.fromEntries (['workspace', 'environment', 'app', 'endpoint'].filter (key => typeof value[key] === 'string').map (key => [key, value[key]])) } : { saved : false, revision : null };
    if (method === 'GET') { return { profile : result.profile, runtime : info (result.runtime), deployment : info (result.deployment) }; }
    if (method === 'POST') { return { connected : result.connected === true, profile : result.profile, workspace : result.workspace, environment : result.environment, app : result.app, version : result.version, conversionReady : result.conversionReady === true }; }
    return { profile : result.profile, purpose : result.purpose, ...info (result) };
}
export async function RemoveModalConnection (website, purpose)
{
    const status = await ModalConnectionRequest (website);
    return ModalConnectionRequest (website, 'DELETE', { purpose, revision : status[purpose]?.revision ?? null });
}
function Element (tag, text, parent)
{
    const element = document.createElement (tag); if (text) { element.textContent = text; } parent?.appendChild (element); return element;
}
export async function OpenModalConnection (website)
{
    const owner = website.auth?.user?.id; Account (website, owner, true);
    const admin = await website.accountAdmin.Refresh (); Account (website, owner, true);
    if (!admin.isAdmin) { throw ConnectionError ('permission_required', 'Administrator access required.'); }
    const dialog = WorkspaceDialog ('Modal connections'); dialog.setAttribute ('data-capture-private', '');
    const form = Element ('form', null, dialog); form.className = 'workspace_save_form'; form.autocomplete = 'off';
    Element ('p', 'Save each token pair once in encrypted Supabase Vault storage. Auto3D retrieves it on the server. Secrets are never shown again or included in projects.', form);
    const profile = Element ('p', 'Loading server profile…', form);
    const purposeLabel = Element ('label', 'Connection purpose', form), purpose = Element ('select', null, purposeLabel);
    purpose.setAttribute ('aria-label', 'Connection purpose');
    purpose.add (new Option ('App connection · wk- / ws-', 'runtime')); purpose.add (new Option ('Deployment · ak- / as-', 'deployment'));
    const inputs = {};
    for (const [key, labelText, type, value] of [['workspace', 'Modal workspace slug', 'text', ''], ['environment', 'Modal environment', 'text', 'main'], ['app', 'Modal app', 'text', 'cloud-3d-studio'], ['endpoint', 'Modal gateway URL', 'url', ''], ['tokenId', 'Modal token ID', 'password', ''], ['tokenSecret', 'Modal token secret', 'password', '']]) {
        const label = Element ('label', labelText, form), input = Element ('input', null, label);
        input.type = type; input.value = value; input.maxLength = key === 'endpoint' ? 256 : 512; input.required = true; input.spellcheck = false; input.autocomplete = type === 'password' ? 'new-password' : 'off'; input.setAttribute ('autocapitalize', 'none');
        if (key === 'app') { input.readOnly = true; } inputs[key] = input;
    }
    const note = Element ('p', '', form);
    const actions = Element ('div', null, form); actions.className = 'mode_buttons';
    const save = Element ('button', 'Save connection', actions); save.type = 'submit';
    const test = Element ('button', 'Test saved app connection', actions); test.type = 'button';
    const remove = Element ('button', 'Remove saved connection', actions); remove.type = 'button';
    const status = Element ('p', 'Loading connection…', form); status.setAttribute ('role', 'status');
    let closed = false, busy = false, state = null;
    const clear = () => { inputs.tokenId.value = ''; inputs.tokenSecret.value = ''; };
    const refresh = () => {
        for (const input of Object.values (inputs)) { input.disabled = busy || !state; }
        purpose.disabled = busy || !state;
        save.disabled = busy || !state || !inputs.tokenId.value || !inputs.tokenSecret.value;
        test.disabled = busy || !state?.runtime.saved || purpose.value !== 'runtime'; remove.disabled = busy || !state?.[purpose.value].saved;
    };
    const show = () => {
        clear ();
        const current = state?.[purpose.value];
        for (const key of ['workspace', 'environment', 'app', 'endpoint']) { inputs[key].value = current?.[key] || (key === 'environment' ? 'main' : key === 'app' ? 'cloud-3d-studio' : ''); }
        inputs.endpoint.parentElement.hidden = purpose.value !== 'runtime'; inputs.endpoint.required = purpose.value === 'runtime';
        inputs.endpoint.parentElement.style.display = purpose.value === 'runtime' ? '' : 'none';
        note.textContent = purpose.value === 'runtime' ? 'Use Web Function proxy tokens from the same workspace as this endpoint. Testing starts only the small status service; it does not run a CAD conversion.' : 'Use a deployment API token pair. Verification and deployment run through the Cloud 3D Studio Vault runner. Saving here does not deploy an app.';
        profile.textContent = state ? 'Server profile: ' + state.profile : 'Server profile unavailable';
        status.textContent = current?.saved ? 'A connection is saved. Enter both token fields to replace it.' : 'No connection saved for this purpose.';
        refresh ();
    };
    const run = async action => {
        if (closed || busy) { return; } busy = true; refresh ();
        try { Account (website, owner, true); await action (); }
        catch (error) { if (!closed && website.auth?.user?.id === owner) { status.textContent = error.displayMessage || 'Modal connection service is unavailable.'; } }
        finally { busy = false; if (!closed) { refresh (); } }
    };
    purpose.addEventListener ('change', show);
    inputs.tokenId.addEventListener ('input', refresh); inputs.tokenSecret.addEventListener ('input', refresh);
    form.addEventListener ('submit', event => {
        event.preventDefault (); if (save.disabled) { return; }
        const selected = purpose.value, settings = Object.fromEntries (Object.entries (inputs).map (([key, input]) => [key, key === 'endpoint' && selected === 'deployment' ? '' : input.value]));
        clear (); run (async () => {
            const result = await ModalConnectionRequest (website, 'PUT', { purpose : selected, revision : state[selected].revision, settings });
            if (closed) { return; } state[selected] = { ...result, ...Object.fromEntries (['workspace', 'environment', 'app', 'endpoint'].map (key => [key, settings[key]])) }; show ();
            status.textContent = 'Connection saved in Supabase Vault. ' + (selected === 'runtime' ? 'Test the saved app connection next.' : 'Use the Vault runner to verify the deployment tokens.');
        });
    });
    test.addEventListener ('click', () => run (async () => { status.textContent = 'Testing Auto3D server → Modal…'; const result = await ModalConnectionRequest (website, 'POST', {}); if (!closed) { status.textContent = result.connected ? 'Connected to ' + result.workspace + ' / ' + result.environment + '. ' + (result.conversionReady ? 'Native CAD verification passed. Convert CAD is ready.' : 'Native CAD verification is pending.') : 'Connection could not be verified.'; } }));
    remove.addEventListener ('click', () => { clear (); const selected = purpose.value; run (async () => { const result = await ModalConnectionRequest (website, 'DELETE', { purpose : selected, revision : state[selected].revision }); if (!closed) { state[selected] = result; show (); status.textContent = 'Saved connection removed. Revoke the token separately in Modal if needed.'; } }); });
    const unsubscribe = website.auth.Subscribe (() => { if (website.auth?.user?.id !== owner) { clear (); dialog.close (); } });
    dialog.addEventListener ('close', () => { closed = true; clear (); state = null; unsubscribe (); }, { once : true });
    refresh ();
    await run (async () => { const result = await ModalConnectionRequest (website); if (!closed) { state = result; show (); } });
    return { opened : !closed, interactive : true };
}
