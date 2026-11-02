import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CreateMcpServer } from '../agent-mcp/mcp-server.js';
import { AgentToolService } from '../agent-mcp/tool-service.js';
import { SessionRouter } from '../agent-mcp/session-router.js';

describe ('MCP SDK read-only prototype', () => {
    it ('lists and invokes a paired read-only scene tool over the MCP protocol', async () => {
        const catalog = JSON.parse (await readFile ('website/assets/commands.json', 'utf8')).commands, router = new SessionRouter (); let deliveries = 0;
        router.Register ({ accountId : 'alice', instanceId : 'window', connectionId : 'connection', sessions : [{ id : 'session', name : 'Box', active : true }], deliver : async request => { deliveries++; return { ok : true, sessionId : request.sessionId }; } }); router.Pair ({ accountId : 'alice', grantId : 'grant', connectionId : 'connection', sessionId : 'session', expiresAt : Date.now () + 10000 });
        const service = new AgentToolService ({ router, catalog }), actor = { accountId : 'alice', grantId : 'grant', scopes : ['auto3d.read'] }; const server = CreateMcpServer ({ service, actor, newRequestId : () => 'request1' }), client = new Client ({ name : 'test', version : '1' }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair ();
        try { await server.connect (serverTransport); await client.connect (clientTransport); const tools = (await client.listTools ()).tools; assert.ok (tools.some (tool => tool.name === 'scene.inspect')); assert.ok (!tools.some (tool => tool.name === 'object.delete')); const response = await client.callTool ({ name : 'scene.inspect', arguments : {} }); assert.equal (response.structuredContent.result.sessionId, 'session'); assert.equal (deliveries, 1); const error = await client.callTool ({ name : 'object.delete', arguments : {} }); assert.equal (error.isError, true); assert.equal (deliveries, 1); }
        finally { await client.close (); await server.close (); }
    });
    it ('selects only an explicitly chosen session belonging to the authorized account', async () => {
        const catalog = JSON.parse (await readFile ('website/assets/commands.json', 'utf8')).commands, router = new SessionRouter ();
        for (const [accountId, connectionId, sessionId] of [['alice', 'first', 'box'], ['alice', 'second', 'bottle'], ['bob', 'other', 'private']]) {
            router.Register ({ accountId, instanceId : connectionId, connectionId, sessions : [{ id : sessionId, name : sessionId, active : true }], deliver : async () => ({ sessionId }) });
        }
        const actor = { accountId : 'alice', grantId : 'grant', scopes : ['auto3d.read'], expiresAt : Date.now () + 10000 };
        const server = CreateMcpServer ({ service : new AgentToolService ({ router, catalog }), actor, newRequestId : () => 'request2' }), client = new Client ({ name : 'test', version : '1' }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair ();
        try {
            await server.connect (serverTransport); await client.connect (clientTransport);
            const available = await client.callTool ({ name : 'auto3d.sessions.list', arguments : {} }); assert.deepEqual (available.structuredContent.result.map (item => item.connectionId), ['first', 'second']);
            assert.equal ((await client.callTool ({ name : 'auto3d.sessions.select', arguments : { connectionId : 'other', sessionId : 'private' } })).isError, true);
            assert.equal ((await client.callTool ({ name : 'scene.inspect', arguments : {} })).isError, true);
            assert.equal ((await client.callTool ({ name : 'auto3d.sessions.select', arguments : { connectionId : 'second', sessionId : 'bottle' } })).structuredContent.result.sessionId, 'bottle');
            assert.equal ((await client.callTool ({ name : 'scene.inspect', arguments : {} })).structuredContent.result.sessionId, 'bottle');
        } finally { await client.close (); await server.close (); }
    });

});
