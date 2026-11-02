import assert from 'node:assert/strict';
import { CreateGrantHandler } from '../agent-mcp/grant-management.js';

const alice = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', bob = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const base = 'https://auto3d.example/agent/grants';

describe ('Agent grant management', () => {
    it ('lists only the verified user’s grants and never reveals provider metadata', async () => {
        let used; const oauth = { listUserGrants : async id => { used = id; return { items : [{ id : 'one', userId : alice, clientId : 'Client', scope : ['auto3d.read'], metadata : { private : 'hidden' } }, { id : 'two', userId : bob, clientId : 'Other', scope : ['auto3d.read'] }] }; } };
        const handler = CreateGrantHandler ({ oauth, verifiedUser : async () => ({ id : alice }) });
        const response = await handler (new Request (base, { headers : { 'X-Auto3D-Account' : alice } })); const page = await response.json (); assert.equal (used, alice); assert.deepEqual (page.grants.map (grant => grant.id), ['one']); assert.ok (!JSON.stringify (page).includes ('hidden'));
        assert.equal ((await handler (new Request (base, { headers : { 'X-Auto3D-Account' : bob } }))).status, 409);
    });
    it ('requires same-origin and binds revoke to the verified account', async () => {
        let revoked; const handler = CreateGrantHandler ({ oauth : { revokeGrant : async (id, userId) => { revoked = [id, userId]; } }, verifiedUser : async () => ({ id : alice }) });
        const request = (origin, account, body) => new Request (base + '/revoke', { method : 'POST', headers : { Origin : origin, 'X-Auto3D-Account' : account, 'Content-Type' : 'application/json' }, body : JSON.stringify (body) });
        assert.equal ((await handler (request ('https://other.example', alice, { id : 'grant' }))).status, 403);
        assert.equal ((await handler (request ('https://auto3d.example', bob, { id : 'grant' }))).status, 409);
        assert.equal ((await handler (request ('https://auto3d.example', alice, { id : 'grant', userId : bob }))).status, 400);
        assert.equal ((await handler (request ('https://auto3d.example', alice, { id : 'grant' }))).status, 200); assert.deepEqual (revoked, ['grant', alice]);
    });
});
