import assert from 'node:assert/strict';
import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Real workerd/DO/KV and OAuth library; identity is a disposable in-process fixture.
// These tests make no requests to Supabase, Cloudflare or ChatGPT.
const userA = '11111111-1111-4111-8111-111111111111', userB = '22222222-2222-4222-8222-222222222222';
const tokenFor = id => 'e30.' + Buffer.from (JSON.stringify ({ sub : id, session_id : id })).toString ('base64url') + '.fixture';
const cookieFor = id => '__Host-auto3d-access=' + tokenFor (id);
const baseBindings = { AUTO3D_MCP_PILOT : '1', AUTO3D_MCP_ORIGIN : 'https://auto3d-mcp-pilot.pages.dev', AUTO3D_MCP_PILOT_ACCOUNTS : [userA, userB].join (','), AUTO3D_MCP_STAGING_SUPABASE_URL : 'https://stagingtest.supabase.co', AUTO3D_MCP_PRODUCTION_SUPABASE_URL : 'https://productiontest.supabase.co', SUPABASE_URL : 'https://stagingtest.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_disposable_test_fixture', AUTO3D_MCP_CONSENT_SECRET : 'a'.repeat (43) };

for (const live of [false, true]) {
const origin = live ? 'https://auto3d-5av.pages.dev' : 'https://auto3d-mcp-pilot.pages.dev';
const bindings = live ? { ...baseBindings, AUTO3D_MCP_PILOT : '0', AUTO3D_MCP_LIVE_ADMIN : '1', AUTO3D_MCP_ORIGIN : origin, AUTO3D_MCP_LIVE_ACCOUNTS : [userA, userB].join (','), AUTO3D_MCP_PRODUCTION_SUPABASE_URL : baseBindings.SUPABASE_URL } : baseBindings;
describe ((live ? 'Live administrator MCP' : 'MCP pilot') + ' on the Workers runtime', function () {
    this.timeout (30000);
    let mf, nextId = 0, clientId, socket;
    const inactive = new Set ();
    const fetch = (pathname, options = {}) => mf.dispatchFetch (origin + pathname, options);
    const userHeaders = id => ({ Cookie : cookieFor (id), 'X-Auto3D-Account' : id });
    const post = (pathname, body, id = userA) => fetch (pathname, { method : 'POST', headers : { ...userHeaders (id), Origin : origin, 'Content-Type' : 'application/json' }, body : JSON.stringify (body) });
    const rpc = (token, method, params = {}) => fetch ('/mcp', { method : 'POST', headers : { Authorization : 'Bearer ' + token, Accept : 'application/json, text/event-stream', 'Content-Type' : 'application/json' }, body : JSON.stringify ({ jsonrpc : '2.0', id : ++nextId, method, params }) });
    const message = ws => new Promise ((resolve, reject) => {
        const timer = setTimeout (() => reject (new Error ('Browser fixture timed out.')), 5000);
        ws.addEventListener ('message', event => { clearTimeout (timer); resolve (JSON.parse (event.data)); }, { once : true });
    });
    async function begin (id = userA, scope = 'auto3d.read offline_access')
    {
        const verifier = Buffer.from (crypto.getRandomValues (new Uint8Array (32))).toString ('base64url');
        const challenge = Buffer.from (await crypto.subtle.digest ('SHA-256', new TextEncoder ().encode (verifier))).toString ('base64url');
        const params = new URLSearchParams ({ client_id : clientId, response_type : 'code', redirect_uri : 'https://client.example/callback', resource : origin + '/mcp', scope, state : 'test-state', code_challenge : challenge, code_challenge_method : 'S256' });
        const response = await fetch ('/oauth/authorize?' + params, { headers : userHeaders (id) }); assert.equal (response.status, 200);
        const html = await response.text ();
        assert.ok (!html.includes ('<script>evil</script>')); assert.ok (html.includes ('&#60;script&#62;evil&#60;/script&#62;'));
        const form = new URLSearchParams ({ handle : html.match (/name="handle" value="([^"]+)"/)[1], binding : html.match (/name="binding" value="([^"]+)"/)[1], name : 'My review agent', harness : 'chatgpt', decision : 'approve' });
        const cookies = [cookieFor (id), ...response.headers.getSetCookie ().map (value => value.split (';')[0])].join ('; ');
        return { verifier, form, cookies };
    }
    const approve = (flow, id = userA) => fetch ('/oauth/authorize', { method : 'POST', headers : { Cookie : flow.cookies, Origin : origin, 'Content-Type' : 'application/x-www-form-urlencoded' }, body : flow.form.toString (), redirect : 'manual' });
    async function grant (id = userA, scope)
    {
        const before = await (await fetch ('/api/agent/registrations', { headers : userHeaders (id) })).json ();
        const flow = await begin (id, scope), approval = await approve (flow, id); assert.equal (approval.status, 302);
        const redirect = new URL (approval.headers.get ('Location')); assert.equal (redirect.searchParams.get ('state'), 'test-state'); assert.equal (redirect.searchParams.get ('iss'), origin + '/oauth');
        const response = await fetch ('/oauth/oauth/token', { method : 'POST', headers : { 'Content-Type' : 'application/x-www-form-urlencoded' }, body : new URLSearchParams ({ grant_type : 'authorization_code', client_id : clientId, code : redirect.searchParams.get ('code'), code_verifier : flow.verifier, redirect_uri : 'https://client.example/callback', resource : origin + '/mcp' }).toString () });
        assert.equal (response.status, 200);
        const after = await (await fetch ('/api/agent/registrations', { headers : userHeaders (id) })).json ();
        const registration = after.registrations.find (record => !before.registrations.some (previous => previous.id === record.id));
        assert.ok (registration); return { ...await response.json (), registrationId : registration.id };
    }
    before (async () => {
        const outboundService = async request => {
            const url = new URL (request.url); assert.equal (url.hostname, 'stagingtest.supabase.co');
            if (url.pathname.startsWith ('/auth/v1/admin/users/')) { const id = url.pathname.split ('/').pop (); return Response.json ({ id, email : id + '@example.test', email_confirmed_at : '2026-01-01T00:00:00Z' }); }
            if (url.pathname === '/auth/v1/user') {
                const token = request.headers.get ('Authorization')?.slice (7), id = token ? JSON.parse (Buffer.from (token.split ('.')[1], 'base64url')).sub : null;
                return Response.json ({ id, email : id + '@example.test', email_confirmed_at : '2026-01-01T00:00:00Z' });
            }
            if (url.pathname.endsWith ('/auto3d_session_active')) { const body = await request.json (); return Response.json (!inactive.has (body.p_user_id)); }
            if (url.pathname.endsWith ('/auto3d_account_controls')) { const id = url.searchParams.get ('user_id')?.slice (3); return Response.json (inactive.has (id) ? [{ disabled : true }] : []); }
            if (url.pathname.endsWith ('/auto3d_admin_emails')) { return Response.json (url.searchParams.get ('email')?.includes (userA) ? [{ email : userA + '@example.test' }] : []); }
            return Response.json ({ error : 'Unexpected fixture route.' }, { status : 500 });
        };
        const worker = role => ({ name : role, modules : true, scriptPath : path.resolve ('build/mcp-workers/' + role + '.js'), compatibilityDate : '2026-11-03', compatibilityFlags : ['nodejs_compat', 'global_fetch_strictly_public'], bindings, outboundService });
        const durableObjects = { AUTO3D_AGENT_BROKER : { className : 'Auto3DAgentBroker', scriptName : 'broker', storage : 'sqlite' } };
        mf = new Miniflare (convertV4MiniflareOptions ({ workers : [
            { ...worker (live ? 'live' : 'pages-worker'), durableObjects, kvNamespaces : live ? ['OAUTH_KV'] : undefined, serviceBindings : { AUTO3D_MCP_AUTH : 'auth', AUTO3D_MCP_GATEWAY : 'gateway', AUTO3D_MCP_RESOURCE : 'resource', ASSETS : () => Response.json ({ static : true }) } },
            { ...worker ('broker'), durableObjects },
            { ...worker ('auth'), durableObjects, kvNamespaces : ['OAUTH_KV'] },
            { ...worker ('gateway'), durableObjects },
            { ...worker ('resource'), durableObjects, serviceBindings : { AUTO3D_AUTH_SERVER : 'auth' } }
        ] }));
        await mf.ready;
        const registration = await post ('/oauth/register', { client_name : '<script>evil</script>', redirect_uris : ['https://client.example/callback'], token_endpoint_auth_method : 'none', grant_types : ['authorization_code', 'refresh_token'], response_types : ['code'] });
        assert.equal (registration.status, 201); clientId = (await registration.json ()).client_id;
    });
    after (async () => { socket?.close (); await mf?.dispose (); });

    it ('publishes OAuth/resource discovery and challenges unauthenticated MCP requests', async () => {
        const discovery = await fetch ('/.well-known/oauth-authorization-server/oauth'); assert.equal (discovery.status, 200); assert.equal ((await discovery.json ()).issuer, origin + '/oauth');
        const metadata = await fetch ('/.well-known/oauth-protected-resource/mcp'); assert.equal ((await metadata.json ()).resource, origin + '/mcp');
        const response = await fetch ('/mcp'); assert.equal (response.status, 401); assert.match (response.headers.get ('WWW-Authenticate'), /oauth-protected-resource/);
    });
    it ('binds consent to its original browser and account', async () => {
        const flow = await begin ();
        const wrongAccount = { ...flow, cookies : flow.cookies.replace (cookieFor (userA), cookieFor (userB)) };
        assert.equal ((await approve (wrongAccount, userB)).status, 403);
        const noCookie = { ...flow, cookies : cookieFor (userA) };
        assert.notEqual ((await approve (noCookie)).status, 302);
        const success = await approve (flow); assert.equal (success.status, 302); assert.notEqual ((await approve (flow)).status, 302);
    });
    it ('enforces PKCE and rejects a different token resource', async () => {
        const flow = await begin (), approved = await approve (flow), code = new URL (approved.headers.get ('Location')).searchParams.get ('code');
        const response = await fetch ('/oauth/oauth/token', { method : 'POST', headers : { 'Content-Type' : 'application/x-www-form-urlencoded' }, body : new URLSearchParams ({ grant_type : 'authorization_code', code, client_id : clientId, code_verifier : 'z'.repeat (43), redirect_uri : 'https://client.example/callback', resource : origin + '/mcp' }).toString () });
        assert.equal (response.status, 400);
        const token = await grant (); const auth = await mf.getWorker ('auth'); assert.equal (await auth.validateToken ('https://other.example/mcp', token.access_token), null);
    });
    it ('keeps accounts, browser windows and selected sessions separate through real MCP calls', async () => {
        const token = await grant (), other = live ? null : await grant (userB);
        const upgrade = await fetch ('/api/agent/connect', { headers : { Cookie : cookieFor (userA), Origin : origin, Upgrade : 'websocket' } }); assert.equal (upgrade.status, 101);
        socket = upgrade.webSocket; socket.accept (); const ack = message (socket);
        socket.send (JSON.stringify ({ type : 'hello', instanceId : 'window-a', windowLabel : 'Review window', sessions : [{ id : 'tab-a', name : 'Test box', active : true }] }));
        const hello = await ack;
        const initialized = await rpc (token.access_token, 'initialize', { protocolVersion : '2025-03-26', capabilities : {}, clientInfo : { name : 'test client', version : '1' } }); assert.equal (initialized.status, 200);
        const tools = await (await rpc (token.access_token, 'tools/list')).json (); assert.ok (!tools.result.tools.some (tool => tool.name === 'capture.image' || tool.name === 'auth.sign_out'));
        if (other) { const otherList = await (await rpc (other.access_token, 'tools/call', { name : 'auto3d.sessions.list', arguments : {} })).json (); assert.deepEqual (JSON.parse (otherList.result.content[0].text), []); }
        const selected = await rpc (token.access_token, 'tools/call', { name : 'auto3d.sessions.select', arguments : { connectionId : hello.connectionId, sessionId : 'tab-a' } }); assert.equal (selected.status, 200);
        const waiting = message (socket); // access_changed from pairing is sent before dispatch
        const inspectPromise = rpc (token.access_token, 'tools/call', { name : 'scene.inspect', arguments : {} });
        let request = await waiting; if (request.type === 'access_changed') { request = await message (socket); }
        assert.equal (request.sessionId, 'tab-a'); socket.send (JSON.stringify ({ type : 'result', requestId : request.requestId, sessionId : request.sessionId, result : { ok : true, command : 'scene.inspect', result : { objects : [{ name : 'Test box' }] } } }));
        const inspected = await (await inspectPromise).json (); assert.equal (JSON.parse (inspected.result.content[0].text).objects[0].name, 'Test box');
        const records = await (await fetch ('/api/agent/registrations', { headers : userHeaders (userA) })).json ();
        const active = records.registrations.find (record => record.id === token.registrationId);
        assert.equal ((await post ('/api/agent/registrations', { action : 'revoke', id : active.id })).status, 200);
        assert.equal ((await rpc (token.access_token, 'tools/list')).status, 401);
        const refreshed = await fetch ('/oauth/oauth/token', { method : 'POST', headers : { 'Content-Type' : 'application/x-www-form-urlencoded' }, body : new URLSearchParams ({ grant_type : 'refresh_token', refresh_token : token.refresh_token, client_id : clientId, resource : origin + '/mcp' }).toString () }); assert.equal (refreshed.status, 400);
    });
    it ('blocks production data routes, forged origins, account mismatches and non-admin controls', async () => {
        assert.ok ([403, 404].includes ((await post ('/api/personal/items', {})).status));
        assert.equal ((await fetch ('/api/agent/registrations', { headers : { Cookie : cookieFor (userA), 'X-Auto3D-Account' : userB } })).status, 409);
        assert.equal ((await fetch ('/api/agent/renew', { method : 'POST', headers : { ...userHeaders (userA), Origin : 'https://evil.example', 'Content-Type' : 'application/json' }, body : '{}' })).status, 403);
        assert.equal ((await post ('/api/agent/admin', { accountId : userA, action : 'disable', disabled : true }, userB)).status, 403);
        assert.equal ((await post ('/api/agent/admin', { accountId : userB, action : 'disable', disabled : true })).status, 200);
        if (live) {
            assert.equal ((await fetch ('/api/agent/config', { headers : userHeaders (userB) })).status, 403);
            assert.equal ((await fetch ('/oauth/authorize', { headers : userHeaders (userB) })).status, 403);
        }
    });
    it ('keeps separate grants for one harness independently revocable and denies screenshots without scope', async () => {
        const first = await grant (), second = await grant ();
        assert.equal ((await rpc (first.access_token, 'tools/list')).status, 200);
        const denied = await (await rpc (second.access_token, 'tools/call', { name : 'capture.image', arguments : {} })).json (); assert.equal (denied.result.isError, true);
        await post ('/api/agent/registrations', { id : first.registrationId, action : 'revoke' });
        assert.equal ((await rpc (first.access_token, 'tools/list')).status, 401); assert.equal ((await rpc (second.access_token, 'tools/list')).status, 200);
    });
    it ('forwards standard MCP image content only with screenshot scope and rejects account revocation', async () => {
        const token = await grant (userA, 'auto3d.read auto3d.capture offline_access');
        const listed = await (await rpc (token.access_token, 'tools/call', { name : 'auto3d.sessions.list', arguments : {} })).json ();
        const target = JSON.parse (listed.result.content[0].text)[0];
        await rpc (token.access_token, 'tools/call', { name : 'auto3d.sessions.select', arguments : { connectionId : target.connectionId, sessionId : 'tab-a' } });
        const waiting = message (socket), pending = rpc (token.access_token, 'tools/call', { name : 'capture.image', arguments : { maxSize : 256 } });
        let request = await waiting; if (request.type === 'access_changed') { request = await message (socket); }
        const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH1cAAAAASUVORK5CYII=';
        socket.send (JSON.stringify ({ type : 'result', requestId : request.requestId, sessionId : 'tab-a', result : { ok : true, command : 'capture.image', result : { scope : 'viewport', width : 1, height : 1, content : [{ type : 'image', mimeType : 'image/png', data }] } } }));
        const result = await (await pending).json (); assert.equal (result.result.content[1].type, 'image'); assert.equal (result.result.content[1].data, data);
        inactive.add (userA); assert.equal ((await rpc (token.access_token, 'tools/list')).status, 401); inactive.delete (userA);
    });
});

}
