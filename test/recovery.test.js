import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/auth/[[path]].js';
import { onRequest as accounts } from '../functions/api/accounts/[[path]].js';
import { LoggedOutCookie } from '../functions/_lib/auth.js';
const env = { SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test' };
const user = { id : '00000000-0000-4000-8000-000000000001', email : 'approved@example.com' };
const token = 'head.' + Buffer.from (JSON.stringify ({ session_id : user.id })).toString ('base64url') + '.signature';
const context = (action, body, origin = 'https://app.example') => ({ env, params : { path : [action] }, request : new Request ('https://app.example/api/auth/' + action, { method : 'POST', headers : { Origin : origin, 'Content-Type' : 'application/json', 'CF-Connecting-IP' : '192.0.2.1', Cookie : LoggedOutCookie + '=1' }, body : JSON.stringify (body) }) });
describe ('Approved-account password recovery', () => {
    let original; let calls; let approved; let limited;
    beforeEach (() => { original = global.fetch; calls = []; approved = true; limited = false;
        global.fetch = async (url, options) => {
            calls.push ({ url, options });
            if (url.endsWith ('auto3d_recovery_attempt')) { return Response.json (!limited); }
            if (url.endsWith ('auto3d_recovery_allowed')) { return Response.json (approved); }
            if (url.endsWith ('auto3d_session_active')) { return Response.json (true); }
            if (url.endsWith ('/user')) { return Response.json (user); }
            return Response.json ({});
        };
    });
    afterEach (() => { global.fetch = original; });
    it ('sends approved recovery only, with indistinguishable responses for unknown and throttled emails', async () => {
        const accepted = await onRequest (context ('recover', { email : ' APPROVED@example.com ' })); assert.equal (accepted.status, 202);
        const send = calls.find ((call) => call.url.includes ('/recover?')); assert.deepEqual (JSON.parse (send.options.body), { email : 'approved@example.com' }); assert.equal (new URL (send.url).searchParams.get ('redirect_to'), 'https://app.example/?password=recovery');
        const attempt = calls.find ((call) => call.url.endsWith ('auto3d_recovery_attempt')); const hashed = JSON.parse (attempt.options.body); assert.match (hashed.p_email_hash, /^[a-f0-9]{64}$/); assert.match (hashed.p_ip_hash, /^[a-f0-9]{64}$/);
        const message = await accepted.json (); calls = []; approved = false; assert.deepEqual (await (await onRequest (context ('recover', { email : 'unknown@example.com' }))).json (), message); assert.ok (!calls.some ((call) => call.url.includes ('/recover?')));
        calls = []; limited = true; assert.deepEqual (await (await onRequest (context ('recover', { email : user.email }))).json (), message); assert.equal (calls.length, 1);
    });
    it ('rejects foreign origins, invalid input, arbitrary redirects and passwords in recovery requests', async () => {
        assert.equal ((await onRequest (context ('recover', { email : user.email }, 'https://evil.example'))).status, 403);
        for (const body of [{ email : 'invalid' }, { email : user.email, redirectTo : 'https://evil.example' }, { email : user.email, password : 'secret' }]) { assert.equal ((await onRequest (context ('recover', body))).status, 400); }
        assert.equal (calls.length, 0);
    });
    it ('verifies the recovery identity and approval, changes password, and revokes sessions without issuing login cookies', async () => {
        const response = await onRequest (context ('reset-password', { accessToken : token, password : 'a-new-strong-password' })); assert.equal (response.status, 200);
        assert.ok (calls.some ((call) => call.url.endsWith ('/user') && call.options.method === 'PUT')); assert.ok (calls.some ((call) => call.url.endsWith ('logout?scope=global')));
        const cookies = response.headers.getSetCookie (); assert.ok (cookies.some ((cookie) => cookie.startsWith (LoggedOutCookie + '=1'))); assert.ok (cookies.filter ((cookie) => !cookie.startsWith (LoggedOutCookie)).every ((cookie) => cookie.includes ('Max-Age=0')));
        calls = []; approved = false; assert.equal ((await onRequest (context ('reset-password', { accessToken : token, password : 'a-new-strong-password' }))).status, 403); assert.ok (!calls.some ((call) => call.options.method === 'PUT'));
    });
    it ('rejects expired links before changing a password and retires the old admin endpoint', async () => {
        global.fetch = async () => Response.json ({}, { status : 401 }); assert.equal ((await onRequest (context ('reset-password', { accessToken : token, password : 'a-new-strong-password' }))).status, 401);
        assert.equal ((await accounts ({ env, params : { path : ['admin'] }, request : new Request ('https://app.example/api/accounts/admin') })).status, 404);
    });
});
