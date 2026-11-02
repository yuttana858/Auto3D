import assert from 'node:assert/strict';
import { OAuthAuthorizationServer } from '../../agent-mcp/node_modules/@cloudflare/workers-oauth-provider/dist/oauth-provider.js';
import { CreateAuthorizationService } from '../../agent-mcp/auth-worker.js';
import { CreateResourceVerifier } from '../../agent-mcp/identity.js';

class MemoryKV {
    constructor () { this.data = new Map (); }
    async get (key, options) { const value = this.data.get (key) ?? null; const type = typeof options === 'string' ? options : options?.type; return value !== null && type === 'json' ? JSON.parse (value) : value; }
    async put (key, value) { this.data.set (key, value); }
    async delete (key) { this.data.delete (key); }
    async list ({ prefix = '' } = {}) { return { keys : [...this.data.keys ()].filter (key => key.startsWith (prefix)).map (name => ({ name })), list_complete : true }; }
}
const issuer = 'https://auto3d.example/agent', resource = 'https://auto3d.example/mcp';
const env = { AUTO3D_MCP_ISSUER : issuer, AUTO3D_MCP_RESOURCE : resource, AUTO3D_MCP_CONSENT_SECRET : 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', OAUTH_KV : new MemoryKV () };
const provider = new OAuthAuthorizationServer ({ issuer, resources : [resource], scopesSupported : ['auto3d.read', 'auto3d.capture', 'offline_access'], clientIdMetadataDocumentEnabled : true, clientRegistrationEndpoint : issuer + '/register' });
const client = await provider.getOAuthApi (env).createClient ({ clientName : 'Test client', redirectUris : ['https://client.example/callback'], tokenEndpointAuthMethod : 'none' });
const service = CreateAuthorizationService ({ OAuthAuthorizationServer, browserIdentity : () => async () => ({ id : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email : 'test@example.test' }) });
const verifier = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
const hash = await crypto.subtle.digest ('SHA-256', new TextEncoder ().encode (verifier)); const challenge = Buffer.from (hash).toString ('base64url');
const params = new URLSearchParams ({ response_type : 'code', client_id : client.clientId, redirect_uri : 'https://client.example/callback', scope : 'auto3d.read auto3d.capture offline_access', state : 'state-value', code_challenge : challenge, code_challenge_method : 'S256', resource });
const page = await service.fetch (new Request (issuer + '/authorize?' + params), env, {}); const html = await page.text ();
assert.equal (page.status, 200, html);
const handle = html.match (/name="handle" value="([^"]+)"/)[1], binding = html.match (/name="binding" value="([^"]+)"/)[1];
const cookie = page.headers.getSetCookie ().map (c => c.split (';')[0]).join ('; '); assert.ok (cookie);
const approve = new Request (issuer + '/authorize', { method : 'POST', headers : { Origin : 'https://auto3d.example', Cookie : cookie, 'Content-Type' : 'application/x-www-form-urlencoded' }, body : new URLSearchParams ({ handle, binding, decision : 'approve' }) });
const approved = await service.fetch (approve, env, {}); assert.equal (approved.status, 302, await approved.text ()); const redirect = new URL (approved.headers.get ('Location')); assert.equal (redirect.searchParams.get ('state'), 'state-value'); const code = redirect.searchParams.get ('code'); assert.ok (code);
const tokenRequest = new Request (issuer + '/oauth/token', { method : 'POST', headers : { 'Content-Type' : 'application/x-www-form-urlencoded' }, body : new URLSearchParams ({ grant_type : 'authorization_code', client_id : client.clientId, redirect_uri : 'https://client.example/callback', code, code_verifier : verifier, resource }) });
const replayRequest = tokenRequest.clone ();
const tokenResponse = await service.fetch (tokenRequest, env, { waitUntil () {} }); const tokenBody = await tokenResponse.json (); assert.equal (tokenResponse.status, 200, JSON.stringify (tokenBody)); assert.ok (tokenBody.access_token);
const verify = CreateResourceVerifier ({ resource, validateToken : (audience, token) => service.validateToken (audience, token, env), isAccountActive : async () => true }); const actor = await verify (tokenBody.access_token); assert.equal (actor.accountId, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'); assert.deepEqual (actor.scopes, ['auto3d.read', 'auto3d.capture', 'offline_access']);
await assert.rejects (() => verify (tokenBody.access_token + 'bad'));
assert.ok (tokenBody.refresh_token);
const refreshRequest = new Request (issuer + '/oauth/token', { method : 'POST', headers : { 'Content-Type' : 'application/x-www-form-urlencoded' }, body : new URLSearchParams ({ grant_type : 'refresh_token', client_id : client.clientId, refresh_token : tokenBody.refresh_token, resource }) });
const refreshResponse = await service.fetch (refreshRequest, env, { waitUntil () {} }); const refreshed = await refreshResponse.json (); assert.equal (refreshResponse.status, 200, JSON.stringify (refreshed)); const refreshedActor = await verify (refreshed.access_token); assert.equal (refreshedActor.accountId, actor.accountId); assert.equal (refreshedActor.grantId, actor.grantId);




// Exercise the real provider token through the read-only MCP resource, the
// account broker, and a browser bridge; Cloudflare state and sockets are fakes.
const { readFile } = await import ('node:fs/promises');
const { CreateMcpResourceService } = await import ('../../agent-mcp/resource-worker.js');
const { DurableSessionBroker } = await import ('../../agent-mcp/durable-broker.js');
const { BrowserBridge } = await import ('../../agent-mcp/browser-bridge.js');
const { CommandRegistry } = await import ('../../source/website/commandregistry.js');
const catalog = JSON.parse (await readFile ('website/assets/commands.json', 'utf8')).commands;
const storageMap = new Map (); const storage = { get : async key => storageMap.get (key), put : async (key, value) => storageMap.set (key, structuredClone (value)), delete : async key => storageMap.delete (key), transaction : async callback => callback (storage) };
const sockets = []; const broker = new DurableSessionBroker ({ storage, acceptWebSocket : socket => sockets.push (socket), getWebSockets : () => sockets });
const website = { accountReady : true, auth : { user : { id : actor.accountId } }, sessionEditor : { readOnly : false, sessions : { Inspect : () => ({ tabs : [{ id : 'box', name : 'Box', active : true }] }) } } };
const registry = new CommandRegistry ({ website, readOnly : false }); registry.Register (catalog.find (item => item.id === 'scene.inspect'), () => ({ name : 'Box' })); const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII='; registry.Register (catalog.find (item => item.id === 'capture.image'), () => ({ scope : 'viewport', width : 1, height : 1, content : [{ type : 'image', mimeType : 'image/png', data : png }] })); website.commands = registry;
const bridge = new BrowserBridge ({ website, instanceId : 'window', windowLabel : 'Laptop' }); const description = bridge.Connect ();
const socket = { readyState : 1, serializeAttachment (value) { this.attachment = structuredClone (value); }, deserializeAttachment () { return structuredClone (this.attachment); }, send (value) { const message = JSON.parse (value); if (message.type !== 'request') { return; } queueMicrotask (async () => { try { const result = await bridge.Execute (message); broker.webSocketMessage (socket, JSON.stringify ({ type : 'result', requestId : message.requestId, result })); } catch { broker.webSocketMessage (socket, JSON.stringify ({ type : 'result', requestId : message.requestId, error : 'error' })); } }); }, close () { this.readyState = 3; } };
const connectionId = await broker.Attach ({ accountId : actor.accountId, sessionFingerprint : 'a'.repeat (64), expiresAt : Date.now () + 60000 }, socket); broker.webSocketMessage (socket, JSON.stringify ({ type : 'hello', ...description }));
const resourceEnv = { ...env, AUTO3D_AUTH_SERVER : { validateToken : (audience, token) => service.validateToken (audience, token, env) }, AUTO3D_AGENT_BROKER : { getByName : name => { assert.equal (name, actor.accountId); return broker; } } };
const resourceHandler = CreateMcpResourceService ({ env : resourceEnv, catalog, isAccountActive : async id => id === actor.accountId });
let requestId = 0; async function call (name, args = {}) { const request = new Request (resource, { method : 'POST', headers : { Authorization : 'Bearer ' + refreshed.access_token, Accept : 'application/json, text/event-stream', 'Content-Type' : 'application/json', 'MCP-Protocol-Version' : '2025-06-18' }, body : JSON.stringify ({ jsonrpc : '2.0', id : ++requestId, method : 'tools/call', params : { name, arguments : args } }) }); const response = await resourceHandler (request); assert.equal (response.status, 200); return (await response.json ()).result; }
assert.equal ((await call ('auto3d.sessions.list')).structuredContent.result[0].connectionId, connectionId);
assert.equal ((await call ('auto3d.sessions.select', { connectionId, sessionId : 'box' })).structuredContent.result.sessionId, 'box');
assert.equal ((await call ('scene.inspect')).structuredContent.result.result.name, 'Box');
const capture = await call ('capture.image', { scope : 'viewport' }); assert.equal (capture.content[1].type, 'image'); assert.equal (capture.content[1].data, png); assert.equal (capture.structuredContent.result.width, 1); assert.ok (!JSON.stringify (capture.structuredContent).includes (png));

const grantResponse = await service.fetch (new Request (issuer + '/grants', { headers : { 'X-Auto3D-Account' : actor.accountId } }), env, {}); const grants = await grantResponse.json (); assert.equal (grantResponse.status, 200); assert.equal (grants.grants.length, 1);
const revokeResponse = await service.fetch (new Request (issuer + '/grants/revoke', { method : 'POST', headers : { Origin : 'https://auto3d.example', 'X-Auto3D-Account' : actor.accountId, 'Content-Type' : 'application/json' }, body : JSON.stringify ({ id : grants.grants[0].id }) }), env, {}); assert.equal (revokeResponse.status, 200); await assert.rejects (() => verify (refreshed.access_token));
const replay = await service.fetch (replayRequest, env, { waitUntil () {} }); assert.equal (replay.status, 400);
