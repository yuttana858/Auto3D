import assert from 'node:assert/strict';
import { AgentAccess, FitResult } from '../../source/website/agentaccess.js';
import { CommandRegistry } from '../../source/website/commandregistry.js';

function Fixture ()
{
    const website = { auth : { user : { id : 'owner' }, Subscribe () {} }, accountReady : true, sessionEditor : { readOnly : false, sessions : { active : 'tab-a', revision : 0, switching : false } } };
    website.commands = new CommandRegistry ({ website });
    website.commands.Register ({ id : 'scene.inspect', mutates : false, inputSchema : { type : 'object', properties : {} } }, async () => ({ objects : [] }));
    website.commands.Register ({ id : 'capture.image', mutates : false, inputSchema : { type : 'object', properties : {} } }, async () => ({ image : true }));
    website.commands.Register ({ id : 'objects.delete', mutates : true, inputSchema : { type : 'object', properties : {} } }, async () => ({ deleted : true }));
    const access = new AgentAccess (website); access.accountId = 'owner'; access.socket = { readyState : 1, sent : [], send (data) { this.sent.push (JSON.parse (data)); } };
    const request = (command, writeAuthorized = false) => ({ data : JSON.stringify ({ type : 'request', command, requestId : 'request-a', sessionId : 'tab-a', arguments : {}, writeAuthorized }) });
    return { website, access, request };
}
describe ('Browser-side MCP guards', () => {
    it ('retries an unexpected connection loss and stops after explicit disconnect or account change', () => {
        const { access, website } = Fixture (); const scheduled = []; access.socket.close = () => {}; access.reconnectEnabled = true; access.allowSelect = true;
        access.ScheduleReconnect = (owner, allowSelect) => scheduled.push ({ owner, allowSelect });
        access.ConnectionLost (); assert.deepEqual (scheduled, [{ owner : 'owner', allowSelect : true }]); assert.equal (access.reconnectEnabled, true);
        access.Disconnect (); access.ConnectionLost (); assert.equal (scheduled.length, 1);
        access.reconnectEnabled = true; access.accountId = 'owner'; website.auth.user = { id : 'other' }; access.ConnectionLost (); assert.equal (scheduled.length, 1); assert.equal (access.reconnectEnabled, false);
    });
    it ('backs off retries and cancels pending retries on explicit disconnect', async () => {
        const { access } = Fixture (); const oldSet = globalThis.setTimeout, oldClear = globalThis.clearTimeout; const timers = new Map (); let next = 0;
        globalThis.setTimeout = (callback, delay) => { const id = ++next; timers.set (id, { callback, delay }); return id; };
        globalThis.clearTimeout = id => timers.delete (id);
        try {
            access.socket.close = () => {}; access.reconnectEnabled = true;
            let attempts = 0; access.Connect = async () => { attempts++; throw new Error ('offline'); };
            access.ConnectionLost (); let timer = [...timers.values ()][0]; assert.equal (timer.delay, 1000); await timer.callback ();
            timer = [...timers.values ()].at (-1); assert.equal (timer.delay, 2000); assert.equal (attempts, 1);
            access.Disconnect (); assert.equal (timers.size, 1); // first fired timer is retained by this minimal fake
            await timer.callback (); assert.equal (attempts, 1);
        } finally { globalThis.setTimeout = oldSet; globalThis.clearTimeout = oldClear; }
    });
    it ('includes screenshots automatically while retaining write authorization and structured denials', async () => {
        const { access, request } = Fixture (); let lost = 0; access.ConnectionLost = () => { lost++; };
        await access.Message (request ('scene.inspect'), access.socket, 0); assert.equal (access.socket.sent[0].result.ok, true);
        await access.Message (request ('auth.sign_out'), access.socket, 0); assert.equal (access.socket.sent[1].error.code, 'permission_required');
        assert.equal (access.Inspect ().screenshots, true);
        assert.equal (access.Inspect ().permissionPolicy, 'full-access-v1');
        await access.Message (request ('capture.image'), access.socket, 0); assert.equal (access.socket.sent[2].result.ok, true);
        await access.Message (request ('objects.delete'), access.socket, 0); assert.equal (access.socket.sent[3].error.code, 'permission_required');
        await access.Message (request ('objects.delete', true), access.socket, 0); assert.equal (access.socket.sent[4].result.ok, true);
        assert.equal (lost, 0); assert.ok (access.socket.sent.every (message => message.requestId === 'request-a' && message.sessionId === 'tab-a'));
    });
    it ('reports command failures and invalid arguments as results', async () => {
        const { website, access, request } = Fixture ();
        website.commands.Register ({ id : 'object.select', mutates : true, inputSchema : { type : 'object', properties : { id : { type : 'string' } }, required : ['id'] } }, async () => { throw new Error ('Object not found.'); });
        await access.Message (request ('object.select', true), access.socket, 0); assert.deepEqual (access.socket.sent[0].error, { code : 'invalid_arguments', message : 'arguments.id is required.' });
        const bad = { data : JSON.stringify ({ type : 'request', command : 'object.select', requestId : 'request-b', sessionId : 'tab-a', arguments : { id : 'x' }, writeAuthorized : true }) };
        await access.Message (bad, access.socket, 0); assert.deepEqual (access.socket.sent[1].error, { code : 'command_failed', message : 'Object not found.' });
        await assert.rejects (access.Message ({ data : '{"type":"bogus"}' }, access.socket, 0), /Invalid message/);
    });
    it ('checks account and tab after the registry queue and reports late changes', async () => {
        const { website, access, request } = Fixture (); let release;
        const blocked = website.commands.Queue (() => new Promise (resolve => { release = resolve; }));
        await Promise.resolve ();
        const waiting = access.Message (request ('scene.inspect'), access.socket, 0); website.sessionEditor.sessions.active = 'tab-b';
        release (); await blocked; await waiting; assert.equal (access.socket.sent[0].error.code, 'session_changed');
        website.sessionEditor.sessions.active = 'tab-a';
        website.commands.commands.get ('scene.inspect').handler = async () => { website.sessionEditor.sessions.revision++; return {}; };
        await access.Message (request ('scene.inspect'), access.socket, 0); assert.equal (access.socket.sent[1].error.code, 'session_changed');
        website.auth.user = { id : 'other' }; await assert.rejects (access.Message (request ('scene.inspect'), access.socket, 0));
    });
    it ('lets agent tab commands change the active tab and reports the new tab', async () => {
        const { website, access } = Fixture ();
        website.sessionEditor.sessions.Inspect = () => ({ tabs : [{ id : website.sessionEditor.sessions.active, name : 'Box', active : true }] });
        website.commands.Register ({ id : 'session.tabs.new', mutates : true, inputSchema : { type : 'object', properties : {} } }, async () => { website.sessionEditor.sessions.active = 'tab-new'; website.sessionEditor.sessions.revision++; return { activeId : 'tab-new' }; });
        await access.Message ({ data : JSON.stringify ({ type : 'request', command : 'session.tabs.new', requestId : 'request-t', sessionId : 'tab-a', arguments : {}, writeAuthorized : true }) }, access.socket, 0);
        assert.equal (access.socket.sent[0].type, 'sessions'); assert.equal (access.socket.sent[0].sessions[0].id, 'tab-new');
        assert.equal (access.socket.sent[1].result.activeSessionId, 'tab-new'); assert.equal (access.socket.sent[1].sessionId, 'tab-a');
    });
    it ('shortens oversized results instead of discarding them', () => {
        const payload = { ok : true, command : 'scene.inspect', result : { objects : Array.from ({ length : 4000 }, (_, index) => ({ id : 'object-' + index, name : 'Part ' + index })) } };
        const fitted = FitResult (payload, 65000);
        assert.ok (JSON.stringify (fitted).length <= 65000); assert.equal (fitted.truncated.path, 'objects'); assert.equal (fitted.truncated.total, 4000);
        assert.equal (fitted.result.objects.length, fitted.truncated.returned); assert.equal (payload.result.objects.length, 4000);
        assert.throws (() => FitResult ({ ok : true, result : { blob : 'x'.repeat (70000) } }, 65000), /transfer limit/);
    });
    it ('cancels a running text command when the broker times out', async () => {
        const { website, access } = Fixture (); let cancelled = 0; website.commands.Cancel = () => { cancelled++; return { requested : true }; };
        access.running.set ('request-c', 'commands.text'); await access.Message ({ data : JSON.stringify ({ type : 'cancel', requestId : 'request-c' }) }, access.socket, 0);
        await access.Message ({ data : JSON.stringify ({ type : 'cancel', requestId : 'other' }) }, access.socket, 0); assert.equal (cancelled, 1);
    });
});
