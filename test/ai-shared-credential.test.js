import assert from 'node:assert/strict';
import { StoreMeshyKey, StoreSharedMeshyKey, ReadSharedMeshyKey, SharedCredentialPath, CredentialPath, MeshyCredential } from '../functions/_lib/aicredentials.js';
import { onRequest as sharedRoute } from '../functions/api/ai/shared-credential.js';
import { onRequest as proxy } from '../functions/api/ai/[[path]].js';
import { AccessCookie } from '../functions/_lib/auth.js';
import { SharedMeshyCredentialRequest } from '../source/website/aiconnection.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

const sharedKey = 'msy_shared_organization_key_123456', personalKey = 'msy_personal_account_key_1234567';
const adminId = '00000000-0000-4000-8000-000000000001', userId = '00000000-0000-4000-8000-000000000002';
const token = 'head.' + Buffer.from (JSON.stringify ({ session_id : adminId })).toString ('base64url') + '.signature';
function Environment ()
{
    const objects = new Map ();
    return { objects, SUPABASE_URL : 'https://configured.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test', AUTO3D_AI_KEY_ENCRYPTION_SECRET : 'a1'.repeat (32), AUTO3D_AI_CREDENTIALS_R2 : {
        async put (path, body) { objects.set (path, body); return {}; }, async head (path) { return objects.has (path) ? {} : null; },
        async get (path) { const body = objects.get (path); return body ? { size : body.length, etag : 'e' + body.length, async json () { return JSON.parse (body); } } : null; },
        async delete (path) { objects.delete (path); }
    } };
}
function Context (env, method, body, { owner = adminId, origin = 'https://auto3d.test' } = {})
{
    return { env, data : { user : { id : owner } }, request : new Request ('https://auto3d.test/api/ai/shared-credential', { method, headers : { Origin : origin, 'X-Auto3D-Account' : owner, 'Content-Type' : 'application/json', Cookie : AccessCookie + '=' + token }, ...(body !== undefined ? { body : JSON.stringify (body) } : {}) }) };
}
describe ('Shared organization Meshy key', () => {
    let original, admin, calls;
    beforeEach (() => {
        original = globalThis.fetch; admin = true; calls = [];
        globalThis.fetch = async (url, options = {}) => {
            calls.push ({ url : String (url), options });
            if (String (url).endsWith ('/user')) { return Response.json ({ id : adminId, email : 'admin@example.com', email_confirmed_at : '2026-10-08' }); }
            if (String (url).endsWith ('auto3d_session_active')) { return Response.json (true); }
            if (String (url).includes ('auto3d_admin_emails')) { return Response.json (admin ? [{ email : 'admin@example.com' }] : []); }
            if (String (url).startsWith ('https://api.meshy.ai/')) { return Response.json ({ result : 'task-' + calls.length }); }
            throw new Error ('Unexpected URL ' + url);
        };
    });
    afterEach (() => { globalThis.fetch = original; });

    it ('stores the shared key encrypted outside every account namespace', async () => {
        const env = Environment (); await StoreSharedMeshyKey (env, sharedKey);
        assert.equal (env.objects.get (SharedCredentialPath).includes (sharedKey), false); assert.equal (await ReadSharedMeshyKey (env), sharedKey);
        assert.throws (() => CredentialPath ('shared/v1/organization')); assert.ok (!SharedCredentialPath.startsWith ('meshy/v1/'));
        // Ciphertext is bound to its path: a personal record copied into the shared slot does not decrypt.
        await StoreMeshyKey (env, userId, personalKey); env.objects.set (SharedCredentialPath, env.objects.get (CredentialPath (userId))); await assert.rejects (() => ReadSharedMeshyKey (env), /unavailable/);
    });
    it ('uses a personal key first, then the shared key, then the deployment key, and fails closed when unreadable', async () => {
        const env = Environment (); const context = owner => ({ env, data : { user : { id : owner } } });
        assert.deepEqual (await MeshyCredential (context (userId)), { key : '', shared : false });
        await StoreSharedMeshyKey (env, sharedKey); assert.deepEqual (await MeshyCredential (context (userId)), { key : sharedKey, shared : true });
        await StoreMeshyKey (env, userId, personalKey); assert.deepEqual (await MeshyCredential (context (userId)), { key : personalKey, shared : false });
        env.MESHY_API_KEY = 'msy_deployment_key_12345678'; env.AUTO3D_AI_ALLOW_SHARED_KEY = 'true'; assert.equal ((await MeshyCredential (context (adminId))).key, sharedKey);
        env.objects.set (SharedCredentialPath, '{broken'); await assert.rejects (() => MeshyCredential (context (adminId)), /unavailable/);
    });
    it ('lets any account read the status but only an administrator save or remove it', async () => {
        const env = Environment ();
        let response = await sharedRoute (Context (env, 'GET', undefined, { owner : userId })); assert.equal (response.status, 200); assert.deepEqual (await response.json (), { saved : false, available : true });
        admin = false; response = await sharedRoute (Context (env, 'PUT', { key : sharedKey })); assert.equal (response.status, 403); assert.equal (env.objects.has (SharedCredentialPath), false);
        admin = true; assert.equal ((await sharedRoute (Context (env, 'PUT', { key : sharedKey }, { origin : 'https://attacker.test' }))).status, 403);
        assert.equal ((await sharedRoute (Context (env, 'PUT', { key : sharedKey }, { owner : userId }))).status, 409);
        assert.equal ((await sharedRoute (Context (env, 'PUT', { key : sharedKey, extra : 1 }))).status, 400); assert.equal ((await sharedRoute (Context (env, 'PUT', { key : 'bad key' }))).status, 400);
        response = await sharedRoute (Context (env, 'PUT', { key : sharedKey })); assert.equal (response.status, 200); const text = await response.text (); assert.ok (!text.includes (sharedKey)); assert.equal (await ReadSharedMeshyKey (env), sharedKey);
        response = await sharedRoute (Context (env, 'GET', undefined, { owner : userId })); assert.deepEqual (await response.json (), { saved : true, available : true });
        admin = false; assert.equal ((await sharedRoute (Context (env, 'DELETE'))).status, 403); assert.equal (await ReadSharedMeshyKey (env), sharedKey);
        admin = true; assert.equal ((await sharedRoute (Context (env, 'DELETE'))).status, 200); assert.equal (await ReadSharedMeshyKey (env), null);
    });
    it ('sends the shared key only server-side, scopes tasks per account and rate-limits each account', async () => {
        const env = Environment (); await StoreSharedMeshyKey (env, sharedKey);
        const submit = owner => proxy ({ env, data : { user : { id : owner } }, params : { path : ['text-to-3d'] }, request : new Request ('https://auto3d.test/api/ai/text-to-3d', { method : 'POST', body : JSON.stringify ({ mode : 'preview', prompt : 'mug' }) }) });
        const response = await submit (userId); assert.equal (response.status, 200); const call = calls.find (item => item.url.startsWith ('https://api.meshy.ai/'));
        assert.equal (call.options.headers.get ('Authorization'), 'Bearer ' + sharedKey); assert.ok (!(await response.text ()).includes (sharedKey));
        const tasks = JSON.parse (env.objects.get ('meshy/v1/tasks/' + userId)).tasks; assert.equal (tasks.length, 1);
        for (let i = 1; i < 20; i++) { assert.equal ((await submit (userId)).status, 200); }
        assert.equal ((await submit (userId)).status, 429); assert.equal ((await submit (adminId)).status, 200);
        const other = await proxy ({ env, data : { user : { id : adminId } }, params : { path : ['text-to-3d', tasks[0].id] }, request : new Request ('https://auto3d.test/api/ai/text-to-3d/' + tasks[0].id) }); assert.equal (other.status, 404);
    });
    it ('maps client errors without echoing server text and exposes status/removal commands without credentials', async () => {
        const website = { auth : { user : { id : userId } }, sessionEditor : { readOnly : false } }; let status = 403;
        globalThis.fetch = async () => new Response (JSON.stringify ({ error : 'server detail ' + sharedKey }), { status });
        await assert.rejects (() => SharedMeshyCredentialRequest (website, 'DELETE'), error => error.message === 'Only an administrator can change the shared Meshy key.');
        status = 200; globalThis.fetch = async () => Response.json ({ saved : true, available : true }); assert.deepEqual (await SharedMeshyCredentialRequest (website), { saved : true, available : true });
        website.sessionEditor.readOnly = true; await assert.rejects (() => SharedMeshyCredentialRequest (website, 'DELETE'), /read-only/);
        let removed = 0; const registry = CreateAgentCommands ({ sessionEditor : {}, aiWorkspace : { InspectSharedConnection : async () => ({ shared : true }), RemoveSharedConnection : async () => { removed++; return { shared : false }; } } });
        assert.equal ((await registry.Execute ('ai.shared_connection.inspect', { key : sharedKey })).ok, false);
        assert.deepEqual ((await registry.Execute ('ai.shared_connection.inspect')).result, { shared : true });
        assert.equal ((await registry.Execute ('ai.shared_connection.remove')).ok, true); assert.equal (removed, 1);
        const catalog = registry.Catalog ().filter (item => item.id.startsWith ('ai.shared_connection')); assert.deepEqual (catalog.map (item => item.mutates), [false, true]); assert.ok (catalog.every (item => !Object.keys (item.inputSchema.properties).length));
    });
});

