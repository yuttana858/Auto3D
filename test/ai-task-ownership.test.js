import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/ai/[[path]].js';

const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
describe ('Shared Meshy task ownership', () => {
    let previous, tasks, upstream, env;
    beforeEach (() => {
        previous = globalThis.fetch; tasks = new Map (); upstream = []; env = { SUPABASE_URL : 'https://db.test', SUPABASE_SECRET_KEY : 'sb_secret_test', MESHY_API_KEY : 'test-key', AUTO3D_AI_ALLOW_SHARED_KEY : 'true' };
        globalThis.fetch = async (input, options = {}) => {
            const url = new URL (input);
            if (url.hostname === 'db.test') {
                if (options.method === 'POST') { const row = JSON.parse (options.body); if (tasks.has (row.task_id)) { return new Response ('conflict', { status : 409 }); } tasks.set (row.task_id, row); return Response.json ([row]); }
                const owner = url.searchParams.get ('user_id')?.replace ('eq.', ''), id = url.searchParams.get ('task_id')?.replace ('eq.', ''), route = url.searchParams.get ('route')?.replace ('eq.', ''); return Response.json ([...tasks.values ()].filter (row => row.user_id === owner && (!id || row.task_id === id) && (!route || row.route === route)));
            }
            if (url.hostname === 'assets.meshy.ai') { upstream.push (url.href); return new Response ('model'); }
            upstream.push (url.href); if (options.method === 'POST') { return Response.json ({ result : 'task_' + (tasks.size + 1) }); }
            return Response.json ({ id : url.pathname.split ('/').at (-1), status : 'SUCCEEDED', model_urls : { glb : 'https://assets.meshy.ai/private.glb' } });
        };
    });
    afterEach (() => { globalThis.fetch = previous; });
    function request (owner, path, method = 'GET', body = null, query = '') { return { env, data : owner ? { user : { id : owner } } : {}, params : { path }, request : new Request ('https://auto3d.test/api/ai/' + path.join ('/') + query, { method, ...(body ? { body : JSON.stringify (body) } : {}) }) }; }
    it ('records the creator and blocks foreign task reads, derivations and model downloads', async () => {
        assert.equal ((await onRequest (request (A, ['text-to-3d'], 'POST', { mode : 'preview', prompt : 'box' }))).status, 200); assert.equal (tasks.get ('task_1').user_id, A);
        assert.equal ((await onRequest (request (B, ['text-to-3d', 'task_1']))).status, 404); assert.equal ((await onRequest (request (B, ['retexture'], 'POST', { input_task_id : 'task_1' }))).status, 404);
        const query = '?task=task_1&url=' + encodeURIComponent ('https://assets.meshy.ai/private.glb'); assert.equal ((await onRequest (request (B, ['model'], 'GET', null, query))).status, 404); assert.equal ((await onRequest (request (A, ['model'], 'GET', null, query))).status, 200);
        const list = await (await onRequest (request (B, ['text-to-3d']))).json (); assert.deepEqual (list, []); assert.equal ((await (await onRequest (request (A, ['text-to-3d']))).json ()).length, 1);
    });
    it ('rejects unknown asset URLs and unauthenticated requests', async () => {
        await onRequest (request (A, ['text-to-3d'], 'POST', { mode : 'preview' })); const query = '?task=task_1&url=' + encodeURIComponent ('https://assets.meshy.ai/someone-else.glb'); assert.equal ((await onRequest (request (A, ['model'], 'GET', null, query))).status, 404); assert.equal ((await onRequest (request (null, ['text-to-3d']))).status, 401);
    });
    it ('returns an uncertain result when task ownership cannot be recorded', async () => {
        const old = globalThis.fetch; globalThis.fetch = async (url, options) => new URL (url).hostname === 'db.test' ? new Response ('down', { status : 503 }) : old (url, options);
        const response = await onRequest (request (A, ['text-to-image'], 'POST', { prompt : 'box' })); assert.equal (response.status, 503); assert.match ((await response.json ()).error, /Do not retry automatically/); assert.equal (tasks.size, 0);
    });
});
