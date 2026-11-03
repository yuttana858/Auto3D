import assert from 'node:assert/strict';
import { Registrations } from '../../mcp/registrations.js';
import { BrokerCore } from '../../mcp/broker-core.js';
import { PilotConfig } from '../../mcp/common.js';
import { PilotService } from '../../mcp/service.js';
import { Validate } from '../../source/website/commandregistry.js';

class Storage
{
    constructor () { this.data = new Map (); this.tail = Promise.resolve (); }
    async get (key) { return structuredClone (this.data.get (key)); }
    async put (key, value) { this.data.set (key, structuredClone (value)); }
    async delete (key) { this.data.delete (key); }
    async list ({ prefix = '', limit = 1000 } = {}) { return new Map ([...this.data].filter (([key]) => key.startsWith (prefix)).slice (0, limit).map (([key, value]) => [key, structuredClone (value)])); }
    transaction (action) { const operation = this.tail.then (() => action (this)); this.tail = operation.catch (() => {}); return operation; }
}
const owner = 'account-a', other = 'account-b';
const registration = (id = 'grant-a') => ({ accountId : owner, id, name : 'Packaging review', harness : 'chatgpt', clientId : 'client-a', scopes : ['auto3d.read'], expiresAt : Date.now () + 60000 });
const State = () => ({ storage : new Storage (), sockets : [], getWebSockets () { return this.sockets; }, acceptWebSocket (socket) { this.sockets.push (socket); } });
const Socket = () => ({ readyState : 1, sent : [], serializeAttachment (data) { this.data = structuredClone (data); }, deserializeAttachment () { return structuredClone (this.data); }, send (text) { this.sent.push (JSON.parse (text)); this.onSend?.(JSON.parse (text)); }, close () { this.readyState = 3; } });

