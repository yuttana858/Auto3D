import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/auth/[[path]].js';
import { AccessCookie, RefreshCookie } from '../functions/_lib/auth.js';
import { AuthService } from '../source/website/authservice.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

const env = { SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test_only' };
const user = { id : 'verified-user', email : 'member@example.com' };
function context (action, options = {})
{
    return { env, params : { path : [action] }, request : new Request ('https://auto3d.example/api/auth/' + action, {
        method : action === 'session' ? 'GET' : 'POST', ...options,
        headers : { 'Content-Type' : 'application/json', Origin : 'https://auto3d.example', ...options.headers }
    }) };
}

describe ('Temporary account authentication', () => {
    let originalFetch;
    beforeEach (() => { originalFetch = global.fetch; });
    afterEach (() => { global.fetch = originalFetch; });

    it ('validates origin and credentials before calling the provider', async () => {
        let calls = 0; global.fetch = async () => { calls++; throw new Error ('unexpected'); };
        assert.equal ((await onRequest (context ('login', { headers : { Origin : 'https://attacker.example' }, body : '{}' }))).status, 403);
        assert.equal ((await onRequest (context ('login', { body : '{' }))).status, 400);
        assert.equal ((await onRequest (context ('login', { body : JSON.stringify ({ email : 'bad', password : 'test' }) }))).status, 400);
        assert.equal ((await onRequest (context ('login', { body : 'x'.repeat (9000) }))).status, 413);
        assert.equal (calls, 0);
    });

    it ('creates secure cookies only after verifying the provider identity', async () => {
        const calls = [];
        global.fetch = async (url, options) => {
            calls.push ({ url, options });
            assert.equal (options.headers.apikey, env.SUPABASE_SECRET_KEY);
            return url.endsWith ('/user') ? Response.json ({ ...user, user_metadata : { role : 'admin' } }) : Response.json ({ access_token : 'user-access', refresh_token : 'user-refresh' });
        };
        const response = await onRequest (context ('login', { body : JSON.stringify ({ email : user.email, password : 'provided-password' }) }));
        assert.equal (response.status, 200);
        assert.deepEqual (await response.json (), { user });
        assert.equal (calls[0].url, env.SUPABASE_URL + '/auth/v1/token?grant_type=password');
        assert.equal (calls[1].options.headers.Authorization, 'Bearer user-access');
        for (const cookie of response.headers.getSetCookie ()) { assert.match (cookie, /HttpOnly; Secure; SameSite=Strict/); assert.match (cookie, /Path=\//); }
        assert.equal (response.headers.get ('Cache-Control'), 'private, no-store');
    });

    it ('does not reveal provider errors or replace a session after bad credentials', async () => {
        global.fetch = async () => Response.json ({ error : env.SUPABASE_SECRET_KEY }, { status : 400 });
        const response = await onRequest (context ('login', { body : JSON.stringify ({ email : user.email, password : 'bad' }) }));
        assert.equal (response.status, 401);
        assert.equal ((await response.text ()).includes (env.SUPABASE_SECRET_KEY), false);
        assert.equal (response.headers.get ('Set-Cookie'), null);
    });

    it ('rejects forged cookies using provider verification', async () => {
        global.fetch = async (url, options) => { assert.equal (options.headers.Authorization, 'Bearer forged'); return new Response ('', { status : 401 }); };
        assert.equal ((await onRequest (context ('session', { headers : { Cookie : AccessCookie + '=forged' } }))).status, 401);
        assert.deepEqual (await (await onRequest (context ('session'))).json (), { user : null });
    });

    it ('rotates refresh cookies and verifies the refreshed user', async () => {
        global.fetch = async (url, options) => {
            if (url.includes ('grant_type=refresh_token')) {
                assert.deepEqual (JSON.parse (options.body), { refresh_token : 'old-refresh' });
                return Response.json ({ access_token : 'new-access', refresh_token : 'new-refresh' });
            }
            return Response.json (user);
        };
        const response = await onRequest (context ('refresh', { headers : { Cookie : RefreshCookie + '=old-refresh' } }));
        assert.equal (response.status, 200);
        assert.ok (response.headers.getSetCookie ().some ((cookie) => cookie.startsWith (RefreshCookie + '=new-refresh')));
    });

    it ('clears cookies for rejected refresh tokens and for logout', async () => {
        global.fetch = async () => new Response ('', { status : 401 });
        for (const action of ['refresh', 'logout']) {
            const response = await onRequest (context (action, { headers : { Cookie : AccessCookie + '=old; ' + RefreshCookie + '=expired' } }));
            assert.equal (response.headers.getSetCookie ().length, 2);
            response.headers.getSetCookie ().forEach ((cookie) => assert.match (cookie, /Max-Age=0/));
        }
    });

    it ('keeps network errors generic and clears local cookies if logout revocation fails', async () => {
        global.fetch = async () => { throw new Error (env.SUPABASE_SECRET_KEY); };
        const response = await onRequest (context ('logout', { headers : { Cookie : AccessCookie + '=old' } }));
        assert.equal (response.status, 503);
        assert.equal ((await response.text ()).includes (env.SUPABASE_SECRET_KEY), false);
        assert.equal (response.headers.getSetCookie ().length, 2);
    });

    it ('revokes a refresh session even when its access token has expired', async () => {
        const paths = [];
        global.fetch = async (url, options) => {
            paths.push (url);
            if (url.includes ('grant_type=refresh_token')) { return Response.json ({ access_token : 'fresh-token' }); }
            return new Response (null, { status : options.headers.Authorization === 'Bearer fresh-token' ? 204 : 401 });
        };
        const response = await onRequest (context ('logout', { headers : { Cookie : AccessCookie + '=expired; ' + RefreshCookie + '=valid-refresh' } }));
        assert.equal (response.status, 200);
        assert.equal (paths.length, 3);
        assert.ok (paths[1].includes ('grant_type=refresh_token'));
        assert.equal (response.headers.getSetCookie ().length, 2);
    });

    it ('restores a session through refresh without storing tokens in AuthService', async () => {
        const calls = [];
        const auth = new AuthService (async (url, options) => {
            calls.push ({ url, options });
            return url.endsWith ('session') ? Response.json ({ error : 'expired' }, { status : 401 }) : Response.json ({ user });
        });
        await Promise.all ([auth.Restore (), auth.Restore ()]);
        assert.deepEqual (calls.map ((call) => call.url), ['/api/auth/session', '/api/auth/refresh']);
        assert.equal (calls[0].options.credentials, 'same-origin');
        assert.deepEqual (auth.Inspect (), { signedIn : true, user });
        await auth.SignOut (); assert.equal (auth.Inspect ().signedIn, false);
    });

    it ('supports account commands and macros without accepting credentials', async () => {
        const auth = new AuthService (async () => Response.json ({ user : null })); auth.Update (user);
        let opened = 0;
        const registry = CreateAgentCommands ({ sessionEditor : { readOnly : false }, auth, authPanel : { Open : () => { opened++; return { opened : true }; } } });
        assert.equal ((await registry.Execute ('auth.open', { password : 'not-allowed' })).ok, false);
        const result = await registry.RunMacro ({ version : 1, steps : [{ id : 'open', command : 'auth.open', arguments : {} }, { id : 'account', command : 'auth.inspect', arguments : {} }] });
        assert.equal (result.ok, true); assert.equal (opened, 1);
        assert.equal ((await registry.Execute ('auth.sign_out', {})).ok, true);
        assert.equal (auth.user, null);
        const readOnly = CreateAgentCommands ({ sessionEditor : { readOnly : true }, auth });
        assert.equal ((await readOnly.Execute ('auth.sign_out', {})).ok, false);
    });

    it ('serializes startup restore before a new sign-in so stale identity cannot replace it', async () => {
        let release;
        const pending = new Promise ((resolve) => { release = resolve; });
        const calls = [];
        const auth = new AuthService (async (url) => {
            calls.push (url);
            if (url.endsWith ('session')) { await pending; return Response.json ({ user : null }); }
            return Response.json ({ user });
        });
        const restore = auth.Restore (); const login = auth.SignIn (user.email, 'test-password');
        await Promise.resolve (); assert.deepEqual (calls, ['/api/auth/session']);
        release (); await Promise.all ([restore, login]);
        assert.deepEqual (auth.Inspect ().user, user);
    });
});
