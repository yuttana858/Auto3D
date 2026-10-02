import * as assert from 'node:assert';
import { CloudLibrary, IsLibraryId } from '../../source/website/cloudlibrary.js';

export default function suite ()
{
    describe ('Shared prototype library', () => {
        it ('Rejects malformed share identifiers before making a network request', async () => {
            const library = new CloudLibrary (); let requests = 0;
            library.Request = async () => { requests++; };
            for (const id of ['../private', 'abc', 'a&select=*', 'https://example.com', null]) {
                assert.equal (IsLibraryId (id), false); await assert.rejects (() => library.Get (id), /invalid/);
            }
            assert.equal (requests, 0);
            assert.equal (IsLibraryId ('577a8d6f-85d7-456d-bb75-4946af3c364b'), true);
        });
        it ('Never uploads while signed out or above the shared size limit', async () => {
            const library = new CloudLibrary (); let requests = 0; library.Request = async () => { requests++; };
            await assert.rejects (() => library.Save ({ archive : { size : 10 } }), /Sign in/);
            library.session = { access_token : 'test', expires_at : Date.now () / 1000 + 500 };
            await assert.rejects (() => library.Save ({ archive : { size : 65 * 1024 * 1024 } }), /64 MB/);
            assert.equal (requests, 0);
        });
        it ('Clears expired publisher credentials when refresh is rejected', async () => {
            const library = new CloudLibrary (); library.session = { access_token : 'expired', refresh_token : 'test', expires_at : 0 };
            library.Request = async () => { throw new Error ('Invalid refresh token'); };
            await assert.rejects (() => library.Token (), /expired/); assert.equal (library.session, null);
        });
        it ('Creates persistent viewer links without carrying workspace URL state', () => {
            const originalWindow = global.window;
            try {
                global.window = { location : { href : 'https://yuttana858.github.io/Auto3D/?v=test#model=private.glb' } };
                const library = new CloudLibrary (); const id = '577a8d6f-85d7-456d-bb75-4946af3c364b';
                assert.equal (library.Share ({ id }), 'https://yuttana858.github.io/Auto3D/?share=' + id);
            } finally { if (originalWindow === undefined) { delete global.window; } else { global.window = originalWindow; } }
        });
        it ('Publishes metadata only after both immutable files finish uploading', async () => {
            const originalFetch = global.fetch; const calls = [];
            try {
                global.fetch = async () => ({ blob : async () => ({ size : 50 }) });
                const library = new CloudLibrary (); library.session = { access_token : 'test', expires_at : Date.now () / 1000 + 500 };
                library.Request = async (path, options, authenticated) => { calls.push ({ path, options, authenticated }); };
                await library.Save ({ id : '577a8d6f-85d7-456d-bb75-4946af3c364b', name : 'Model', category : 'Accessories', kind : 'model', objects : 1, archive : { size : 100 }, thumbnail : 'data:image/png;base64,AA==' });
                assert.equal (calls.length, 3);
                assert.ok (calls[0].path.endsWith ('/session.auto3d')); assert.ok (calls[1].path.endsWith ('/thumbnail.png')); assert.equal (calls[2].path, '/rest/v1/auto3d_library');
                assert.ok (calls.every ((call) => call.authenticated));
                assert.equal (calls[0].options.headers['x-upsert'], 'false');
                assert.equal (JSON.parse (calls[2].options.body).object_count, 1);
                calls.length = 0; library.Request = async (path) => { calls.push ({ path }); throw new Error ('Upload interrupted'); };
                await assert.rejects (() => library.Save ({ archive : { size : 1 }, thumbnail : 'data:image/png;base64,AA==' }), /interrupted/);
                assert.equal (calls.length, 1); assert.ok (calls[0].path.endsWith ('/session.auto3d'));
            } finally { global.fetch = originalFetch; }
        });
    });
}
