import { LimitedBody, Reply } from '../../_lib/accountstorage.js';
import { ValidateMeshyKey } from '../../_lib/aicredentials.js';

// Tests an entered key without persisting it or exposing provider responses.
export async function onRequest ({ request, data })
{
    if (request.method !== 'POST') { return Reply ({ error : 'Method not allowed.' }, 405); }
    if (!data?.user?.id) { return Reply ({ error : 'Sign in to test your Meshy key.' }, 401); }
    if (request.headers.get ('X-Auto3D-Account') !== data.user.id) { return Reply ({ error : 'Account changed.' }, 409); }
    if (request.headers.get ('Origin') !== new URL (request.url).origin) { return Reply ({ error : 'Requests must come from Auto3D.' }, 403); }
    if (!/^application\/json(?:\s*;|$)/i.test (request.headers.get ('Content-Type') || '')) { return Reply ({ error : 'Use a JSON request.' }, 415); }
    try {
        const body = JSON.parse (await (await LimitedBody (request, 2048)).text ());
        if (!body || Array.isArray (body) || Object.keys (body).length !== 1 || !Object.hasOwn (body, 'key')) { return Reply ({ error : 'Invalid key request.' }, 400); }
        const key = ValidateMeshyKey (body.key);
        const result = await fetch ('https://api.meshy.ai/openapi/v1/balance', { headers : { Authorization : 'Bearer ' + key }, redirect : 'manual', signal : AbortSignal.timeout (15000) });
        await result.body?.cancel ();
        // Workers do not support redirect: 'error'; a redirect is refused rather than followed with the key.
        if (result.status >= 300 && result.status < 400 || result.type === 'opaqueredirect') { return Reply ({ error : 'Meshy could not verify the key. Try again later.', code : 'MESHY_REQUEST_FAILED' }, 502); }
        if (result.status === 401 || result.status === 403) { return Reply ({ error : 'Meshy rejected this key. Check the key and any Meshy IP restrictions.', code : 'MESHY_KEY_REJECTED' }, result.status); }
        if (result.status === 429) { return Reply ({ error : 'Meshy is rate limiting requests. Try again later.', code : 'MESHY_RATE_LIMITED' }, 429); }
        if (!result.ok) { return Reply ({ error : 'Meshy could not verify the key. Try again later.', code : 'MESHY_REQUEST_FAILED' }, 502); }
        return Reply ({ valid : true });
    } catch (error) {
        const invalid = error.status === 400 || error instanceof SyntaxError; const tooLarge = error.status === 413;
        return Reply ({ error : invalid ? 'Enter a valid Meshy API key without spaces.' : tooLarge ? 'Key request is too large.' : 'Could not test this Meshy key.', code : invalid ? 'MESHY_KEY_INVALID' : 'MESHY_REQUEST_FAILED' }, invalid ? 400 : tooLarge ? 413 : 503);
    }
}
