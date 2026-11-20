import assert from 'node:assert/strict';
import { AgentAccess } from '../source/website/agentaccess.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

function Fixture ()
{
    const calls = [];
    const editor = { document : { objects : [] }, readOnly : false, busy : false, sessions : { active : 'session-a', revision : 0, switching : false } };
    const website = { sessionEditor : editor, auth : { user : { id : 'owner' } }, accountReady : true }; editor.website = website;
    website.studioPanel = {
        studio : { Create () { calls.push ('create'); return { objectId : 'solid-1' }; } },
        Inspect () { calls.push ('inspect'); return { busy : editor.busy, available : false, definition : null, units : 'mm' }; },
        Cancel () { calls.push ('cancel'); return { cancelled : true }; }
    };
    website.commands = CreateAgentCommands (website);
    const access = Object.assign (Object.create (AgentAccess.prototype), { website, accountId : 'owner', generation : 7, socket : { readyState : 1 } });
    const request = (command, args = {}, options = {}) => ({ command, arguments : args, sessionId : 'session-a', writeAuthorized : true, ...options });
    const execute = (message, socket = access.socket, generation = access.generation) => AgentAccess.prototype.Execute.call (access, message, socket, generation);
    return { access, website, editor, calls, request, execute };
}

async function Deadline (promise)
{
    let timer;
    try { return await Promise.race ([promise, new Promise ((resolve, reject) => { timer = setTimeout (() => reject (new Error ('Remote inspection or cancellation waited behind the pending modeling task.')), 500); })]); }
    finally { clearTimeout (timer); }
}

describe ('3Dstudio remote MCP execution', () => {
    it ('inspects and cancels a pending remote generation without waiting on the bridge queue', async () => {
        const { website, editor, calls, request, execute } = Fixture ();
        let release, began; const started = new Promise (resolve => { began = resolve; });
        website.studioPanel.studio.Create = () => {
            calls.push ('create'); editor.busy = true; began ();
            return new Promise (resolve => { release = () => { editor.busy = false; resolve ({ cancelled : true }); }; });
        };
        website.studioPanel.Cancel = () => { calls.push ('cancel'); release (); return { cancelled : true }; };
        const pending = execute (request ('studio.create', { type : 'box' })); await started;
        try {
            for (const command of ['studio.inspect', 'studio.history.inspect', 'studio.primitives.list']) {
                const result = await Deadline (execute (request (command))); assert.equal (result.ok, true, command); assert.equal (result.command, command);
                assert.equal (editor.busy, true, 'inspection does not stop generation');
            }
            const cancelled = await Deadline (execute (request ('studio.cancel')));
            assert.equal (cancelled.result.cancelled, true); assert.equal ((await pending).result.cancelled, true);
            assert.deepEqual (calls, ['create', 'inspect', 'inspect', 'cancel']);
        } finally { release (); await pending; }
    });

    it ('rejects stale sockets, connections, sessions and accounts before cancelling', async () => {
        const cases = [
            fixture => ({ socket : { readyState : 1 }, generation : fixture.access.generation }),
            fixture => ({ socket : fixture.access.socket, generation : fixture.access.generation - 1 }),
            fixture => { fixture.editor.sessions.active = 'session-b'; return {}; },
            fixture => { fixture.editor.sessions.switching = true; return {}; },
            fixture => { fixture.website.auth.user = { id : 'other-owner' }; return {}; },
            fixture => { fixture.website.auth.user = null; return {}; },
            fixture => { fixture.website.accountReady = false; return {}; },
            fixture => { fixture.editor.readOnly = true; return {}; }
        ];
        for (const change of cases) {
            const fixture = Fixture (), { socket, generation } = change (fixture);
            await assert.rejects (fixture.execute (fixture.request ('studio.cancel'), socket, generation));
            assert.deepEqual (fixture.calls, [], 'a stale or unauthorized request must never reach Cancel');
        }
    });

    it ('requires a write grant and validates cancellation arguments before the handler', async () => {
        const { calls, request, execute } = Fixture ();
        await assert.rejects (execute (request ('studio.cancel', {}, { writeAuthorized : false })), error => error.agentCode === 'permission_required');
        await assert.rejects (execute (request ('studio.cancel', { force : true })), /Unknown argument/);
        await assert.rejects (execute (request ('studio.cancel', null)), /must be an object/);
        assert.deepEqual (calls, []);
        assert.equal ((await execute (request ('studio.cancel'))).result.cancelled, true); assert.deepEqual (calls, ['cancel']);
    });

    it ('applies the same session and schema guards to immediate inspection commands', async () => {
        for (const command of ['studio.inspect', 'studio.history.inspect', 'studio.primitives.list']) {
            const { access, calls, request, execute } = Fixture ();
            await assert.rejects (execute (request (command), {}, access.generation), error => error.agentCode === 'session_changed');
            await assert.rejects (execute (request (command, {}, { sessionId : 'session-b' })), error => error.agentCode === 'session_changed');
            await assert.rejects (execute (request (command, { unexpected : true })), /Unknown argument/);
            assert.deepEqual (calls, []);
        }
    });

    it ('rechecks connection and tab revision after immediate inspection instead of reporting stale success', async () => {
        for (const change of [
            fixture => { fixture.editor.sessions.revision++; },
            fixture => { fixture.editor.sessions.active = 'session-b'; },
            fixture => { fixture.access.generation++; },
            fixture => { fixture.access.socket = { readyState : 1 }; },
            fixture => { fixture.website.auth.user = { id : 'other-owner' }; }
        ]) {
            const fixture = Fixture ();
            fixture.website.studioPanel.Inspect = async () => { change (fixture); return { available : false }; };
            await assert.rejects (fixture.execute (fixture.request ('studio.inspect')), error => error.agentCode === 'session_changed');
        }
    });
});
