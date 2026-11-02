import assert from 'node:assert/strict';
import { DurableRouter } from '../agent-mcp/durable-router.js';
import { CreateMcpHttpHandler } from '../agent-mcp/http-handler.js';

describe ('Account-scoped durable router', () => {
    it ('routes each verified account to its own broker and rejects account substitution', async () => {
        const names = []; const namespace = { getByName : name => { names.push (name); return { List : async account => [{ account }], Pair : async value => value, Dispatch : async value => value }; } };
        const router = new DurableRouter ({ namespace, accountId : 'alice' }); assert.deepEqual (await router.List ('alice'), [{ account : 'alice' }]); assert.throws (() => router.List ('bob'), /Account unavailable/); assert.throws (() => router.Pair ({ accountId : 'bob' }), /Account unavailable/); assert.deepEqual (names, ['alice']);
    });
    it ('constructs a service only after verifying each bearer token', async () => {
        const accounts = []; const handler = CreateMcpHttpHandler ({ resourceMetadataUrl : 'https://auto3d.test/meta', verifyAccessToken : async token => { if (token !== 'valid') { throw new Error ('Denied'); } return { accountId : 'alice', grantId : 'grant', scopes : ['auto3d.read'] }; }, serviceForActor : actor => { accounts.push (actor.accountId); return { Authorize : () => {}, ListTools : () => [], ListSessions : async () => [{ connectionId : 'window' }] }; } });
        const request = token => new Request ('https://auto3d.test/mcp', { method : 'POST', headers : { Authorization : 'Bearer ' + token, Accept : 'application/json, text/event-stream', 'Content-Type' : 'application/json', 'MCP-Protocol-Version' : '2025-06-18' }, body : JSON.stringify ({ jsonrpc : '2.0', id : 1, method : 'tools/call', params : { name : 'auto3d.sessions.list', arguments : {} } }) });
        assert.equal ((await handler (request ('invalid'))).status, 401); assert.deepEqual (accounts, []); const response = await handler (request ('valid')); assert.equal ((await response.json ()).result.structuredContent.result[0].connectionId, 'window'); assert.deepEqual (accounts, ['alice']);
    });
});
