import { AgentLabel } from './agent-label.js';
import { MaxCaptureMessageLength } from './capture-image.js';

// Server-internal Durable Object coordination core. A trusted Worker must verify
// the login before Attach and verify OAuth/account status before each RPC. Do
// not expose this class or construct its identity arguments from client data.
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test (value);
function requireId (value) { if (!validId (value)) { throw new Error ('Invalid identifier.'); } }
function sessions (value)
{
    if (!Array.isArray (value) || value.length > 20) { throw new Error ('Invalid sessions.'); }
    const seen = new Set (); const result = value.map (item => {
        if (!item || !validId (item.id) || seen.has (item.id) || typeof item.name !== 'string' || item.name.length > 100) { throw new Error ('Invalid session.'); }
        seen.add (item.id); return { id : item.id, name : item.name, active : item.active === true };
    });
    if (result.filter (item => item.active).length > 1) { throw new Error ('Invalid active session.'); } return result;
}
function label (value) { return typeof value === 'string' && value.trim () && value.length <= 80 && ![...value].some (character => character.charCodeAt (0) < 32 || character.charCodeAt (0) === 127) ? value.trim () : null; }

export class DurableSessionBroker
{
    constructor (state, { now = () => Date.now (), timeoutMs = 15000 } = {}) { this.state = state; this.now = now; this.timeoutMs = timeoutMs; this.pending = new Map (); }
    async Account (accountId)
    {
        requireId (accountId); await this.state.storage.transaction (async tx => { const owner = await tx.get ('owner'); if (owner && owner !== accountId) { throw new Error ('Account unavailable.'); } if (!owner) { await tx.put ('owner', accountId); } });
    }
    async Attach ({ accountId, sessionFingerprint, expiresAt }, socket)
    {
        await this.Account (accountId); if (typeof sessionFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test (sessionFingerprint) || !Number.isFinite (expiresAt) || expiresAt <= this.now () || !socket?.serializeAttachment) { throw new Error ('Invalid connection.'); }
        const connectionId = crypto.randomUUID (); this.state.acceptWebSocket (socket); socket.serializeAttachment ({ accountId, sessionFingerprint, connectionId, expiresAt, ready : false }); return connectionId;
    }
    Connections (accountId)
    {
        return this.state.getWebSockets ().map (socket => ({ socket, data : socket.deserializeAttachment () })).filter (item => item.socket.readyState === 1 && item.data?.accountId === accountId && item.data.ready && item.data.expiresAt > this.now ());
    }
    async List (accountId)
    {
        await this.Account (accountId); return this.Connections (accountId).map (({ data }) => ({ connectionId : data.connectionId, instanceId : data.instanceId, windowLabel : data.windowLabel, sessions : data.sessions.map (item => ({ ...item })) }));
    }
    NotifyAgents (socket)
    {
        const data = socket.deserializeAttachment (); if (!data?.ready) { return; }
        const agents = (data.agents || []).filter (agent => agent.expiresAt > this.now ());
        if (agents.length !== (data.agents || []).length) { socket.serializeAttachment ({ ...data, agents }); }
        const activeIds = new Set (data.sessions.filter (session => session.active).map (session => session.id));
        try { socket.send (JSON.stringify ({ type : 'agents', agents : agents.filter (agent => activeIds.has (agent.sessionId)).map (agent => ({ name : agent.name, domain : agent.domain, expiresAt : agent.expiresAt })) })); } catch { /* A closed socket cannot receive status. */ }
    }
    async Pair ({ accountId, grantId, connectionId, sessionId, expiresAt, client })
    {
        await this.Account (accountId); [grantId, connectionId, sessionId].forEach (requireId);
        const target = this.Connections (accountId).find (item => item.data.connectionId === connectionId && item.data.sessions.some (session => session.id === sessionId));
        if (!target || !Number.isFinite (expiresAt) || expiresAt <= this.now ()) { throw new Error ('Session unavailable.'); }
        const identity = AgentLabel ({ clientName : client?.name, clientDomain : client?.domain });
        const existingAgents = (target.data.agents || []).filter (agent => agent.grantId !== grantId && agent.expiresAt > this.now ());
        if (existingAgents.length >= 20) { throw new Error ('Too many paired agents.'); }
        await this.state.storage.put ('pair:' + grantId, { connectionId, sessionId, expiresAt, revision : crypto.randomUUID () });
        for (const connection of this.Connections (accountId)) {
            const current = connection.socket.deserializeAttachment (); const agents = (current.agents || []).filter (agent => agent.grantId !== grantId && agent.expiresAt > this.now ());
            if (connection.socket === target.socket) { agents.push ({ grantId, sessionId, expiresAt, ...identity }); }
            connection.socket.serializeAttachment ({ ...current, agents }); this.NotifyAgents (connection.socket);
        }
    }
    async Renew ({ accountId, sessionFingerprint, connectionId, instanceId, expiresAt })
    {
        await this.Account (accountId); [connectionId, instanceId].forEach (requireId);
        if (typeof sessionFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test (sessionFingerprint) || !Number.isFinite (expiresAt) || expiresAt <= this.now () || expiresAt > this.now () + 5 * 60 * 1000) { throw new Error ('Invalid renewal.'); }
        const target = this.Connections (accountId).find (item => item.data.connectionId === connectionId && item.data.instanceId === instanceId && item.data.sessionFingerprint === sessionFingerprint);
        if (!target) { throw new Error ('Connection unavailable.'); }
        target.socket.serializeAttachment ({ ...target.data, expiresAt });
    }
    async Resolve ({ accountId, grantId })
    {
        await this.Account (accountId); requireId (grantId); const pair = await this.state.storage.get ('pair:' + grantId);
        if (!pair || pair.expiresAt <= this.now ()) { throw new Error ('No active pairing.'); }
        const target = this.Connections (accountId).find (item => item.data.connectionId === pair.connectionId && item.data.sessions.some (session => session.id === pair.sessionId && session.active));
        if (!target) { throw new Error ('Paired session unavailable.'); } return { pair, target };
    }
    async Dispatch ({ accountId, grantId, requestId, command, arguments : args })
    {
        requireId (requestId); if (typeof command !== 'string' || !/^[a-z][a-z0-9_.-]{0,127}$/.test (command) || !args || typeof args !== 'object' || Array.isArray (args)) { throw new Error ('Invalid request.'); }
        const { pair, target } = await this.Resolve ({ accountId, grantId });
        const message = JSON.stringify ({ type : 'request', requestId, command, arguments : args, sessionId : pair.sessionId }); if (message.length > 65536) { throw new Error ('Request too large.'); }
        await this.state.storage.transaction (async tx => { const key = 'request:' + grantId + ':' + requestId; if (await tx.get (key)) { throw new Error ('Duplicate request; do not replay automatically.'); } await tx.put (key, { expiresAt : pair.expiresAt }); });
        // Pairing/session may change while writing the durable request ledger.
        const current = await this.Resolve ({ accountId, grantId }); if (current.pair.revision !== pair.revision || current.target.socket !== target.socket) { throw new Error ('Pairing changed.'); }
        const key = target.data.connectionId + ':' + requestId; if (this.pending.has (key)) { throw new Error ('Duplicate request.'); }
        const result = await new Promise ((resolve, reject) => {
            const timer = setTimeout (() => { this.pending.delete (key); reject (new Error ('Request timed out; outcome may be unknown.')); }, this.timeoutMs);
            this.pending.set (key, { resolve, reject, timer, command }); try { target.socket.send (message); } catch { clearTimeout (timer); this.pending.delete (key); reject (new Error ('Connection unavailable.')); }
        });
        const after = await this.Resolve ({ accountId, grantId }); if (after.pair.revision !== pair.revision || after.target.socket !== target.socket) { throw new Error ('Pairing changed; outcome may be unknown.'); } return result;
    }
    async Revoke ({ accountId, grantId }) { await this.Account (accountId); requireId (grantId); await this.state.storage.delete ('pair:' + grantId); for (const connection of this.Connections (accountId)) { const data = connection.socket.deserializeAttachment (); connection.socket.serializeAttachment ({ ...data, agents : (data.agents || []).filter (agent => agent.grantId !== grantId) }); this.NotifyAgents (connection.socket); } }
    webSocketMessage (socket, message)
    {
        const data = socket.deserializeAttachment (); if (!data || data.expiresAt <= this.now () || typeof message !== 'string' || message.length > MaxCaptureMessageLength) { socket.close (1008, 'Invalid connection'); return; }
        let payload; try { payload = JSON.parse (message); } catch { socket.close (1008, 'Invalid message'); return; }
        try {
            if (message.length > 65536 && payload?.type !== 'result') { throw new Error ('Message too large.'); }
            if (payload?.type === 'hello' && !data.ready) {
                requireId (payload.instanceId); const windowLabel = label (payload.windowLabel); if (!windowLabel || this.Connections (data.accountId).some (item => item.data.instanceId === payload.instanceId)) { throw new Error ('Invalid window.'); }
                socket.serializeAttachment ({ ...data, ready : true, instanceId : payload.instanceId, windowLabel, sessions : sessions (payload.sessions) }); socket.send (JSON.stringify ({ type : 'hello_ack', connectionId : data.connectionId, expiresAt : data.expiresAt })); return;
            }
            if (payload?.type === 'sessions' && data.ready) { if (payload.instanceId !== data.instanceId || !label (payload.windowLabel)) { throw new Error ('Invalid window.'); } socket.serializeAttachment ({ ...data, windowLabel : label (payload.windowLabel), sessions : sessions (payload.sessions) }); this.NotifyAgents (socket); return; }
            if (payload?.type === 'result' && data.ready && validId (payload.requestId)) {
                const key = data.connectionId + ':' + payload.requestId, pending = this.pending.get (key); if (!pending) { return; } if (message.length > 65536 && pending.command !== 'capture.image') { throw new Error ('Message too large.'); } this.pending.delete (key); clearTimeout (pending.timer);
                if (payload.error) { pending.reject (new Error ('Browser could not complete request.')); } else { pending.resolve (payload.result); } return;
            }
            throw new Error ('Invalid message.');
        } catch { socket.close (1008, 'Invalid message'); }
    }
    webSocketClose (socket)
    {
        const data = socket.deserializeAttachment (); if (!data) { return; }
        for (const [key, pending] of this.pending) { if (key.startsWith (data.connectionId + ':')) { clearTimeout (pending.timer); this.pending.delete (key); pending.reject (new Error ('Connection ended; outcome may be unknown.')); } }
    }
    webSocketError (socket) { this.webSocketClose (socket); }
}
