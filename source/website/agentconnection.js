import { AgentLabel } from '../../agent-mcp/agent-label.js';
import { BrowserBridge } from '../../agent-mcp/browser-bridge.js';
import { BrowserAgentSocket } from '../../agent-mcp/browser-socket.js';

// Opt-in connection belongs to this tab and is never restored automatically.
export class AgentConnection
{
    constructor (website, { origin = window.location.origin, createSocket, now = () => Date.now (), schedule = setTimeout, cancel = clearTimeout } = {})
    {
        this.website = website; this.origin = origin; this.createSocket = createSocket; this.now = now; this.schedule = schedule; this.cancel = cancel; this.instanceId = crypto.randomUUID (); this.status = 'disconnected'; this.agents = []; this.listeners = new Set ();
    }
    Subscribe (listener) { this.listeners.add (listener); return () => this.listeners.delete (listener); }
    SetStatus (status) { if (status === 'disconnected' && this.leaseTimer) { this.cancel (this.leaseTimer); this.leaseTimer = null; } if (status === 'disconnected') { if (this.agentTimer) { this.cancel (this.agentTimer); this.agentTimer = null; } this.agents = []; } this.status = status; for (const listener of this.listeners) { listener (this.Inspect ()); } }
    Inspect () { return { status : this.status, windowLabel : this.label || null, agents : this.agents.map (agent => ({ ...agent })) }; }
    Connect (windowLabel)
    {
        if (this.client?.socket) { throw new Error ('This window is already connected.'); }
        const bridge = new BrowserBridge ({ website : this.website, instanceId : this.instanceId, windowLabel }); this.label = bridge.windowLabel;
        const client = new BrowserAgentSocket ({ bridge, origin : this.origin, ...(this.createSocket ? { createSocket : this.createSocket } : {}), onStatus : status => this.SetStatus (status), onLease : expiresAt => this.SetLease (expiresAt), onAgents : agents => this.SetAgents (agents) });
        this.client = client; try { client.Connect (); this.leaseTimer = this.schedule (() => this.Disconnect (), 15000); } catch (error) { this.client = null; this.SetStatus ('disconnected'); throw error; }
        return this.Inspect ();
    }
    SetAgents (agents)
    {
        if (this.agentTimer) { this.cancel (this.agentTimer); this.agentTimer = null; }
        this.agents = agents.filter (agent => agent && Number.isSafeInteger (agent.expiresAt) && agent.expiresAt > this.now ()).slice (0, 20).map (agent => ({ ...AgentLabel ({ clientName : agent.name, clientDomain : agent.domain }), expiresAt : agent.expiresAt }));
        if (this.agents.length) { const delay = Math.max (0, Math.min (2147483647, Math.min (...this.agents.map (agent => agent.expiresAt)) - this.now ())); this.agentTimer = this.schedule (() => { this.agentTimer = null; this.SetAgents (this.agents); }, delay); }
        for (const listener of this.listeners) { listener (this.Inspect ()); }
    }
    SetLease (expiresAt)
    {
        if (!Number.isSafeInteger (expiresAt) || expiresAt <= this.now () || expiresAt > this.now () + 6 * 60 * 1000) { this.Disconnect (); return; }
        if (this.leaseTimer) { this.cancel (this.leaseTimer); }
        const delay = Math.max (0, Math.min (4 * 60 * 1000, expiresAt - this.now () - 60 * 1000));
        this.leaseTimer = this.schedule (() => { this.leaseTimer = null; const client = this.client; this.Renew ().catch (() => { if (this.client === client) { this.Disconnect (); } }); }, delay);
    }
    async Renew ()
    {
        const client = this.client, socket = client?.socket, owner = this.website.auth?.user?.id;
        if (!owner || this.website.accountReady !== true || !socket || !client.connectionId) { throw new Error ('Agent connection unavailable.'); }
        const response = await fetch ('/api/agent/renew', { method : 'POST', credentials : 'same-origin', cache : 'no-store', headers : { 'Content-Type' : 'application/json', 'X-Auto3D-Account' : owner }, body : JSON.stringify ({ connectionId : client.connectionId, instanceId : this.instanceId }) });
        const data = await response.json (); if (!response.ok || this.client !== client || client.socket !== socket || this.website.auth?.user?.id !== owner || this.website.accountReady !== true) { throw new Error ('Agent connection could not be renewed.'); }
        this.SetLease (data.expiresAt); return this.Inspect ();
    }
    async GrantRequest (path, options = {})
    {
        const owner = this.website.auth?.user?.id; if (!owner || this.website.accountReady !== true) { throw new Error ('Sign in to manage agent access.'); }
        const response = await fetch (path, { ...options, credentials : 'same-origin', cache : 'no-store', headers : { 'X-Auto3D-Account' : owner, ...(options.body ? { 'Content-Type' : 'application/json' } : {}) } });
        let data; try { data = await response.json (); } catch { throw new Error ('Agent access service is unavailable.'); }
        if (this.website.auth?.user?.id !== owner || this.website.accountReady !== true) { throw new Error ('Account changed. Refresh and try again.'); }
        if (!response.ok) { throw new Error (data.error || 'Agent access service is unavailable.'); } return data;
    }
    ListGrants (cursor = null) { return this.GrantRequest ('/agent/grants' + (cursor ? '?cursor=' + encodeURIComponent (cursor) : '')); }
    RevokeGrant (id) { return this.GrantRequest ('/agent/grants/revoke', { method : 'POST', body : JSON.stringify ({ id }) }); }
    Disconnect () { if (this.leaseTimer) { this.cancel (this.leaseTimer); this.leaseTimer = null; } this.client?.Disconnect (); this.client = null; this.SetStatus ('disconnected'); return this.Inspect (); }
}
