import { DurableObject } from 'cloudflare:workers';
import { DurableSessionBroker } from './durable-broker.js';

// Only the verified gateway and MCP Worker may hold this binding. The broker's
// internal fetch route is not an HTTP endpoint for external traffic.
export class Auto3DAgentBroker extends DurableObject
{
    constructor (state, env) { super (state, env); this.broker = new DurableSessionBroker (state); }
    async fetch (request)
    {
        const url = new URL (request.url), accountId = request.headers.get ('X-Auto3D-Verified-Account'), sessionFingerprint = request.headers.get ('X-Auto3D-Verified-Session'), expiresAt = Number (request.headers.get ('X-Auto3D-Connection-Expires'));
        if (url.origin !== 'https://broker.internal' || url.pathname !== '/connect' || request.method !== 'GET' || (request.headers.get ('Upgrade') || '').toLowerCase () !== 'websocket' || !/^[0-9a-f-]{36}$/i.test (accountId || '') || !/^[0-9a-f]{64}$/.test (sessionFingerprint || '') || !Number.isSafeInteger (expiresAt) || expiresAt <= Date.now () || expiresAt > Date.now () + 5 * 60 * 1000) { return new Response ('Invalid connection.', { status : 403 }); }
        const pair = new globalThis.WebSocketPair (); const [client, server] = Object.values (pair); await this.broker.Attach ({ accountId, sessionFingerprint, expiresAt }, server); return new Response (null, { status : 101, webSocket : client });
    }
    List (accountId) { return this.broker.List (accountId); }
    Renew (request) { return this.broker.Renew (request); }
    Pair (request) { return this.broker.Pair (request); }
    Dispatch (request) { return this.broker.Dispatch (request); }
    Revoke (request) { return this.broker.Revoke (request); }
    webSocketMessage (socket, message) { return this.broker.webSocketMessage (socket, message); }
    webSocketClose (socket) { return this.broker.webSocketClose (socket); }
    webSocketError (socket) { return this.broker.webSocketError (socket); }
}
