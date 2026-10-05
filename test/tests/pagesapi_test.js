import * as assert from 'node:assert';
import { onRequest } from '../../functions/api/library/[[path]].js';
import { onRequest as onShareRequest } from '../../functions/api/share/[[path]].js';

export default function suite ()
{
    describe ('Cloudflare library API bridge', () => {
        it ('returns normalized published library rows', async () => {
            const originalFetch = global.fetch;
            try {
                global.fetch = async (url, options) => {
                    assert.ok (String (url).includes ('status=eq.published'));
                    assert.ok (options.headers.apikey.startsWith ('sb_publishable_'));
                    return new Response (JSON.stringify ([{
                        id : '577a8d6f-85d7-456d-bb75-4946af3c364b',
                        name : 'Bottle', category : 'Primary products', kind : 'model',
                        object_count : 1, created_at : '2026-10-05T00:00:00Z', version : 2, status : 'published'
                    }]), { status : 200, headers : { 'Content-Type' : 'application/json' } });
                };
                const response = await onRequest ({ request : new Request ('https://auto3d.example/api/library/items'), params : { path : ['items'] }, env : {} });
                assert.equal (response.status, 200);
                const body = await response.json (); assert.equal (body[0].objectCount, 1); assert.equal (body[0].version, 2);
                assert.equal (body[0].archive_path, undefined);
            } finally { global.fetch = originalFetch; }
        });

        it ('fails closed for write methods until corporate identity is connected', async () => {
            const response = await onRequest ({ request : new Request ('https://auto3d.example/api/library/items', { method : 'POST' }), params : { path : ['items'] }, env : {} });
            assert.equal (response.status, 503); assert.match ((await response.json ()).error, /corporate/i);
        });

        it ('rejects malformed identifiers before upstream access', async () => {
            const originalFetch = global.fetch; let calls = 0;
            try {
                global.fetch = async () => { calls++; return new Response ('[]'); };
                const response = await onRequest ({ request : new Request ('https://auto3d.example/api/library/items/bad'), params : { path : ['items', 'bad'] }, env : {} });
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
                    env : {}
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
                const response = await onShareRequest ({ request : new Request ('https://auto3d.example/api/share/' + token), params : { path : [token] }, env : {} });
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
                    env : {}
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
                    env : {}
                });
                assert.equal (response.status, 403);
                assert.equal (calls, 1);
            } finally { global.fetch = originalFetch; }
        });
    });


}
