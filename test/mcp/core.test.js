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
        assert.equal ((await registry.Create ({ ...registration ('claude-grant'), harness : 'claude' })).harness, 'claude');
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
        await broker.Message (socket, JSON.stringify ({ type : 'hello', instanceId : 'window-a', windowLabel : 'Review', allowSelect : true, sessions : [{ id : 'tab-a', name : 'Box', active : true }] }));
        const connectionId = socket.data.connectionId;
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 60000 });
        socket.onSend = message => { if (message.type === 'request') { queueMicrotask (() => broker.Message (socket, JSON.stringify ({ type : 'result', requestId : message.requestId, sessionId : message.sessionId, result : { ok : true, command : message.command, result : 'box' } }))); } };
        const input = { accountId : owner, grantId : 'grant-a', requestId : 'request-a', command : 'scene.inspect', arguments : {} };
        assert.equal ((await broker.Dispatch (input)).result, 'box'); await assert.rejects (broker.Dispatch (input), /Duplicate/);
        await assert.rejects (broker.Dispatch ({ ...input, requestId : 'write-denied', command : 'auth.sign_out' }), /Write permission/);
        await assert.rejects (broker.List (other));
        await broker.Message (socket, JSON.stringify ({ type : 'sessions', instanceId : 'window-a', sessions : [{ id : 'tab-a', name : 'Box', active : false }, { id : 'tab-b', name : 'Other', active : true }] }));
        await assert.rejects (broker.Dispatch ({ ...input, requestId : 'request-b' }), /session/);
        await broker.Revoke ({ accountId : owner, id : 'grant-a' }); await assert.rejects (broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId, sessionId : 'tab-b', expiresAt : Date.now () + 60000 }));
    });
    it ('rejects pending results on revoke and enforces screenshot permission at the broker', async () => {
        const state = State (), broker = new BrokerCore (state), socket = Socket ();
        await broker.registrations.Create (registration ()); await broker.Attach ({ accountId : owner, sessionFingerprint : 'a'.repeat (64), expiresAt : Date.now () + 60000 }, socket);
        await broker.Message (socket, JSON.stringify ({ type : 'hello', instanceId : 'window-a', windowLabel : 'Review', allowSelect : true, sessions : [{ id : 'tab-a', name : 'Box', active : true }] }));
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : socket.data.connectionId, sessionId : 'tab-a', expiresAt : Date.now () + 60000 });
        await assert.rejects (broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'capture-a', command : 'capture.image', arguments : {} }), /Screenshot/);
        let sent; const dispatched = new Promise (resolve => { sent = resolve; }); socket.onSend = message => { if (message.type === 'request') { sent (); } };
        const result = broker.Dispatch ({ accountId : owner, grantId : 'grant-a', requestId : 'pending-a', command : 'scene.inspect', arguments : {} });
        const rejection = assert.rejects (result, /revoked/); await dispatched; await broker.Revoke ({ accountId : owner, id : 'grant-a' }); await rejection;
    });
    it ('pairs one active app window with one short-lived code without exposing its digest', async () => {
        let now = Date.now (); const state = State (), broker = new BrokerCore (state, { now : () => now }), socket = Socket ();
        await broker.registrations.Create ({ ...registration (), expiresAt : now + 60000 });
        await broker.Attach ({ accountId : owner, sessionFingerprint : 'a'.repeat (64), expiresAt : now + 60000 }, socket);
        const code = 'ABCD-EFGH-JKLM-NPQR';
        await broker.Message (socket, JSON.stringify ({ type : 'hello', instanceId : 'window-code', windowLabel : 'Auto3D window', windowCode : code, sessions : [{ id : 'tab-a', name : 'Bottle', active : true }] }));
        assert.ok (!JSON.stringify (socket.data).includes (code));
        assert.equal ((await broker.List (owner))[0].windowLabel, 'Auto3D window');
        assert.ok (!JSON.stringify (await broker.List (owner)).includes (code));
        await broker.PairWithCode ({ accountId : owner, grantId : 'grant-a', code, expiresAt : now + 60000 });
        await assert.rejects (broker.PairWithCode ({ accountId : owner, grantId : 'grant-a', code, expiresAt : now + 60000 }), /already used/);
        await assert.rejects (broker.PairWithCode ({ accountId : other, grantId : 'grant-a', code, expiresAt : now + 60000 }));
        const paired = await state.storage.get ('pair:grant-a');
        assert.equal (paired.connectionId, socket.data.connectionId); assert.equal (paired.sessionId, 'tab-a');
        assert.ok (!JSON.stringify (paired).includes (code));
        now += 600001; await broker.Cleanup ();
        assert.equal ((await state.storage.list ({ prefix : 'used-window-code:' })).size, 0);
    });
    it ('disconnects an idle pairing after one hour without revoking the agent registration', async () => {
        let now = Date.now (); const state = State (), broker = new BrokerCore (state, { now : () => now }), socket = Socket ();
        await broker.registrations.Create ({ ...registration (), expiresAt : now + 7200000 });
        await broker.Attach ({ accountId : owner, sessionFingerprint : 'a'.repeat (64), expiresAt : now + 60000 }, socket);
        await broker.Message (socket, JSON.stringify ({ type : 'hello', instanceId : 'idle-window', windowLabel : 'Review', allowSelect : true, sessions : [{ id : 'tab-a', name : 'Box', active : true }] }));
        await broker.Pair ({ accountId : owner, grantId : 'grant-a', connectionId : socket.data.connectionId, sessionId : 'tab-a', expiresAt : now + 7200000 });
        now += 3600000; await broker.Cleanup (); assert.equal (await state.storage.get ('pair:grant-a'), undefined);
        assert.ok (await broker.registrations.Assert ({ accountId : owner, id : 'grant-a' }));
    });
    it ('enforces remote allowlists and strict string argument constraints', async () => {
        const broker = { AssertRegistration : async () => ({}) }, actor = { userId : owner, props : { registrationId : 'grant-a' }, scope : ['auto3d.read'], expiresAt : Date.now () / 1000 + 60 };
        const service = new PilotService (broker, [{ id : 'auth.sign_out', mutates : true }, { id : 'capture.image', mutates : false }]);
        assert.equal (service.Tools (actor).length, 9); await assert.rejects (service.Call (actor, 'auth.sign_out', {}));
        const tools = service.Tools ({ ...actor, scope : ['auto3d.read', 'auto3d.write'] }).map (tool => tool.id);
        for (const id of ['auto3d.design', 'auto3d.commands', 'auto3d.capture', 'auto3d.modules', 'auto3d.sessions', 'auto3d.settings', 'auto3d.commands.invoke']) { assert.ok (tools.includes (id)); }
        assert.throws (() => Validate ('abc', { type : 'string', maxLength : 2 })); assert.throws (() => Validate ('bad!', { type : 'string', pattern : '^[a-z]+$' }));
    });
    it ('keeps headless CAD drafts isolated by grant, gated and independent of browser windows', async () => {
        const broker = new BrokerCore (State ());
        await broker.registrations.Create ({ ...registration (), scopes : ['auto3d.read', 'auto3d.write'] }); await broker.registrations.Create (registration ('grant-b'));
        const params = { code : '0201', length : 304.8, width : 304.8, height : 304.8, thickness : 3 };
        const generated = await broker.HeadlessGenerate ({ accountId : owner, grantId : 'grant-a', parameters : params });
        assert.equal (generated.mode, 'headless'); assert.equal (generated.draft.parameters.length, 304.8); assert.equal (generated.draft.basis, 'score-to-score'); assert.ok (generated.draft.profile.paths.length > 0);
        assert.equal ((await broker.HeadlessInspect ({ accountId : owner, grantId : 'grant-b' })).draft, null);
        await assert.rejects (broker.HeadlessGenerate ({ accountId : owner, grantId : 'grant-b', parameters : params }), /Write permission/);
        await assert.rejects (broker.HeadlessInspect ({ accountId : other, grantId : 'grant-a' }));
        await broker.Revoke ({ accountId : owner, id : 'grant-a' }); await assert.rejects (broker.HeadlessInspect ({ accountId : owner, grantId : 'grant-a' }));
        assert.equal (await broker.state.storage.get ('headless:grant-a'), undefined);
    });
    it ('saves account-owned projects with revision checks, preserving them when a grant is revoked', async () => {
        const broker = new BrokerCore (State ()), params = { code : '0201', length : 304.8, width : 304.8, height : 304.8, thickness : 3 };
        for (const id of ['grant-a', 'grant-b']) { await broker.registrations.Create ({ ...registration (id), scopes : ['auto3d.read', 'auto3d.write'] }); await broker.HeadlessGenerate ({ accountId : owner, grantId : id, parameters : params }); }
        const { project } = await broker.HeadlessProjectSave ({ accountId : owner, grantId : 'grant-a', name : 'Box' }); assert.equal (project.revision, 1);
        const updates = await Promise.allSettled (['grant-a', 'grant-b'].map (grantId => broker.HeadlessProjectSave ({ accountId : owner, grantId, name : 'Updated', projectId : project.id, expectedRevision : 1 })));
        assert.equal (updates.filter (item => item.status === 'fulfilled').length, 1); assert.equal (updates.filter (item => item.status === 'rejected').length, 1);
        await broker.Revoke ({ accountId : owner, id : 'grant-a' });
        assert.equal ((await broker.HeadlessProjectGet ({ accountId : owner, grantId : 'grant-b', projectId : project.id })).project.revision, 2);
        const restarted = new BrokerCore (broker.state); assert.equal ((await restarted.HeadlessProjectGet ({ accountId : owner, grantId : 'grant-b', projectId : project.id })).project.name, 'Updated');
        await assert.rejects (broker.HeadlessProjectGet ({ accountId : other, grantId : 'grant-b', projectId : project.id }));
        await assert.rejects (broker.HeadlessProjectDelete ({ accountId : owner, grantId : 'grant-b', projectId : project.id, expectedRevision : 1 }), /changed/);
        await broker.HeadlessProjectDelete ({ accountId : owner, grantId : 'grant-b', projectId : project.id, expectedRevision : 2 }); assert.deepEqual ((await broker.HeadlessProjects ({ accountId : owner, grantId : 'grant-b' })).projects, []);
    });
    it ('browses grouped command schemas with pagination without exposing every tool', async () => {
        const broker = { AssertRegistration : async () => ({}) }, actor = { userId : owner, props : { registrationId : 'grant-a' }, scope : ['auto3d.read', 'auto3d.write'], expiresAt : Date.now () / 1000 + 60 };
        const schema = { type : 'object', properties : {} };
        const service = new PilotService (broker, [{ id : 'object.a', title : 'A', category : 'Objects', inputSchema : schema }, { id : 'object.b', title : 'B', category : 'Objects', inputSchema : schema }, { id : 'box.create', title : 'Box', category : 'Packaging', inputSchema : schema }, { id : 'future.item', title : 'Future', category : 'New category', inputSchema : schema }]);
        const families = await service.Call (actor, 'auto3d.design', {}); assert.deepEqual (families.categories.map (item => item.category), ['Objects']); assert.equal (families.commands, undefined);
        const page = await service.Call (actor, 'auto3d.design', { category : 'Objects', limit : 1 }); assert.equal (page.total, 2); assert.equal (page.nextOffset, 1); assert.equal (page.commands[0].id, 'object.a'); assert.deepEqual (page.commands[0].inputSchema, schema);
        assert.equal ((await service.Call (actor, 'auto3d.design', { category : 'Objects', offset : 1 })).commands[0].id, 'object.b');
        await assert.rejects (service.Call (actor, 'auto3d.design', { category : 'Packaging' }), /not in this family/);
        assert.equal ((await service.Call (actor, 'auto3d.modules', {})).categories[0].category, 'Packaging');
        assert.equal ((await service.Call (actor, 'auto3d.settings', {})).categories[0].category, 'New category');
        assert.equal ((await service.Call ({ ...actor, scope : ['auto3d.read'] }, 'auto3d.design', {})).family, 'Design');
        await assert.rejects (service.Call ({ ...actor, scope : ['auto3d.read'] }, 'auto3d.commands.invoke', { command : 'object.a', arguments : {} }), /Write permission/);
    });
    it ('reports connected module panels through the selected session', async () => {
        const actor = { userId : owner, props : { registrationId : 'grant-a' }, scope : ['auto3d.read', 'auto3d.write'], expiresAt : Date.now () / 1000 + 60 };
        const broker = { AssertRegistration : async () => ({}), Dispatch : async request => { assert.equal (request.command, 'ui.modules.inspect'); return { ok : true, command : request.command, result : { panels : [{ id : 'packaging', mode : 'minimal' }] } }; } };
        const result = await new PilotService (broker, []).Call (actor, 'auto3d.modules', {});
        assert.equal (result.running.panels[0].id, 'packaging'); assert.equal (result.running.panels[0].mode, 'minimal');
    });
});
