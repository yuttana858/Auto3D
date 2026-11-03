import { WorkerEntrypoint } from 'cloudflare:workers';
import { OAuthResourceServer } from '@cloudflare/workers-oauth-provider';
import catalog from '../website/assets/commands.json';
import { Json, PilotConfig } from './common.js';
import { PilotService } from './service.js';
import { HandleMcp } from './transport.js';

export default class Auto3DResource extends WorkerEntrypoint
{
    async fetch (request)
    {
        try {
            const config = PilotConfig (this.env), url = new URL (request.url);
            if (url.origin !== config.origin || url.search || !['/mcp', '/.well-known/oauth-protected-resource/mcp'].includes (url.pathname)) { return Json ({ error : 'Not found.' }, 404); }
            const resource = new OAuthResourceServer ({
                resourceMetadata : { resource : config.resource, authorization_servers : [config.issuer] }, requiredScopes : ['auto3d.read'],
                validateToken : env => (audience, token) => env.AUTO3D_AUTH_SERVER.validateToken (audience, token),
                handler : { fetch : async (req, env, ctx) => {
                    const actor = { ...ctx.auth, props : ctx.props };
                    const service = new PilotService (env.AUTO3D_AGENT_BROKER.getByName (actor.userId), catalog.commands);
                    return HandleMcp (req, service, actor);
                } }
            });
            return await resource.fetch (request, this.env, this.ctx);
        } catch { return Json ({ error : 'MCP service unavailable.' }, 503); }
    }
}
