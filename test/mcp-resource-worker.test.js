import assert from 'node:assert/strict';
import { CreateMcpResourceService } from '../agent-mcp/resource-worker.js';

const account = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', grant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const issuer = 'https://auto3d.example/agent', resource = 'https://auto3d.example/mcp';

describe ('MCP resource composition', () => {
    it ('advertises discovery and resolves a verified account through its private broker', async () => {
        let calls = 0, names = [];
        const env = { AUTO3D_MCP_RESOURCE : resource, AUTO3D_MCP_ISSUER : issuer, AUTO3D_AUTH_SERVER : { validateToken : async (audience, token) => { calls++; if (token !== 'valid') { return null; } return { audience, userId : account, props : { grantId : grant, authorizedAt : 1000 }, scope : ['auto3d.read'], expiresAt : Math.floor (Date.now () / 1000) + 100 }; } }, AUTO3D_AGENT_BROKER : { getByName : name => { names.push (name); return { List : async () => [{ connectionId : 'window' }] }; } } };
        const handle = CreateMcpResourceService ({ env, catalog : [], isAccountActive : async id => id === account });
        const metadata = await handle (new Request ('https://auto3d.example/.well-known/oauth-protected-resource/mcp')); assert.deepEqual ((await metadata.json ()).authorization_servers, [issuer]);
        const request = token => new Request (resource, { method : 'POST', headers : { Authorization : 'Bearer ' + token, Accept : 'application/json, text/event-stream', 'Content-Type' : 'application/json', 'MCP-Protocol-Version' : '2025-06-18' }, body : JSON.stringify ({ jsonrpc : '2.0', id : 1, method : 'tools/call', params : { name : 'auto3d.sessions.list', arguments : {} } }) });
        assert.equal ((await handle (request ('invalid'))).status, 401); assert.deepEqual (names, []);
        const response = await handle (request ('valid')); assert.equal ((await response.json ()).result.structuredContent.result[0].connectionId, 'window'); assert.deepEqual (names, [account]); assert.equal (calls, 2);
        assert.equal ((await handle (new Request ('https://wrong.example/mcp'))).status, 404);
    });
});
