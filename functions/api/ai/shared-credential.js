import { CredentialReady, SharedCredentialPath, StoreSharedMeshyKey } from '../../_lib/aicredentials.js';
import { LimitedBody, Reply } from '../../_lib/accountstorage.js';
import { RequireAdmin } from '../../_lib/accounts.js';

// Organization Meshy key: any signed-in account can see whether one is saved; only administrators can save or remove it.
// The key is encrypted in the private credentials bucket and is never returned.
export async function onRequest (context)
{
    const { request, env, data } = context;
    if (!data?.user?.id) { return Reply ({ error : 'Sign in to use Meshy.' }, 401); }
    if (request.headers.get ('X-Auto3D-Account') !== data.user.id) { return Reply ({ error : 'Account changed. Reopen AI connections.' }, 409); }
    if (!['GET', 'PUT', 'DELETE'].includes (request.method)) { return Reply ({ error : 'Method not allowed.' }, 405); }
    const bucket = env.AUTO3D_AI_CREDENTIALS_R2;
    try {
        if (request.method === 'GET') { return Reply ({ saved : bucket ? !!await bucket.head (SharedCredentialPath) : false, available : CredentialReady (env) }); }
        if (request.headers.get ('Origin') !== new URL (request.url).origin) { return Reply ({ error : 'Requests must come from Auto3D.' }, 403); }
        const admin = await RequireAdmin (context);
        if (admin.id !== data.user.id) { return Reply ({ error : 'Account changed. Reopen AI connections.' }, 409); }
        if (!bucket) { return Reply ({ error : 'Secure Meshy key storage is unavailable.' }, 503); }
        if (request.method === 'DELETE') { await bucket.delete (SharedCredentialPath); return Reply ({ saved : false }); }
        if (!CredentialReady (env)) { return Reply ({ error : 'Secure Meshy key storage is unavailable.' }, 503); }
        if (!(request.headers.get ('Content-Type') || '').startsWith ('application/json')) { return Reply ({ error : 'Use a JSON request.' }, 415); }
        let body;
        try { body = JSON.parse (await (await LimitedBody (request, 2048)).text ()); }
        catch (error) { return Reply ({ error : 'Invalid Meshy key request.' }, error.status === 413 ? 413 : 400); }
        if (!body || Array.isArray (body) || Object.keys (body).length !== 1 || !Object.hasOwn (body, 'key')) { return Reply ({ error : 'Only a Meshy key is accepted.' }, 400); }
        await StoreSharedMeshyKey (env, body.key);
        return Reply ({ saved : true });
    } catch (error) {
        // Never log request bodies, encryption errors or provider credentials.
        if (error.status === 401 || error.status === 403) { return Reply ({ error : error.status === 403 ? 'Administrator access required.' : 'Sign in again.' }, error.status); }
        return Reply ({ error : error.status === 400 ? 'Enter a valid Meshy API key without spaces.' : 'Secure Meshy key storage is unavailable.' }, error.status === 400 ? 400 : 503);
    }
}
