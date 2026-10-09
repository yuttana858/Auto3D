import assert from 'node:assert/strict';
import { onRequest as library } from '../functions/api/library/[[path]].js';
import { onRequest as share } from '../functions/api/share/[[path]].js';
import { CloudLibrary } from '../source/website/cloudlibrary.js';
const id = '577a8d6f-85d7-456d-bb75-4946af3c364b';
const env = { SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test_only' };
function ctx (path, storage, post = false) {
    return { env : { ...env, ...storage }, params : { path }, request : new Request ('https://auto3d.example/api/test', post ? { method : 'POST', body : '{"code":"1234"}' } : {}) };
}
describe ('Published R2 Library compatibility', () => {
    let original;
    beforeEach (() => { original = global.fetch; });
    afterEach (() => { global.fetch = original; });
    for (const type of ['archive', 'thumbnail']) {
        it ('streams the stored ' + type + ' key without public caching', async () => {
            let gets = 0;
            global.fetch = async (url) => {
                assert.match (url, /status=eq.published/);
                assert.match (url, /storage_provider/);
                return Response.json ([{ storage_provider : 'r2', [type + '_object_key'] : 'published/exact key', [type + '_path'] : 'legacy' }]);
            };
            const response = await library (ctx (['items', id, type], { AUTO3D_LIBRARY_R2 : { get : async (key) => { gets++; assert.equal (key, 'published/exact key'); return { body : 'model bytes' }; } } }));
            assert.equal (response.status, 200); assert.equal (await response.text (), 'model bytes');
            assert.equal (response.headers.get ('Cache-Control'), 'private, no-store');
            assert.equal (response.headers.get ('Content-Type'), type === 'archive' ? 'application/octet-stream' : 'image/png');
            assert.equal (response.headers.get ('X-Content-Type-Options'), 'nosniff'); assert.equal (gets, 1);
        });
    }
    it ('preserves legacy Storage and authenticates only on the server', async () => {
        global.fetch = async (url, options) => {
            if (url.includes ('/rest/')) { return Response.json ([{ archive_path : 'legacy/my model' }]); }
            assert.match (url, /authenticated\/auto3d-library\/legacy\/my%20model$/);
            assert.equal (options.headers.apikey, env.SUPABASE_SECRET_KEY);
            assert.ok (options.signal); return new Response ('legacy bytes');
        };
        const response = await library (ctx (['items', id, 'archive']));
        assert.equal (response.status, 200); assert.equal (await response.text (), 'legacy bytes');
        assert.equal (response.headers.get ('Cache-Control'), 'private, no-store');
    });
    it ('fails closed for unpublished items, invalid IDs and unavailable storage', async () => {
        let gets = 0; const storage = { AUTO3D_LIBRARY_R2 : { get : async () => { gets++; return null; } } };
        global.fetch = async () => Response.json ([]);
        assert.equal ((await library (ctx (['items', id, 'archive'], storage))).status, 404);
        assert.equal ((await library (ctx (['items', '../private', 'archive'], storage))).status, 400);
        assert.equal (gets, 0);
        global.fetch = async () => Response.json ([{ storage_provider : 'r2', archive_object_key : 'exact' }]);
        assert.equal ((await library (ctx (['items', id, 'archive']))).status, 503);
        assert.equal ((await library (ctx (['items', id, 'archive'], storage))).status, 404);
        storage.AUTO3D_LIBRARY_R2.get = async () => { throw new Error (env.SUPABASE_SECRET_KEY); };
        const failed = await library (ctx (['items', id, 'archive'], storage));
        assert.equal (failed.status, 502); assert.equal ((await failed.text ()).includes (env.SUPABASE_SECRET_KEY), false);
        global.fetch = async () => Response.json ([{ storage_provider : 'unknown', archive_path : 'exact' }]);
        assert.equal ((await library (ctx (['items', id, 'archive'], storage))).status, 502);
    });
    it ('checks share grants and download permissions before reading R2', async () => {
        let gets = 0; let grant = [];
        const storage = { AUTO3D_LIBRARY_R2 : { get : async () => { gets++; return { body : 'shared bytes' }; } } };
        global.fetch = async (url) => url.includes ('auto3d_verify_share') ? Response.json (grant) : Response.json ([{ name : 'A / Model', storage_provider : 'r2', archive_object_key : 'published/model' }]);
        assert.equal ((await share (ctx ([id, 'archive'], storage, true))).status, 401);
        grant = [{ item_id : id, allow_download : false }];
        assert.equal ((await share (ctx ([id, 'download'], storage, true))).status, 403); assert.equal (gets, 0);
        assert.equal ((await share (ctx ([id, 'archive'], storage, true))).status, 200);
        grant[0].allow_download = true;
        const response = await share (ctx ([id, 'download'], storage, true));
        assert.equal (response.status, 200); assert.equal (await response.text (), 'shared bytes');
        assert.equal (response.headers.get ('Content-Disposition'), 'attachment; filename="A_Model.auto3d"');
        assert.equal (response.headers.get ('Cache-Control'), 'private, no-store'); assert.equal (gets, 2);
    });
    it ('carries file size and provider metadata through the client', async () => {
        global.fetch = async () => Response.json ([{ id, storage_provider : 'r2', file_size_bytes : 2048 }]);
        const response = await library (ctx (['items']));
        const row = (await response.json ())[0];
        const item = new CloudLibrary ().Item (row);
        assert.equal (item.fileSize, 2048); assert.equal (item.storageProvider, 'r2');
    });
    it ('reads historical R2 rows whose object key is recorded in archive_path', async () => {
        global.fetch = async () => Response.json ([{ storage_provider : 'r2', archive_path : 'historical/exact' }]);
        const response = await library (ctx (['items', id, 'archive'], { AUTO3D_LIBRARY_R2 : { get : async (key) => {
            assert.equal (key, 'historical/exact'); return { body : 'historical bytes' };
        } } }));
        assert.equal (response.status, 200); assert.equal (await response.text (), 'historical bytes');
    });
    it ('keeps verified legacy shares usable and rejects missing file metadata', async () => {
        let path = 'legacy/shared';
        global.fetch = async (url) => {
            if (url.includes ('auto3d_verify_share')) { return Response.json ([{ item_id : id, allow_download : true }]); }
            if (url.includes ('/rest/')) { return Response.json ([{ name : 'Legacy', archive_path : path }]); }
            assert.match (url, /authenticated\/auto3d-library\/legacy\/shared$/); return new Response ('legacy share');
        };
        let response = await share (ctx ([id, 'download'], undefined, true));
        assert.equal (response.status, 200); assert.equal (await response.text (), 'legacy share');
        path = null;
        response = await share (ctx ([id, 'archive'], undefined, true));
        assert.equal (response.status, 404);
    });
});
