import { AgentName, Identifier, ReadTools } from './common.js';
import { Registrations } from './registrations.js';

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
export class BrokerCore
{
    constructor (state, { now = () => Date.now (), timeoutMs = 15000 } = {})
    {
        this.state = state; this.now = now; this.timeoutMs = timeoutMs; this.pending = new Map ();
        this.registrations = new Registrations (state.storage, now);
    }
    Connections (accountId)
    {
        return this.state.getWebSockets ().map (socket => ({ socket, data : socket.deserializeAttachment () })).filter (({ socket, data }) => socket.readyState === 1 && data?.accountId === accountId && data.ready && data.expiresAt > this.now ());
    }
    async Attach ({ accountId, sessionFingerprint, expiresAt }, socket)
    {
        await this.registrations.Account (accountId);
        if (!/^[a-f0-9]{64}$/.test (sessionFingerprint) || expiresAt <= this.now () || expiresAt > this.now () + 300000 || this.state.getWebSockets ().length >= 10) { throw new Error ('Invalid connection.'); }
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
        if (!target || !Number.isFinite (expiresAt) || expiresAt <= this.now ()) { throw new Error ('Session unavailable.'); }
        await this.state.storage.put ('pair:' + grantId, { connectionId, sessionId, expiresAt : Math.min (expiresAt, registration.expiresAt), revision : crypto.randomUUID () });
        await this.registrations.Assert ({ accountId, id : grantId });
        this.Notify (accountId);
    }
    Notify (accountId)
    {
        // Names are fetched separately by the account UI; sockets carry no credentials.
        for (const { socket } of this.Connections (accountId)) { try { socket.send (JSON.stringify ({ type : 'access_changed' })); } catch { /* Closed connection. */ } }
    }
    async Resolve ({ accountId, grantId })
    {
        await this.registrations.Assert ({ accountId, id : grantId });
        const pair = await this.state.storage.get ('pair:' + grantId);
        const target = this.Connections (accountId).find (({ data }) => data.connectionId === pair?.connectionId && data.sessions.some (session => session.id === pair.sessionId && session.active));
        if (!pair || pair.expiresAt <= this.now () || !target) { throw new Error ('Paired session unavailable.'); }
        return { pair, target };
    }
    async Dispatch ({ accountId, grantId, requestId, command, arguments : args })
    {
        Identifier (requestId);
        if (!ReadTools.includes (command) || !args || typeof args !== 'object' || Array.isArray (args)) { throw new Error ('Tool unavailable.'); }
        const registration = await this.registrations.Assert ({ accountId, id : grantId });
        if (command === 'capture.image' && !registration.scopes.includes ('auto3d.capture')) { throw new Error ('Screenshot permission required.'); }
        const { pair, target } = await this.Resolve ({ accountId, grantId });
        const message = JSON.stringify ({ type : 'request', requestId, command, arguments : args, sessionId : pair.sessionId });
        if (message.length > 65536 || this.pending.size >= 20) { throw new Error ('Request limit reached.'); }
        await this.state.storage.transaction (async storage => {
            const key = 'request:' + grantId + ':' + requestId;
            if (await storage.get (key)) { throw new Error ('Duplicate request.'); }
            if ((await storage.list ({ prefix : 'request:', limit : 1000 })).size >= 1000) { throw new Error ('Request retention limit reached.'); }
            await storage.put (key, { expiresAt : pair.expiresAt });
        });
        const fresh = await this.Resolve ({ accountId, grantId });
        if (fresh.pair.revision !== pair.revision || fresh.target.socket !== target.socket) { throw new Error ('Pairing changed.'); }
        const key = target.data.connectionId + ':' + requestId;
        const result = await new Promise ((resolve, reject) => {
            const timer = setTimeout (() => { this.pending.delete (key); reject (new Error ('Timed out. Do not automatically replay.')); }, this.timeoutMs);
            this.pending.set (key, { resolve, reject, timer, command, grantId, sessionId : pair.sessionId });
            try { target.socket.send (message); } catch { clearTimeout (timer); this.pending.delete (key); reject (new Error ('Connection ended.')); }
        });
        const current = await this.Resolve ({ accountId, grantId });
        if (current.pair.revision !== pair.revision || current.target.socket !== target.socket) { throw new Error ('Pairing changed. Result discarded.'); }
        return result;
    }
    async Revoke ({ accountId, id })
    {
        await this.registrations.Revoke ({ accountId, id });
        for (const [key, pending] of this.pending) {
            if (pending.grantId === id) { clearTimeout (pending.timer); this.pending.delete (key); pending.reject (new Error ('Access revoked.')); }
        }
        this.Notify (accountId); return { revoked : true };
    }
    Message (socket, text)
    {
        const data = socket.deserializeAttachment ();
        try {
            if (!data || data.expiresAt <= this.now () || typeof text !== 'string' || text.length > 2100000) { throw new Error ('Invalid connection.'); }
            const message = JSON.parse (text);
            if (message.type === 'hello' && !data.ready && text.length <= 65536) {
                Identifier (message.instanceId); const windowLabel = AgentName (message.windowLabel);
                if (this.Connections (data.accountId).some (item => item.data.instanceId === message.instanceId)) { throw new Error ('Duplicate window.'); }
                socket.serializeAttachment ({ ...data, instanceId : message.instanceId, windowLabel, sessions : Sessions (message.sessions), ready : true });
                socket.send (JSON.stringify ({ type : 'hello_ack', connectionId : data.connectionId, expiresAt : data.expiresAt })); return;
            }
            if (message.type === 'sessions' && data.ready && text.length <= 65536 && message.instanceId === data.instanceId) {
                socket.serializeAttachment ({ ...data, sessions : Sessions (message.sessions) }); return;
            }
            if (message.type === 'result' && data.ready) {
                const key = data.connectionId + ':' + Identifier (message.requestId), pending = this.pending.get (key);
                if (!pending) { return; }
                if (message.sessionId !== pending.sessionId || text.length > 65536 && pending.command !== 'capture.image') { throw new Error ('Invalid result.'); }
                clearTimeout (pending.timer); this.pending.delete (key);
                if (message.error) { pending.reject (new Error ('Browser request failed.')); } else { pending.resolve (message.result); } return;
            }
            throw new Error ('Invalid message.');
        } catch { socket.close (1008, 'Invalid message'); this.Close (socket); }
    }
    Close (socket)
    {
        const data = socket.deserializeAttachment ();
        for (const [key, pending] of this.pending) {
            if (key.startsWith (data?.connectionId + ':')) { clearTimeout (pending.timer); this.pending.delete (key); pending.reject (new Error ('Connection ended.')); }
        }
    }
    async Cleanup ()
    {
        const records = await this.state.storage.list ({ prefix : 'request:', limit : 1000 });
        for (const [key, record] of records) { if (record.expiresAt <= this.now ()) { await this.state.storage.delete (key); } }
        for (const socket of this.state.getWebSockets ()) { if (socket.deserializeAttachment ()?.expiresAt <= this.now ()) { socket.close (1008, 'Connection expired'); this.Close (socket); } }
    }
}
