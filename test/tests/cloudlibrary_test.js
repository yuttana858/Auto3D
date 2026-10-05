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
        it ('Disables browser publishing during the corporate identity migration', async () => {
            const library = new CloudLibrary (); let requests = 0; library.Request = async () => { requests++; };
            await assert.rejects (() => library.Save ({}), /corporate identity/);
            assert.equal (requests, 0);
        });
        it ('Uses same-origin API routes by default', async () => {
            const originalFetch = global.fetch;
            try {
                let requested = null;
                global.fetch = async (url) => { requested = String (url); return new Response ('[]', { status : 200, headers : { 'Content-Type' : 'application/json' } }); };
                const library = new CloudLibrary (); await library.List ();
                assert.equal (requested, '/api/library/items');
            } finally { global.fetch = originalFetch; }
        });
        it ('Uses the backend API for shared reads when configured', async () => {
            const originalFetch = global.fetch;
            try {
                const calls = [];
                global.fetch = async (url) => {
                    calls.push (String (url));
                    return new Response (JSON.stringify ([{ id : '577a8d6f-85d7-456d-bb75-4946af3c364b', name : 'API Model', category : 'Accessories', kind : 'model', objectCount : 1, createdAt : '2026-10-05T00:00:00Z' }]), { status : 200, headers : { 'Content-Type' : 'application/json' } });
                };
                const library = new CloudLibrary (); library.apiUrl = 'https://api.example.com';
                const items = await library.List ();
                assert.equal (items[0].name, 'API Model');
                assert.equal (items[0].objects, 1);
                assert.equal (calls[0], 'https://api.example.com/api/library/items');
            } finally { global.fetch = originalFetch; }
        });
        it ('Creates managed mini-viewer links through the share API', async () => {
            const library = new CloudLibrary ();
            let request;
            library.Request = async (path, options) => {
                request = { path, options };
                return new Response (JSON.stringify ({ token : 'c4db39ad-bb0a-4f91-86fc-30e7a4dd7284', url : 'https://auto3d.example/?view=c4db39ad-bb0a-4f91-86fc-30e7a4dd7284', allowDownload : true, codeRequired : true }), { status : 201, headers : { 'Content-Type' : 'application/json' } });
            };
            const item = { id : '577a8d6f-85d7-456d-bb75-4946af3c364b' };
            const result = await library.CreateShare (item, true, '1234');
            assert.equal (request.path, '/api/share');
            assert.equal (request.options.method, 'POST');
            assert.deepEqual (JSON.parse (request.options.body), { itemId : item.id, allowDownload : true, code : '1234' });
            assert.match (result.url, /\?view=/);
        });

        it ('Uses POST for protected share archives so access codes stay out of URLs', async () => {
            const library = new CloudLibrary ();
            let request;
            library.Request = async (path, options) => {
                request = { path, options };
                return new Response (new Uint8Array ([1, 2, 3]), { status : 200, headers : { 'Content-Type' : 'application/octet-stream' } });
            };
            const token = 'c4db39ad-bb0a-4f91-86fc-30e7a4dd7284';
            const archive = await library.ShareArchive (token, '1234');
            assert.equal (request.path, '/api/share/' + token + '/archive');
            assert.equal (request.options.method, 'POST');
            assert.deepEqual (JSON.parse (request.options.body), { code : '1234' });
            assert.deepEqual (Array.from (new Uint8Array (archive)), [1, 2, 3]);
        });

        it ('Creates persistent viewer links without carrying workspace URL state', () => {
            const originalWindow = global.window;
            try {
                global.window = { location : { href : 'https://yuttana858.github.io/Auto3D/?v=test#model=private.glb' } };
                const library = new CloudLibrary (); const id = '577a8d6f-85d7-456d-bb75-4946af3c364b';
                assert.equal (library.Share ({ id }), 'https://yuttana858.github.io/Auto3D/?share=' + id);
            } finally { if (originalWindow === undefined) { delete global.window; } else { global.window = originalWindow; } }
        });
    });
}
