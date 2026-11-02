import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { CreateMcpServer } from './mcp-server.js';

async function BoundedRequest (request, maximum)
{
    if (request.method !== 'POST') { return request; }
    if (Number (request.headers.get ('Content-Length')) > maximum) { throw new Error ('Request too large.'); }
    const reader = request.body?.getReader (); if (!reader) { return request; } const chunks = []; let length = 0;
    try { let done = false; while (!done) { const part = await reader.read (); done = part.done; if (done) { break; } length += part.value.byteLength; if (length > maximum) { await reader.cancel (); throw new Error ('Request too large.'); } chunks.push (part.value); } } finally { reader.releaseLock (); }
    const bytes = new Uint8Array (length); let offset = 0; for (const chunk of chunks) { bytes.set (chunk, offset); offset += chunk.byteLength; }
    return new Request (request.url, { method : request.method, headers : request.headers, body : bytes, signal : request.signal });
}

// Integration boundary only: verifyAccessToken must validate a real OAuth
// bearer token and return a trusted account/grant/scope context. This module
// intentionally cannot start a server without an injected verifier.
export function CreateMcpHttpHandler ({ service, serviceForActor, verifyAccessToken, resourceMetadataUrl })
{
    if ((!service && typeof serviceForActor !== 'function') || (service && serviceForActor) || typeof verifyAccessToken !== 'function' || typeof resourceMetadataUrl !== 'string' || !resourceMetadataUrl.startsWith ('https://')) { throw new Error ('MCP authorization configuration is required.'); }
    const metadata = new URL (resourceMetadataUrl); if (metadata.protocol !== 'https:' || metadata.username || metadata.password || metadata.hash || metadata.search) { throw new Error ('Invalid authorization metadata URL.'); }
    return async request => {
        const auth = request.headers.get ('Authorization') || ''; if (!/^Bearer [^\s]+$/i.test (auth)) { return new Response ('Authentication required.', { status : 401, headers : { 'WWW-Authenticate' : 'Bearer resource_metadata="' + metadata.href + '", scope="auto3d.read"', 'Cache-Control' : 'no-store' } }); }
        let actor, actorService; try { actor = await verifyAccessToken (auth.slice (7)); actorService = service || await serviceForActor (actor); actorService.Authorize (actor); } catch { return new Response ('Invalid authorization.', { status : 401, headers : { 'WWW-Authenticate' : 'Bearer resource_metadata="' + metadata.href + '", scope="auto3d.read"', 'Cache-Control' : 'no-store' } }); }
        let bounded; try { bounded = await BoundedRequest (request, 1024 * 1024); } catch { return new Response ('Request too large.', { status : 413, headers : { 'Cache-Control' : 'no-store' } }); }
        const server = CreateMcpServer ({ service : actorService, actor }); const transport = new WebStandardStreamableHTTPServerTransport ({ enableJsonResponse : true }); await server.connect (transport);
        return transport.handleRequest (bounded);
    };
}
