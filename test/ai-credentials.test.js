import assert from 'node:assert/strict';
import { StoreMeshyKey, ReadMeshyKey, CredentialPath } from '../functions/_lib/aicredentials.js';
import { onRequest } from '../functions/api/ai/credentials.js';
import { onRequest as proxy } from '../functions/api/ai/[[path]].js';
import { onRequest as testEnteredKey } from '../functions/api/ai/credential-test.js';
import { MeshyCredentialRequest } from '../source/website/aiconnection.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

const key = 'msy_test_credential_1234567890';
function Environment ()
{
    const objects = new Map ();
    return { objects, AUTO3D_AI_KEY_ENCRYPTION_SECRET : 'a1'.repeat (32), AUTO3D_AI_CREDENTIALS_R2 : {
        async put (path, body) { objects.set (path, body); }, async head (path) { return objects.has (path) ? {} : null; },
        async get (path) { const body = objects.get (path); return body ? { size : body.length, async json () { return JSON.parse (body); } } : null; },
        async delete (path) { objects.delete (path); }
    } };
}
function Context (env, method = 'GET', body, owner = 'owner')
{
    return { env, data : { user : { id : owner } }, request : new Request ('https://auto3d.test/api/ai/credentials', { method, headers : { Origin : 'https://auto3d.test', 'X-Auto3D-Account' : owner, 'Content-Type' : 'application/json' }, ...(body !== undefined ? { body : JSON.stringify (body) } : {}) }) };
}
describe ('Private account Meshy credentials', () => {
    it ('encrypts each save with a fresh nonce, scopes reads and binds ciphertext to the owner', async () => {
        const env = Environment (); await StoreMeshyKey (env, 'owner', key); const first = env.objects.get (CredentialPath ('owner'));
        assert.equal (first.includes (key), false); assert.equal (await ReadMeshyKey (env, 'owner'), key); assert.equal (await ReadMeshyKey (env, 'other'), null);
        await StoreMeshyKey (env, 'owner', key); assert.notEqual (env.objects.get (CredentialPath ('owner')), first);
        env.objects.set (CredentialPath ('other'), first); await assert.rejects (() => ReadMeshyKey (env, 'other'), /unavailable/);
    });
    it ('fails closed on tampering, missing or wrong encryption secrets', async () => {
        const env = Environment (); await StoreMeshyKey (env, 'owner', key);
        env.AUTO3D_AI_KEY_ENCRYPTION_SECRET = 'b2'.repeat (32); await assert.rejects (() => ReadMeshyKey (env, 'owner'), /unavailable/);
        delete env.AUTO3D_AI_KEY_ENCRYPTION_SECRET; await assert.rejects (() => ReadMeshyKey (env, 'owner'), /unavailable/);
        env.objects.set (CredentialPath ('owner'), '{broken'); await assert.rejects (() => ReadMeshyKey (env, 'owner'), /unavailable/);
        await assert.rejects (() => StoreMeshyKey (env, 'owner', key), /unavailable/);
    });
    it ('requires identity, matching account and same-origin writes before accessing storage', async () => {
        const env = Environment (); const c = Context (env, 'PUT', { key }); c.data = {}; assert.equal ((await onRequest (c)).status, 401);
        c.data.user = { id : 'owner' }; c.request.headers.set ('X-Auto3D-Account', 'other'); assert.equal ((await onRequest (c)).status, 409);
        c.request.headers.set ('X-Auto3D-Account', 'owner'); c.request.headers.set ('Origin', 'https://attacker.test'); assert.equal ((await onRequest (c)).status, 403);
        assert.equal (env.objects.size, 0);
    });
    it ('stores/replaces/removes only the actor key and returns status without any key bytes', async () => {
        const env = Environment ();
        for (const value of [key, key + '_replacement']) { const response = await onRequest (Context (env, 'PUT', { key : value })); assert.equal (response.status, 200); assert.deepEqual (await response.json (), { saved : true }); assert.equal (response.headers.get ('Cache-Control'), 'private, no-store'); }
        assert.deepEqual (await (await onRequest (Context (env))).json (), { saved : true, available : true });
        assert.deepEqual (await (await onRequest (Context (env, 'GET', undefined, 'other'))).json (), { saved : false, available : true });
        await onRequest (Context (env, 'DELETE', undefined, 'other')); assert.equal (await ReadMeshyKey (env, 'owner'), key + '_replacement');
        delete env.AUTO3D_AI_KEY_ENCRYPTION_SECRET; assert.equal ((await onRequest (Context (env, 'DELETE'))).status, 200); assert.equal (env.objects.size, 0);
    });
    it ('rejects invalid, extra, oversized and malformed input without replacing a saved key', async () => {
        const env = Environment (); await StoreMeshyKey (env, 'owner', key);
        for (const body of [{ key : '' }, { key : 'space in key 123456789' }, { key : 'x'.repeat (513) }, { key, owner : 'other' }, [], null]) { assert.equal ((await onRequest (Context (env, 'PUT', body))).status, 400); }
        const large = Context (env, 'PUT', { key }); large.request.headers.set ('Content-Length', '4096'); assert.equal ((await onRequest (large)).status, 413);
        const malformed = Context (env, 'PUT', { key }); malformed.request = new Request (malformed.request.url, { method : 'PUT', headers : malformed.request.headers, body : '{' }); assert.equal ((await onRequest (malformed)).status, 400);
        assert.equal (await ReadMeshyKey (env, 'owner'), key);
    });
    it ('reports unavailable setup and masks storage exceptions', async () => {
        assert.deepEqual (await (await onRequest (Context ({}))).json (), { saved : false, available : false });
        const env = Environment (); env.AUTO3D_AI_CREDENTIALS_R2.put = async () => { throw new Error (key); };
        const response = await onRequest (Context (env, 'PUT', { key })); assert.equal (response.status, 503); assert.equal ((await response.text ()).includes (key), false);
    });
    it ('uses personal keys ahead of shared keys, prevents redirects and never echoes the secret', async () => {
        const env = Environment (); await StoreMeshyKey (env, 'owner', key); env.MESHY_API_KEY = 'shared'; env.AUTO3D_AI_ALLOW_SHARED_KEY = 'true';
        const original = globalThis.fetch; const calls = [];
        globalThis.fetch = async (url, init) => { calls.push ({ url, init }); return Response.json ({ balance : 42, debug : key }); };
        try {
            const c = Context (env); c.params = { path : ['balance'] }; const response = await proxy (c); assert.equal (response.status, 200);
            assert.equal (calls[0].init.headers.get ('Authorization'), 'Bearer ' + key); assert.equal (calls[0].init.redirect, 'error'); assert.equal ((await response.text ()).includes (key), false);
            env.AUTO3D_AI_KEY_ENCRYPTION_SECRET = 'b2'.repeat (32); assert.equal ((await proxy (c)).status, 503); assert.equal (calls.length, 1);
            env.AUTO3D_AI_CREDENTIALS_R2.get = async () => { throw Object.assign (new Error (key), { status : 503 }); };
            const storageError = await proxy (c); assert.equal (storageError.status, 503); assert.equal ((await storageError.text ()).includes (key), false);
            c.data = {}; assert.equal ((await proxy (c)).status, 401); assert.equal (calls.length, 1);
        } finally { globalThis.fetch = original; }
    });
    it ('keeps optional administrator fallback explicit and rejects insecure upstream configuration', async () => {
        const original = globalThis.fetch; let calls = 0; globalThis.fetch = async () => { calls++; return Response.json ({ balance : 0 }); };
        try {
            const c = Context ({ MESHY_API_KEY : 'shared' }); c.params = { path : ['balance'] };
            assert.equal ((await proxy (c)).status, 401); c.env.AUTO3D_AI_ALLOW_SHARED_KEY = 'true'; assert.equal ((await proxy (c)).status, 200);
            c.env.MESHY_API_BASE_URL = 'http://insecure.test'; assert.equal ((await proxy (c)).status, 503); assert.equal (calls, 1);
        } finally { globalThis.fetch = original; }
    });
    it ('scopes shared-key tasks to their creating account, rate-limits creation and validates bodies', async () => {
        const env = Environment (); env.MESHY_API_KEY = 'shared_key_value'; env.AUTO3D_AI_ALLOW_SHARED_KEY = 'true';
        const original = globalThis.fetch; let next = 0; const upstream = [];
        globalThis.fetch = async (url, init = {}) => {
            upstream.push ({ url : String (url), init });
            if (init.method === 'POST') { return Response.json ({ result : 'task-' + (++next) }); }
            if (/text-to-3d\?/.test (String (url))) { return Response.json ([{ id : 'task-1' }, { id : 'task-2' }, { id : 'foreign' }]); }
            return Response.json ({ id : 'task' });
        };
        const call = (owner, method, path, body) => { const c = Context (env, method, body, owner); c.request = new Request ('https://auto3d.test/api/ai/' + path.join ('/'), { method, headers : { 'Content-Type' : 'application/json' }, ...(body !== undefined ? { body : JSON.stringify (body) } : {}) }); c.params = { path }; return proxy (c); };
        try {
            assert.equal ((await call ('owner', 'POST', ['text-to-3d'], { mode : 'preview', prompt : 'box' })).status, 200);
            assert.equal ((await call ('other', 'POST', ['text-to-3d'], { mode : 'preview', prompt : 'cup' })).status, 200);
            assert.deepEqual (await (await call ('owner', 'GET', ['text-to-3d'])).json (), [{ id : 'task-1' }]);
            assert.deepEqual (await (await call ('other', 'GET', ['text-to-3d'])).json (), [{ id : 'task-2' }]);
            assert.equal ((await call ('owner', 'GET', ['text-to-3d', 'task-2'])).status, 404);
            assert.equal ((await call ('owner', 'GET', ['text-to-3d', 'task-1'])).status, 200);
            for (const body of [{ nested : { a : 1 } }, { 'Bad-Key' : 1 }, [1]]) { assert.equal ((await call ('owner', 'POST', ['text-to-3d'], body)).status, 400); }
            const large = await call ('owner', 'POST', ['text-to-3d'], { prompt : 'x'.repeat (70000) }); assert.equal (large.status, 413);
            for (let index = 0; index < 19; index++) { assert.equal ((await call ('owner', 'POST', ['text-to-3d'], { prompt : 'p' })).status, 200); }
            const limited = await call ('owner', 'POST', ['text-to-3d'], { prompt : 'p' }); assert.equal (limited.status, 429); assert.equal ((await limited.json ()).code, 'MESHY_SHARED_RATE_LIMITED');
            assert.ok (upstream.every (request => !String (request.url).includes ('shared_key_value')));
        } finally { globalThis.fetch = original; }
    });
    it ('distinguishes a missing key, unavailable secure storage, and provider rejection without returning the key', async () => {
        const original = globalThis.fetch; const env = Environment (); const c = Context (env); c.params = { path : ['balance'] };
        try {
            let response = await proxy (c); assert.equal ((await response.json ()).code, 'MESHY_KEY_MISSING');
            await StoreMeshyKey (env, 'owner', key); env.AUTO3D_AI_KEY_ENCRYPTION_SECRET = 'b2'.repeat (32);
            response = await proxy (c); assert.equal ((await response.json ()).code, 'MESHY_STORAGE_UNAVAILABLE');
            env.AUTO3D_AI_KEY_ENCRYPTION_SECRET = 'a1'.repeat (32); globalThis.fetch = async () => new Response ('provider echoed ' + key, { status : 401 });
            response = await proxy (c); const body = await response.text (); assert.match (body, /MESHY_KEY_REJECTED/); assert.equal (body.includes (key), false);
        } finally { globalThis.fetch = original; }
    });
    it ('tests an entered key without storage and does not return a provider response or secret', async () => {
        const original = globalThis.fetch; let calls = 0; let providerStatus = 200;
        globalThis.fetch = async (url, init) => { calls++; assert.equal (url, 'https://api.meshy.ai/openapi/v1/balance'); assert.equal (init.headers.Authorization, 'Bearer ' + key); assert.equal (init.redirect, 'error'); return new Response ('provider echoes ' + key, { status : providerStatus }); };
        try {
            const c = Context ({}, 'POST', { key }); let response = await testEnteredKey (c); assert.deepEqual (await response.json (), { valid : true });
            providerStatus = 401; response = await testEnteredKey (Context ({}, 'POST', { key })); const body = await response.text (); assert.equal (response.status, 401); assert.equal (body.includes (key), false);
            const foreign = Context ({}, 'POST', { key }); foreign.request.headers.set ('Origin', 'https://attacker.test'); assert.equal ((await testEnteredKey (foreign)).status, 403);
            const mismatch = Context ({}, 'POST', { key }); mismatch.request.headers.set ('X-Auto3D-Account', 'other'); assert.equal ((await testEnteredKey (mismatch)).status, 409);
            assert.equal ((await testEnteredKey (Context ({}, 'POST', { key, extra : true }))).status, 400); assert.equal (calls, 2);
        } finally { globalThis.fetch = original; }
    });
    it ('checks account changes and read-only state on the client without trusting response fields', async () => {
        const website = { auth : { user : { id : 'owner' } }, sessionEditor : {} }; const original = globalThis.fetch;
        try {
            globalThis.fetch = async () => Response.json ({ saved : true, key }); assert.deepEqual (await MeshyCredentialRequest (website), { saved : true });
            website.sessionEditor.readOnly = true; await assert.rejects (() => MeshyCredentialRequest (website, 'PUT', key), /read-only/);
            website.sessionEditor.readOnly = false; globalThis.fetch = async () => { website.auth.user.id = 'other'; return Response.json ({ saved : true }); };
            await assert.rejects (() => MeshyCredentialRequest (website, 'PUT', key), /Account changed/);
        } finally { globalThis.fetch = original; }
    });
    it ('offers interactive entry through commands without accepting credentials in commands or macros', async () => {
        let opened = 0; const registry = CreateAgentCommands ({ sessionEditor : {}, aiWorkspace : { OpenConnection () { opened++; return { opened : true, interactive : true }; } } });
        assert.equal ((await registry.Execute ('ai.connection.open', { key })).ok, false); assert.equal (opened, 0);
        const response = await registry.Execute ('ai.connection.open', {}); assert.equal (response.ok, true); assert.equal (opened, 1);
    });
});