describe ('Meshy upstream calls on the Cloudflare Workers runtime', () => {
    let original; beforeEach (() => { original = globalThis.fetch; }); afterEach (() => { globalThis.fetch = original; });
    // Workers throw for redirect: 'error' ("use 'manual'"); production failed every Meshy call before 0.65.2.
    const WorkersFetch = respond => async (url, init = {}) => { if (!['follow', 'manual', undefined].includes (init.redirect)) { throw new TypeError ('Invalid redirect value, must be one of "follow" or "manual"'); } return respond (String (url), init); };
    const env = () => ({ MESHY_API_KEY : sharedKey, AUTO3D_AI_ALLOW_SHARED_KEY : 'true', AUTO3D_AI_CREDENTIALS_R2 : { async get () { return null; }, async put () { return {}; } } });
    const call = (path, method = 'GET', body) => proxy ({ env : env (), data : { user : { id : userId } }, params : { path }, request : new Request ('https://auto3d.test/api/ai/' + path.join ('/'), { method, ...(body ? { body } : {}) }) });
    it ('reaches Meshy for balance, submission and polling with a Workers-compatible fetch', async () => {
        globalThis.fetch = WorkersFetch ((url, init) => Response.json (url.endsWith ('/balance') ? { balance : 7 } : init.method === 'POST' ? { result : 'task-1' } : []));
        const balance = await call (['balance']); assert.equal (balance.status, 200); assert.deepEqual (await balance.json (), { balance : 7 });
        const submitted = await call (['text-to-3d'], 'POST', JSON.stringify ({ mode : 'preview', prompt : 'mug' })); assert.equal (submitted.status, 200); assert.deepEqual (await submitted.json (), { result : 'task-1' });
    });
    it ('refuses a Meshy redirect instead of following it with the key', async () => {
        const seen = []; globalThis.fetch = WorkersFetch (url => { seen.push (url); return new Response (null, { status : 302, headers : { Location : 'https://elsewhere.test/' } }); });
        const response = await call (['balance']); assert.equal (response.status, 502); assert.equal ((await response.json ()).code, 'MESHY_REQUEST_FAILED'); assert.deepEqual (seen, ['https://api.meshy.ai/openapi/v1/balance']);
    });
});

