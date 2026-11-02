import assert from 'node:assert/strict';
import { CreateBrowserGateway } from '../agent-mcp/browser-gateway.js';

const account = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
describe ('Authenticated browser gateway', () => {
    it ('uses the verified account and forwards no browser-supplied identity or cookies', async () => {
        let name, forwarded; const namespace = { getByName : value => { name = value; return { fetch : request => { forwarded = request; return new Response ('ok'); } }; } };
        const gateway = CreateBrowserGateway ({ namespace, verifiedUser : async () => ({ id : account, sessionFingerprint : 'a'.repeat (64) }), now : () => 1000 });
        const request = new Request ('https://auto3d.example/api/agent/connect', { headers : { Origin : 'https://auto3d.example', Upgrade : 'websocket', Cookie : 'session=secret', 'X-Auto3D-Verified-Account' : 'attacker' } });
        assert.equal ((await gateway (request)).status, 200); assert.equal (name, account); assert.equal (forwarded.headers.get ('X-Auto3D-Verified-Account'), account); assert.equal (forwarded.headers.get ('X-Auto3D-Connection-Expires'), '301000'); assert.equal (forwarded.headers.get ('Cookie'), null);
    });
    it ('blocks cross-origin, unverified, non-WebSocket and query-string requests', async () => {
        let calls = 0; const namespace = { getByName : () => { calls++; throw new Error ('Should not connect'); } }; const gateway = CreateBrowserGateway ({ namespace, verifiedUser : async () => null });
        const base = 'https://auto3d.example/api/agent/connect';
        assert.equal ((await gateway (new Request (base, { headers : { Origin : 'https://other.example', Upgrade : 'websocket' } }))).status, 403);
        assert.equal ((await gateway (new Request (base + '?account=other', { headers : { Origin : 'https://auto3d.example', Upgrade : 'websocket' } }))).status, 403);
        assert.equal ((await gateway (new Request (base, { headers : { Origin : 'https://auto3d.example' } }))).status, 426);
        assert.equal ((await gateway (new Request (base, { headers : { Origin : 'https://auto3d.example', Upgrade : 'websocket' } }))).status, 401); assert.equal (calls, 0);
    });
    it ('renews only a same-origin request with a matching verified session', async () => {
        let received; const namespace = { getByName : () => ({ Renew : async value => { received = value; } }) };
        const gateway = CreateBrowserGateway ({ namespace, verifiedUser : async () => ({ id : account, sessionFingerprint : 'a'.repeat (64) }), now : () => 1000 });
        const request = (origin, accountHeader, body) => new Request ('https://auto3d.example/api/agent/renew', { method : 'POST', headers : { Origin : origin, 'X-Auto3D-Account' : accountHeader, 'Content-Type' : 'application/json' }, body : JSON.stringify (body) });
        assert.equal ((await gateway (request ('https://other.example', account, { connectionId : 'connection', instanceId : 'window' }))).status, 403);
        assert.equal ((await gateway (request ('https://auto3d.example', 'other', { connectionId : 'connection', instanceId : 'window' }))).status, 409);
        assert.equal ((await gateway (request ('https://auto3d.example', account, { connectionId : 'connection', instanceId : 'window', accountId : 'other' }))).status, 409);
        const response = await gateway (request ('https://auto3d.example', account, { connectionId : 'connection', instanceId : 'window' })); assert.equal (response.status, 200); assert.equal ((await response.json ()).expiresAt, 301000); assert.equal (received.accountId, account); assert.equal (received.sessionFingerprint, 'a'.repeat (64));
    });

});
