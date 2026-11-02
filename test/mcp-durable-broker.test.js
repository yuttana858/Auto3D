import assert from 'node:assert/strict';
import { DurableSessionBroker } from '../agent-mcp/durable-broker.js';

function setup ()
{
    const data = new Map (), sockets = []; const storage = { get : async key => data.get (key), put : async (key, value) => data.set (key, structuredClone (value)), delete : async key => data.delete (key), transaction : async callback => callback (storage) };
    const state = { storage, acceptWebSocket : socket => { sockets.push (socket); }, getWebSockets : () => sockets };
    const socket = () => ({ readyState : 1, serializeAttachment (value) { this.attachment = structuredClone (value); }, deserializeAttachment () { return structuredClone (this.attachment); }, send (value) { const message = JSON.parse (value); this.messages ||= []; this.messages.push (message); if (message.type === 'request') { this.last = message; } }, close () { this.readyState = 3; } });
    const broker = new DurableSessionBroker (state, { timeoutMs : 100 }); return { broker, state, socket };
}
async function connect (test, accountId, instanceId, sessionId)
{
    const socket = test.socket (); const connectionId = await test.broker.Attach ({ accountId, sessionFingerprint : 'a'.repeat (64), expiresAt : Date.now () + 10000 }, socket);
    test.broker.webSocketMessage (socket, JSON.stringify ({ type : 'hello', instanceId, windowLabel : instanceId, sessions : [{ id : sessionId, name : sessionId, active : true }] })); return { socket, connectionId, sessionId };
}

describe ('Durable session broker core', () => {
    it ('preserves account ownership and pairing across broker reinitialization', async () => {
        const test = setup (), window = await connect (test, 'alice', 'window', 'box');
        await test.broker.Pair ({ accountId : 'alice', grantId : 'grant', connectionId : window.connectionId, sessionId : 'box', expiresAt : Date.now () + 10000 });
        await assert.rejects (() => test.broker.List ('bob'), /Account unavailable/);
        test.broker = new DurableSessionBroker (test.state, { timeoutMs : 100 }); assert.equal ((await test.broker.List ('alice'))[0].sessions[0].id, 'box');
        const pending = test.broker.Dispatch ({ accountId : 'alice', grantId : 'grant', requestId : 'one', command : 'scene.inspect', arguments : {} });
        await new Promise (resolve => setTimeout (resolve, 5)); assert.equal (window.socket.last.sessionId, 'box'); test.broker.webSocketMessage (window.socket, JSON.stringify ({ type : 'result', requestId : 'one', result : { ok : true } })); assert.deepEqual (await pending, { ok : true });
        test.broker = new DurableSessionBroker (test.state, { timeoutMs : 100 });
        await assert.rejects (() => test.broker.Dispatch ({ accountId : 'alice', grantId : 'grant', requestId : 'one', command : 'scene.inspect', arguments : {} }), /Duplicate/);
    });
    it ('never redirects to another session and rejects results after re-pairing', async () => {
        const test = setup (), first = await connect (test, 'alice', 'first', 'box'), second = await connect (test, 'alice', 'second', 'bottle');
        const pair = { accountId : 'alice', grantId : 'grant', connectionId : first.connectionId, sessionId : 'box', expiresAt : Date.now () + 10000 }; await test.broker.Pair (pair);
        const pending = test.broker.Dispatch ({ accountId : 'alice', grantId : 'grant', requestId : 'two', command : 'scene.inspect', arguments : {} }); await new Promise (resolve => setTimeout (resolve, 5));
        await test.broker.Pair ({ ...pair, connectionId : second.connectionId, sessionId : 'bottle' }); test.broker.webSocketMessage (first.socket, JSON.stringify ({ type : 'result', requestId : 'two', result : {} })); await assert.rejects (pending, /Pairing changed/);
        second.socket.close (); await assert.rejects (() => test.broker.Dispatch ({ accountId : 'alice', grantId : 'grant', requestId : 'three', command : 'scene.inspect', arguments : {} }), /unavailable/); assert.equal (first.socket.last.requestId, 'two');
    });
    it ('renews the same verified browser session without retargeting the pairing', async () => {
        const test = setup (), window = await connect (test, 'alice', 'window', 'box'); const originalExpiry = window.socket.attachment.expiresAt;
        await test.broker.Pair ({ accountId : 'alice', grantId : 'grant', connectionId : window.connectionId, sessionId : 'box', expiresAt : Date.now () + 100000 });
        const request = { accountId : 'alice', connectionId : window.connectionId, instanceId : 'window', sessionFingerprint : 'a'.repeat (64), expiresAt : Date.now () + 200000 };
        await assert.rejects (() => test.broker.Renew ({ ...request, sessionFingerprint : 'b'.repeat (64) }), /unavailable/); await assert.rejects (() => test.broker.Renew ({ ...request, instanceId : 'other' }), /unavailable/);
        await test.broker.Renew (request); assert.ok (window.socket.attachment.expiresAt > originalExpiry); const resolved = await test.broker.Resolve ({ accountId : 'alice', grantId : 'grant' }); assert.equal (resolved.pair.sessionId, 'box'); assert.equal (resolved.target.data.connectionId, window.connectionId);
        window.socket.attachment.expiresAt = Date.now () - 1; await assert.rejects (() => test.broker.Renew (request), /unavailable/);
    });

    it ('reports paired agent labels only in their selected active window and clears them on revoke', async () => {
        const test = setup (), first = await connect (test, 'alice', 'laptop', 'box'), second = await connect (test, 'alice', 'desktop', 'bottle'); const expiresAt = Date.now () + 60000;
        await test.broker.Pair ({ accountId : 'alice', grantId : 'grant1', connectionId : first.connectionId, sessionId : 'box', expiresAt, client : { name : 'Codex', domain : null } });
        assert.equal (first.socket.messages.at (-1).agents[0].name, 'Codex'); assert.deepEqual (second.socket.messages.at (-1).agents, []);
        await test.broker.Pair ({ accountId : 'alice', grantId : 'grant2', connectionId : first.connectionId, sessionId : 'box', expiresAt, client : { name : 'Claude', domain : 'claude.example' } });
        assert.deepEqual (first.socket.messages.at (-1).agents.map (agent => agent.name), ['Codex', 'Claude']);
        await test.broker.Revoke ({ accountId : 'alice', grantId : 'grant1' }); assert.deepEqual (first.socket.messages.at (-1).agents.map (agent => agent.name), ['Claude']);
        test.broker.webSocketMessage (first.socket, JSON.stringify ({ type : 'sessions', instanceId : 'laptop', windowLabel : 'Laptop', sessions : [{ id : 'box', name : 'Box', active : false }, { id : 'other', name : 'Other', active : true }] })); assert.deepEqual (first.socket.messages.at (-1).agents, []);
    });

});
