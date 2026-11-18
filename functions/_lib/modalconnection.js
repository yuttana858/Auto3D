import { SupabaseConfig, SupabaseHeaders, RequireServerKey } from './supabase.js';
import { LimitedBody } from './accountstorage.js';

// These messages are the entire public error vocabulary. Never forward Vault/provider text.
export const ModalMessages = Object.freeze ({
    MODAL_PROFILE_MISSING : 'The server needs an explicit production or preview Modal profile.',
    MODAL_STORAGE_UNAVAILABLE : 'The Modal credential vault is unavailable. Contact your administrator.',
    MODAL_INVALID_SETTINGS : 'Check the workspace, environment, app and Modal endpoint.',
    MODAL_TOKEN_TYPE : 'Use wk-/ws- tokens for app connections, or ak-/as- tokens for deployment. Enter the complete matching pair.',
    MODAL_CONFLICT : 'This connection changed. Reopen Modal connections before saving or removing it.',
    MODAL_NOT_CONFIGURED : 'No app connection is saved for this server profile.',
    MODAL_AUTH_REJECTED : 'Modal rejected the app connection tokens. Check the pair and workspace.',
    MODAL_ENDPOINT_UNAVAILABLE : 'The Modal endpoint is unavailable. Check that the gateway is deployed.',
    MODAL_NETWORK_FAILED : 'Auto3D could not reach Modal. Check the server network route and endpoint.',
    MODAL_TARGET_MISMATCH : 'The gateway does not match the saved workspace, environment or app.',
    MODAL_RESPONSE_INVALID : 'The endpoint did not return a supported Cloud 3D Studio connection response.',
    MODAL_DEPLOYMENT_CHECK_REQUIRED : 'Deployment tokens are saved. Verify them with the Cloud 3D Studio Vault runner.'
});
export function ModalFailure (code, status = 503) { return Object.assign (new Error (ModalMessages[code]), { code, status }); }
export function ModalProfile (env)
{
    const profile = env.AUTO3D_MODAL_PROFILE;
    if (!['production', 'preview'].includes (profile) || env.CF_PAGES_BRANCH === 'main' && profile !== 'production' || env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== 'main' && profile !== 'preview') { throw ModalFailure ('MODAL_PROFILE_MISSING'); }
    return profile;
}
export function ModalPurpose (purpose)
{
    if (!['runtime', 'deployment'].includes (purpose)) { throw ModalFailure ('MODAL_INVALID_SETTINGS', 400); }
    return purpose;
}
export function ValidateModalSettings (settings, purpose)
{
    ModalPurpose (purpose);
    const allowed = ['workspace', 'environment', 'app', 'endpoint', 'tokenId', 'tokenSecret'];
    const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,62}$/.test (value);
    if (!settings || Array.isArray (settings) || Object.keys (settings).some (key => !allowed.includes (key)) || !slug (settings.workspace) || !slug (settings.environment) || settings.app !== 'cloud-3d-studio') { throw ModalFailure ('MODAL_INVALID_SETTINGS', 400); }
    if (purpose === 'runtime') {
        // Provider HTTPS origin: workspace/function label, optional region, no URL credentials or path.
        if (typeof settings.endpoint !== 'string' || !/^https:\/\/[a-z0-9][a-z0-9-]{0,190}(?:\.[a-z0-9][a-z0-9-]{0,62})?\.modal\.run$/.test (settings.endpoint) || !new RegExp ('^' + settings.workspace + '(--|-[a-z0-9-]+--)').test (new URL (settings.endpoint).hostname)) { throw ModalFailure ('MODAL_INVALID_SETTINGS', 400); }
    } else if (settings.endpoint !== '') { throw ModalFailure ('MODAL_INVALID_SETTINGS', 400); }
    const [id, secret] = purpose === 'runtime' ? ['wk-', 'ws-'] : ['ak-', 'as-'];
    const token = (value, prefix) => typeof value === 'string' && value.length <= 512 && new RegExp ('^' + prefix + '[A-Za-z0-9_-]{8,509}$').test (value);
    if (!token (settings.tokenId, id) || !token (settings.tokenSecret, secret)) { throw ModalFailure ('MODAL_TOKEN_TYPE', 400); }
    return Object.fromEntries (allowed.map (key => [key, settings[key]]));
}
const revisionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function ModalRevision (value)
{
    if (value !== null && (typeof value !== 'string' || !revisionPattern.test (value))) { throw ModalFailure ('MODAL_INVALID_SETTINGS', 400); }
    return value;
}
export async function ModalVault (env, action, purpose, extra = {})
{
    const profile = ModalProfile (env); ModalPurpose (purpose);
    try {
        const { url, key } = SupabaseConfig (env); RequireServerKey (key);
        const response = await fetch (url + '/rest/v1/rpc/auto3d_modal_connection_' + action, {
            method : 'POST', redirect : 'manual', signal : AbortSignal.timeout (15000),
            headers : { ...SupabaseHeaders (key), 'Content-Type' : 'application/json' },
            body : JSON.stringify ({ p_profile : profile, p_purpose : purpose, ...extra })
        });
        if (response.status === 409) { throw ModalFailure ('MODAL_CONFLICT', 409); }
        if (!response.ok) { throw ModalFailure ('MODAL_STORAGE_UNAVAILABLE'); }
        return JSON.parse (await (await LimitedBody (response, 16384)).text ());
    } catch (error) {
        if (error.code === 'MODAL_CONFLICT') { throw error; }
        throw ModalFailure ('MODAL_STORAGE_UNAVAILABLE');
    }
}
export async function ReadModalConnection (env, purpose)
{
    const record = await ModalVault (env, 'read', purpose);
    if (record === null) { return null; }
    try { if (record.schema !== 1 || record.profile !== ModalProfile (env) || record.purpose !== purpose || typeof record.revision !== 'string') { throw new Error (); } return { ...ValidateModalSettings (record.settings, purpose), revision : ModalRevision (record.revision) }; }
    catch { throw ModalFailure ('MODAL_STORAGE_UNAVAILABLE'); }
}
export function ModalConnectionStatus (record)
{
    if (!record) { return { saved : false, revision : null }; }
    return { saved : true, revision : record.revision, workspace : record.workspace, environment : record.environment, app : record.app, endpoint : record.endpoint };
}
// Callers must first authorize the account/job. Only fixed operations reach the saved server target.
export async function ModalRequest (record, path, body)
{
    if (!['/connection', '/jobs', '/cancel'].includes (path)) { throw ModalFailure ('MODAL_INVALID_SETTINGS', 400); }
    let response;
    try {
        response = await fetch (record.endpoint + path, {
            method : path === '/connection' ? 'GET' : 'POST', redirect : 'manual', signal : AbortSignal.timeout (20000),
            headers : { 'Modal-Key' : record.tokenId, 'Modal-Secret' : record.tokenSecret, Accept : 'application/json', ...(body ? { 'Content-Type' : 'application/json' } : {}) },
            body : body ? JSON.stringify (body) : undefined
        });
    } catch { throw ModalFailure ('MODAL_NETWORK_FAILED', 502); }
    if ([401, 403].includes (response.status)) { throw ModalFailure ('MODAL_AUTH_REJECTED', 502); }
    if (response.status === 404 || response.status === 503) { throw ModalFailure ('MODAL_ENDPOINT_UNAVAILABLE', 502); }
    if (!response.ok) { throw ModalFailure ('MODAL_NETWORK_FAILED', 502); }
    let result;
    try { result = JSON.parse (await (await LimitedBody (response, 16384)).text ()); }
    catch { throw ModalFailure ('MODAL_RESPONSE_INVALID', 502); }
    return result;
}
export async function TestModalConnection (env)
{
    const record = await ReadModalConnection (env, 'runtime');
    if (!record) { throw ModalFailure ('MODAL_NOT_CONFIGURED', 409); }
    const result = await ModalRequest (record, '/connection');
    if (result?.service !== 'cloud-3d-studio' || result.protocol !== 1 || typeof result.version !== 'string' || !/^\d+\.\d+\.\d+$/.test (result.version) || typeof result.conversionReady !== 'boolean' || result.conversionReady === true && result.jobApiVersion !== 1) { throw ModalFailure ('MODAL_RESPONSE_INVALID', 502); }
    if (['workspace', 'environment', 'app'].some (key => result[key] !== record[key])) { throw ModalFailure ('MODAL_TARGET_MISMATCH', 502); }
    // Explicit allowlist: a provider cannot inject secrets or arbitrary text into the UI/agent log.
    return { connected : true, profile : ModalProfile (env), workspace : record.workspace, environment : record.environment, app : record.app, version : result.version, conversionReady : result.conversionReady, ...(result.jobApiVersion === 1 ? { jobApiVersion : 1 } : {}), ...(result.diagnosticApiVersion === 1 ? { diagnosticApiVersion : 1 } : {}), ...(result.appearanceApiVersion === 1 ? { appearanceApiVersion : 1 } : {}) };
}
