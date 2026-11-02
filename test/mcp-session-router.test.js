import assert from 'node:assert/strict';
import { SessionRouter } from '../agent-mcp/session-router.js';

describe ('Agent session routing foundation', () => {
    const connection = (accountId, instanceId, connectionId, sessionId, deliver = async request => request) => ({ accountId, instanceId, connectionId, sessions : [{ id : sessionId, name : 'Design', active : true }], deliver });
    it ('keeps windows separate and routes only to the paired account and session', async () => {
        const router = new SessionRouter ({ now : () => 100 }); router.Register (connection ('alice', 'window_1', 'connection_1', 'session_1')); router.Register (connection ('alice', 'window_2', 'connection_2', 'session_2')); router.Register (connection ('bob', 'window_3', 'connection_3', 'session_3'));
        assert.equal (router.List ('alice').length, 2); assert.throws (() => router.Pair ({ accountId : 'alice', grantId : 'grant', connectionId : 'connection_3', sessionId : 'session_3', expiresAt : 200 }), /unavailable/);
        router.Pair ({ accountId : 'alice', grantId : 'grant', connectionId : 'connection_2', sessionId : 'session_2', expiresAt : 200 }); const request = { accountId : 'alice', grantId : 'grant', requestId : 'request', command : 'scene.inspect', arguments : {} }; const result = await router.Dispatch (request); assert.equal (result.sessionId, 'session_2'); await assert.rejects (() => router.Dispatch (request), /Duplicate/); assert.throws (() => router.Resolve ({ accountId : 'bob', grantId : 'grant' }), /pairing/); assert.throws (() => router.Pair ({ accountId : 'bob', grantId : 'grant', connectionId : 'connection_3', sessionId : 'session_3', expiresAt : 200 }), /Grant/);
    });
    it ('revokes routes on disconnect and never redirects to another tab', () => {
        const router = new SessionRouter (); router.Register (connection ('alice', 'window_1', 'connection_1', 'session_1')); router.Register (connection ('alice', 'window_2', 'connection_2', 'session_2')); router.Pair ({ accountId : 'alice', grantId : 'grant', connectionId : 'connection_1', sessionId : 'session_1', expiresAt : Date.now () + 1000 }); router.Disconnect ('connection_1'); assert.throws (() => router.Resolve ({ accountId : 'alice', grantId : 'grant' }), /pairing/); assert.equal (router.List ('alice').length, 1);
    });
    it ('rejects an in-flight result if the grant changes or expires', async () => {
        let now = 0, finish; const router = new SessionRouter ({ now : () => now }); router.Register (connection ('alice', 'window_1', 'connection_1', 'session_1', () => new Promise (resolve => { finish = resolve; }))); router.Pair ({ accountId : 'alice', grantId : 'grant', connectionId : 'connection_1', sessionId : 'session_1', expiresAt : 10 }); const pending = router.Dispatch ({ accountId : 'alice', grantId : 'grant', requestId : 'request', command : 'scene_inspect', arguments : {} }); now = 11; finish ({ ok : true }); await assert.rejects (pending, /outcome may be unknown/);
    });
    it ('does not redirect commands when an in-app session changes or closes', async () => {
        const router = new SessionRouter (); router.Register (connection ('alice', 'window_1', 'connection_1', 'session_1')); router.Pair ({ accountId : 'alice', grantId : 'grant', connectionId : 'connection_1', sessionId : 'session_1', expiresAt : Date.now () + 10000 });
        router.UpdateSessions ({ accountId : 'alice', connectionId : 'connection_1', sessions : [{ id : 'session_1', name : 'One', active : false }, { id : 'session_2', name : 'Two', active : true }] });
        await assert.rejects (() => router.Dispatch ({ accountId : 'alice', grantId : 'grant', requestId : 'a', command : 'scene.inspect', arguments : {} }), /not active/);
        assert.throws (() => router.UpdateSessions ({ accountId : 'bob', connectionId : 'connection_1', sessions : [] }), /unavailable/);
        router.UpdateSessions ({ accountId : 'alice', connectionId : 'connection_1', sessions : [{ id : 'session_2', name : 'Two', active : true }] }); assert.throws (() => router.Resolve ({ accountId : 'alice', grantId : 'grant' }), /pairing/);
    });
    it ('offers automatic pairing only for one active session when enabled', () => {
        const router = new SessionRouter (); assert.equal (router.Candidates ('alice', true).state, 'no_sessions'); router.Register ({ ...connection ('alice', 'window_1', 'connection_1', 'session_1'), windowLabel : 'Laptop' }); assert.equal (router.Candidates ('alice', false).state, 'selection_required'); const single = router.Candidates ('alice', true); assert.equal (single.state, 'single_candidate'); assert.equal (single.candidates[0].windowLabel, 'Laptop'); router.Register (connection ('alice', 'window_2', 'connection_2', 'session_2')); assert.equal (router.Candidates ('alice', true).state, 'selection_required'); assert.equal (router.Candidates ('bob', true).state, 'no_sessions');
    });
    it ('rejects an old response after the same grant is re-paired', async () => {
        let finish; const router = new SessionRouter (), pair = { accountId : 'alice', grantId : 'grant', connectionId : 'connection_1', sessionId : 'session_1', expiresAt : Date.now () + 10000 }; router.Register (connection ('alice', 'window_1', 'connection_1', 'session_1', () => new Promise (resolve => { finish = resolve; }))); router.Pair (pair); const pending = router.Dispatch ({ accountId : 'alice', grantId : 'grant', requestId : 'request', command : 'scene.inspect', arguments : {} }); router.Revoke ('grant'); router.Pair (pair); finish ({ ok : true }); await assert.rejects (pending, /outcome may be unknown/);
    });
});
