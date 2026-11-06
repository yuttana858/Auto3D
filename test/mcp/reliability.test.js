import assert from 'node:assert/strict';
import { Registrations } from '../../mcp/registrations.js';
import { BrokerCore, CommandTimeout } from '../../mcp/broker-core.js';
import { AgentError, PublicError } from '../../mcp/common.js';
import { ActiveRegistration } from '../../mcp/identity.js';
import { PilotService } from '../../mcp/service.js';
import { readFileSync } from 'node:fs';
const catalog = JSON.parse (readFileSync (new URL ('../../website/assets/commands.json', import.meta.url), 'utf8'));

class Storage
{
    constructor () { this.data = new Map (); this.tail = Promise.resolve (); }
    async get (key) { return structuredClone (this.data.get (key)); }
    async put (key, value) { this.data.set (key, structuredClone (value)); }
    async delete (key) { this.data.delete (key); }
    async list ({ prefix = '', limit = 1000 } = {}) { return new Map ([...this.data].filter (([key]) => key.startsWith (prefix)).slice (0, limit).map (([key, value]) => [key, structuredClone (value)])); }
    transaction (action) { const operation = this.tail.then (() => action (this)); this.tail = operation.catch (() => {}); return operation; }
}
const owner = 'account-a';
const State = () => ({ storage : new Storage (), sockets : [], getWebSockets () { return this.sockets; }, acceptWebSocket (socket) { this.sockets.push (socket); } });
const Socket = () => ({ readyState : 1, sent : [], serializeAttachment (data) { this.data = structuredClone (data); }, deserializeAttachment () { return structuredClone (this.data); }, send (text) { const message = JSON.parse (text); this.sent.push (message); this.onSend?.(message); }, close () { this.readyState = 3; } });
const Registration = (id = 'grant-a', scopes = ['auto3d.read', 'auto3d.write'], expiresAt = Date.now () + 3600000) => ({ accountId : owner, id, name : 'Agent', harness : 'claude', clientId : 'client', scopes, expiresAt });

async function Connected ({ now, allowSelect = true, instanceId = 'window-a', fingerprint = 'a'.repeat (64), state = State (), broker } = {})
{
    broker ||= new BrokerCore (state, { now, timeoutMs : 50 });
    const socket = Socket ();
    await broker.Attach ({ accountId : owner, sessionFingerprint : fingerprint, expiresAt : (now?.() ?? Date.now ()) + 60000 }, socket);
    await broker.Message (socket, JSON.stringify ({ type : 'hello', instanceId, windowLabel : 'Window', allowSelect, sessions : [{ id : 'tab-a', name : 'Box', active : true }] }));
    return { state, broker, socket };
}
const Echo = (broker, socket, respond = message => ({ result : { ok : true, command : message.command, result : 'done' } })) => {
    socket.onSend = message => { if (message.type === 'request') { queueMicrotask (() => broker.Message (socket, JSON.stringify ({ type : 'result', requestId : message.requestId, sessionId : message.sessionId, ...respond (message) }))); } };
};

