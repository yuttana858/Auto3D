import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AgentToolService } from '../agent-mcp/tool-service.js';
import { CreateMcpHttpHandler } from '../agent-mcp/http-handler.js';
import { SessionRouter } from '../agent-mcp/session-router.js';

describe ('MCP Streamable HTTP client interoperability', () => {
    for (const host of ['claude-compatible', 'copilot-compatible']) {
        it ('negotiates and selects an isolated session using a standards-based client: ' + host, async () => {
            const catalog = JSON.parse (await readFile ('website/assets/commands.json', 'utf8')).commands; const router = new SessionRouter ();
            router.Register ({ accountId : 'alice', instanceId : 'window', connectionId : 'connection', sessions : [{ id : 'box', name : 'Box', active : true }], deliver : async () => ({ ok : true, name : 'Box' }) });
            const actor = { accountId : 'alice', grantId : 'grant', scopes : ['auto3d.read'], expiresAt : Date.now () + 60000 }, service = new AgentToolService ({ router, catalog });
            const handle = CreateMcpHttpHandler ({ service, resourceMetadataUrl : 'https://auto3d.example/.well-known/oauth-protected-resource/mcp', verifyAccessToken : async token => { if (token !== 'test-token') { throw new Error ('Invalid token'); } return actor; } });
            const transport = new StreamableHTTPClientTransport (new URL ('https://auto3d.example/mcp'), { requestInit : { headers : { Authorization : 'Bearer test-token' } }, fetch : (input, init) => handle (new Request (input, init)) }); const client = new Client ({ name : host, version : '1' });
            try {
                await client.connect (transport); const tools = (await client.listTools ()).tools; assert.ok (tools.some (tool => tool.name === 'auto3d.sessions.select')); assert.ok (!tools.some (tool => tool.name === 'capture.image'));
                const listed = await client.callTool ({ name : 'auto3d.sessions.list', arguments : {} }); assert.equal (listed.structuredContent.result[0].connectionId, 'connection');
                const selected = await client.callTool ({ name : 'auto3d.sessions.select', arguments : { connectionId : 'connection', sessionId : 'box' } }); assert.equal (selected.structuredContent.result.sessionId, 'box');
                const scene = await client.callTool ({ name : 'scene.inspect', arguments : {} }); assert.equal (scene.structuredContent.result.name, 'Box');
            } finally { await client.close (); }
        });
    }
});