describe ('MCP registration and isolation boundary', () => {
    it ('rejects an account mismatch and keeps named grants independent', async () => {
        const registry = new Registrations (new Storage ());
        await registry.Create (registration ()); await registry.Create (registration ('grant-b'));
        await assert.rejects (registry.List (other), /Account/);
        await registry.Revoke ({ accountId : owner, id : 'grant-a' });
        await assert.rejects (registry.Assert ({ accountId : owner, id : 'grant-a' }), /revoked/);
        assert.equal ((await registry.Assert ({ accountId : owner, id : 'grant-b' })).name, 'Packaging review');
    });
    it ('does not resurrect grants when administrators restore agent access', async () => {
        const registry = new Registrations (new Storage ()); await registry.Create (registration ());
        await registry.Disable ({ accountId : owner, disabled : true }); await assert.rejects (registry.Create (registration ('new-grant')));
        await registry.Disable ({ accountId : owner, disabled : false }); await assert.rejects (registry.Assert ({ accountId : owner, id : 'grant-a' }));
        await registry.Create (registration ('new-grant'));
    });
    it ('rejects hidden/bidirectional labels, unsupported harnesses and excessive scopes', async () => {
        const registry = new Registrations (new Storage ());
        for (const change of [{ name : 'Agent\u202eevil' }, { harness : 'shared-api-key' }, { scopes : ['auto3d.read', 'admin'] }]) { await assert.rejects (registry.Create ({ ...registration (), ...change })); }
    });
    it ('expires registrations and rejects production or missing identity configuration', async () => {
        let now = Date.now (); const registry = new Registrations (new Storage (), () => now);
        await registry.Create (registration ()); now += 120000; await assert.rejects (registry.Assert ({ accountId : owner, id : 'grant-a' }));
        const env = { AUTO3D_MCP_PILOT : '1', AUTO3D_MCP_ORIGIN : 'https://auto3d-mcp-pilot.pages.dev', AUTO3D_MCP_PILOT_ACCOUNTS : '11111111-1111-4111-8111-111111111111', AUTO3D_MCP_STAGING_SUPABASE_URL : 'https://stagingtest.supabase.co', AUTO3D_MCP_PRODUCTION_SUPABASE_URL : 'https://productiontest.supabase.co', SUPABASE_URL : 'https://stagingtest.supabase.co' };
        assert.ok (PilotConfig (env)); assert.throws (() => PilotConfig ({ ...env, SUPABASE_URL : env.AUTO3D_MCP_PRODUCTION_SUPABASE_URL }));
        assert.throws (() => PilotConfig ({ ...env, AUTO3D_MCP_PILOT_ACCOUNTS : '' }));
    });
    it ('routes results to one account/window/tab and refuses stale tabs, replay and revocation', async () => {
        const state = State (), broker = new BrokerCore (state), socket = Socket ();
        await broker.registrations.Create (registration ());
        await broker.Attach ({ accountId : owner, sessionFingerprint : 'a'.repeat (64), expiresAt : Date.now () + 60000 }, socket);
        broker.Message (socket, JSON.stringify ({ type : 'hello', instanceId : 'window-a', windowLabel : 'Review', sessions : [{ id : 'tab-a', name : 'Box', active : true }] }));
        const connectionId = socket.data.connectionId;
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 60000 });
        socket.onSend = message => { if (message.type === 'request') { queueMicrotask (() => broker.Message (socket, JSON.stringify ({ type : 'result', requestId : message.requestId, sessionId : message.sessionId, result : { ok : true, command : message.command, result : 'box' } }))); } };
        const input = { accountId : owner, grantId : 'grant-a', requestId : 'request-a', command : 'scene.inspect', arguments : {} };
        assert.equal ((await broker.Dispatch (input)).result, 'box'); await assert.rejects (broker.Dispatch (input), /Duplicate/);
        await assert.rejects (broker.List (other));
        broker.Message (socket, JSON.stringify ({ type : 'sessions', instanceId : 'window-a', sessions : [{ id : 'tab-a', name : 'Box', active : false }, { id : 'tab-b', name : 'Other', active : true }] }));
        await assert.rejects (broker.Dispatch ({ ...input, requestId : 'request-b' }), /session/);
        await broker.Revoke ({ accountId : owner, id : 'grant-a' }); await assert.rejects (broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId, sessionId : 'tab-b', expiresAt : Date.now () + 60000 }));
    });
    it ('rejects pending results on revoke and enforces screenshot permission at the broker', async () => {
        const state = State (), broker = new BrokerCore (state), socket = Socket ();
        await broker.registrations.Create (registration ()); await broker.Attach ({ accountId : owner, sessionFingerprint : 'a'.repeat (64), expiresAt : Date.now () + 60000 }, socket);
        broker.Message (socket, JSON.stringify ({ type : 'hello', instanceId : 'window-a', windowLabel : 'Review', sessions : [{ id : 'tab-a', name : 'Box', active : true }] }));
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : socket.data.connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 60000 });
        await assert.rejects (broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'capture-a', command : 'capture.image', arguments : {} }), /Screenshot/);
        let sent; const dispatched = new Promise (resolve => { sent = resolve; }); socket.onSend = message => { if (message.type === 'request') { sent (); } };
        const result = broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'pending-a', command : 'scene.inspect', arguments : {} });
        const rejection = assert.rejects (result, /revoked/); await dispatched; await broker.Revoke ({ accountId : owner, id : 'grant-a' }); await rejection;
    });
    it ('enforces remote allowlists and strict string argument constraints', async () => {
        const broker = { AssertRegistration : async () => ({}) }, actor = { userId : owner, props : { registrationId : 'grant-a' }, scope : ['auto3d.read'], expiresAt : Date.now () / 1000 + 60 };
        const service = new PilotService (broker, [{ id : 'auth.sign_out', mutates : true }, { id : 'capture.image', mutates : false }]);
        assert.equal (service.Tools (actor).length, 0); await assert.rejects (service.Call (actor, 'auth.sign_out', {}));
        assert.throws (() => Validate ('abc', { type : 'string', maxLength : 2 })); assert.throws (() => Validate ('bad!', { type : 'string', pattern : '^[a-z]+$' }));
    });
});
