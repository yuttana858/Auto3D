import assert from 'node:assert/strict';
import { ErrorLogs, RedactLogText } from '../source/website/errorlogs.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
function Fixture () {
    const data = new Map (); const events = {}; const storage = { getItem : (key) => data.get (key), setItem : (key, value) => data.set (key, value), removeItem : (key) => data.delete (key) };
    const environment = { navigator : { userAgent : 'Test browser' }, console : { error : () => {}, warn : () => {} }, addEventListener : (key, callback) => { events[key] = callback; }, document : { addEventListener : (key, callback) => { events[key] = callback; } }, fetch : async () => ({ ok : false, status : 503 }) };
    return { log : new ErrorLogs (environment, storage), data, storage, environment, events };
}
describe ('Browser diagnostics', () => {
    it ('captures runtime, rejected requests, promise and WebGL errors without request bodies', async () => {
        const { log, events, environment } = Fixture (); log.Install (); log.BindAccount ('one');
        events.error ({ message : 'Problem', error : new Error ('Problem') }); events.unhandledrejection ({ reason : new Error ('Rejected') }); events.webglcontextlost ();
        environment.console.error ('WebGL problem', { password : 'must-not-log' }); await environment.fetch ('https://app.example/api/accounts/admin?token=hidden', { headers : { Authorization : 'Bearer must-not-log' }, body : 'password=must-not-log' });
        const output = log.Export ().text; assert.ok (output.includes ('HTTP 503 /api/accounts/admin')); assert.ok (output.includes ('Rendering context lost')); assert.ok (!output.includes ('must-not-log')); assert.ok (!output.includes ('token=hidden'));
    });
    it ('redacts credential patterns, JSON values and URL queries', () => {
        assert.ok (!RedactLogText ('Authorization=Bearer hidden-bearer').includes ('hidden-bearer'));
        const result = RedactLogText ('password="hidden phrase" {"api_key":"hidden-key"} Authorization=Bearer hidden-bearer https://user:pass@app.example/x?access_token=hidden-query#hidden-fragment sb_secret_hidden-secret eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature');
        for (const secret of ['hidden phrase', 'hidden-key', 'hidden-bearer', 'hidden-query', 'hidden-fragment', 'hidden-secret', 'signature', 'user:pass']) { assert.ok (!result.includes (secret), result); }
    });
    it ('bounds/deduplicates entries, survives refresh and clears account-scoped tab storage', () => {
        const { log, data, storage, environment } = Fixture (); log.Record ('error', 'startup', 'early error'); log.BindAccount ('one'); assert.equal (log.List ().entries.length, 1);
        for (let i = 0; i < 220; i++) { log.Record ('error', 'test', 'Error ' + i); } log.Record ('error', 'test', 'Error 219'); assert.equal (log.entries.length, 200); assert.equal (log.entries.at (-1).count, 2);
        const restored = new ErrorLogs (environment, storage); restored.BindAccount ('one'); assert.equal (restored.entries.length, 200);
        restored.BindAccount ('two'); assert.equal (restored.entries.length, 0); assert.equal (data.has ('auto3d-error-log-v1:one'), false); restored.Record ('warning', 'test', 'two'); restored.BindAccount (null); assert.equal (data.has ('auto3d-error-log-v1:two'), false);
        log.listeners.add (() => { throw new Error ('panel failed'); }); assert.doesNotThrow (() => log.Clear ());
    });
    it ('supports strict command execution and read-only review macros', async () => {
        const { log } = Fixture (); log.Record ('error', 'test', 'example'); const commands = CreateAgentCommands ({ sessionEditor : { readOnly : true, website : { errorLogs : log } }, errorLogs : log });
        const macro = await commands.RunMacro ({ version : 1, steps : [{ id : 'read', command : 'diagnostics.list', arguments : { level : 'error' } }, { id : 'export', command : 'diagnostics.export', arguments : {} }] }); assert.equal (macro.ok, true); assert.equal (macro.completed[0].result.entries.length, 1);
        assert.equal ((await commands.Execute ('diagnostics.list', { level : 'bad' })).ok, false); assert.equal ((await commands.Execute ('diagnostics.clear', { token : 'bad' })).ok, false); assert.ok (log.List ().entries.some ((entry) => entry.source === 'command')); assert.equal ((await commands.Execute ('diagnostics.clear')).ok, true);
    });
});
