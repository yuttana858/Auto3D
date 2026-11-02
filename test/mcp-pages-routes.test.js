import assert from 'node:assert/strict';
import { onRequest as authorize } from '../functions/agent/[[path]].js';
import { onRequest as metadata } from '../functions/.well-known/oauth-authorization-server/[[path]].js';
import { onRequest as resourceMetadata } from '../functions/.well-known/oauth-protected-resource/[[path]].js';
import { onRequest as resource } from '../functions/mcp.js';
import { onRequest as connect } from '../functions/api/agent/connect.js';
import { onRequest as renew } from '../functions/api/agent/renew.js';

describe ('Same-origin MCP Pages routing', () => {
    it ('forwards only known routes to their private service bindings with the original request', async () => {
        const seen = [], endpoint = { fetch : request => { seen.push (request); return new Response ('forwarded'); } };
        const env = { AUTO3D_MCP_AUTH : endpoint, AUTO3D_MCP_RESOURCE : endpoint, AUTO3D_MCP_GATEWAY : endpoint };
        for (const [route, path] of [[authorize, '/agent/authorize?client_id=abc'], [authorize, '/agent/oauth/token'], [metadata, '/.well-known/oauth-authorization-server/agent'], [resourceMetadata, '/.well-known/oauth-protected-resource/mcp'], [resource, '/mcp'], [connect, '/api/agent/connect'], [renew, '/api/agent/renew']]) {
            const request = new Request ('https://auto3d.example' + path, { headers : { Cookie : 'private-cookie', Origin : 'https://auto3d.example' } });
            assert.equal ((await route ({ request, env })).status, 200); assert.equal (seen.at (-1), request);
        }
        assert.equal ((await authorize ({ request : new Request ('https://auto3d.example/agent/other'), env })).status, 404);
        assert.equal ((await resource ({ request : new Request ('https://auto3d.example/mcp'), env : {} })).status, 503);
    });
});
