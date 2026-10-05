import * as assert from 'node:assert';
import { onRequest } from '../../functions/api/library/[[path]].js';

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
    });
}
