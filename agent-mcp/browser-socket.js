// Browser transport foundation. The server endpoint is not implemented here;
// it must authenticate the existing session and validate the WebSocket Origin.
export class BrowserAgentSocket
{
    constructor ({ bridge, origin, createSocket = url => new WebSocket (url), onStatus = () => {}, onLease = () => {}, onAgents = () => {} })
    {
        const base = new URL (origin); if (base.protocol !== 'https:' || base.pathname !== '/' || base.search || base.hash || base.username || base.password) { throw new Error ('A secure Auto3D origin is required.'); }
        this.bridge = bridge; this.onStatus = onStatus; this.onLease = onLease; this.onAgents = onAgents; this.url = new URL ('/api/agent/connect', base); this.url.protocol = 'wss:'; this.createSocket = createSocket; this.generation = 0;
    }
    Connect ()
    {
        if (this.socket) { throw new Error ('Agent connection already started.'); }
        this.bridge.Connect (); let socket; try { socket = this.createSocket (this.url.href); } catch (error) { this.bridge.Disconnect (); throw error; }
        this.socket = socket; const generation = ++this.generation; this.onStatus ('connecting');
        const website = this.bridge.website;
        this.unsubscribeAuth = website?.auth?.Subscribe?.(user => { if (!user || user.id !== this.bridge.accountId) { this.Disconnect (); } });
        this.unsubscribeSessions = website?.sessionEditor?.sessions?.Subscribe?.(() => { try { this.PublishSessions (); } catch { this.Disconnect (); } });
        socket.onopen = () => { if (this.socket === socket) { try { this.Send ({ type : 'hello', ...this.bridge.Describe () }); } catch { this.Disconnect (); } } };
        socket.onmessage = event => { this.Handle (socket, generation, event).catch (() => {}); };
        socket.onclose = () => { if (this.socket === socket) { this.Disconnect (); } };
    }
    Send (message) { if (this.socket?.readyState === 1) { this.socket.send (JSON.stringify (message)); } }
    PublishSessions () { this.Send ({ type : 'sessions', ...this.bridge.Describe () }); }
    async Handle (socket, generation, event)
    {
        if (socket !== this.socket || generation !== this.generation || typeof event.data !== 'string' || event.data.length > 65536) { return; }
        let message; try { message = JSON.parse (event.data); } catch { return; }
        if (message?.type === 'hello_ack' && !this.connectionId && typeof message.connectionId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test (message.connectionId) && Number.isSafeInteger (message.expiresAt)) { this.connectionId = message.connectionId; this.onLease (message.expiresAt); if (this.socket === socket && this.connectionId) { this.onStatus ('connected'); } return; }
        if (message?.type === 'agents' && this.connectionId && Array.isArray (message.agents) && message.agents.length <= 20) { this.onAgents (message.agents); return; }
        if (!message || message.type !== 'request' || typeof message.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test (message.requestId)) { return; }
        let reply; try { const result = await this.bridge.Execute (message); reply = { type : 'result', requestId : message.requestId, result }; } catch { reply = { type : 'result', requestId : message.requestId, error : 'Request could not be completed.' }; }
        if (socket === this.socket && generation === this.generation) { this.Send (reply); }
    }
    Disconnect () { this.generation++; const socket = this.socket; this.socket = null; this.connectionId = null; this.unsubscribeAuth?.(); this.unsubscribeAuth = null; this.unsubscribeSessions?.(); this.unsubscribeSessions = null; this.bridge.Disconnect (); if (socket) { socket.close (); this.onStatus ('disconnected'); } }
}
