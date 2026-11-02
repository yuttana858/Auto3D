import { strict as assert } from 'node:assert';
import { webcrypto } from 'node:crypto';
import { CreateConsentHandler } from '../agent-mcp/consent.js';

if (!globalThis.crypto) { globalThis.crypto = webcrypto; }
const account = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const url = 'https://auto3d.example/authorize';
function setup ()
{
    let user = { id : account, email : 'a@example.test' }; let clock = 100000; let used = false; const complete = [];
    const authRequest = { scope : ['auto3d.read'], clientId : 'client', redirectUri : 'https://client.example/callback' };
    const oauth = {
        parseAuthRequest : async () => authRequest,
        describeConsent : async () => ({ clientName : '<script>client</script>', clientDomain : 'client.example', redirectHost : 'client.example', scope : ['auto3d.read'] }),
        beginConsent : async () => ({ handle : 'handle', headers : new Headers ({ 'Set-Cookie' : '__Host-oauth=bound; Secure; HttpOnly; Path=/' }) }),
        approveConsent : async (request, handle) => { if (used || handle !== 'handle' || request.headers.get ('Cookie') !== '__Host-oauth=bound') { throw new Error ('Unbound or used'); } used = true; return { request : authRequest, headers : new Headers () }; },
        denyConsent : async (request, handle) => { if (used || handle !== 'handle' || request.headers.get ('Cookie') !== '__Host-oauth=bound') { throw new Error ('Unbound or used'); } used = true; return { headers : new Headers ({ Location : 'https://client.example/callback?error=access_denied' }) }; },
        completeAuthorization : async input => { complete.push (input); return { redirectTo : 'https://client.example/callback?code=abc' }; }
    };
    const handler = CreateConsentHandler ({ oauth, verifiedUser : async () => user, signingKey : new Uint8Array (32).fill (42), now : () => clock });
    const page = async () => { const response = await handler (new Request (url)); const html = await response.text (); const handle = html.match (/name="handle" value="([^"]+)"/)?.[1]; const binding = html.match (/name="binding" value="([^"]+)"/)?.[1]; return { response, html, handle, binding }; };
    const post = (form, origin = 'https://auto3d.example', cookie = '__Host-oauth=bound') => handler (new Request (url, { method : 'POST', headers : { Origin : origin, Cookie : cookie, 'Content-Type' : 'application/x-www-form-urlencoded' }, body : new URLSearchParams (form) }));
    return { page, post, complete, authRequest, setUser : next => { user = next; }, advance : ms => { clock += ms; } };
}

describe ('MCP consent boundary', function () {
    it ('shows escaped client and destination and issues a read-only grant to the verified account', async function () {
        const test = setup (); const page = await test.page (); assert.equal (page.response.status, 200); assert.match (page.html, /&lt;script&gt;client&lt;\/script&gt;/); assert.match (page.html, /client\.example/); assert.match (page.response.headers.get ('Content-Security-Policy'), /frame-ancestors 'none'/); assert.match (page.response.headers.get ('Set-Cookie'), /__Host-oauth/);
        const response = await test.post ({ handle : page.handle, binding : page.binding, decision : 'approve' }); assert.equal (response.status, 302); assert.equal (test.complete[0].userId, account); assert.deepEqual (test.complete[0].scope, ['auto3d.read']); assert.match (test.complete[0].props.grantId, /^[0-9a-f-]{36}$/);
        assert.equal ((await test.post ({ handle : page.handle, binding : page.binding, decision : 'approve' })).status, 400); assert.equal (test.complete.length, 1);
    });
    it ('rejects an account switch, invalid origin, unbound cookie and expired consent', async function () {
        const test = setup (); const page = await test.page (); const form = { handle : page.handle, binding : page.binding, decision : 'approve' };
        test.setUser ({ id : other }); assert.equal ((await test.post (form)).status, 403); test.setUser ({ id : account });
        assert.equal ((await test.post (form, 'https://attacker.example')).status, 403); assert.equal ((await test.post (form, 'https://auto3d.example', 'bad')).status, 400);
        test.advance (600001); assert.equal ((await test.post (form)).status, 403); assert.equal (test.complete.length, 0);
    });
    it ('denies without issuing a grant and refuses broader requested scopes', async function () {
        const test = setup (); const page = await test.page (); const response = await test.post ({ handle : page.handle, binding : page.binding, decision : 'deny' }); assert.equal (response.status, 302); assert.match (response.headers.get ('Location'), /access_denied/); assert.equal (test.complete.length, 0);
        const second = setup (); second.authRequest.scope = ['auto3d.read', 'auto3d.write']; assert.equal ((await second.page ()).response.status, 400);
    });
});
