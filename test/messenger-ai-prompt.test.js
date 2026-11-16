import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { CommandBar } from '../source/website/commandbar.js';
import { MessengerAIHistory, EncodeCommand, DecodeEntry } from '../source/website/messengeraistory.js';

// The command box and the Messenger AI tab share one prompt: commands run, other text goes to an agent,
// and both are saved to AI history.
function Bar ({ connected = true, execute } = {})
{
    const bar = Object.create (CommandBar.prototype); const events = [];
    Object.assign (bar, { log : [], nextId : 1, running : false, ownStatus : null,
        status : { textContent : '', dataset : {} }, root : { dispatchEvent : event => events.push (event.detail) },
        input : {}, run : {}, browse : {},
        website : { sessionEditor : { busy : false }, agentAccess : { socket : { readyState : connected ? 1 : 3 } }, commands : { Execute : execute } } });
    return { bar, events };
}
const ok = completed => async () => ({ ok : true, result : { ok : true, completed } });
const unknown = async () => ({ ok : true, result : { ok : false, error : { message : 'Unknown command: hello' } } });

describe ('Shared AI prompt (command bar and Messenger AI tab)', () => {
    it ('runs commands and records them with their success', async () => {
        const { bar, events } = Bar ({ execute : ok ([{ command : 'object.array', result : { total : 96 } }]) });
        const result = await bar.Submit ('array model 4x4x6');
        assert.deepEqual ({ accepted : result.accepted, kind : result.kind, ok : result.ok }, { accepted : true, kind : 'command', ok : true });
        assert.deepEqual (events.map (({ from, kind, text, ok }) => ({ from, kind, text, ok })), [{ from : 'user', kind : 'command', text : 'array model 4x4x6', ok : true }]);
        assert.equal (bar.status.textContent, 'Array created · 96 objects'); assert.equal (bar.running, false);
    });
    it ('sends non-command text to a connected agent and keeps failed commands without an agent', async () => {
        const { bar, events } = Bar ({ execute : unknown });
        const sent = await bar.Submit ('make the lid taller'); assert.deepEqual ([sent.accepted, sent.kind], [true, 'message']);
        assert.deepEqual ([events[0].from, events[0].kind, events[0].text], ['user', 'message', 'make the lid taller']);
        const offline = Bar ({ connected : false, execute : unknown }); const failed = await offline.bar.Submit ('hello');
        assert.deepEqual ([failed.accepted, failed.kind, failed.ok], [false, 'command', false]); assert.equal (offline.events[0].ok, false);
        const kept = await offline.bar.Submit ('hello', { keepForAgent : true }); assert.deepEqual ([kept.accepted, kept.kind], [true, 'message']); assert.equal (offline.events[1].kind, 'message');
    });
    it ('routes @agent text to the agent without running it, and rejects empty, long or busy input', async () => {
        let ran = false; const { bar, events } = Bar ({ execute : async () => { ran = true; } });
        assert.equal ((await bar.Submit ('@agent: check the flaps')).kind, 'message'); assert.equal (ran, false); assert.equal (events[0].text, 'check the flaps');
        assert.equal ((await bar.Submit ('   ')).accepted, false); assert.equal ((await bar.Submit ('x'.repeat (2001))).accepted, false);
        bar.website.sessionEditor.busy = true; assert.equal ((await bar.Submit ('fit')).kind, 'busy'); assert.equal (events.length, 1);
    });
    it ('encodes saved commands so history shows them as commands', () => {
        assert.deepEqual (DecodeEntry (EncodeCommand ('fit', true)), { kind : 'command', ok : true, text : 'fit' });
        assert.deepEqual (DecodeEntry (EncodeCommand ('nope', false)), { kind : 'command', ok : false, text : 'nope' });
        assert.deepEqual (DecodeEntry ('[commandish] hi'), { kind : 'message', text : '[commandish] hi' });
    });
    it ('saves commands typed in either box to AI history, but not app status lines', async () => {
        const sent = []; const auth = { user : { id : 'one' }, Subscribe () {} };
        const service = { async List () { return { conversations : [{ id : 'ai', kind : 'ai' }] }; }, async Read () { return { messages : [] }; }, async Send (id, body, origin, messageId) { sent.push ({ body, origin }); return { message : { id : messageId, body, origin, created_at : new Date ().toISOString () } }; } };
        const history = new MessengerAIHistory ({ service, tab : 'ai', root : { hidden : true }, website : { auth }, RenderConversation () {} });
        const at = Date.now ();
        history.Record ({ from : 'user', kind : 'command', text : 'fit', ok : true, at });
        history.Record ({ from : 'user', kind : 'command', text : 'explode', ok : false, at });
        history.Record ({ from : 'app', kind : 'status', text : 'Completed · 1 command', at });
        history.Record ({ from : 'agent', kind : 'response', text : 'Done.', at });
        for (let i = 0; i < 200 && (history.busy || history.pending.length); i++) { await new Promise (resolve => setTimeout (resolve, 5)); }
        assert.deepEqual (sent, [{ body : '[command] fit', origin : 'user' }, { body : '[command failed] explode', origin : 'user' }, { body : 'Done.', origin : 'agent' }]);
    });
});
