import assert from 'node:assert/strict';
import { AgentAccess } from '../../source/website/agentaccess.js';
import { CommandRegistry } from '../../source/website/commandregistry.js';

function Fixture ()
{
    const website = { auth : { user : { id : 'owner' }, Subscribe () {} }, accountReady : true, sessionEditor : { readOnly : false, sessions : { active : 'tab-a', revision : 0, switching : false } } };
    website.commands = new CommandRegistry ({ website });
    website.commands.Register ({ id : 'scene.inspect', mutates : false, inputSchema : { type : 'object', properties : {} } }, async () => ({ objects : [] }));
    website.commands.Register ({ id : 'capture.image', mutates : false, inputSchema : { type : 'object', properties : {} } }, async () => ({ image : true }));
    const access = new AgentAccess (website); access.accountId = 'owner'; access.socket = { sent : [], send (data) { this.sent.push (JSON.parse (data)); } };
    const request = command => ({ data : JSON.stringify ({ type : 'request', command, requestId : 'request-a', sessionId : 'tab-a', arguments : {} }) });
    return { website, access, request };
}
describe ('Browser-side MCP guards', () => {
    it ('executes only the read allowlist and requires a separate screenshot opt-in', async () => {
        const { access, request } = Fixture ();
        await access.Message (request ('scene.inspect'), access.socket, 0); assert.equal (access.socket.sent[0].result.ok, true);
        await assert.rejects (access.Message (request ('auth.sign_out'), access.socket, 0));
        await assert.rejects (access.Message (request ('capture.image'), access.socket, 0));
        access.screenshots = true; await access.Message (request ('capture.image'), access.socket, 0); assert.equal (access.socket.sent.length, 2);
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
