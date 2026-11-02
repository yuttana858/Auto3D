import assert from 'node:assert/strict';
import { CreateMcpHttpHandler } from '../agent-mcp/http-handler.js';

describe ('MCP HTTP boundary', () => {
    it ('requires injected verification and rejects missing or invalid bearer credentials before protocol handling', async () => {
        const service = { Authorize : actor => { if (!actor || !actor.scopes?.includes ('auto3d.read')) { throw new Error ('Denied'); } }, ListTools : () => [], ListSessions : () => [] }; assert.throws (() => CreateMcpHttpHandler ({ service, resourceMetadataUrl : 'https://auto3d.test/meta' }), /configuration/);
        let verifies = 0; const handle = CreateMcpHttpHandler ({ service, resourceMetadataUrl : 'https://auto3d.test/meta', verifyAccessToken : async token => { verifies++; if (token !== 'valid') { throw new Error ('Invalid'); } return { accountId : 'alice', grantId : 'grant', scopes : ['auto3d.read'] }; } });
        const request = headers => new Request ('https://auto3d.test/mcp', { method : 'POST', headers, body : JSON.stringify ({ jsonrpc : '2.0', id : 1, method : 'tools/list' }) });
        const unauthenticated = await handle (request ({})); assert.equal (unauthenticated.status, 401); assert.match (unauthenticated.headers.get ('WWW-Authenticate'), /scope="auto3d.read"/); assert.equal (verifies, 0); assert.equal ((await handle (request ({ Authorization : 'Bearer invalid' }))).status, 401); assert.equal (verifies, 1);
        const response = await handle (request ({ Authorization : 'Bearer valid', Accept : 'application/json, text/event-stream', 'Content-Type' : 'application/json', 'MCP-Protocol-Version' : '2025-06-18' })); assert.equal (response.status, 200); const result = await response.json (); assert.equal (result.result.tools[0].name, 'auto3d.sessions.list');
        const large = new Request ('https://auto3d.test/mcp', { method : 'POST', headers : { Authorization : 'Bearer valid', 'Content-Type' : 'application/json' }, body : 'x'.repeat (1024 * 1024 + 1) }); assert.equal ((await handle (large)).status, 413);
    });
});
