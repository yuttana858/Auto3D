import { Reply } from '../../_lib/accountstorage.js';
import { ProofSource } from '../../_lib/conversionproof.js';
export async function onRequest ({ request, env })
{
    try {
        const path = new URL (request.url).pathname.split ('/');
        if (path.length !== 5 || path[4] !== 'source') { return Reply ({ error : 'Not found.' }, 404); }
        return await ProofSource (env, request, path[3]);
    } catch (error) { return Reply ({ error : 'Private source unavailable.' }, [403, 404, 409, 410].includes (error.status) ? error.status : 503); }
}
