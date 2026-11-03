import { WorkerEntrypoint } from 'cloudflare:workers';
import { AuthorizationError, CimdFetchError } from '@cloudflare/workers-oauth-provider';
import { AuthorizationProvider, Consent, ManageRegistrations } from './authorization.js';
import { PilotConfig, Json } from './common.js';
import { ActiveRegistration } from './identity.js';

export default class Auto3DAuth extends WorkerEntrypoint
{
    async fetch (request)
    {
        try {
            const config = PilotConfig (this.env), url = new URL (request.url);
            if (url.origin !== config.origin) { return Json ({ error : 'Invalid origin.' }, 403); }
            const provider = AuthorizationProvider (this.env);
            if (url.pathname === '/oauth/authorize') { return await Consent (request, this.env, provider); }
            if (['/api/agent/registrations', '/api/agent/admin'].includes (url.pathname)) { return await ManageRegistrations (request, this.env); }
            return await provider.fetch (request, this.env, this.ctx);
        } catch (error) { return Json ({ error : 'Agent authorization unavailable. Start again.' }, error instanceof AuthorizationError || error instanceof CimdFetchError ? 400 : [400, 401, 403].includes (error.status) ? error.status : 503); }
    }
    async validateToken (resource, token)
    {
        const config = PilotConfig (this.env); if (resource !== config.resource) { return null; }
        const result = await AuthorizationProvider (this.env).validateToken (resource, token, this.env);
        if (!result?.userId || !result.props?.registrationId) { return null; }
        try { await ActiveRegistration (this.env, result.userId, result.props.registrationId); } catch { return null; }
        return result;
    }
}
