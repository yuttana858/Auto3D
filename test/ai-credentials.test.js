import { strict as assert } from 'node:assert';
import { webcrypto } from 'node:crypto';
import { CredentialExists, SaveCredential, ReadCredential, DeleteCredential } from '../functions/_lib/ai-credentials.js';
import { onRequest } from '../functions/api/ai/[[path]].js';

describe ('Personal AI credentials', () => {
    const owner = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002'; let env, objects;
    before (() => { globalThis.crypto ||= webcrypto; });
    beforeEach (() => {
        objects = new Map (); env = { AUTO3D_AI_ENCRYPTION_KEY : btoa ('x'.repeat (32)), AUTO3D_LIBRARY_R2 : {
            async put (key, value) { objects.set (key, new Uint8Array (value)); }, async head (key) { return objects.has (key) ? {} : null; },
            async get (key) { const bytes = objects.get (key); return bytes ? { arrayBuffer : async () => bytes.slice ().buffer } : null; }, async delete (key) { objects.delete (key); }
        } };
    });
    it ('encrypts per owner, supports replacement and rejects copied or tampered ciphertext', async () => {
        await SaveCredential (env, owner, 'secret-example-one'); const [path, bytes] = [...objects][0];
        assert.equal (new TextDecoder ().decode (bytes).includes ('secret-example-one'), false); assert.equal (await ReadCredential (env, owner), 'secret-example-one');
        objects.set (path.replace (owner, other), bytes); await assert.rejects (ReadCredential (env, other));
        bytes[15] ^= 1; await assert.rejects (ReadCredential (env, owner));
        await SaveCredential (env, owner, 'secret-example-two'); assert.equal (await ReadCredential (env, owner), 'secret-example-two');
        await DeleteCredential (env, owner); assert.equal (await CredentialExists (env, owner), false);
    });
    it ('only returns status and requires matching account and same-origin mutation', async () => {
        const request = (method, account, origin, body) => onRequest ({ env, data : { user : { id : owner } }, params : { path : ['credential'] }, request : new Request ('https://app.test/api/ai/credential', { method, headers : { 'X-Auto3D-Account' : account, ...(origin ? { Origin : origin } : {}), ...(body ? { 'Content-Type' : 'application/json' } : {}) }, ...(body ? { body : JSON.stringify (body) } : {}) }) });
        assert.equal ((await request ('PUT', other, 'https://app.test', { key : 'secret-example-one' })).status, 409);
        assert.equal ((await request ('PUT', owner, 'https://evil.test', { key : 'secret-example-one' })).status, 403);
        const saved = await request ('PUT', owner, 'https://app.test', { key : 'secret-example-one' }); assert.deepEqual (await saved.json (), { configured : true });
        const status = await request ('GET', owner); assert.deepEqual (await status.json (), { configured : true });
        assert.deepEqual (await (await request ('DELETE', owner, 'https://app.test')).json (), { configured : false });
    });
    it ('uses the owner credential for the provider and redacts reflected keys', async () => {
        await SaveCredential (env, owner, 'secret-example-one'); const original = globalThis.fetch; let bearer;
        globalThis.fetch = async (url, init) => { bearer = init.headers.get ('Authorization'); return Response.json ({ error : 'failed secret-example-one' }, { status : 401 }); };
        try {
            const response = await onRequest ({ env, data : { user : { id : owner } }, params : { path : ['balance'] }, request : new Request ('https://app.test/api/ai/balance') });
            assert.equal (bearer, 'Bearer secret-example-one'); assert.equal ((await response.text ()).includes ('secret-example-one'), false);
        } finally { globalThis.fetch = original; }
    });
});
