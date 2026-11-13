import { CommandIds } from './command-catalog.js';
import { AgentError, AgentName, ErrorCode, Identifier, MissingScopeError, ReadTools, SafeText } from './common.js';
import { Registrations } from './registrations.js';
import { FefcoProfile, ValidateFefco } from '../modules/packaging/src/fefco.js';

const ToolIds = new Set (CommandIds);
const LongCommands = /^(?:render\.(?:now|queue\.start)|ai\.|library\.|material\.(?:textures?\.|surface\.|relief|uv\.generate)|packaging\.(?:export|download|extrude|apply|fefco\.(?:generate|animate|toggle|unfold))|polygon\.|session\.(?:model\.|recovery\.restore|tabs\.new)|primary\.(?:generate|update)|commands\.text$)/;
const RequestRetentionMs = 3600000, RateWindowMs = 60000, RateLimit = 120;
const WindowCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function CreateWindowCode ()
{
    const bytes = crypto.getRandomValues (new Uint8Array (16));
    return [...bytes].map (byte => WindowCodeAlphabet[byte & 31]).join ('').match (/.{4}/g).join ('-');
}
// Reads stay short; ordinary mutations and long-running work get longer limits.
export function CommandTimeout (command, baseMs)
{
    if (ReadTools.includes (command)) { return command === 'capture.image' ? baseMs * 2 : baseMs; }
    return LongCommands.test (command) ? baseMs * 20 : baseMs * 4;
}

