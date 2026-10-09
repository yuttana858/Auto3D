import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/accounts/[[path]].js';
import { AccessCookie, LoggedOutCookie } from '../functions/_lib/auth.js';
const adminId = '00000000-0000-4000-8000-000000000001'; const targetId = '00000000-0000-4000-8000-000000000002';
const token = 'head.' + Buffer.from (JSON.stringify ({ session_id : adminId })).toString ('base64url') + '.signature';
const env = { SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test' };
const context = (action, body, overrides = {}) => ({ env, params : { path : [action] }, request : new Request ('https://app.example/api/accounts/' + action, { method : action === 'users' ? 'GET' : 'POST', headers : { Origin : 'https://app.example', 'Content-Type' : 'application/json', Cookie : AccessCookie + '=' + token, ...overrides }, ...(body ? { body : JSON.stringify (body) } : {}) }) });
describe ('Administrator account access controls', () => {
    let original; let calls; let active; let targetAdmin; let providerOK;
    beforeEach (() => { original = global.fetch; calls = []; active = true; targetAdmin = false; providerOK = true;
        global.fetch = async (url, options = {}) => {
            calls.push ({ url, options });
            if (url.endsWith ('/user')) { return Response.json ({ id : adminId, email : 'admin@example.com', email_confirmed_at : '2026-10-08' }); }
            if (url.endsWith ('auto3d_session_active')) { return Response.json (active); }
            if (url.includes ('auto3d_admin_emails')) { return Response.json (url.includes ('target') ? (targetAdmin ? [{ email : 'target@example.com' }] : []) : [{ email : 'admin@example.com' }]); }
            if (url.includes ('admin/users?page=')) { return Response.json ({ users : [{ id : targetId, email : 'target@example.com', user_metadata : { name : 'Target' }, identities : ['private'], encrypted_password : 'never-return' }] }); }
            if (url.endsWith ('admin/users/' + targetId)) { return Response.json (options.method === 'PUT' ? {} : { id : targetId, email : 'target@example.com' }, { status : options.method === 'PUT' && !providerOK ? 500 : 200 }); }
            if (url.includes ('auto3d_account_controls')) { return options.method === 'POST' ? new Response (null, { status : 204 }) : Response.json ([{ user_id : targetId, disabled : true }]); }
            throw new Error ('Unexpected URL ' + url);
        };
    });
    afterEach (() => { global.fetch = original; });
    it ('lists only safe account properties for an active verified administrator', async () => {
        const response = await onRequest (context ('users')); assert.equal (response.status, 200); const body = await response.json (); assert.equal (body.users[0].disabled, true); assert.ok (!JSON.stringify (body).includes ('never-return')); assert.deepEqual (Object.keys (body.users[0]).sort (), ['disabled', 'email', 'id', 'isAdmin', 'name']);
        active = false; assert.equal ((await onRequest (context ('users'))).status, 401);
        assert.equal ((await onRequest (context ('users', null, { Cookie : AccessCookie + '=' + token + '; ' + LoggedOutCookie + '=1' }))).status, 401);
    });
    it ('blocks old sessions before revoking access, retains files, and protects admins', async () => {
        const response = await onRequest (context ('manage', { id : targetId, action : 'revoke' })); assert.equal (response.status, 200);
        const cutoff = calls.findIndex ((call) => call.url.includes ('auto3d_account_controls') && call.options.method === 'POST'); const ban = calls.findIndex ((call) => call.options.method === 'PUT'); assert.ok (cutoff < ban); assert.equal (JSON.parse (calls[cutoff].options.body).disabled, true); assert.equal (JSON.parse (calls[ban].options.body).ban_duration, '876000h'); assert.ok (!calls.some ((call) => call.url.includes ('personal_library')));
        targetAdmin = true; calls = []; assert.equal ((await onRequest (context ('manage', { id : targetId, action : 'revoke' }))).status, 403); assert.ok (!calls.some ((call) => ['PUT', 'POST'].includes (call.options.method) && !call.url.includes ('session_active')));
    });
    it ('resets passwords without returning secrets or reenabling disabled accounts', async () => {
        const password = 'a-new-private-password'; const response = await onRequest (context ('manage', { id : targetId, action : 'reset_password', password })); assert.equal (response.status, 200); assert.ok (!(await response.text ()).includes (password));
        assert.equal (JSON.parse (calls.find ((call) => call.options.method === 'PUT').options.body).password, password); assert.equal (JSON.parse (calls.find ((call) => call.options.method === 'POST' && call.url.includes ('account_controls')).options.body).disabled, true);
    });
    it ('restores access while retaining a cutoff and safely reports ambiguous provider failures', async () => {
        assert.equal ((await onRequest (context ('manage', { id : targetId, action : 'restore' }))).status, 200); const saved = JSON.parse (calls.find ((call) => call.options.method === 'POST' && call.url.includes ('account_controls')).options.body); assert.equal (saved.disabled, false); assert.ok (saved.sessions_after);
        providerOK = false; assert.equal ((await onRequest (context ('manage', { id : targetId, action : 'reset_password', password : 'new-private-password' }))).status, 503);
    });
    it ('rejects foreign origins, malformed actions and passwords on revoke before any mutation', async () => {
        assert.equal ((await onRequest (context ('manage', {}, { Origin : 'https://evil.example' }))).status, 403);
        for (const body of [{ id : 'invalid', action : 'revoke' }, { id : targetId, action : 'reset_password', password : 'short' }, { id : targetId, action : 'revoke', password : 'unexpected' }, { id : targetId, action : 'delete' }]) { assert.equal ((await onRequest (context ('manage', body))).status, 400); }
        assert.ok (!calls.some ((call) => call.options.method === 'PUT'));
    });
});
