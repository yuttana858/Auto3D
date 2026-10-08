import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/accounts/[[path]].js';
import { AccessCookie } from '../functions/_lib/auth.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
const env = { SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test_only' };
const id = '12345678-1234-1234-1234-123456789abc';
const admin = { id : 'admin-id', email : 'admin@example.com', email_confirmed_at : '2026-10-08' };
const pending = { id, email : 'request@example.com', name : 'Requester', status : 'pending' };
const context = (action, body, headers = {}) => ({ env, params : { path : [action] }, request : new Request ('https://app.example/api/accounts/' + action, { method : action === 'admin' ? 'GET' : 'POST', headers : { Origin : 'https://app.example', 'Content-Type' : 'application/json', Cookie : AccessCookie + '=verified', ...headers }, ...(body ? { body : JSON.stringify (body) } : {}) }) });
describe ('Account requests and administration', () => {
    let originalFetch;
    beforeEach (() => { originalFetch = global.fetch; }); afterEach (() => { global.fetch = originalFetch; });
    it ('rejects foreign origins and password-bearing account requests without provider calls', async () => {
        global.fetch = async () => { throw new Error ('unexpected'); };
        assert.equal ((await onRequest (context ('request', {}, { Origin : 'https://evil.example' }))).status, 403);
        assert.equal ((await onRequest (context ('request', { email : pending.email, name : 'Name', reason : '', password : 'unexpected' }))).status, 400);
    });
    it ('records only normalized contact details and a hashed IP, with a generic response', async () => {
        global.fetch = async (url, options) => {
            assert.ok (url.endsWith ('rpc/auto3d_request_account'));
            const body = JSON.parse (options.body); assert.equal (body.p_email, 'request@example.com'); assert.match (body.p_ip_hash, /^[a-f0-9]{64}$/); assert.equal (body.p_name, 'Name');
            return Response.json (null);
        };
        const response = await onRequest (context ('request', { email : ' REQUEST@example.com ', name : ' Name ', reason : '' }, { 'CF-Connecting-IP' : '192.0.2.1' }));
        assert.equal (response.status, 202); assert.ok ((await response.json ()).message);
    });
    it ('requires authentication and ignores user-editable admin metadata', async () => {
        assert.equal ((await onRequest (context ('admin', null, { Cookie : '' }))).status, 401);
        global.fetch = async (url) => url.endsWith ('/user') ? Response.json ({ ...admin, user_metadata : { role : 'admin' } }) : Response.json ([]);
        assert.equal ((await onRequest (context ('admin'))).status, 403);
    });
    it ('does not grant admin access to an unconfirmed allowlisted email', async () => {
        global.fetch = async () => Response.json ({ ...admin, email_confirmed_at : null });
        assert.equal ((await onRequest (context ('admin'))).status, 403);
    });
    function provider (claim = [pending], createStatus = 200) {
        const calls = [];
        global.fetch = async (url, options) => {
            calls.push ({ url, options });
            if (url.endsWith ('/user')) { return Response.json (admin); }
            if (url.includes ('auto3d_admin_emails')) { return Response.json ([{ email : admin.email }]); }
            if (url.endsWith ('admin/users')) { return Response.json ({ id : 'created-id' }, { status : createStatus }); }
            if (options.method === 'PATCH' && options.headers.Prefer) { return Response.json (JSON.parse (options.body).status === 'approved' ? [{ ...pending, status : 'approved', user_id : 'created-id' }] : claim); }
            if (options.method === 'PATCH') { return new Response (null, { status : 204 }); }
            return Response.json ([pending]);
        }; return calls;
    }
    it ('lists requests only after provider identity and allowlist checks', async () => {
        const calls = provider (); const response = await onRequest (context ('admin')); assert.equal (response.status, 200);
        assert.equal ((await response.json ()).isAdmin, true); assert.equal (calls.length, 3);
    });
    it ('claims approval once and creates a confirmed non-admin account, without returning credentials', async () => {
        const calls = provider (); const password = 'initial-private-password';
        const response = await onRequest (context ('review', { id, decision : 'approve', password }));
        assert.equal (response.status, 200); assert.ok (!(await response.text ()).includes (password));
        const create = calls.find ((call) => call.url.endsWith ('admin/users')); const body = JSON.parse (create.options.body);
        assert.equal (body.email_confirm, true); assert.equal (body.app_metadata, undefined);
        assert.ok (calls.findIndex ((call) => call.url.includes ('status=eq.pending')) < calls.indexOf (create));
    });
    it ('does not create a second user after concurrent review', async () => {
        const calls = provider ([]); const response = await onRequest (context ('review', { id, decision : 'approve', password : 'initial-private-password' }));
        assert.equal (response.status, 409); assert.ok (!calls.some ((call) => call.url.endsWith ('admin/users')));
    });
    it ('rejects without creating a user and validates approval passwords before claim', async () => {
        const calls = provider (); assert.equal ((await onRequest (context ('review', { id, decision : 'approve', password : 'short' }))).status, 400);
        assert.ok (!calls.some ((call) => call.options.method === 'PATCH'));
        assert.equal ((await onRequest (context ('review', { id, decision : 'reject' }))).status, 200);
        assert.ok (!calls.some ((call) => call.url.endsWith ('admin/users')));
    });
    it ('restores pending on definitive provider rejection but preserves processing after ambiguous failure', async () => {
        let calls = provider ([pending], 422);
        assert.equal ((await onRequest (context ('review', { id, decision : 'approve', password : 'initial-private-password' }))).status, 503);
        assert.ok (calls.some ((call) => call.options.method === 'PATCH' && JSON.parse (call.options.body).status === 'pending'));
        calls = provider ([pending], 500);
        assert.equal ((await onRequest (context ('review', { id, decision : 'approve', password : 'initial-private-password' }))).status, 503);
        assert.ok (!calls.some ((call) => call.options.method === 'PATCH' && JSON.parse (call.options.body).status === 'pending'));
    });
    it ('exposes shared admin commands and validates macros before review', async () => {
        const reviewed = [];
        const commands = CreateAgentCommands ({ sessionEditor : { readOnly : false }, accountAdmin : { Refresh : async () => ({ isAdmin : true, requests : [pending] }), Review : async (...args) => { reviewed.push (args); return { request : pending }; }, Open : () => ({ opened : true }), OpenRequest : () => ({ opened : true }) } });
        assert.equal ((await commands.Execute ('admin.requests', {})).ok, true);
        assert.equal ((await commands.Execute ('admin.reject', { id, password : 'not-accepted' })).ok, false);
        assert.equal ((await commands.RunMacro ({ version : 1, steps : [{ id : 'review', command : 'admin.reject', arguments : { id } }] })).ok, true);
        assert.deepEqual (reviewed, [[id, 'reject']]);
    });
});
