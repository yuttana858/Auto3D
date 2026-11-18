import assert from 'node:assert/strict';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { CheckMacro, MacroWarnings } from '../source/website/commandregistry.js';
import { SceneHistory } from '../source/website/scenedocument.js';

const schema = { type : 'object', properties : {} };
function Fixture ()
{
    const editor = { document : { objects : [] }, history : new SceneHistory (), busy : false }; const registry = CreateAgentCommands ({ sessionEditor : editor });
    return { editor, registry };
}
function Storage ()
{
    const store = new Map (); const previous = globalThis.localStorage;
    globalThis.localStorage = { getItem : key => store.has (key) ? store.get (key) : null, setItem : (key, value) => store.set (key, String (value)), removeItem : key => store.delete (key) };
    return () => { globalThis.localStorage = previous; };
}

describe ('Macro runs', () => {
    it ('waits for a step’s playback to release the viewer before the next step', async () => {
        const { editor, registry } = Fixture (), order = [];
        registry.Register ({ id : 'test.play', mutates : false, inputSchema : schema }, () => { editor.busy = true; order.push ('started'); setTimeout (() => { order.push ('finished'); editor.busy = false; }, 250); return { started : true }; });
        registry.Register ({ id : 'test.next', mutates : false, inputSchema : schema }, () => { order.push ('next'); return 'ran'; });
        const result = await registry.RunMacro ({ version : 1, steps : [{ id : 'play', command : 'test.play' }, { id : 'next', command : 'test.next' }] });
        assert.equal (result.ok, true, JSON.stringify (result)); assert.deepEqual (order, ['started', 'finished', 'next']);
    });
    it ('cancels while a step waits for its playback', async () => {
        const { editor, registry } = Fixture ();
        registry.Register ({ id : 'test.play', mutates : false, inputSchema : schema }, () => { editor.busy = true; return {}; });
        registry.Register ({ id : 'test.next', mutates : false, inputSchema : schema }, () => 'ran');
        const running = registry.RunMacro ({ version : 1, steps : [{ id : 'play', command : 'test.play' }, { id : 'next', command : 'test.next' }] });
        await new Promise (resolve => setTimeout (resolve, 150)); await registry.Execute ('macro.cancel', {});
        const result = await running; assert.equal (result.cancelled, true); assert.equal (result.completed.length, 1); editor.busy = false;
    });
    it ('collapses the run into one Undo step, including after a failed step', async () => {
        const { editor, registry } = Fixture (); let value = 0;
        editor.history.Push ({ undo : () => {}, redo : () => {} });
        registry.Register ({ id : 'test.add', mutates : false, inputSchema : schema }, () => { const before = value; value += 1; const after = value; editor.history.Push ({ undo : () => { value = before; }, redo : () => { value = after; } }); return value; });
        registry.Register ({ id : 'test.fail', mutates : false, inputSchema : schema }, () => { throw new Error ('stop'); });
        const ok = await registry.RunMacro ({ version : 1, steps : ['a', 'b', 'c'].map (id => ({ id, command : 'test.add' })) });
        assert.equal (ok.ok, true); assert.equal (value, 3); assert.equal (editor.history.undo.length, 2); assert.equal (editor.history.undo.at (-1).steps, 3);
        await editor.history.Undo (); assert.equal (value, 0); await editor.history.Redo (); assert.equal (value, 3);
        assert.equal (Object.hasOwn (editor.history, 'Push'), false);
        const failed = await registry.RunMacro ({ version : 1, steps : [{ id : 'a', command : 'test.add' }, { id : 'b', command : 'test.add' }, { id : 'c', command : 'test.fail' }] });
        assert.equal (failed.failedStep, 'c'); assert.equal (value, 5); await editor.history.Undo (); assert.equal (value, 3);
    });
    it ('only lets a session tab change be the last step', () => {
        const { registry } = Fixture ();
        assert.throws (() => CheckMacro ({ version : 1, steps : [{ id : 'tab', command : 'session.tabs.new' }, { id : 'fit', command : 'view.fit' }] }, registry.commands), /only be the last step/);
        assert.doesNotThrow (() => CheckMacro ({ version : 1, steps : [{ id : 'fit', command : 'view.fit' }, { id : 'tab', command : 'session.tabs.new' }] }, registry.commands));
    });
    it ('saves, exports and deletes macros with replay warnings', async () => {
        const restore = Storage ();
        try {
            const { registry } = Fixture ();
            const macro = { version : 1, steps : [{ id : 'board', command : 'packaging.boards.select', arguments : { id : 'account-board-7' } }, { id : 'fit', command : 'view.fit', arguments : {} }] };
            const saved = await registry.Execute ('macro.save', { name : 'Demo1', definition : JSON.stringify (macro) }); assert.equal (saved.ok, true, JSON.stringify (saved));
            assert.equal (saved.result.warnings.length, 1); assert.equal (saved.result.warnings[0].step, 'board');
            assert.deepEqual (MacroWarnings ({ steps : [{ id : 'b', arguments : { id : 'nominal-e', objectId : { $ref : 'a.id' } } }] }), []);
            const exported = await registry.Execute ('macro.export', { name : 'demo1' }); assert.deepEqual (JSON.parse (exported.result.definition), macro);
            assert.equal ((await registry.Execute ('macro.save', { name : 'Bad', definition : JSON.stringify ({ version : 1, steps : [{ id : 'x', command : 'no.such' }] }) })).ok, false);
            assert.equal ((await registry.Execute ('macro.delete', { name : 'DEMO1' })).result.remaining, 0);
            assert.equal ((await registry.Execute ('macro.delete', { name : 'demo1' })).ok, false);
        } finally { restore (); }
    });
});
