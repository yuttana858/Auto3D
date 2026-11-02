import assert from 'node:assert/strict';
import { AICloudWorkspace } from '../source/website/aicloudworkspace.js';

describe ('AI cloud workspace client', () => {
    it ('keeps saves account-bound and rejects changed remote revisions', async () => {
        const auth = { user : { id : 'alice' } }, calls = []; const service = new AICloudWorkspace (auth, async (url, options) => { calls.push ({ url, options }); if (url.endsWith ('?archive=1')) { return new Response (new Uint8Array ([1]), { headers : { ETag : '"2"' } }); } return Response.json ({ revision : 2 }); });
        assert.equal ((await service.Inspect ()).revision, 2); assert.equal (calls[0].options.headers['X-Auto3D-Account'], 'alice'); await assert.rejects (() => service.Load (1), /changed/); assert.equal ((await service.Load (2)).byteLength, 1); await service.Save (new Uint8Array ([1]), 2); assert.equal (calls.at (-1).options.headers['If-Match'], '"2"');
    });
    it ('discards a response if the signed-in account changes', async () => {
        const auth = { user : { id : 'alice' } }; const service = new AICloudWorkspace (auth, async () => { auth.user = { id : 'bob' }; return Response.json ({ revision : 0 }); }); await assert.rejects (() => service.Inspect (), /Account changed/);
    });
});
