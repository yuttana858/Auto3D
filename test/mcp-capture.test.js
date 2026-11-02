import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CaptureImageResult, MaxCaptureDataLength } from '../agent-mcp/capture-image.js';
import { AgentToolService } from '../agent-mcp/tool-service.js';
import { CreateConsentHandler } from '../agent-mcp/consent.js';
import { DurableSessionBroker } from '../agent-mcp/durable-broker.js';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=';
const capture = data => ({ ok : true, command : 'capture.image', result : { scope : 'viewport', width : 1, height : 1, content : [{ type : 'image', mimeType : 'image/png', data }] } });

describe ('MCP screenshot sharing', () => {
    it ('requires the separate capture grant and limits image data', async () => {
        const catalog = JSON.parse (await readFile ('website/assets/commands.json', 'utf8')).commands; const router = { Dispatch : async () => capture (png) }; const service = new AgentToolService ({ router, catalog });
        const actor = { accountId : 'alice', grantId : 'grant', scopes : ['auto3d.read'] }; assert.ok (!service.ListTools (actor).some (tool => tool.id === 'capture.image'));
        await assert.rejects (() => service.Call (actor, { command : 'capture.image', requestId : 'one', arguments : {} }), /unavailable/);
        actor.scopes.push ('auto3d.capture'); assert.ok (service.ListTools (actor).some (tool => tool.id === 'capture.image')); assert.equal (CaptureImageResult (await service.Call (actor, { command : 'capture.image', requestId : 'two', arguments : {} })).image.data, png);
        assert.throws (() => CaptureImageResult (capture ('iVBORw0KGgo' + 'A'.repeat (MaxCaptureDataLength))), /too large/); assert.throws (() => CaptureImageResult (capture ('not-a-png')), /unavailable/);
    });
    it ('tells the user when screenshot sharing is requested at consent', async () => {
        const requested = ['auto3d.read', 'auto3d.capture']; const oauth = { parseAuthRequest : async () => ({ scope : requested }), describeConsent : async () => ({ scope : requested, clientName : 'Client', redirectHost : 'client.example' }), beginConsent : async () => ({ handle : 'handle', headers : new Headers () }) };
        const handler = CreateConsentHandler ({ oauth, verifiedUser : async () => ({ id : 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }), signingKey : new Uint8Array (32) });
        const response = await handler (new Request ('https://auto3d.example/authorize')); assert.equal (response.status, 200); assert.match (await response.text (), /share screenshots/);
    });
    it ('allows a bounded screenshot result larger than the normal message limit', async () => {
        const records = new Map (), sockets = [], store = { get : async key => records.get (key), put : async (key, value) => records.set (key, value), delete : async key => records.delete (key), transaction : async fn => fn (store) };
        const broker = new DurableSessionBroker ({ storage : store, acceptWebSocket : socket => sockets.push (socket), getWebSockets : () => sockets }, { timeoutMs : 1000 });
        const socket = { readyState : 1, serializeAttachment (value) { this.data = value; }, deserializeAttachment () { return this.data; }, send () {}, close () { this.readyState = 3; } };
        const connectionId = await broker.Attach ({ accountId : 'alice', sessionFingerprint : 'a'.repeat (64), expiresAt : Date.now () + 10000 }, socket); broker.webSocketMessage (socket, JSON.stringify ({ type : 'hello', instanceId : 'window', windowLabel : 'Laptop', sessions : [{ id : 'one', name : 'Box', active : true }] }));
        await broker.Pair ({ accountId : 'alice', grantId : 'grant', connectionId, sessionId : 'one', expiresAt : Date.now () + 10000 });
        const task = broker.Dispatch ({ accountId : 'alice', grantId : 'grant', requestId : 'large', command : 'capture.image', arguments : {} }); await new Promise (resolve => setTimeout (resolve, 5));
        const large = 'iVBORw0KGgo' + 'A'.repeat (70000); broker.webSocketMessage (socket, JSON.stringify ({ type : 'result', requestId : 'large', result : capture (large) })); assert.equal ((await task).result.content[0].data.length, large.length); assert.equal (socket.readyState, 1);
    });
});
