import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/personal/ai-workspace.js';

const A = '00000000-0000-4000-8000-000000000001', B = '00000000-0000-4000-8000-000000000002';
const bytes = new Uint8Array ([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
describe ('Private AI cloud workspace', () => {
    let previous, rows, files, env, patchFailure;
    beforeEach (() => {
        previous = globalThis.fetch; rows = new Map (); files = new Map (); patchFailure = false;
        env = { SUPABASE_URL : 'https://db.test', SUPABASE_SECRET_KEY : 'sb_secret_test', AUTO3D_LIBRARY_R2 : { async put (key, value) { files.set (key, value); }, async get (key) { const blob = files.get (key); return blob ? { body : blob.stream () } : null; }, async delete (key) { files.delete (key); } } };
        globalThis.fetch = async (input, options = {}) => {
            const url = new URL (input); if (!url.pathname.endsWith ('auto3d_ai_workspaces')) { throw new Error ('Unexpected database path'); }
            if (options.method === 'POST') { const owner = JSON.parse (options.body).user_id; if (!rows.has (owner)) { rows.set (owner, { revision : 0, archive_key : null, file_size : 0, updated_at : 'now' }); } return new Response (null, { status : 204 }); }
            const owner = url.searchParams.get ('user_id')?.replace ('eq.', ''), row = rows.get (owner); if (options.method === 'GET') { return Response.json (row ? [row] : []); }
            if (options.method === 'PATCH') { const expected = Number (url.searchParams.get ('revision')?.replace ('eq.', '')); if (!row || row.revision !== expected) { return Response.json ([]); } Object.assign (row, JSON.parse (options.body)); if (patchFailure) { return new Response ('failed', { status : 503 }); } return Response.json ([{ revision : row.revision, updated_at : row.updated_at }]); }
            throw new Error ('Unexpected database method');
        };
    });
    afterEach (() => { globalThis.fetch = previous; });
    function request (owner, method = 'GET', revision = null, archive = false, body = bytes) {
        const headers = {}; if (method === 'PUT') { headers.Origin = 'https://auto3d.test'; if (revision !== null) { headers['If-Match'] = '"' + revision + '"'; } }
        return { env, data : owner ? { user : { id : owner } } : {}, request : new Request ('https://auto3d.test/api/personal/ai-workspace' + (archive ? '?archive=1' : ''), { method, headers, ...(method === 'PUT' ? { body } : {}) }) };
    }
    it ('initializes isolated accounts and restores only the owner archive', async () => {
        assert.equal ((await onRequest (request (null))).status, 401); assert.equal ((await (await onRequest (request (A))).json ()).revision, 0);
        assert.equal ((await (await onRequest (request (A, 'PUT', 0))).json ()).revision, 1); assert.equal ((await (await onRequest (request (B))).json ()).exists, false); assert.equal ((await onRequest (request (B, 'GET', null, true))).status, 404);
        assert.deepEqual (new Uint8Array (await (await onRequest (request (A, 'GET', null, true))).arrayBuffer ()), bytes); assert.ok ([...files.keys ()].every (key => key.startsWith ('users/' + A + '/ai-workspace/')));
    });
    it ('rejects stale revisions, invalid archives, and foreign origins', async () => {
        await onRequest (request (A, 'PUT', 0)); assert.equal ((await onRequest (request (A, 'PUT', 0))).status, 409); assert.equal ((await onRequest (request (A, 'PUT', null))).status, 428); assert.equal ((await onRequest (request (A, 'PUT', 1, false, new Uint8Array ([1, 2, 3, 4])))).status, 400);
        const foreign = request (A, 'PUT', 1); foreign.request.headers.set ('Origin', 'https://foreign.test'); assert.equal ((await onRequest (foreign)).status, 403); assert.equal (files.size, 1);
    });
    it ('does not delete the new archive after an ambiguous database commit', async () => {
        patchFailure = true; assert.equal ((await onRequest (request (A, 'PUT', 0))).status, 503); assert.equal (rows.get (A).revision, 1); assert.equal (files.has (rows.get (A).archive_key), true); patchFailure = false; assert.equal ((await onRequest (request (A, 'GET', null, true))).status, 200);
    });
    it ('allows only one of two concurrent saves at the same revision', async () => {
        await onRequest (request (A)); const put = env.AUTO3D_LIBRARY_R2.put; let started = 0, release; const barrier = new Promise (resolve => { release = resolve; });
        env.AUTO3D_LIBRARY_R2.put = async (key, blob) => { await put (key, blob); started++; if (started === 2) { release (); } await barrier; };
        const results = await Promise.all ([onRequest (request (A, 'PUT', 0)), onRequest (request (A, 'PUT', 0))]); assert.deepEqual (results.map (result => result.status).sort (), [200, 409]); assert.equal (rows.get (A).revision, 1); assert.equal (files.size, 1); assert.equal (files.has (rows.get (A).archive_key), true);
    });
});
