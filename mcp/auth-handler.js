import { AuthorizationError, CimdFetchError, OAuthError } from '@cloudflare/workers-oauth-provider';
import { AuthorizationProvider, Consent, ManageRegistrations } from './authorization.js';
import { ErrorCode, PilotConfig, Json } from './common.js';
import { ActiveRegistration } from './identity.js';

export async function AuthFetch (request, env, ctx)
{
    try {
        const config = PilotConfig (env), url = new URL (request.url);
        if (url.origin !== config.origin) { return Json ({ error : 'Invalid origin.' }, 403); }
        const provider = AuthorizationProvider (env);
        if (url.pathname === '/oauth/authorize') { return await Consent (request, env, provider); }
        if (['/api/agent/registrations', '/api/agent/admin'].includes (url.pathname)) { return await ManageRegistrations (request, env); }
        return await provider.fetch (request, env, ctx);
    } catch (error) {
        if (error instanceof AuthorizationError && request.method === 'POST' && new URL (request.url).pathname === '/oauth/authorize') {
            return Json ({ error : 'This permission request expired or was already used. Restart the connection from ChatGPT.', code : 'CONSENT_REQUEST_INVALID' }, 400);
        }
        return Json ({ error : 'Agent authorization unavailable. Start again.' }, error instanceof AuthorizationError || error instanceof CimdFetchError ? 400 : [400, 401, 403].includes (error.status) ? error.status : 503);
    }
}
export async function ValidateAccessToken (resource, token, env)
{
    const config = PilotConfig (env); if (resource !== config.resource) { return null; }
    const result = await AuthorizationProvider (env).validateToken (resource, token, env);
    if (!result?.userId || !result.props?.registrationId) { return null; }
    try { await ActiveRegistration (env, result.userId, result.props.registrationId); }
    catch (error) {
        // Revoked access is a 401; an outage must not look like an invalid token.
        if (ErrorCode (error) === 'revoked') { return null; }
        throw new OAuthError ('temporarily_unavailable', { description : 'Auto3D is temporarily unavailable. Retry later.', statusCode : 503, headers : { 'Retry-After' : '30' } });
    }
    return result;
}
