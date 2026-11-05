import assert from 'node:assert/strict';
import { AgentAccess } from '../../source/website/agentaccess.js';
import { CommandRegistry } from '../../source/website/commandregistry.js';

function Fixture ()
{
    const website = { auth : { user : { id : 'owner' }, Subscribe () {} }, accountReady : true, sessionEditor : { readOnly : false, sessions : { active : 'tab-a', revision : 0, switching : false } } };
    website.commands = new CommandRegistry ({ website });
    website.commands.Register ({ id : 'scene.inspect', mutates : false, inputSchema : { type : 'object', properties : {} } }, async () => ({ objects : [] }));
    website.commands.Register ({ id : 'capture.image', mutates : false, inputSchema : { type : 'object', properties : {} } }, async () => ({ image : true }));
    website.commands.Register ({ id : 'objects.delete', mutates : true, inputSchema : { type : 'object', properties : {} } }, async () => ({ deleted : true }));
    const access = new AgentAccess (website); access.accountId = 'owner'; access.socket = { sent : [], send (data) { this.sent.push (JSON.parse (data)); } };
    const request = (command, writeAuthorized = false) => ({ data : JSON.stringify ({ type : 'request', command, requestId : 'request-a', sessionId : 'tab-a', arguments : {}, writeAuthorized }) });
    return { website, access, request };
}
describe ('Browser-side MCP guards', () => {
    it ('retries an unexpected connection loss and stops after explicit disconnect or account change', () => {
        const { access, website } = Fixture (); const scheduled = []; access.socket.close = () => {}; access.reconnectEnabled = true; access.screenshots = true;
        access.ScheduleReconnect = (owner, screenshots) => scheduled.push ({ owner, screenshots });
        access.ConnectionLost (); assert.deepEqual (scheduled, [{ owner : 'owner', screenshots : true }]); assert.equal (access.reconnectEnabled, true);
        access.Disconnect (); access.ConnectionLost (); assert.equal (scheduled.length, 1);
        access.reconnectEnabled = true; access.accountId = 'owner'; website.auth.user = { id : 'other' }; access.ConnectionLost (); assert.equal (scheduled.length, 1); assert.equal (access.reconnectEnabled, false);
    });
    it ('backs off retries and cancels pending retries on explicit disconnect', async () => {
        const { access } = Fixture (); const oldSet = globalThis.setTimeout, oldClear = globalThis.clearTimeout; const timers = new Map (); let next = 0;
        globalThis.setTimeout = (callback, delay) => { const id = ++next; timers.set (id, { callback, delay }); return id; };
        globalThis.clearTimeout = id => timers.delete (id);
        try {
            access.socket.close = () => {}; access.reconnectEnabled = true; access.screenshots = false;
            let attempts = 0; access.Connect = async () => { attempts++; throw new Error ('offline'); };
            access.ConnectionLost (); let timer = [...timers.values ()][0]; assert.equal (timer.delay, 1000); await timer.callback ();
            timer = [...timers.values ()].at (-1); assert.equal (timer.delay, 2000); assert.equal (attempts, 1);
            access.Disconnect (); assert.equal (timers.size, 1); // first fired timer is retained by this minimal fake
            await timer.callback (); assert.equal (attempts, 1);
        } finally { globalThis.setTimeout = oldSet; globalThis.clearTimeout = oldClear; }
    });
    it ('executes only the read allowlist and requires a separate screenshot opt-in', async () => {
        const { access, request } = Fixture ();
        await access.Message (request ('scene.inspect'), access.socket, 0); assert.equal (access.socket.sent[0].result.ok, true);
        await assert.rejects (access.Message (request ('auth.sign_out'), access.socket, 0));
        await assert.rejects (access.Message (request ('capture.image'), access.socket, 0));
        await assert.rejects (access.Message (request ('objects.delete'), access.socket, 0));
        await access.Message (request ('objects.delete', true), access.socket, 0); assert.equal (access.socket.sent[1].result.ok, true);
        access.screenshots = true; await access.Message (request ('capture.image'), access.socket, 0); assert.equal (access.socket.sent.length, 3);
    });
    it ('checks account and tab after the registry queue and discards late results', async () => {
        const { website, access, request } = Fixture (); let release;
        const blocked = website.commands.Queue (() => new Promise (resolve => { release = resolve; }));
        await Promise.resolve ();
        const waiting = access.Message (request ('scene.inspect'), access.socket, 0); website.sessionEditor.sessions.active = 'tab-b';
        release (); await blocked; await assert.rejects (waiting); assert.equal (access.socket.sent.length, 0);
        website.sessionEditor.sessions.active = 'tab-a';
        website.commands.commands.get ('scene.inspect').handler = async () => { website.sessionEditor.sessions.revision++; return {}; };
        await assert.rejects (access.Message (request ('scene.inspect'), access.socket, 0)); assert.equal (access.socket.sent.length, 0);
        website.auth.user = { id : 'other' }; await assert.rejects (access.Message (request ('scene.inspect'), access.socket, 0));
    });
});
