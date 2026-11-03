import { CredentialPath, CredentialReady, StoreMeshyKey } from '../../_lib/aicredentials.js';
import { LimitedBody, Reply } from '../../_lib/accountstorage.js';

export async function onRequest ({ request, env, data })
{
    if (!data?.user?.id) { return Reply ({ error : 'Sign in to manage your Meshy key.' }, 401); }
    const owner = data.user.id;
    if (request.headers.get ('X-Auto3D-Account') !== owner) { return Reply ({ error : 'Account changed. Reopen AI connections.' }, 409); }
    if (!['GET', 'PUT', 'DELETE'].includes (request.method)) { return Reply ({ error : 'Method not allowed.' }, 405); }
    if (request.method !== 'GET' && request.headers.get ('Origin') !== new URL (request.url).origin) { return Reply ({ error : 'Requests must come from Auto3D.' }, 403); }
    try {
        const path = CredentialPath (owner), bucket = env.AUTO3D_AI_CREDENTIALS_R2;
        if (request.method === 'GET') {
            const saved = bucket ? !!await bucket.head (path) : false;
            return Reply ({ saved, available : CredentialReady (env) });
        }
        if (!bucket) { return Reply ({ error : 'Secure Meshy key storage is unavailable.' }, 503); }
        if (request.method === 'DELETE') { await bucket.delete (path); return Reply ({ saved : false }); }
        if (!CredentialReady (env)) { return Reply ({ error : 'Secure Meshy key storage is unavailable.' }, 503); }
        if (!(request.headers.get ('Content-Type') || '').startsWith ('application/json')) { return Reply ({ error : 'Use a JSON request.' }, 415); }
        let body;
        try { body = JSON.parse (await (await LimitedBody (request, 2048)).text ()); }
        catch (error) { return Reply ({ error : 'Invalid Meshy key request.' }, error.status === 413 ? 413 : 400); }
        if (!body || Array.isArray (body) || Object.keys (body).length !== 1 || !Object.hasOwn (body, 'key')) { return Reply ({ error : 'Only a Meshy key is accepted.' }, 400); }
        await StoreMeshyKey (env, owner, body.key);
        return Reply ({ saved : true });
    } catch (error) {
        // Never log request bodies, encryption errors or provider credentials.
        return Reply ({ error : error.status === 400 ? 'Enter a valid Meshy API key without spaces.' : 'Secure Meshy key storage is unavailable.' }, error.status === 400 ? 400 : 503);
    }
}
