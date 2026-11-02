import { strict as assert } from 'node:assert';
import { CreateAuthorizationService } from '../agent-mcp/auth-worker.js';
import { CreateConsentHandler } from '../agent-mcp/consent.js';

const issuer = 'https://auto3d.example/agent';
const resource = 'https://auto3d.example/mcp';
const env = { AUTO3D_MCP_ISSUER : issuer, AUTO3D_MCP_RESOURCE : resource, AUTO3D_MCP_CONSENT_SECRET : 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', OAUTH_KV : {} };

describe ('MCP authorization service wiring', function () {
    it ('routes authorization through the verified browser identity and provider helpers', async function () {
        let options; let identityEnvironment; let complete;
        class Provider {
            constructor (value) { options = value; }
            getOAuthApi () { return {
                parseAuthRequest : async () => ({ scope : ['auto3d.read'] }),
                describeConsent : async () => ({ scope : ['auto3d.read'], clientName : 'Client', redirectHost : 'client.example' }),
                beginConsent : async () => ({ handle : 'bound', headers : new Headers () }),
                approveConsent : async () => ({ request : { scope : ['auto3d.read'] }, headers : new Headers () }),
                completeAuthorization : async value => { complete = value; return { redirectTo : 'https://client.example/callback' }; }
            }; }
            fetch () { return new Response ('provider'); }
            validateToken (audience, token) { return { audience, token }; }
        }
        const worker = CreateAuthorizationService ({ OAuthAuthorizationServer : Provider, browserIdentity : passed => { identityEnvironment = passed; return async () => ({ id : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }); } });
        const response = await worker.fetch (new Request (issuer + '/authorize?client_id=x'), env, {}); const page = await response.text ();
        assert.equal (response.status, 200); assert.equal (identityEnvironment, env); assert.deepEqual (options.resources, [resource]); assert.deepEqual (options.scopesSupported, ['auto3d.read', 'auto3d.capture', 'offline_access']);
        const handle = page.match (/name="handle" value="([^"]+)"/)[1]; const binding = page.match (/name="binding" value="([^"]+)"/)[1];
        const post = new Request (issuer + '/authorize', { method : 'POST', headers : { Origin : 'https://auto3d.example', 'Content-Type' : 'application/x-www-form-urlencoded' }, body : new URLSearchParams ({ handle, binding, decision : 'approve' }) });
        assert.equal ((await worker.fetch (post, env, {})).status, 302); assert.equal (complete.userId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
        assert.equal (await (await worker.fetch (new Request (issuer + '/oauth/token'), env, {})).text (), 'provider');
        assert.deepEqual (await worker.validateToken (resource, 'token', env), { audience : resource, token : 'token' }); assert.equal (await worker.validateToken ('https://other.example/mcp', 'token', env), null);
        assert.equal ((await worker.fetch (new Request ('https://other.example/agent/authorize'), env, {})).status, 400);
        assert.equal ((await worker.fetch (new Request (issuer + '/authorize'), { ...env, AUTO3D_MCP_CONSENT_SECRET : '' }, {})).status, 503);
    });
    it ('preserves the authorization request through an escaped same-site sign-in continuation', async function () {
        const handler = CreateConsentHandler ({ oauth : {}, verifiedUser : async () => null, signingKey : new Uint8Array (32) });
        const response = await handler (new Request (issuer + '/authorize?state=%3Cscript%3E&scope=auto3d.read'));
        const html = await response.text (); assert.equal (response.status, 401); assert.match (html, /name="state" value="&lt;script&gt;"/); assert.match (html, /name="scope" value="auto3d.read"/); assert.match (html, /Continue/); assert.match (response.headers.get ('Content-Security-Policy'), /frame-ancestors 'none'/);
    });
});
