import assert from 'node:assert/strict';
import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Real OAuth/DO/KV runtime with synthetic identity and hosted client metadata.
// No calls reach a live account, Supabase, Cloudflare API, or ChatGPT.
export async function BrowserOAuthRuntime (callback)
{
    const origin = 'https://auto3d-5av.pages.dev', userId = '11111111-1111-4111-8111-111111111111';
    const clientId = 'https://client.example/oauth.json';
    const bindings = { AUTO3D_MCP_LIVE_ADMIN : '1', AUTO3D_MCP_ORIGIN : origin, AUTO3D_MCP_LIVE_ACCOUNTS : userId, AUTO3D_MCP_PRODUCTION_SUPABASE_URL : 'https://stagingtest.supabase.co', SUPABASE_URL : 'https://stagingtest.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_browser_fixture', AUTO3D_MCP_CONSENT_SECRET : 'a'.repeat (43) };
    const user = { id : userId, email : 'fixture@example.test', email_confirmed_at : '2026-01-01T00:00:00Z' };
    const outboundService = async request => {
        const url = new URL (request.url);
        if (url.href === clientId) { return Response.json ({ client_id : clientId, client_name : 'Hosted OAuth browser fixture', redirect_uris : [callback], token_endpoint_auth_method : 'none', grant_types : ['authorization_code', 'refresh_token'], response_types : ['code'] }); }
        assert.equal (url.hostname, 'stagingtest.supabase.co');
        if (url.pathname === '/auth/v1/user' || url.pathname === '/auth/v1/admin/users/' + userId) { return Response.json (user); }
        if (url.pathname.endsWith ('/auto3d_session_active')) { return Response.json (true); }
        if (url.pathname.endsWith ('/auto3d_admin_emails')) { return Response.json ([{ email : user.email }]); }
        if (url.pathname.endsWith ('/auto3d_account_controls')) { return Response.json ([]); }
        return Response.json ({ error : 'Unexpected fixture request.' }, { status : 500 });
    };
    const worker = role => ({ name : role, modules : true, scriptPath : path.resolve ('build/mcp-workers/' + role + '.js'), compatibilityDate : '2026-11-03', compatibilityFlags : ['nodejs_compat', 'global_fetch_strictly_public'], bindings, outboundService });
    const durableObjects = { AUTO3D_AGENT_BROKER : { className : 'Auto3DAgentBroker', scriptName : 'broker', storage : 'sqlite' } };
    const runtime = new Miniflare (convertV4MiniflareOptions ({ workers : [{ ...worker ('live'), durableObjects, kvNamespaces : ['OAUTH_KV'] }, { ...worker ('broker'), durableObjects }] }));
    await runtime.ready;
    const accessCookie = 'e30.' + Buffer.from (JSON.stringify ({ sub : userId, session_id : userId })).toString ('base64url') + '.fixture';
    return { runtime, origin, userId, clientId, callback, accessCookie };
}
