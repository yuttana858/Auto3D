import * as assert from 'node:assert';
import { onRequest } from '../../functions/api/library/[[path]].js';
import { onRequest as onShareRequest } from '../../functions/api/share/[[path]].js';
import { onRequestGet as onHealthRequest } from '../../functions/api/health.js';
import { SupabaseHeaders } from '../../functions/_lib/supabase.js';
import { onRequest as onEnvironmentRequest } from '../../functions/api/environments.js';

const databaseEnv = { SUPABASE_URL : 'https://configured-project.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test_only' };

export default function suite ()
{
    describe ('Server-side database configuration and readiness', () => {
        it ('fails closed without secrets instead of querying the prototype project', async () => {
            const originalFetch = global.fetch;
            try {
                let calls = 0;
                global.fetch = async () => { calls++; throw new Error ('Unexpected upstream request'); };
                for (const env of [{}, { SUPABASE_URL : databaseEnv.SUPABASE_URL }, { SUPABASE_SECRET_KEY : databaseEnv.SUPABASE_SECRET_KEY }, { ...databaseEnv, SUPABASE_URL : 'not-a-url' }]) {
                    const response = await onRequest ({ request : new Request ('https://auto3d.example/api/library/items'), params : { path : ['items'] }, env });
                    assert.equal (response.status, 503);
                    assert.match ((await response.json ()).error, /configuration/i);
                }
                const share = await onShareRequest ({ request : new Request ('https://auto3d.example/api/share/577a8d6f-85d7-456d-bb75-4946af3c364b'), params : { path : ['577a8d6f-85d7-456d-bb75-4946af3c364b'] }, env : {} });
                assert.equal (share.status, 503);
                assert.equal (calls, 0);
            } finally { global.fetch = originalFetch; }
        });

        it ('reports database readiness from a bounded read query without exposing rows', async () => {
            const originalFetch = global.fetch;
            try {
                global.fetch = async (url, options) => {
                    assert.equal (url, databaseEnv.SUPABASE_URL + '/rest/v1/auto3d_library?select=id&limit=1');
                    assert.equal (options.headers.apikey, databaseEnv.SUPABASE_SECRET_KEY);
                    assert.ok (options.signal);
                    return Response.json ([{ id : 'private-row' }]);
                };
                const response = await onHealthRequest ({ env : databaseEnv });
                assert.equal (response.status, 200);
                assert.equal (response.headers.get ('Cache-Control'), 'no-store');
                const body = await response.json ();
                assert.equal (body.database, 'ok');
                assert.equal (JSON.stringify (body).includes ('private-row'), false);
                assert.equal (JSON.stringify (body).includes (databaseEnv.SUPABASE_SECRET_KEY), false);
            } finally { global.fetch = originalFetch; }
        });

        it ('reports missing configuration, rejected credentials and network errors as degraded', async () => {
            const originalFetch = global.fetch;
            try {
                for (const upstream of [async () => new Response ('credential details', { status : 401 }), async () => { throw new Error (databaseEnv.SUPABASE_SECRET_KEY); }, async () => Response.json ({ error : 'unexpected body' })]) {
                    global.fetch = upstream;
                    const response = await onHealthRequest ({ env : databaseEnv });
                    assert.equal (response.status, 503);
                    assert.deepEqual (await response.json (), { service : 'auto3d-library-api', status : 'degraded', database : 'unavailable', publishing : 'awaiting-corporate-identity' });
                }
                assert.equal ((await onHealthRequest ({ env : {} })).status, 503);
                const response = await onRequest ({ request : new Request ('https://auto3d.example/api/library/items'), params : { path : ['items'] }, env : databaseEnv });
                assert.equal (response.status, 500);
                assert.equal ((await response.text ()).includes (databaseEnv.SUPABASE_SECRET_KEY), false);
            } finally { global.fetch = originalFetch; }
        });

        it ('supports legacy server JWT keys without sending new secrets as bearer tokens', () => {
            assert.deepEqual (SupabaseHeaders ('legacy-jwt'), { apikey : 'legacy-jwt', Authorization : 'Bearer legacy-jwt' });
            assert.deepEqual (SupabaseHeaders ('sb_secret_test'), { apikey : 'sb_secret_test' });
        });

        it ('authenticates archive retrieval and does not forward upstream credential headers', async () => {
            const originalFetch = global.fetch;
            try {
                global.fetch = async (url, options) => {
                    assert.equal (options.headers.apikey, databaseEnv.SUPABASE_SECRET_KEY);
                    if (url.includes ('/rest/v1/')) {
                        assert.ok (url.includes ('status=eq.published'));
                        return Response.json ([{ archive_path : 'model/session.auto3d' }]);
                    }
                    return new Response ('archive-bytes', { headers : { apikey : databaseEnv.SUPABASE_SECRET_KEY } });
                };
                const response = await onRequest ({ request : new Request ('https://auto3d.example/api/library/items/577a8d6f-85d7-456d-bb75-4946af3c364b/archive'), params : { path : ['items', '577a8d6f-85d7-456d-bb75-4946af3c364b', 'archive'] }, env : databaseEnv });
                assert.equal (response.status, 200);
                assert.equal (await response.text (), 'archive-bytes');
                assert.equal (response.headers.get ('apikey'), null);
            } finally { global.fetch = originalFetch; }
        });
    });
    describe ('Cloudflare library API bridge', () => {
        it ('returns normalized published library rows', async () => {
            const originalFetch = global.fetch;
            try {
                global.fetch = async (url, options) => {
                    assert.ok (String (url).includes ('status=eq.published'));
                    assert.equal (options.headers.apikey, databaseEnv.SUPABASE_SECRET_KEY);
                    assert.equal (options.headers.Authorization, undefined);
                    return new Response (JSON.stringify ([{
                        id : '577a8d6f-85d7-456d-bb75-4946af3c364b',
                        name : 'Bottle', category : 'Primary products', kind : 'model',
                        object_count : 1, created_at : '2026-10-05T00:00:00Z', version : 2, status : 'published'
                    }]), { status : 200, headers : { 'Content-Type' : 'application/json' } });
                };
                const response = await onRequest ({ request : new Request ('https://auto3d.example/api/library/items'), params : { path : ['items'] }, env : databaseEnv });
                assert.equal (response.status, 200);
                const body = await response.json (); assert.equal (body[0].objectCount, 1); assert.equal (body[0].version, 2);
                assert.equal (body[0].archive_path, undefined);
            } finally { global.fetch = originalFetch; }
        });

        it ('fails closed for write methods until corporate identity is connected', async () => {
            const response = await onRequest ({ request : new Request ('https://auto3d.example/api/library/items', { method : 'POST' }), params : { path : ['items'] }, env : databaseEnv });
            assert.equal (response.status, 503); assert.match ((await response.json ()).error, /corporate/i);
        });

        it ('rejects malformed identifiers before upstream access', async () => {
            const originalFetch = global.fetch; let calls = 0;
            try {
                global.fetch = async () => { calls++; return new Response ('[]'); };
                const response = await onRequest ({ request : new Request ('https://auto3d.example/api/library/items/bad'), params : { path : ['items', 'bad'] }, env : databaseEnv });
                assert.equal (response.status, 400); assert.equal (calls, 0);
            } finally { global.fetch = originalFetch; }
        });
    });    describe ('Cloudflare share-link API', () => {
        const itemId = '577a8d6f-85d7-456d-bb75-4946af3c364b';
        const token = 'c4db39ad-bb0a-4f91-86fc-30e7a4dd7284';

        it ('creates a random viewer link and stores only a code hash', async () => {
            const originalFetch = global.fetch;
            try {
                const calls = [];
                global.fetch = async (url, options = {}) => {
                    assert.equal (options.headers.apikey, databaseEnv.SUPABASE_SECRET_KEY);
                    calls.push ({ url : String (url), options });
                    if (String (url).includes ('auto3d_library')) {
                        return new Response (JSON.stringify ([{ id : itemId, name : 'Bottle', category : 'Primary products', kind : 'model', object_count : 1, created_at : '2026-10-05T00:00:00Z', status : 'published' }]), { status : 200, headers : { 'Content-Type' : 'application/json' } });
                    }
                    return new Response ('', { status : 201 });
                };
                const response = await onShareRequest ({
                    request : new Request ('https://auto3d.example/api/share', {
                        method : 'POST',
                        headers : { 'Content-Type' : 'application/json' },
                        body : JSON.stringify ({ itemId, allowDownload : true, code : '1234' })
                    }),
                    params : { path : [] },
                    env : databaseEnv
                });
                assert.equal (response.status, 201);
                const result = await response.json ();
                assert.match (result.url, /^https:\/\/auto3d\.example\/\?view=/);
                assert.equal (result.allowDownload, true);
                assert.equal (result.codeRequired, true);
                assert.ok (calls[1].url.includes ('/rest/v1/rpc/auto3d_create_share'));
                const inserted = JSON.parse (calls[1].options.body);
                assert.equal (inserted.p_item_id, itemId);
                assert.equal (inserted.p_code_required, true);
                assert.match (inserted.p_code_hash, /^[0-9a-f]{64}$/);
                assert.notEqual (inserted.p_code_hash, '1234');
            } finally { global.fetch = originalFetch; }
        });

        it ('returns share metadata without exposing the code hash', async () => {
            const originalFetch = global.fetch;
            try {
                global.fetch = async (url) => {
                    if (String (url).includes ('auto3d_share_links')) {
                        return new Response (JSON.stringify ([{ token, item_id : itemId, allow_download : false, code_required : true, created_at : '2026-10-05T00:00:00Z', expires_at : null }]), { status : 200, headers : { 'Content-Type' : 'application/json' } });
                    }
                    return new Response (JSON.stringify ([{ id : itemId, name : 'Bottle', category : 'Primary products', kind : 'model', object_count : 1, created_at : '2026-10-05T00:00:00Z', status : 'published' }]), { status : 200, headers : { 'Content-Type' : 'application/json' } });
                };
                const response = await onShareRequest ({ request : new Request ('https://auto3d.example/api/share/' + token), params : { path : [token] }, env : databaseEnv });
                assert.equal (response.status, 200);
                const info = await response.json ();
                assert.equal (info.codeRequired, true);
                assert.equal (info.allowDownload, false);
                assert.equal (info.code_hash, undefined);
            } finally { global.fetch = originalFetch; }
        });

        it ('rejects an incorrect access code before retrieving model bytes', async () => {
            const originalFetch = global.fetch;
            try {
                let calls = 0;
                global.fetch = async () => {
                    calls++;
                    return new Response ('[]', { status : 200, headers : { 'Content-Type' : 'application/json' } });
                };
                const response = await onShareRequest ({
                    request : new Request ('https://auto3d.example/api/share/' + token + '/archive', {
                        method : 'POST',
                        headers : { 'Content-Type' : 'application/json' },
                        body : JSON.stringify ({ code : '9999' })
                    }),
                    params : { path : [token, 'archive'] },
                    env : databaseEnv
                });
                assert.equal (response.status, 401);
                assert.equal (calls, 1);
            } finally { global.fetch = originalFetch; }
        });

        it ('enforces the per-link download flag', async () => {
            const originalFetch = global.fetch;
            try {
                let calls = 0;
                global.fetch = async () => {
                    calls++;
                    return new Response (JSON.stringify ([{ item_id : itemId, allow_download : false }]), { status : 200, headers : { 'Content-Type' : 'application/json' } });
                };
                const response = await onShareRequest ({
                    request : new Request ('https://auto3d.example/api/share/' + token + '/download', {
                        method : 'POST',
                        headers : { 'Content-Type' : 'application/json' },
                        body : JSON.stringify ({})
                    }),
                    params : { path : [token, 'download'] },
                    env : databaseEnv
                });
                assert.equal (response.status, 403);
                assert.equal (calls, 1);
            } finally { global.fetch = originalFetch; }
        });

        it ('hides expired share metadata even when server credentials bypass RLS', async () => {
            const originalFetch = global.fetch;
            try {
                let calls = 0;
                global.fetch = async () => { calls++; return Response.json ([{ token, item_id : itemId, expires_at : '2000-01-01T00:00:00Z' }]); };
                const response = await onShareRequest ({ request : new Request ('https://auto3d.example/api/share/' + token), params : { path : [token] }, env : databaseEnv });
                assert.equal (response.status, 404);
                assert.equal (calls, 1);
            } finally { global.fetch = originalFetch; }
        });
    });

    describe ('Cloudflare environment catalog API', () => {
        it ('returns preview and future render tiers as public CDN URLs', async () => {
            const originalFetch = global.fetch;
            try {
                global.fetch = async (url, options) => {
                    assert.ok (String (url).includes ('auto3d_environments'));
                    assert.ok (options.headers.apikey.startsWith ('sb_publishable_'));
                    return new Response (JSON.stringify ([{
                        id : 'studio_small_09',
                        name : 'Studio Small',
                        preview_path : 'preview/studio_small_09.hdr',
                        render_path : 'render/studio_small_09_4k.hdr',
                        thumbnail_path : 'thumb/studio_small_09.png',
                        source_url : 'https://polyhaven.com/a/studio_small_09',
                        license : 'CC0-1.0',
                        sort_order : 10
                    }]), { status : 200, headers : { 'Content-Type' : 'application/json' } });
                };
                const response = await onEnvironmentRequest ({
                    request : new Request ('https://auto3d.example/api/environments'),
                    env : {}
                });
                assert.equal (response.status, 200);
                const body = await response.json ();
                assert.equal (body.length, 1);
                assert.match (body[0].previewUrl, /\/storage\/v1\/object\/public\/auto3d-hdri\/preview\/studio_small_09\.hdr$/);
                assert.match (body[0].renderUrl, /\/storage\/v1\/object\/public\/auto3d-hdri\/render\/studio_small_09_4k\.hdr$/);
                assert.match (body[0].thumbnailUrl, /\/storage\/v1\/object\/public\/auto3d-hdri\/thumb\/studio_small_09\.png$/);
            } finally { global.fetch = originalFetch; }
        });
    });


}
