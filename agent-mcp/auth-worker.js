import { CreateGrantHandler } from './grant-management.js';
import { CreateConsentHandler } from './consent.js';
import { CreateBrowserIdentity } from './identity.js';

function Configuration (env)
{
    const issuer = String (env.AUTO3D_MCP_ISSUER || ''); const resource = String (env.AUTO3D_MCP_RESOURCE || '');
    let issuerUrl, resourceUrl; try { issuerUrl = new URL (issuer); resourceUrl = new URL (resource); } catch { throw new Error ('Invalid MCP configuration.'); }
    if ([issuerUrl, resourceUrl].some (url => url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) || issuerUrl.href !== issuer || resourceUrl.href !== resource || issuerUrl.origin !== resourceUrl.origin || issuer.endsWith ('/') || !env.OAUTH_KV) { throw new Error ('Invalid MCP configuration.'); }
    const secret = String (env.AUTO3D_MCP_CONSENT_SECRET || ''); if (!/^[A-Za-z0-9_-]{43,}$/.test (secret)) { throw new Error ('Invalid MCP consent secret.'); }
    let key; try { key = Uint8Array.from (atob (secret.replace (/-/g, '+').replace (/_/g, '/') + '='.repeat ((4 - secret.length % 4) % 4)), c => c.charCodeAt (0)); } catch { throw new Error ('Invalid MCP consent secret.'); }
    if (key.length < 32) { throw new Error ('Invalid MCP consent secret.'); }
    return { issuer, resource, key, origin : issuerUrl.origin };
}

// This factory has no listener. Only a same-origin deployment can read the
// app's host-only cookies. Keep it private until integration is fully tested.
export function CreateAuthorizationService ({ OAuthAuthorizationServer, browserIdentity = CreateBrowserIdentity })
{
    if (typeof OAuthAuthorizationServer !== 'function' || typeof browserIdentity !== 'function') { throw new Error ('Authorization service configuration is required.'); }
    const create = env => {
        const config = Configuration (env);
        const provider = new OAuthAuthorizationServer ({ issuer : config.issuer, resources : [config.resource], scopesSupported : ['auto3d.read', 'auto3d.capture', 'offline_access'], clientIdMetadataDocumentEnabled : true, clientRegistrationEndpoint : config.issuer + '/register' });
        return { config, provider };
    };
    return {
        async fetch (request, env, ctx) {
            try {
                const { config, provider } = create (env); const url = new URL (request.url);
                if (url.origin !== config.origin) { return new Response ('Invalid origin.', { status : 400, headers : { 'Cache-Control' : 'no-store' } }); }
                if (url.pathname === new URL (config.issuer + '/authorize').pathname) { return CreateConsentHandler ({ oauth : provider.getOAuthApi (env), verifiedUser : browserIdentity (env), signingKey : config.key }) (request); }
                if ([new URL (config.issuer + '/grants').pathname, new URL (config.issuer + '/grants/revoke').pathname].includes (url.pathname)) { return CreateGrantHandler ({ oauth : provider.getOAuthApi (env), verifiedUser : browserIdentity (env) }) (request); }
                return await provider.fetch (request, env, ctx);
            } catch { return new Response ('Authorization service unavailable.', { status : 503, headers : { 'Cache-Control' : 'no-store' } }); }
        },
        async validateToken (resource, token, env) {
            const { config, provider } = create (env); if (resource !== config.resource) { return null; }
            return provider.validateToken (resource, token, env);
        }
    };
}
