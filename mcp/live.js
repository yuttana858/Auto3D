import { AuthFetch, ValidateAccessToken } from './auth-handler.js';
import { ResourceFetch } from './resource-handler.js';
import { Gateway } from './gateway-handler.js';
import { BrowserIdentity } from './identity.js';
import { Json, PilotConfig, LiveMcpPath } from './common.js';
export async function HandleLiveMcp (context)
{
    const { request, env } = context, url = new URL (request.url);
    if (!LiveMcpPath (url.pathname)) { return null; }
    if (env.AUTO3D_MCP_LIVE_ADMIN !== '1') { return Json ({ error : 'Not found.' }, 404); }
    try {
        const config = PilotConfig (env);
        if (config.mode !== 'live-admin' || url.origin !== config.origin) { return Json ({ error : 'Use the canonical Auto3D origin.' }, 403); }
        if (url.pathname === '/mcp' || url.pathname === '/.well-known/oauth-protected-resource/mcp') { return ResourceFetch (request, env, context, ValidateAccessToken); }
        if (url.pathname === '/api/agent/config') {
            if (request.method !== 'GET' || url.search) { return Json ({ error : 'Invalid request.' }, 400); }
            const user = await BrowserIdentity (request, env);
            if (!user) { return Json ({ error : 'Administrator sign-in required.' }, 401); }
            if (request.headers.get ('X-Auto3D-Account') !== user.id) { return Json ({ error : 'Account changed.' }, 409); }
            return Json ({ pilot : true, mode : 'live-admin', mcpUrl : config.resource });
        }
        if (url.pathname === '/api/agent/connect' || url.pathname === '/api/agent/renew') { return Gateway (request, env); }
        return AuthFetch (request, env, context);
    } catch (error) { return Json ({ error : 'Administrator MCP access unavailable.' }, [401, 403].includes (error.status) ? error.status : 503); }
}
export default { async fetch (request, env, ctx) { return await HandleLiveMcp ({ request, env, waitUntil : promise => ctx.waitUntil (promise) }) || new Response ('Not found.', { status : 404 }); } };
