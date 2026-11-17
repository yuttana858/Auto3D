import { Reply } from '../../_lib/accountstorage.js';
import { WorkerOperation } from '../../_lib/conversionworker.js';
export async function onRequest ({ request, env })
{
    try {
        const parts = new URL (request.url).pathname.slice ('/internal/conversion-worker/'.length).split ('/');
        const result = await WorkerOperation (env, request, parts);
        return result instanceof Response ? result : Reply (result);
    } catch (error) { const status = [400, 403, 404, 405, 409, 410, 413].includes (error.status) ? error.status : 503; return Reply ({ error : 'Conversion transfer refused.' }, status); }
}
