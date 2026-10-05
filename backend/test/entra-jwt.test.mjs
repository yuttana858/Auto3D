import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { VerifyEntraToken, ResetJwksCacheForTests } from '../auth/entra-jwt.mjs';

function b64 (value) { return Buffer.from (typeof value === 'string' ? value : JSON.stringify (value)).toString ('base64url'); }

test ('verifies a valid Entra-style RS256 token and roles', async () => {
    ResetJwksCacheForTests ();
    const { privateKey, publicKey } = generateKeyPairSync ('rsa', { modulusLength : 2048 });
    const jwk = publicKey.export ({ format : 'jwk' }); jwk.kid = 'test-key'; jwk.use = 'sig';
    const env = { ENTRA_TENANT_ID : 'tenant', ENTRA_CLIENT_ID : 'client' };
    const now = Math.floor (Date.now () / 1000);
    const header = b64 ({ alg : 'RS256', kid : 'test-key', typ : 'JWT' });
    const payload = b64 ({ iss : 'https://login.microsoftonline.com/tenant/v2.0', aud : 'client', sub : 'user', tid : 'tenant', exp : now + 300, roles : ['Auto3D.Publisher'] });
    const input = header + '.' + payload;
    const signature = sign ('RSA-SHA256', Buffer.from (input), privateKey).toString ('base64url');
    const fetchImpl = async () => new Response (JSON.stringify ({ keys : [jwk] }), { status : 200, headers : { 'Content-Type' : 'application/json' } });
    const actor = await VerifyEntraToken (input + '.' + signature, env, fetchImpl);
    assert.equal (actor.subject, 'user');
    assert.deepEqual (actor.roles, ['Auto3D.Publisher']);
});

test ('rejects a token with the wrong audience', async () => {
    ResetJwksCacheForTests ();
    const header = b64 ({ alg : 'RS256', kid : 'x' });
    const payload = b64 ({ iss : 'https://login.microsoftonline.com/tenant/v2.0', aud : 'wrong', exp : Math.floor (Date.now () / 1000) + 60 });
    await assert.rejects (() => VerifyEntraToken (header + '.' + payload + '.AA', { ENTRA_TENANT_ID : 'tenant', ENTRA_CLIENT_ID : 'client' }, async () => new Response ('{}')), /issuer or audience/);
});