describe ('Deleting AI creations through the proxy', () => {
    let original; beforeEach (() => { original = globalThis.fetch; }); afterEach (() => { globalThis.fetch = original; });
    const call = (env, owner, id) => proxy ({ env, data : { user : { id : owner } }, params : { path : ['text-to-image', id] }, request : new Request ('https://auto3d.test/api/ai/text-to-image/' + id, { method : 'DELETE' }) });
    it ('deletes only the account\'s own shared-key tasks and forgets them', async () => {
        const env = Environment (); await StoreSharedMeshyKey (env, sharedKey);
        env.objects.set ('meshy/v1/tasks/' + userId, JSON.stringify ({ version : 1, tasks : [{ id : 'mine', createdAt : 1 }, { id : 'kept', createdAt : 2 }] }));
        const calls = []; globalThis.fetch = async (url, init = {}) => { calls.push ([String (url), init.method]); return new Response ('', { status : 200 }); };
        assert.equal ((await call (env, userId, 'someone-else')).status, 404); assert.equal (calls.length, 0);
        const response = await call (env, userId, 'mine'); assert.equal (response.status, 200); assert.deepEqual (await response.json (), { deleted : true });
        assert.deepEqual (calls, [['https://api.meshy.ai/openapi/v1/text-to-image/mine', 'DELETE']]);
        assert.deepEqual (JSON.parse (env.objects.get ('meshy/v1/tasks/' + userId)).tasks.map (task => task.id), ['kept']);
    });
    it ('treats a task Meshy no longer has as deleted, and passes other provider errors through', async () => {
        const env = Environment (); await StoreMeshyKey (env, userId, personalKey); let status = 404;
        globalThis.fetch = async () => Response.json ({ message : 'not found' }, { status });
        let response = await call (env, userId, 'gone'); assert.equal (response.status, 200); assert.deepEqual (await response.json (), { deleted : true, missing : true });
        status = 500; response = await call (env, userId, 'broken'); assert.equal (response.status, 500);
    });
});
