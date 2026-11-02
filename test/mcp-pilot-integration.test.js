import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BrowserBridge } from '../agent-mcp/browser-bridge.js';
import { SessionRouter } from '../agent-mcp/session-router.js';
import { AgentToolService } from '../agent-mcp/tool-service.js';
import { CreateMcpHttpHandler } from '../agent-mcp/http-handler.js';
import { CommandRegistry } from '../source/website/commandregistry.js';

describe ('MCP read-only integration prototype', () => {
    it ('sends an authenticated MCP request to only its paired browser session', async () => {
        const catalog = JSON.parse (await readFile ('website/assets/commands.json', 'utf8')).commands, metadata = catalog.find (item => item.id === 'scene.inspect');
        const router = new SessionRouter (), website = { accountReady : true, auth : { user : { id : 'alice' } }, sessionEditor : { readOnly : false, sessions : { Inspect : () => ({ tabs : [{ id : 'session1', name : 'Box', active : true }] }) } } }; const registry = new CommandRegistry ({ website, readOnly : false }); registry.Register (metadata, () => ({ name : 'Box', objects : 1 })); website.commands = registry;
        const bridge = new BrowserBridge ({ website, instanceId : 'window1' }); const description = bridge.Connect (); router.Register ({ accountId : 'alice', connectionId : 'connection1', ...description, deliver : request => bridge.Execute (request) }); router.Pair ({ accountId : 'alice', grantId : 'grant1', connectionId : 'connection1', sessionId : 'session1', expiresAt : Date.now () + 60000 });
        const service = new AgentToolService ({ router, catalog }), handle = CreateMcpHttpHandler ({ service, resourceMetadataUrl : 'https://auto3d.test/metadata', verifyAccessToken : async token => { if (token !== 'test-token') { throw new Error ('Denied'); } return { accountId : 'alice', grantId : 'grant1', scopes : ['auto3d.read'] }; } });
        const payload = { jsonrpc : '2.0', id : 1, method : 'tools/call', params : { name : 'scene.inspect', arguments : {} } }; const request = () => new Request ('https://auto3d.test/mcp', { method : 'POST', headers : { Authorization : 'Bearer test-token', Accept : 'application/json, text/event-stream', 'Content-Type' : 'application/json', 'MCP-Protocol-Version' : '2025-06-18' }, body : JSON.stringify (payload) });
        const response = await handle (request ()); assert.equal (response.status, 200); const result = await response.json (); assert.equal (result.result.structuredContent.result.result.name, 'Box');
        bridge.Disconnect (); const disconnected = await handle (request ()); assert.equal ((await disconnected.json ()).result.isError, true);
    });
});
