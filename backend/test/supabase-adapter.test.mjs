import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseLibraryAdapter } from '../adapters/supabase.mjs';

const env = { SUPABASE_URL : 'https://example.supabase.co', SUPABASE_SECRET_KEY : 'secret' };

test ('public-facing adapter reads explicitly filter published rows', async () => {
    const urls = [];
    const mock = async (url) => {
        urls.push (url);
        return new Response (JSON.stringify ([]), { status : 200, headers : { 'Content-Type' : 'application/json' } });
    };
    const adapter = new SupabaseLibraryAdapter (env, mock);
    await adapter.List ();
    await adapter.Get ('577a8d6f-85d7-456d-bb75-4946af3c364b');
    assert.ok (urls.every ((url) => url.includes ('status=eq.published')));
});

test ('delete archives metadata before removing files', async () => {
    const calls = [];
    const mock = async (url, options = {}) => {
        calls.push ({ url, options });
        if (url.includes ('select=archive_path')) {
            return new Response (JSON.stringify ([{ archive_path : 'id/session.auto3d', thumbnail_path : 'id/thumbnail.png' }]), { status : 200, headers : { 'Content-Type' : 'application/json' } });
        }
        return new Response ('', { status : 200 });
    };
    const adapter = new SupabaseLibraryAdapter (env, mock);
    assert.equal (await adapter.Delete ('577a8d6f-85d7-456d-bb75-4946af3c364b'), true);
    assert.equal (calls[1].options.method, 'PATCH');
    assert.match (calls[1].options.body, /archived/);
    assert.equal (calls[2].options.method, 'DELETE');
});
