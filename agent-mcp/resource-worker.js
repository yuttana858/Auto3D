import { CreateAccountActiveCheck, CreateResourceVerifier } from './identity.js';
import { CreateMcpHttpHandler } from './http-handler.js';
import { DurableRouter } from './durable-router.js';
import { AgentToolService } from './tool-service.js';

// Composition root for the read-only resource. Its bindings must be private;
// no Worker route or configuration is included until the pilot is reviewed.
export function CreateMcpResourceService ({ env, catalog, isAccountActive = CreateAccountActiveCheck (env) })
{
    const resource = String (env.AUTO3D_MCP_RESOURCE || ''), issuer = String (env.AUTO3D_MCP_ISSUER || ''); let resourceUrl, issuerUrl;
    try { resourceUrl = new URL (resource); issuerUrl = new URL (issuer); } catch { throw new Error ('Invalid MCP resource configuration.'); }
    if (resourceUrl.protocol !== 'https:' || issuerUrl.protocol !== 'https:' || resourceUrl.origin !== issuerUrl.origin || resourceUrl.href !== resource || issuerUrl.href !== issuer || [resourceUrl, issuerUrl].some (url => url.username || url.password || url.search || url.hash) || !Array.isArray (catalog) || typeof env.AUTO3D_AUTH_SERVER?.validateToken !== 'function' || typeof env.AUTO3D_AGENT_BROKER?.getByName !== 'function') { throw new Error ('Invalid MCP resource configuration.'); }
    const metadataPath = '/.well-known/oauth-protected-resource' + resourceUrl.pathname;
    const verifyAccessToken = CreateResourceVerifier ({ resource, validateToken : (audience, token) => env.AUTO3D_AUTH_SERVER.validateToken (audience, token), isAccountActive });
    const handle = CreateMcpHttpHandler ({ verifyAccessToken, resourceMetadataUrl : resourceUrl.origin + metadataPath, serviceForActor : actor => new AgentToolService ({ router : new DurableRouter ({ namespace : env.AUTO3D_AGENT_BROKER, accountId : actor.accountId }), catalog }) });
    return async request => {
        const url = new URL (request.url); if (url.origin !== resourceUrl.origin || url.search) { return new Response ('Not found.', { status : 404 }); }
        if (url.pathname === metadataPath && request.method === 'GET') { return Response.json ({ resource, authorization_servers : [issuer], scopes_supported : ['auto3d.read', 'auto3d.capture'], bearer_methods_supported : ['header'] }, { headers : { 'Cache-Control' : 'public, max-age=300', 'X-Content-Type-Options' : 'nosniff' } }); }
        if (url.pathname !== resourceUrl.pathname) { return new Response ('Not found.', { status : 404 }); } return handle (request);
    };
}
