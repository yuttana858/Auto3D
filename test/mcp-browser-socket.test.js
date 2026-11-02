import assert from 'node:assert/strict';
import { BrowserAgentSocket } from '../agent-mcp/browser-socket.js';

describe ('Browser agent WebSocket foundation', () => {
    it ('connects only to the app origin and returns only allowed bridge results', async () => {
        const sent = [], socket = { readyState : 1, send : value => sent.push (JSON.parse (value)), close () {} }; let requested, disconnects = 0;
        const bridge = { Connect : () => ({ instanceId : 'window', sessions : [] }), Describe : () => ({ instanceId : 'window', sessions : [] }), Disconnect : () => { disconnects++; }, Execute : async message => ({ ok : true, request : message.requestId }) };
        assert.throws (() => new BrowserAgentSocket ({ bridge, origin : 'http://bad.test' }), /secure/); const client = new BrowserAgentSocket ({ bridge, origin : 'https://auto3d.test', createSocket : url => { requested = url; return socket; } }); client.Connect (); socket.onopen (); assert.equal (requested, 'wss://auto3d.test/api/agent/connect'); assert.equal (sent[0].type, 'hello');
        await client.Handle (socket, client.generation, { data : JSON.stringify ({ type : 'request', requestId : 'r1', sessionId : 'one', command : 'scene.inspect', arguments : {} }) }); assert.equal (sent[1].result.ok, true); client.Disconnect (); assert.equal (disconnects, 1); await client.Handle (socket, client.generation - 1, { data : JSON.stringify ({ type : 'request', requestId : 'r2' }) }); assert.equal (sent.length, 2);
    });
    it ('publishes session changes and disconnects when the signed-in account changes', () => {
        const sent = []; let authListener, sessionsListener, authRemoved = false, sessionsRemoved = false, closed = 0;
        const socket = { readyState : 1, send : value => sent.push (JSON.parse (value)), close : () => { closed++; } };
        const website = { auth : { Subscribe : listener => { authListener = listener; return () => { authRemoved = true; }; } }, sessionEditor : { sessions : { Subscribe : listener => { sessionsListener = listener; return () => { sessionsRemoved = true; }; } } } };
        let name = 'first'; const bridge = { website, accountId : 'account', Connect : () => ({}), Describe : () => ({ instanceId : 'window', sessions : [{ id : name }] }), Disconnect : () => {} };
        const client = new BrowserAgentSocket ({ bridge, origin : 'https://auto3d.test', createSocket : () => socket }); client.Connect (); socket.onopen ();
        name = 'second'; sessionsListener (); assert.equal (sent[1].sessions[0].id, 'second'); authListener ({ id : 'another-account' });
        assert.equal (closed, 1); assert.equal (authRemoved, true); assert.equal (sessionsRemoved, true); assert.equal (client.socket, null);
    });

});
