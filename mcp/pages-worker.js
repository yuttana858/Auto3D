import { onRequest as AuthRequest } from '../functions/api/auth/[[path]].js';
import { BrowserIdentity } from './identity.js';
import { Json, PilotConfig } from './common.js';

// Advanced-mode Pages artifact: production Library/AI routes are never bundled.
export async function PilotPages (request, env, ctx)
{
    let config;
    try { config = PilotConfig (env); } catch { return Json ({ error : 'Staging configuration is incomplete.' }, 503); }
    const url = new URL (request.url);
    if (url.origin !== config.origin) { return Json ({ error : 'Use the canonical staging origin.' }, 403); }
    if (url.pathname === '/mcp' || url.pathname === '/.well-known/oauth-protected-resource/mcp') { return env.AUTO3D_MCP_RESOURCE.fetch (request); }
    if (url.pathname.startsWith ('/oauth/') || url.pathname === '/.well-known/oauth-authorization-server/oauth') { return env.AUTO3D_MCP_AUTH.fetch (request); }
    if (['/api/agent/registrations', '/api/agent/admin'].includes (url.pathname)) { return env.AUTO3D_MCP_AUTH.fetch (request); }
    if (['/api/agent/connect', '/api/agent/renew'].includes (url.pathname)) { return env.AUTO3D_MCP_GATEWAY.fetch (request); }
    if (['/api/auth/login', '/api/auth/session', '/api/auth/refresh', '/api/auth/logout'].includes (url.pathname)) {
        // Supabase/session helpers below receive only the isolated staging project.
        return AuthRequest ({ request, env, params : { path : [url.pathname.split ('/').pop ()] } });
    }
    if (url.pathname.startsWith ('/api/')) {
        const user = await BrowserIdentity (request, env); if (!user) { return Json ({ error : 'Sign in.' }, 401); }
        if (request.headers.get ('X-Auto3D-Account') !== user.id) { return Json ({ error : 'Account changed.' }, 409); }
        if (url.pathname === '/api/agent/config' && request.method === 'GET') { return Json ({ pilot : true, mcpUrl : config.resource }); }
        // Defaults allow the existing login gate to initialize. No save is reported.
        if (url.pathname === '/api/preferences' && request.method === 'GET') { return Json ({ preferences : {}, folders : [], pilot : true, writable : false }); }
        return Json ({ error : 'This API is disabled in the isolated MCP pilot. Use local files and disposable test data.' }, 403);
    }
    const response = await env.ASSETS.fetch (request);
    const headers = new Headers (response.headers); headers.set ('X-Robots-Tag', 'noindex, nofollow');
    return new Response (response.body, { status : response.status, headers });
}
export default { async fetch (request, env, ctx) { try { return await PilotPages (request, env, ctx); } catch { return Json ({ error : 'Staging request unavailable.' }, 503); } } };
