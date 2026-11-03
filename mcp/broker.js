import { DurableObject } from 'cloudflare:workers';
import { BrokerCore } from './broker-core.js';

export class Auto3DAgentBroker extends DurableObject
{
    constructor (ctx, env) { super (ctx, env); this.core = new BrokerCore (ctx); }
    async fetch (request)
    {
        const accountId = request.headers.get ('X-Auto3D-Verified-Account'), sessionFingerprint = request.headers.get ('X-Auto3D-Verified-Session'), expiresAt = Number (request.headers.get ('X-Auto3D-Connection-Expires'));
        if (request.url !== 'https://broker.internal/connect' || request.method !== 'GET' || request.headers.get ('Upgrade')?.toLowerCase () !== 'websocket') { return new Response ('Not found.', { status : 404 }); }
        const [client, server] = Object.values (new globalThis.WebSocketPair ());
        try { await this.core.Attach ({ accountId, sessionFingerprint, expiresAt }, server); await this.ctx.storage.setAlarm (Date.now () + 300000); }
        catch { return new Response ('Connection unavailable.', { status : 403 }); }
        return new Response (null, { status : 101, webSocket : client });
    }
    List (accountId) { return this.core.List (accountId); }
    Renew (input) { return this.core.Renew (input); }
    Pair (input) { return this.core.Pair (input); }
    Dispatch (input) { return this.core.Dispatch (input); }
    Register (input) { return this.core.registrations.Create (input); }
    Registrations (accountId) { return this.core.registrations.List (accountId); }
    AssertRegistration (input) { return this.core.registrations.Assert (input); }
    RevokeRegistration (input) { return this.core.Revoke (input); }
    DisableAgents (input) { return this.core.registrations.Disable (input); }
    webSocketMessage (socket, message) { this.core.Message (socket, message); }
    webSocketClose (socket) { this.core.Close (socket); }
    webSocketError (socket) { this.core.Close (socket); }
    async alarm () { await this.core.Cleanup (); if (this.ctx.getWebSockets ().length) { await this.ctx.storage.setAlarm (Date.now () + 300000); } }
}
export default { fetch () { return new Response ('Not found.', { status : 404 }); } };
