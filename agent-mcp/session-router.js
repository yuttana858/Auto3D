// In-memory routing core. This is not an authentication boundary or a deployed
// broker: callers must first verify the account and OAuth grant server-side.
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const validId = value => typeof value === 'string' && ID.test (value);
function requireId (value, label) { if (!validId (value)) { throw new Error ('Invalid ' + label + '.'); } }
function validateSessions (sessions)
{
    if (!Array.isArray (sessions) || sessions.length > 20) { throw new Error ('Invalid sessions.'); }
    const ids = new Set (); const records = sessions.map (session => {
        if (!session || !validId (session.id) || ids.has (session.id) || typeof session.name !== 'string' || session.name.length > 100) { throw new Error ('Invalid sessions.'); }
        ids.add (session.id); return { id : session.id, name : session.name, active : session.active === true };
    });
    if (records.filter (session => session.active).length > 1) { throw new Error ('Only one session can be active.'); }
    return records;
}

export class SessionRouter
{
    constructor ({ now = () => Date.now () } = {}) { this.now = now; this.connections = new Map (); this.pairings = new Map (); this.requests = new Map (); this.pairingSequence = 0; }
    Register ({ accountId, instanceId, connectionId, sessions, deliver, windowLabel = 'Auto3D window' })
    {
        requireId (accountId, 'account'); requireId (instanceId, 'browser instance'); requireId (connectionId, 'connection');
        if (this.connections.has (connectionId) || typeof deliver !== 'function' || typeof windowLabel !== 'string' || !windowLabel.trim () || windowLabel.length > 80 || [...windowLabel].some (character => character.charCodeAt (0) < 32 || character.charCodeAt (0) === 127)) { throw new Error ('Invalid or duplicate connection.'); }
        const records = validateSessions (sessions);
        for (const connection of this.connections.values ()) { if (connection.accountId === accountId && connection.instanceId === instanceId) { throw new Error ('Browser instance already connected.'); } }
        this.connections.set (connectionId, { accountId, instanceId, windowLabel : windowLabel.trim (), sessions : records, deliver });
    }
    List (accountId)
    {
        requireId (accountId, 'account'); return [...this.connections.entries ()].filter (([, connection]) => connection.accountId === accountId).map (([connectionId, connection]) => ({ connectionId, instanceId : connection.instanceId, windowLabel : connection.windowLabel, sessions : connection.sessions.map (session => ({ ...session })) }));
    }
    Candidates (accountId, autoPairEnabled = false)
    {
        if (typeof autoPairEnabled !== 'boolean') { throw new Error ('Invalid pairing preference.'); }
        const candidates = this.List (accountId).flatMap (window => window.sessions.map (session => ({ connectionId : window.connectionId, instanceId : window.instanceId, windowLabel : window.windowLabel, sessionId : session.id, sessionName : session.name, active : session.active })));
        if (!candidates.length) { return { state : 'no_sessions', candidates }; }
        if (autoPairEnabled && candidates.length === 1 && candidates[0].active) { return { state : 'single_candidate', candidates }; }
        return { state : 'selection_required', candidates };
    }
    UpdateSessions ({ accountId, connectionId, sessions })
    {
        requireId (accountId, 'account'); requireId (connectionId, 'connection'); const connection = this.connections.get (connectionId);
        if (!connection || connection.accountId !== accountId) { throw new Error ('Connection unavailable.'); }
        connection.sessions = validateSessions (sessions);
        for (const [grantId, pairing] of this.pairings) { if (pairing.connectionId === connectionId && !connection.sessions.some (session => session.id === pairing.sessionId)) { this.pairings.delete (grantId); } }
    }
    Pair ({ accountId, grantId, connectionId, sessionId, expiresAt })
    {
        for (const [label, value] of [['account', accountId], ['grant', grantId], ['connection', connectionId], ['session', sessionId]]) { requireId (value, label); }
        const connection = this.connections.get (connectionId);
        if (this.pairings.has (grantId) && this.pairings.get (grantId).accountId !== accountId) { throw new Error ('Grant unavailable.'); }
        if (!connection || connection.accountId !== accountId || !connection.sessions.some (session => session.id === sessionId)) { throw new Error ('Session unavailable.'); }
        if (!Number.isFinite (expiresAt) || expiresAt <= this.now ()) { throw new Error ('Pairing has expired.'); }
        this.pairings.set (grantId, { accountId, connectionId, instanceId : connection.instanceId, sessionId, expiresAt, revision : ++this.pairingSequence });
    }
    Disconnect (connectionId)
    {
        this.connections.delete (connectionId); for (const [grantId, pairing] of this.pairings) { if (pairing.connectionId === connectionId) { this.pairings.delete (grantId); } }
    }
    Revoke (grantId) { this.pairings.delete (grantId); }
    Resolve ({ accountId, grantId })
    {
        requireId (accountId, 'account'); requireId (grantId, 'grant'); const pairing = this.pairings.get (grantId);
        if (!pairing || pairing.accountId !== accountId || pairing.expiresAt <= this.now ()) { throw new Error ('No active pairing.'); }
        const connection = this.connections.get (pairing.connectionId);
        if (!connection || connection.accountId !== accountId || connection.instanceId !== pairing.instanceId || !connection.sessions.some (session => session.id === pairing.sessionId)) { throw new Error ('Session unavailable.'); }
        return { ...pairing, deliver : connection.deliver };
    }
    async Dispatch ({ accountId, grantId, requestId, command, arguments : args })
    {
        requireId (requestId, 'request'); if (typeof command !== 'string' || !/^[a-z][a-z0-9_.-]{0,127}$/.test (command)) { throw new Error ('Invalid command.'); }
        if (!args || typeof args !== 'object' || Array.isArray (args)) { throw new Error ('Invalid arguments.'); }
        const target = this.Resolve ({ accountId, grantId });
        if (!this.connections.get (target.connectionId).sessions.some (session => session.id === target.sessionId && session.active)) { throw new Error ('Paired session is not active in its browser.'); }
        const key = grantId + ':' + requestId; for (const [id, expiresAt] of this.requests) { if (expiresAt <= this.now ()) { this.requests.delete (id); } }
        if (this.requests.has (key)) { throw new Error ('Duplicate request; do not replay automatically.'); }
        if (this.requests.size >= 10000) { throw new Error ('Request history is full.'); }
        this.requests.set (key, target.expiresAt);
        const result = await target.deliver ({ requestId, command, arguments : args, sessionId : target.sessionId });
        let current; try { current = this.Resolve ({ accountId, grantId }); } catch { throw new Error ('Pairing ended; operation outcome may be unknown.'); }
        if (current.revision !== target.revision || current.connectionId !== target.connectionId || current.sessionId !== target.sessionId || current.instanceId !== target.instanceId || !this.connections.get (current.connectionId).sessions.some (session => session.id === current.sessionId && session.active)) { throw new Error ('Pairing changed; operation outcome may be unknown.'); }
        return result;
    }
}
