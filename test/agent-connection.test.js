import assert from 'node:assert/strict';
import { AgentConnection } from '../source/website/agentconnection.js';

describe ('Agent connection control', () => {
    it ('only connects on an explicit request and disconnects when the account changes', () => {
        let listener, socket; const website = { accountReady : true, auth : { user : { id : 'alice' }, Subscribe : fn => { listener = fn; return () => {}; } }, sessionEditor : { readOnly : false, sessions : { Inspect : () => ({ tabs : [{ id : 'one', name : 'Box', active : true }] }), Subscribe : () => () => {} } } };
        const control = new AgentConnection (website, { origin : 'https://auto3d.example', createSocket : () => { socket = { readyState : 1, send () {}, close () { this.closed = true; } }; return socket; } });
        assert.equal (control.Inspect ().status, 'disconnected'); assert.equal (control.Connect ('Laptop').status, 'connecting'); socket.onopen (); socket.onmessage ({ data : JSON.stringify ({ type : 'hello_ack', connectionId : 'server-id', expiresAt : Date.now () + 300000 }) }); assert.equal (control.Inspect ().status, 'connected'); assert.throws (() => control.Connect ('Duplicate'), /already connected/);
        listener ({ id : 'bob' }); assert.equal (control.Inspect ().status, 'disconnected'); assert.equal (socket.closed, true);
    });
    it ('binds grant operations to the signed-in account and rejects an account change', async () => {
        const original = globalThis.fetch; const website = { accountReady : true, auth : { user : { id : 'alice' } } }; const control = new AgentConnection (website, { origin : 'https://auto3d.example' }); let header;
        try {
            globalThis.fetch = async (path, init) => { header = init.headers['X-Auto3D-Account']; assert.equal (path, '/agent/grants'); return new Response (JSON.stringify ({ grants : [] }), { headers : { 'Content-Type' : 'application/json' } }); };
            assert.deepEqual (await control.ListGrants (), { grants : [] }); assert.equal (header, 'alice');
            globalThis.fetch = async () => { website.auth.user.id = 'bob'; return new Response (JSON.stringify ({ grants : [] }), { headers : { 'Content-Type' : 'application/json' } }); };
            await assert.rejects (() => control.ListGrants (), /Account changed/);
        } finally { globalThis.fetch = original; }
    });

    it ('renews the acknowledged window and closes if the verified account changes', async () => {
        const original = globalThis.fetch; let socket, requestBody, timerId = 0; const website = { accountReady : true, auth : { user : { id : 'alice' }, Subscribe : () => () => {} }, sessionEditor : { readOnly : false, sessions : { Inspect : () => ({ tabs : [{ id : 'one', name : 'Box', active : true }] }), Subscribe : () => () => {} } } };
        const control = new AgentConnection (website, { origin : 'https://auto3d.example', now : () => 100000, schedule : () => ++timerId, cancel : () => {}, createSocket : () => { socket = { readyState : 1, send () {}, close () { this.closed = true; } }; return socket; } });
        try {
            control.Connect ('Laptop'); socket.onopen (); socket.onmessage ({ data : JSON.stringify ({ type : 'hello_ack', connectionId : 'connection', expiresAt : 400000 }) });
            globalThis.fetch = async (path, init) => { assert.equal (path, '/api/agent/renew'); requestBody = JSON.parse (init.body); assert.equal (init.headers['X-Auto3D-Account'], 'alice'); return new Response (JSON.stringify ({ expiresAt : 400000 }), { headers : { 'Content-Type' : 'application/json' } }); };
            await control.Renew (); assert.equal (requestBody.connectionId, 'connection'); assert.equal (requestBody.instanceId, control.instanceId);
            globalThis.fetch = async () => { website.auth.user.id = 'bob'; return new Response (JSON.stringify ({ expiresAt : 400000 }), { headers : { 'Content-Type' : 'application/json' } }); };
            await assert.rejects (() => control.Renew (), /could not be renewed/); control.Disconnect (); assert.equal (socket.closed, true);
        } finally { globalThis.fetch = original; control.Disconnect (); }
    });

    it ('shows only unexpired paired agents and clears them on disconnect', () => {
        let socket; const website = { accountReady : true, auth : { user : { id : 'alice' }, Subscribe : () => () => {} }, sessionEditor : { readOnly : false, sessions : { Inspect : () => ({ tabs : [{ id : 'one', name : 'Box', active : true }] }), Subscribe : () => () => {} } } }; let now = 100000;
        const control = new AgentConnection (website, { origin : 'https://auto3d.example', now : () => now, schedule : () => 1, cancel : () => {}, createSocket : () => { socket = { readyState : 1, send () {}, close () {} }; return socket; } });
        control.Connect ('Laptop'); socket.onopen (); socket.onmessage ({ data : JSON.stringify ({ type : 'hello_ack', connectionId : 'connection', expiresAt : 400000 }) });
        socket.onmessage ({ data : JSON.stringify ({ type : 'agents', agents : [{ name : 'Codex', domain : null, expiresAt : 120000 }, { name : 'Expired', domain : null, expiresAt : 90000 }] }) }); assert.deepEqual (control.Inspect ().agents.map (agent => agent.name), ['Codex']);
        now = 130000; control.SetAgents (control.Inspect ().agents); assert.deepEqual (control.Inspect ().agents, []); control.Disconnect (); assert.deepEqual (control.Inspect ().agents, []);
    });

});
