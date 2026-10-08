import { onRequest as files } from '../functions/_middleware.js';
import assert from 'node:assert/strict';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { onRequest as route } from '../functions/api/auth/[[path]].js';
import { AccessCookie, LoggedOutCookie, AuthResponse } from '../functions/_lib/auth.js';
import { AuthService } from '../source/website/authservice.js';
import { CommandRegistry } from '../source/website/commandregistry.js';
const user = { id : '12345678-1234-1234-1234-123456789abc', email : 'user@example.com' };
const token = 'head.' + Buffer.from (JSON.stringify ({ session_id : user.id })).toString ('base64url') + '.signature';
const env = { SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test' };
const context = (path, cookie = '', method = 'GET', origin = 'https://app.example') => ({ env, data : {}, params : { path : [path.split ('/').pop ()] }, request : new Request ('https://app.example' + path, { method, headers : { Cookie : cookie, Origin : origin } }), next : async () => Response.json ({ allowed : true }) });
describe ('Mandatory login and logout protection', () => {
    let originalFetch;
    beforeEach (() => { originalFetch = global.fetch; }); afterEach (() => { global.fetch = originalFetch; });
    it ('blocks every resource API when unsigned, while allowing login and account requests', async () => {
        for (const path of ['library', 'share', 'ai', 'environments', 'knowledge/paper-packaging', 'accounts/admin', 'health']) { assert.equal ((await middleware (context ('/api/' + path))).status, 401); }
        for (const path of ['/api/auth/login', '/api/auth/session', '/api/accounts/request']) { assert.equal ((await middleware (context (path))).status, 200); }
    });
    it ('protects direct model and embedded-viewer URLs while retaining public login assets', async () => {
        assert.equal ((await files (context ('/assets/models/sample.glb'))).status, 401);
        const redirect = await files (context ('/embed.html')); assert.equal (redirect.status, 302); assert.equal (redirect.headers.get ('Location'), 'https://app.example/');
        assert.equal ((await files (context ('/index.html'))).status, 200);
        assert.equal ((await files (context ('/build/app.js'))).status, 200);
    });
    it ('only explicit password login can clear the persistent logout cookie', () => {
        const tokens = { access_token : token, refresh_token : 'refresh' };
        assert.ok (AuthResponse ({}, 200, null, true, 'logout').headers.getSetCookie ().some ((cookie) => cookie.startsWith (LoggedOutCookie + '=1')));
        assert.ok (!AuthResponse ({}, 200, tokens).headers.getSetCookie ().some ((cookie) => cookie.startsWith (LoggedOutCookie)));
        assert.ok (AuthResponse ({}, 200, tokens, false, 'login').headers.getSetCookie ().some ((cookie) => cookie.startsWith (LoggedOutCookie + '=;') && cookie.includes ('Max-Age=0')));
    });
    it ('denies a still-valid provider JWT when its server session is gone', async () => {
        global.fetch = async (url) => Response.json (url.endsWith ('/user') ? user : false);
        assert.equal ((await middleware (context ('/api/library', AccessCookie + '=' + token))).status, 401);
    });
    it ('accepts only a provider-verified active session and rejects cross-origin mutations', async () => {
        global.fetch = async (url, options) => {
            if (url.endsWith ('/user')) { return Response.json (user); }
            assert.deepEqual (JSON.parse (options.body), { p_session_id : user.id, p_user_id : user.id }); return Response.json (true);
        };
        assert.equal ((await middleware (context ('/api/library', AccessCookie + '=' + token))).status, 200);
        assert.equal ((await middleware (context ('/api/share', AccessCookie + '=' + token, 'POST', 'https://evil.example'))).status, 403);
    });
    it ('a logout cookie stops resource access and refresh even if stale tokens reappear', async () => {
        global.fetch = async () => { throw new Error ('must not call provider'); };
        const cookies = AccessCookie + '=' + token + '; ' + LoggedOutCookie + '=1';
        assert.equal ((await middleware (context ('/api/library', cookies))).status, 401);
        assert.equal ((await route (context ('/api/auth/refresh', cookies, 'POST'))).status, 401);
        assert.deepEqual (await (await route (context ('/api/auth/session', cookies))).json (), { user : null });
    });
    it ('logout immediately locks the browser and invalidates an in-flight restore', async () => {
        let release; const pending = new Promise ((resolve) => { release = resolve; });
        const auth = new AuthService (async (url) => { if (url.endsWith ('session')) { await pending; return Response.json ({ user }); } return Response.json ({ user : null }); });
        const restoring = auth.Restore (); await Promise.resolve (); const logout = auth.SignOut (); assert.equal (auth.user, null);
        release (); await Promise.all ([restoring, logout]); assert.equal (auth.user, null); await auth.Restore (); assert.equal (auth.user, null);
    });
    it ('failed logout cannot restore saved credentials without a fresh explicit login', async () => {
        let calls = 0;
        const auth = new AuthService (async (url) => { calls++; if (url.endsWith ('logout')) { throw new Error ('offline'); } return Response.json ({ user }); });
        auth.Update (user); await assert.rejects (() => auth.SignOut (), /unavailable/); await auth.Restore ();
        assert.equal (auth.user, null); assert.equal (calls, 1); await auth.SignIn (user.email, 'provided'); assert.deepEqual (auth.user, user);
    });
    it ('agent commands and macros cannot bypass the signed-out gate', async () => {
        const auth = { user : null }; const commands = new CommandRegistry ({ website : { auth }, readOnly : false }); let calls = 0;
        commands.Register ({ id : 'scene.edit', mutates : true, inputSchema : { type : 'object', properties : {}, required : [] } }, () => { calls++; });
        assert.equal ((await commands.Execute ('scene.edit')).ok, false); assert.equal (calls, 0);
        auth.user = user; assert.equal ((await commands.Execute ('scene.edit')).ok, true); assert.equal (calls, 1);
    });
});