function NormalizeWindowCode (code)
{
    const normalized = typeof code === 'string' ? code.trim ().toUpperCase ().replace (/-/g, '') : '';
    if (!/^[A-HJ-NP-Z2-9]{16}$/.test (normalized)) { throw AgentError ('invalid_code', 'Invalid app window code.'); }
    return normalized;
}
async function WindowCodeHash (code)
{
    const digest = new Uint8Array (await crypto.subtle.digest ('SHA-256', new TextEncoder ().encode (NormalizeWindowCode (code))));
    return [...digest].map (byte => byte.toString (16).padStart (2, '0')).join ('');
}
function Sessions (sessions)
{
    if (!Array.isArray (sessions) || sessions.length > 20 || sessions.filter (item => item.active).length > 1) { throw new Error ('Invalid sessions.'); }
    const ids = new Set ();
    return sessions.map (item => {
        Identifier (item.id);
        if (ids.has (item.id) || typeof item.name !== 'string' || item.name.length > 100) { throw new Error ('Invalid session.'); }
        ids.add (item.id); return { id : item.id, name : item.name, active : item.active === true };
    });
}
function BrowserError (error)
{
    const allowed = ['invalid_arguments', 'unknown_command', 'permission_required', 'session_changed', 'session_unavailable', 'invalid_code', 'timeout', 'result_too_large', 'command_failed', 'conflict', 'not_found'];
    const code = allowed.includes (error?.code) ? error.code : 'command_failed';
    return AgentError (code, typeof error?.message === 'string' && error.message ? SafeText (error.message) : undefined);
}
export { ErrorCode };
export class BrokerCore
{
    constructor (state, { now = () => Date.now (), timeoutMs = 15000 } = {})
    {
        this.state = state; this.now = now; this.timeoutMs = timeoutMs; this.pending = new Map (); this.recent = [];
        this.registrations = new Registrations (state.storage, now);
    }
    Connections (accountId)
    {
        return this.state.getWebSockets ().map (socket => ({ socket, data : socket.deserializeAttachment () })).filter (({ socket, data }) => socket.readyState === 1 && data?.accountId === accountId && data.ready && data.expiresAt > this.now ());
    }
    async Attach ({ accountId, sessionFingerprint, expiresAt }, socket)
    {
        await this.registrations.Account (accountId);
        // Expired or closing sockets must not block reconnects until the next alarm.
        for (const old of this.state.getWebSockets ()) { if (old.readyState === 1 && old.deserializeAttachment ()?.expiresAt <= this.now ()) { old.close (1008, 'Connection expired'); this.Close (old); } }
        const open = this.state.getWebSockets ().filter (old => old.readyState === 1 && old.deserializeAttachment ()?.expiresAt > this.now ()).length;
        if (!/^[a-f0-9]{64}$/.test (sessionFingerprint) || expiresAt <= this.now () || expiresAt > this.now () + 300000 || open >= 10) { throw new Error ('Invalid connection.'); }
        const connectionId = crypto.randomUUID ();
        this.state.acceptWebSocket (socket); socket.serializeAttachment ({ accountId, sessionFingerprint, connectionId, expiresAt, ready : false });
        return connectionId;
    }
    async List (accountId)
    {
        await this.registrations.Account (accountId);
        return this.Connections (accountId).map (({ data }) => ({ connectionId : data.connectionId, instanceId : data.instanceId, windowLabel : data.windowLabel, sessions : data.sessions }));
    }
    async Renew ({ accountId, sessionFingerprint, connectionId, instanceId, expiresAt })
    {
        await this.registrations.Account (accountId);
        const target = this.Connections (accountId).find (({ data }) => data.connectionId === connectionId && data.instanceId === instanceId && data.sessionFingerprint === sessionFingerprint);
        if (!target || !Number.isSafeInteger (expiresAt) || expiresAt <= this.now () || expiresAt > this.now () + 300000) { throw new Error ('Connection unavailable.'); }
        target.socket.serializeAttachment ({ ...target.data, expiresAt });
    }
    async Pair ({ accountId, grantId, connectionId, sessionId, expiresAt })
    {
        [grantId, connectionId, sessionId].forEach (Identifier);
        const registration = await this.registrations.Assert ({ accountId, id : grantId });
        const target = this.Connections (accountId).find (({ data }) => data.connectionId === connectionId && data.sessions.some (session => session.id === sessionId && session.active));
        if (!target || !Number.isFinite (expiresAt) || expiresAt <= this.now ()) { throw AgentError ('session_unavailable', 'Session unavailable.'); }
        // Selecting without the one-time code is an explicit per-window opt-in.
        if (target.data.allowSelect !== true) { throw AgentError ('invalid_code', 'This window requires its one-time code. Use auto3d.sessions.pair_code with the code shown in Agent access.'); }
        await this.state.storage.put ('pair:' + grantId, { connectionId, instanceId : target.data.instanceId, sessionFingerprint : target.data.sessionFingerprint, sessionId, expiresAt : Math.min (expiresAt, registration.expiresAt), lastActivity : this.now (), revision : crypto.randomUUID () });
        await this.registrations.Assert ({ accountId, id : grantId });
        this.Notify (accountId);
    }
    async PairWithCode ({ accountId, grantId, code, expiresAt })
    {
        Identifier (grantId);
        const codeHash = await WindowCodeHash (code), registration = await this.registrations.Assert ({ accountId, id : grantId });
        const target = this.Connections (accountId).find (({ data }) => data.windowCodeHash === codeHash && data.windowCodeExpiresAt > this.now () && data.sessions.some (session => session.active));
        if (!target || !Number.isSafeInteger (expiresAt) || expiresAt <= this.now ()) { throw AgentError ('invalid_code', 'App window code unavailable. Choose Live Control or New code in Agent access and share the current code.'); }
        await this.state.storage.transaction (async storage => {
            const key = 'used-window-code:' + codeHash, used = await storage.get (key);
            if (used?.expiresAt > this.now ()) { throw AgentError ('invalid_code', 'App window code already used.'); }
            if (used) { await storage.delete (key); }
            await storage.put ('pair:' + grantId, { connectionId : target.data.connectionId, instanceId : target.data.instanceId, sessionFingerprint : target.data.sessionFingerprint, sessionId : target.data.sessions.find (session => session.active).id, expiresAt : Math.min (expiresAt, registration.expiresAt), lastActivity : this.now (), revision : crypto.randomUUID () });
            await storage.put (key, { expiresAt : target.data.windowCodeExpiresAt });
        });
        await this.registrations.Assert ({ accountId, id : grantId });
        this.Notify (accountId, { connectionId : target.data.connectionId, windowCodeId : target.data.windowCodeId });
        return { paired : true };
    }
    async CheckWindowCode ({ accountId, code })
    {
        await this.registrations.Account (accountId);
        const codeHash = await WindowCodeHash (code);
        const target = this.Connections (accountId).find (({ data }) => data.windowCodeHash === codeHash && data.windowCodeExpiresAt > this.now () && data.sessions.some (session => session.active));
        const used = await this.state.storage.get ('used-window-code:' + codeHash);
        return Boolean (target && (!used || used.expiresAt <= this.now ()));
    }
    Notify (accountId, codeUsed = null)
    {
        // Names are fetched separately; this notification only marks a code as used.
        for (const { socket, data } of this.Connections (accountId)) { try { socket.send (JSON.stringify ({ type : 'access_changed', ...(codeUsed?.connectionId === data.connectionId ? { windowCodeUsed : codeUsed.windowCodeId } : {}) })); } catch { /* Closed connection. */ } }
    }
    async Resolve ({ accountId, grantId })
    {
        await this.registrations.Assert ({ accountId, id : grantId });
        const pair = await this.state.storage.get ('pair:' + grantId);
        if (pair && Number.isFinite (pair.lastActivity) && this.now () - pair.lastActivity >= 3600000) {
            await this.state.storage.transaction (async storage => { const current = await storage.get ('pair:' + grantId); if (current?.revision === pair.revision && current.lastActivity === pair.lastActivity) { await storage.delete ('pair:' + grantId); } });
            throw AgentError ('not_paired', 'Agent session disconnected after inactivity. Pair again.');
        }
        if (!pair || pair.expiresAt <= this.now ()) { throw AgentError ('not_paired'); }
        const active = data => data.sessions.some (session => session.id === pair.sessionId && session.active);
        const connections = this.Connections (accountId);
        let target = connections.find (({ data }) => data.connectionId === pair.connectionId && active (data));
        // A window that reconnected from the same login session keeps its pairing.
        if (!target && pair.instanceId) { target = connections.find (({ data }) => data.instanceId === pair.instanceId && data.sessionFingerprint === pair.sessionFingerprint && active (data)); }
        if (!target) {
            const window = connections.find (({ data }) => data.connectionId === pair.connectionId || pair.instanceId && data.instanceId === pair.instanceId);
            throw AgentError ('session_unavailable', window ? 'The paired tab is no longer active in its window. Ask the user to return to it or pair again.' : 'The paired app window is disconnected. Ask the user to reconnect it in Agent access.');
        }
        if (target.data.connectionId !== pair.connectionId) {
            await this.state.storage.transaction (async storage => { const current = await storage.get ('pair:' + grantId); if (current?.revision === pair.revision) { await storage.put ('pair:' + grantId, { ...current, connectionId : target.data.connectionId }); } });
            pair.connectionId = target.data.connectionId;
        }
        return { pair, target };
    }
    async Dispatch ({ accountId, grantId, requestId, command, arguments : args })
    {
        Identifier (requestId);
        if (!ToolIds.has (command) || !args || typeof args !== 'object' || Array.isArray (args)) { throw AgentError ('unknown_command'); }
        const registration = await this.registrations.Assert ({ accountId, id : grantId });
        if (!ReadTools.includes (command) && !registration.scopes.includes ('auto3d.write')) { throw AgentError ('permission_required', 'Write permission required. Authorize again with auto3d.write.'); }
        if (command === 'capture.image' && !registration.scopes.includes ('auto3d.capture')) { throw MissingScopeError ('auto3d.capture', 'Screenshot permission required. Reconnect Auto3D to approve all tools and screenshots together.'); }
        const now = this.now (); this.recent = this.recent.filter (time => now - time < RateWindowMs);
        if (this.recent.length >= RateLimit) { throw AgentError ('rate_limited', 'Too many requests for this account. Wait a minute and retry.'); }
        const { pair, target } = await this.Resolve ({ accountId, grantId });
        const message = JSON.stringify ({ type : 'request', requestId, command, arguments : args, sessionId : pair.sessionId, ...(!ReadTools.includes (command) ? { writeAuthorized : true } : {}) });
        if (message.length > 65536) { throw AgentError ('invalid_arguments', 'Arguments exceed the 64 KB transfer limit.'); }
        if (this.pending.size >= 20) { throw AgentError ('rate_limited', 'Too many requests are already running. Wait for them to finish.'); }
        this.recent.push (now);
        // Short-lived replay guard; records expire well after any request timeout.
        await this.state.storage.transaction (async storage => {
            const key = 'request:' + grantId + ':' + requestId;
            if (await storage.get (key)) { throw AgentError ('invalid_arguments', 'Duplicate request.'); }
            await storage.put (key, { expiresAt : now + Math.max (RequestRetentionMs, CommandTimeout (command, this.timeoutMs) * 2) });
        });
        const fresh = await this.Resolve ({ accountId, grantId });
        if (fresh.pair.revision !== pair.revision || fresh.target.socket !== target.socket) { throw AgentError ('session_changed', 'Pairing changed.'); }
        await this.state.storage.transaction (async storage => {
            const current = await storage.get ('pair:' + grantId);
            if (!current || current.revision !== pair.revision) { throw AgentError ('session_changed', 'Pairing changed.'); }
            await storage.put ('pair:' + grantId, { ...current, lastActivity : this.now () });
        });
        const key = target.data.connectionId + ':' + requestId, timeoutMs = CommandTimeout (command, this.timeoutMs);
        const result = await new Promise ((resolve, reject) => {
            const timer = setTimeout (() => {
                this.pending.delete (key);
                try { target.socket.send (JSON.stringify ({ type : 'cancel', requestId, sessionId : pair.sessionId })); } catch { /* Closed connection. */ }
                reject (AgentError ('timeout', 'Timed out after ' + Math.round (timeoutMs / 1000) + ' s. The command may still complete in the app; inspect before retrying. Requests are never replayed.'));
            }, timeoutMs);
            this.pending.set (key, { resolve, reject, timer, command, grantId, sessionId : pair.sessionId });
            try { target.socket.send (message); } catch { clearTimeout (timer); this.pending.delete (key); reject (AgentError ('session_unavailable', 'Connection ended.')); }
        });
        // An agent-initiated tab change moves the pairing to the tab it activated.
        const moved = /^session\.tabs\.(?:new|switch|close)$/.test (command) && typeof result?.activeSessionId === 'string' ? result.activeSessionId : null;
        if (moved && moved !== pair.sessionId) {
            await this.state.storage.transaction (async storage => { const current = await storage.get ('pair:' + grantId); if (current?.revision === pair.revision) { await storage.put ('pair:' + grantId, { ...current, sessionId : Identifier (moved) }); } });
            return result;
        }
        const current = await this.Resolve ({ accountId, grantId });
        if (current.pair.revision !== pair.revision || current.target.socket !== target.socket) { throw AgentError ('session_changed', 'Pairing changed. Result discarded.'); }
        return result;
    }
    async HeadlessInspect ({ accountId, grantId })
    {
        await this.registrations.Assert ({ accountId, id : grantId });
        return { mode : 'headless', draft : await this.state.storage.get ('headless:' + grantId) || null };
    }
    async HeadlessGenerate ({ accountId, grantId, parameters })
    {
        const registration = await this.registrations.Assert ({ accountId, id : grantId });
        if (!registration.scopes.includes ('auto3d.write')) { throw AgentError ('permission_required', 'Write permission required.'); }
        let p, profile;
        try { p = ValidateFefco (parameters); profile = FefcoProfile (p); } catch (error) { throw AgentError ('invalid_arguments', error.message); }
        const draft = { kind : 'fefco-cad', basis : 'score-to-score', units : 'mm', parameters : p, profile, updatedAt : this.now () };
        await this.state.storage.transaction (async storage => {
            const current = await storage.get ('registration:' + grantId);
            if (!current || current.revokedAt !== null || current.expiresAt <= this.now () || await storage.get ('disabled')) { throw AgentError ('revoked'); }
            await storage.put ('headless:' + grantId, draft);
        });
        return { mode : 'headless', draft };
    }
    async HeadlessProjects ({ accountId, grantId })
    {
        await this.registrations.Assert ({ accountId, id : grantId });
        const entries = await this.state.storage.list ({ prefix : 'headless-project:', limit : 21 });
        return { projects : [...entries.values ()].map (({ id, name, revision, updatedAt }) => ({ id, name, revision, updatedAt })) };
    }
    async HeadlessProjectGet ({ accountId, grantId, projectId })
    {
        await this.registrations.Assert ({ accountId, id : grantId }); Identifier (projectId);
        const project = await this.state.storage.get ('headless-project:' + projectId);
        if (!project) { throw AgentError ('not_found', 'Project unavailable.'); }
        await this.registrations.Assert ({ accountId, id : grantId }); return { project };
    }
    async HeadlessProjectSave ({ accountId, grantId, name, projectId = null, expectedRevision = null })
    {
        const registration = await this.registrations.Assert ({ accountId, id : grantId });
        if (!registration.scopes.includes ('auto3d.write')) { throw AgentError ('permission_required', 'Write permission required.'); }
        name = AgentName (name);
        if (projectId !== null) { Identifier (projectId); if (!Number.isSafeInteger (expectedRevision) || expectedRevision < 1) { throw AgentError ('invalid_arguments', 'Expected revision required.'); } }
        else if (expectedRevision !== null) { throw AgentError ('invalid_arguments', 'Revision requires a project.'); }
        const id = projectId || crypto.randomUUID ();
        return this.state.storage.transaction (async storage => {
            const currentGrant = await storage.get ('registration:' + grantId);
            if (!currentGrant || currentGrant.revokedAt !== null || currentGrant.expiresAt <= this.now () || !currentGrant.scopes.includes ('auto3d.write') || await storage.get ('disabled')) { throw AgentError ('revoked'); }
            const draft = await storage.get ('headless:' + grantId); if (!draft) { throw AgentError ('not_found', 'Create a headless CAD draft first.'); }
            const key = 'headless-project:' + id, existing = await storage.get (key);
            if (projectId && (!existing || existing.revision !== expectedRevision)) { throw AgentError ('conflict', 'Project changed or unavailable.'); }
            if (!projectId && (await storage.list ({ prefix : 'headless-project:', limit : 20 })).size >= 20) { throw AgentError ('conflict', 'Headless project limit reached. Delete a project first.'); }
            const project = { version : 1, id, name, revision : existing ? existing.revision + 1 : 1, updatedAt : this.now (), draft };
            await storage.put (key, project); return { project };
        });
    }
    async HeadlessProjectDelete ({ accountId, grantId, projectId, expectedRevision })
    {
        const registration = await this.registrations.Assert ({ accountId, id : grantId });
        if (!registration.scopes.includes ('auto3d.write')) { throw AgentError ('permission_required', 'Write permission required.'); }
        Identifier (projectId); if (!Number.isSafeInteger (expectedRevision) || expectedRevision < 1) { throw AgentError ('invalid_arguments', 'Expected revision required.'); }
        return this.state.storage.transaction (async storage => {
            const currentGrant = await storage.get ('registration:' + grantId);
            if (!currentGrant || currentGrant.revokedAt !== null || currentGrant.expiresAt <= this.now () || !currentGrant.scopes.includes ('auto3d.write') || await storage.get ('disabled')) { throw AgentError ('revoked'); }
            const key = 'headless-project:' + projectId, project = await storage.get (key);
            if (!project || project.revision !== expectedRevision) { throw AgentError ('conflict', 'Project changed or unavailable.'); }
            await storage.delete (key); return { deleted : projectId };
        });
    }
    async Revoke ({ accountId, id })
    {
        await this.registrations.Revoke ({ accountId, id });
        for (const [key, pending] of this.pending) {
            if (pending.grantId === id) { clearTimeout (pending.timer); this.pending.delete (key); pending.reject (AgentError ('revoked', 'Access revoked.')); }
        }
        this.Notify (accountId); return { revoked : true };
    }
    async DisableAgents ({ accountId, disabled })
    {
        const result = await this.registrations.Disable ({ accountId, disabled });
        if (disabled) {
            for (const [key, pending] of this.pending) { clearTimeout (pending.timer); this.pending.delete (key); pending.reject (AgentError ('revoked', 'Agent access disabled.')); }
            const pairs = await this.state.storage.list ({ prefix : 'pair:', limit : 1000 });
            for (const key of pairs.keys ()) { await this.state.storage.delete (key); }
        }
        this.Notify (accountId); return result;
    }
    async Message (socket, text)
    {
        const data = socket.deserializeAttachment ();
        try {
            if (!data || data.expiresAt <= this.now () || typeof text !== 'string' || text.length > 2100000) { throw new Error ('Invalid connection.'); }
            const message = JSON.parse (text);
            if (message.type === 'hello' && !data.ready && text.length <= 65536) {
                Identifier (message.instanceId); const windowLabel = AgentName (message.windowLabel);
                for (const item of this.Connections (data.accountId).filter (entry => entry.data.instanceId === message.instanceId)) {
                    // The same login session may replace its own stale socket after a reconnect.
                    if (item.data.sessionFingerprint !== data.sessionFingerprint || item.socket === socket) { throw new Error ('Duplicate window.'); }
                    item.socket.close (1000, 'Replaced by reconnect'); this.Close (item.socket);
                }
                // New clients receive a server-issued code. Keep accepting older clients'
                // valid codes until their next app reload; only a digest is retained.
                const windowCode = message.windowCode === undefined ? CreateWindowCode () : message.windowCode;
                const windowCodeHash = await WindowCodeHash (windowCode), windowCodeExpiresAt = this.now () + 600000, windowCodeId = crypto.randomUUID ();
                socket.serializeAttachment ({ ...data, instanceId : message.instanceId, windowLabel, windowCodeHash, windowCodeExpiresAt, windowCodeId, allowSelect : message.allowSelect === true, sessions : Sessions (message.sessions), ready : true });
                socket.send (JSON.stringify ({ type : 'hello_ack', connectionId : data.connectionId, expiresAt : data.expiresAt, windowCode, windowCodeExpiresAt, windowCodeId })); return;
            }
            if (message.type === 'window_code' && data.ready && text.length <= 1024 && message.instanceId === data.instanceId) {
                Identifier (message.requestId);
                const windowCode = CreateWindowCode (), windowCodeHash = await WindowCodeHash (windowCode), windowCodeExpiresAt = this.now () + 600000, windowCodeId = crypto.randomUUID ();
                socket.serializeAttachment ({ ...socket.deserializeAttachment (), windowCodeHash, windowCodeExpiresAt, windowCodeId });
                socket.send (JSON.stringify ({ type : 'window_code', requestId : message.requestId, windowCode, windowCodeExpiresAt, windowCodeId })); return;
            }
            if (message.type === 'sessions' && data.ready && text.length <= 65536 && message.instanceId === data.instanceId) {
                socket.serializeAttachment ({ ...data, sessions : Sessions (message.sessions) }); return;
            }
            if (message.type === 'result' && data.ready) {
                const key = data.connectionId + ':' + Identifier (message.requestId), pending = this.pending.get (key);
                if (!pending) { return; }
                if (message.sessionId !== pending.sessionId || text.length > 65536 && pending.command !== 'capture.image') { throw new Error ('Invalid result.'); }
                clearTimeout (pending.timer); this.pending.delete (key);
                if (message.error) { pending.reject (BrowserError (message.error)); } else { pending.resolve (message.result); } return;
            }
            throw new Error ('Invalid message.');
        } catch { socket.close (1008, 'Invalid message'); this.Close (socket); }
    }
    Close (socket)
    {
        const data = socket.deserializeAttachment ();
        for (const [key, pending] of this.pending) {
            if (key.startsWith (data?.connectionId + ':')) { clearTimeout (pending.timer); this.pending.delete (key); pending.reject (AgentError ('session_unavailable', 'The app window disconnected before the result arrived. Inspect after it reconnects; requests are never replayed.')); }
        }
    }
    async Cleanup ()
    {
        for (const prefix of ['request:', 'used-window-code:']) {
            // Records written before 0.50.0 carried the registration lifetime; they are only replay guards.
            for (let page = 0; page < 10; page++) {
                const records = await this.state.storage.list ({ prefix, limit : 1000 }); let deleted = 0;
                for (const [key, record] of records) { if (record.expiresAt <= this.now () || prefix === 'request:' && record.expiresAt > this.now () + RequestRetentionMs * 20) { await this.state.storage.delete (key); deleted++; } }
                if (records.size < 1000 || !deleted) { break; }
            }
        }
        await this.registrations.Prune ();
        for (const socket of this.state.getWebSockets ()) { if (socket.deserializeAttachment ()?.expiresAt <= this.now ()) { socket.close (1008, 'Connection expired'); this.Close (socket); } }
        const pairs = await this.state.storage.list ({ prefix : 'pair:', limit : 1000 }); let remaining = false;
        for (const [key, pair] of pairs) {
            if (pair.expiresAt <= this.now () || Number.isFinite (pair.lastActivity) && this.now () - pair.lastActivity >= 3600000) {
                await this.state.storage.transaction (async storage => { const current = await storage.get (key); if (current?.revision === pair.revision && current.lastActivity === pair.lastActivity) { await storage.delete (key); } });
            } else { remaining = true; }
        }
        return remaining;
    }
}
