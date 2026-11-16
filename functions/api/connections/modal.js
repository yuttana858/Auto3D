import { RequireAdmin } from '../../_lib/accounts.js';
import { JsonBody, Reply } from '../../_lib/accountstorage.js';
import { ModalMessages, ModalFailure, ModalProfile, ModalPurpose, ModalRevision, ModalVault, ReadModalConnection, ModalConnectionStatus, ValidateModalSettings, TestModalConnection } from '../../_lib/modalconnection.js';

export async function onRequest (context)
{
    const { request, env, data } = context;
    if (!data?.user?.id) { return Reply ({ error : 'Sign in to manage Modal connections.', code : 'unauthenticated' }, 401); }
    if (request.headers.get ('X-Auto3D-Account') !== data.user.id) { return Reply ({ error : 'Account changed. Reopen Modal connections.', code : 'conflict' }, 409); }
    if (!['GET', 'PUT', 'POST', 'DELETE'].includes (request.method)) { return Reply ({ error : 'Method not allowed.', code : 'invalid_request' }, 405); }
    if (request.method !== 'GET' && request.headers.get ('Origin') !== new URL (request.url).origin) { return Reply ({ error : 'Requests must come from Auto3D.', code : 'forbidden' }, 403); }
    try {
        const admin = await RequireAdmin (context);
        if (admin.id !== data.user.id) { return Reply ({ error : 'Account changed. Reopen Modal connections.', code : 'conflict' }, 409); }
        const profile = ModalProfile (env);
        if (request.method === 'GET') {
            const records = await Promise.all (['runtime', 'deployment'].map (purpose => ReadModalConnection (env, purpose)));
            return Reply ({ profile, runtime : ModalConnectionStatus (records[0]), deployment : ModalConnectionStatus (records[1]) });
        }
        if (!(request.headers.get ('Content-Type') || '').startsWith ('application/json')) { return Reply ({ error : 'Use a JSON request.', code : 'invalid_request' }, 415); }
        let body;
        try { body = await JsonBody (request, 8192); }
        catch (error) { return Reply ({ error : 'Invalid Modal connection request.', code : 'invalid_request' }, error.status === 413 ? 413 : 400); }
        const allowed = request.method === 'PUT' ? ['purpose', 'revision', 'settings'] : request.method === 'DELETE' ? ['purpose', 'revision'] : [];
        if (!body || Array.isArray (body) || Object.keys (body).length !== allowed.length || Object.keys (body).some (key => !allowed.includes (key))) { throw ModalFailure ('MODAL_INVALID_SETTINGS', 400); }
        if (request.method === 'POST') { return Reply (await TestModalConnection (env)); }
        const purpose = ModalPurpose (body.purpose), revision = ModalRevision (body.revision);
        if (request.method === 'DELETE') {
            await ModalVault (env, 'delete', purpose, { p_expected_revision : revision });
            return Reply ({ profile, purpose, saved : false, revision : null });
        }
        const settings = ValidateModalSettings (body.settings, purpose);
        const result = await ModalVault (env, 'save', purpose, { p_expected_revision : revision, p_settings : settings, p_actor : admin.id });
        return Reply ({ profile, purpose, saved : true, revision : ModalRevision (result.revision) });
    } catch (error) {
        if ([401, 403].includes (error.status)) { return Reply ({ error : error.status === 403 ? 'Administrator access required.' : 'Sign in again.', code : error.status === 403 ? 'forbidden' : 'unauthenticated' }, error.status); }
        const code = Object.hasOwn (ModalMessages, error.code || '') ? error.code : 'MODAL_STORAGE_UNAVAILABLE';
        return Reply ({ error : ModalMessages[code], code }, [400, 409, 502, 503].includes (error.status) ? error.status : 503);
    }
}