describe ('MCP live-control reliability', () => {
    it ('keeps working after more than 1000 commands and removes legacy request records', async () => {
        let now = Date.now (); const { broker, socket, state } = await Connected ({ now : () => now });
        await broker.registrations.Create (Registration ());
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : socket.data.connectionId, sessionId : 'tab-a', expiresAt : now + 3600000 });
        Echo (broker, socket);
        for (let index = 0; index < 1005; index++) {
            if (index % 100 === 0) { now += 1000; broker.recent = []; }
            assert.equal ((await broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'r' + index, command : 'scene.inspect', arguments : {} })).result, 'done');
        }
        await state.storage.put ('request:grant-a:legacy', { expiresAt : now + 36525 * 86400000 });
        now += 3 * 3600000;
        await broker.Cleanup ();
        assert.equal ((await state.storage.list ({ prefix : 'request:' })).size, 0);
    });
    it ('rate-limits bursts with a coded error', async () => {
        const { broker, socket } = await Connected ();
        await broker.registrations.Create (Registration ());
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : socket.data.connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 3600000 });
        Echo (broker, socket); broker.recent = Array (120).fill (Date.now ());
        await assert.rejects (broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'burst', command : 'scene.inspect', arguments : {} }), /\[rate_limited\]/);
    });
    it ('passes browser error codes through and maps unknown codes to command_failed', async () => {
        const { broker, socket } = await Connected ();
        await broker.registrations.Create (Registration ());
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : socket.data.connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 3600000 });
        Echo (broker, socket, message => ({ error : message.requestId === 'a' ? { code : 'invalid_arguments', message : 'arguments.id is required.' } : { code : 'evil', message : 'x‮' } }));
        await assert.rejects (broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'a', command : 'object.select', arguments : {} }), error => PublicError (error).code === 'invalid_arguments' && PublicError (error).message === 'arguments.id is required.');
        await assert.rejects (broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'b', command : 'object.select', arguments : {} }), error => PublicError (error).code === 'command_failed' && PublicError (error).message === 'x');
        assert.equal (socket.readyState, 1);
    });
    it ('times out long commands by class, cancels them in the window and says they may still complete', async () => {
        assert.equal (CommandTimeout ('scene.inspect', 15000), 15000); assert.equal (CommandTimeout ('object.select', 15000), 60000); assert.equal (CommandTimeout ('render.now', 15000), 300000); assert.equal (CommandTimeout ('ai.generate', 15000), 300000);
        const { broker, socket } = await Connected ();
        await broker.registrations.Create (Registration ());
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : socket.data.connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 3600000 });
        await assert.rejects (broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'slow', command : 'scene.inspect', arguments : {} }), /\[timeout\].*may still complete/);
        assert.deepEqual (socket.sent.at (-1), { type : 'cancel', requestId : 'slow', sessionId : 'tab-a' });
    });
    it ('requires the window code unless the window allows agent selection', async () => {
        const { broker, socket } = await Connected ({ allowSelect : false });
        await broker.registrations.Create (Registration ());
        await assert.rejects (broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : socket.data.connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 3600000 }), /\[invalid_code\].*one-time code/);
    });
    it ('resumes a pairing when the same login session reconnects the same window', async () => {
        const first = await Connected ();
        await first.broker.registrations.Create (Registration ());
        await first.broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : first.socket.data.connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 3600000 });
        first.socket.readyState = 3; first.broker.Close (first.socket);
        await assert.rejects (first.broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'gone', command : 'scene.inspect', arguments : {} }), /\[session_unavailable\].*reconnect/);
        const other = await Connected ({ state : first.state, broker : first.broker, fingerprint : 'b'.repeat (64) });
        await assert.rejects (first.broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'other-login', command : 'scene.inspect', arguments : {} }), /session_unavailable/);
        other.socket.readyState = 3; first.broker.Close (other.socket);
        const again = await Connected ({ state : first.state, broker : first.broker });
        Echo (first.broker, again.socket);
        assert.equal ((await first.broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'resumed', command : 'scene.inspect', arguments : {} })).result, 'done');
        assert.equal ((await first.state.storage.get ('pair:grant-a')).connectionId, again.socket.data.connectionId);
    });
    it ('moves the pairing to the tab an agent activated', async () => {
        const { broker, socket } = await Connected ();
        await broker.registrations.Create (Registration ());
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : socket.data.connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 3600000 });
        socket.onSend = message => {
            if (message.type !== 'request') { return; }
            queueMicrotask (async () => {
                if (message.command === 'session.tabs.new') { await broker.Message (socket, JSON.stringify ({ type : 'sessions', instanceId : 'window-a', sessions : [{ id : 'tab-a', name : 'Box', active : false }, { id : 'tab-b', name : 'New', active : true }] })); }
                await broker.Message (socket, JSON.stringify ({ type : 'result', requestId : message.requestId, sessionId : message.sessionId, result : { ok : true, command : message.command, result : {}, ...(message.command === 'session.tabs.new' ? { activeSessionId : 'tab-b' } : {}) } }));
            });
        };
        await broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'new-tab', command : 'session.tabs.new', arguments : {} });
        await broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'after', command : 'scene.inspect', arguments : {} });
        assert.equal (socket.sent.filter (message => message.type === 'request').at (-1).sessionId, 'tab-b');
    });
    it ('counts only active registrations and prunes old revoked ones', async () => {
        let now = Date.now (); const registry = new Registrations (new Storage (), () => now);
        for (let index = 0; index < 100; index++) { await registry.Create (Registration ('old-' + index, ['auto3d.read'], now + 86400000)); await registry.Revoke ({ accountId : owner, id : 'old-' + index }); }
        await registry.Create (Registration ('fresh', ['auto3d.read'], now + 60 * 86400000));
        now += 31 * 86400000; await registry.Prune ();
        assert.deepEqual ((await registry.List (owner)).registrations.map (record => record.id), ['fresh']);
    });
    it ('rejects pending requests and clears pairings when an administrator disables agents', async () => {
        const { broker, socket, state } = await Connected ();
        await broker.registrations.Create (Registration ());
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : socket.data.connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 3600000 });
        let sent; const dispatched = new Promise (resolve => { sent = resolve; }); socket.onSend = message => { if (message.type === 'request') { sent (); } };
        const pending = assert.rejects (broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'p', command : 'object.select', arguments : {} }), /\[revoked\]/);
        await dispatched; await broker.DisableAgents ({ accountId : owner, disabled : true }); await pending;
        assert.equal (await state.storage.get ('pair:grant-a'), undefined);
    });
    it ('separates identity outages from revocation', async () => {
        const env = { AUTO3D_MCP_PILOT : '1', AUTO3D_MCP_ORIGIN : 'https://auto3d-mcp-pilot.pages.dev', AUTO3D_MCP_PILOT_ACCOUNTS : '11111111-1111-4111-8111-111111111111', AUTO3D_MCP_STAGING_SUPABASE_URL : 'https://stagingtest.supabase.co', AUTO3D_MCP_PRODUCTION_SUPABASE_URL : 'https://productiontest.supabase.co', SUPABASE_URL : 'https://stagingtest.supabase.co', SUPABASE_SECRET_KEY : 'sb_secret_test' };
        const account = '11111111-1111-4111-8111-111111111111';
        const broker = assert => ({ getByName : () => ({ AssertRegistration : assert }) });
        const originalFetch = globalThis.fetch;
        try {
            globalThis.fetch = async () => new Response ('[]', { status : 200, headers : { 'Content-Type' : 'application/json' } });
            assert.ok (await ActiveRegistration ({ ...env, AUTO3D_AGENT_BROKER : broker (async () => ({ createdAt : Date.now () })) }, account, 'grant-a'));
            await assert.rejects (ActiveRegistration ({ ...env, AUTO3D_AGENT_BROKER : broker (async () => { throw AgentError ('revoked'); }) }, account, 'grant-a'), /\[revoked\]/);
            await assert.rejects (ActiveRegistration ({ ...env, AUTO3D_AGENT_BROKER : broker (async () => { throw new Error ('Durable Object reset'); }) }, account, 'grant-a'), /\[unavailable\]/);
            globalThis.fetch = async () => new Response ('down', { status : 502 });
            await assert.rejects (ActiveRegistration ({ ...env, AUTO3D_AGENT_BROKER : broker (async () => ({ createdAt : Date.now () })) }, account, 'grant-a'), /\[unavailable\]/);
            await assert.rejects (ActiveRegistration ({ ...env, AUTO3D_AGENT_BROKER : broker (async () => ({})) }, 'not-enrolled', 'grant-a'), /\[revoked\]/);
        } finally { globalThis.fetch = originalFetch; }
    });
    it ('maps every catalog category to a family and gives read-only grants accurate hints', async () => {
        const service = new PilotService ({ AssertRegistration : async () => ({}) }, catalog.commands);
        const reader = { userId : owner, props : { registrationId : 'grant-a' }, scope : ['auto3d.read'], expiresAt : Date.now () / 1000 + 60 };
        const writer = { ...reader, scope : ['auto3d.read', 'auto3d.write'] };
        const families = ['design', 'commands', 'capture', 'modules', 'sessions', 'settings'];
        const listed = new Set ();
        for (const family of families) { for (const item of (await service.Call (writer, 'auto3d.' + family, {})).categories) { listed.add (item.category); } }
        assert.deepEqual ([...listed].sort (), [...new Set (catalog.commands.map (tool => tool.category))].sort ());
        assert.ok ((await service.Call (writer, 'auto3d.modules', {})).categories.some (item => item.category === 'Primary Products'));
        assert.ok (!(await service.Call (writer, 'auto3d.settings', {})).categories.some (item => item.category === 'Primary Products'));
        const readTools = service.Tools (reader);
        assert.ok (!readTools.some (tool => tool.id === 'auto3d.commands.invoke'));
        assert.ok (readTools.filter (tool => /^auto3d\.(design|modules)$/.test (tool.id)).every (tool => !tool.description.includes ('auto3d.commands.invoke') && tool.description.includes ('read-only')));
        assert.match ((await service.Call (reader, 'auto3d.modules', {})).hint, /read-only/);
        const page = await service.Call (reader, 'auto3d.design', { category : 'Objects', limit : 2 });
        assert.ok (page.commands.every (command => command.runnable === false));
        await assert.rejects (service.Call (reader, 'auto3d.commands.invoke', { command : 'scene.inspect', arguments : {} }), error => PublicError (error).code === 'permission_required');
        await assert.rejects (service.Call (writer, 'auto3d.design', { category : 'Objects', bogus : 1 }), error => PublicError (error).code === 'invalid_arguments' && /bogus/.test (PublicError (error).message));
        assert.equal (PublicError (new Error ('Database password is hunter2')).code, 'unavailable');
    });
});
