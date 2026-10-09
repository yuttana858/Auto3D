import assert from 'node:assert/strict';
import { ParseCommandText, ExecuteCommandText } from '../source/website/commandtext.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { SessionEditor } from '../source/website/sessioneditor.js';

function fixture () {
    const selected = { id : 'model', name : 'Model' }; const events = [];
    const editor = { selected, readOnly : false, busy : false, document : { objects : [selected] }, Select : item => { editor.selected = item; },
        CreateArray : async (w, l, h) => { events.push (['array', w, l, h]); return Array.from ({ length : w * l * h - 1 }, (_, i) => ({ id : 'copy' + i })); },
        FitScene : () => events.push ('fit'), SetMode : mode => events.push (mode), Focus : () => events.push ('focus'),
        Undo : async () => events.push ('undo'), history : { undo : [], redo : [] } };
    const registry = CreateAgentCommands ({ sessionEditor : editor, FitModelToWindow : () => events.push ('fit') });
    return { editor, registry, events };
}
describe ('Typed commands and macros', () => {
    it ('uses W/L/H dimensions for the requested 4x4x6 array, without evaluating input as code', async () => {
        const { registry, events } = fixture ();
        const result = await registry.Execute ('commands.text', { text : 'Array model 4 x 4 × 6' });
        assert.equal (result.ok, true); assert.deepEqual (events, [['array', 4, 4, 6]]); assert.equal (result.result.completed[0].result.total, 96);
    });
    it ('runs activation and sequential commands on shared handlers', async () => {
        const { registry, events } = fixture ();
        const result = await registry.Execute ('commands.text', { text : 'move model; fit; undo' });
        assert.equal (result.ok, true); assert.deepEqual (events, ['translate', 'fit', 'undo']); assert.equal (result.result.completed.length, 3);
    });
    it ('rejects unknown or oversized input before any sequence action runs', async () => {
        const { registry, events } = fixture ();
        for (const text of ['fit; array model 20x20x20', 'fit; publish everything', 'fit;;undo', 'array model 1.5x2x2', 'fit; alert(1)', 'x'.repeat (2001)]) {
            assert.equal ((await registry.Execute ('commands.text', { text })).ok, false);
        }
        assert.deepEqual (events, []); assert.throws (() => ParseCommandText (''), /Enter a command/);
        assert.equal ((await registry.Execute ('commands.text', { text : 'fit', extra : true })).ok, false);
    });
    it ('retains read-only, account and selected-object checks through text dispatch', async () => {
        const { registry, editor, events } = fixture (); editor.readOnly = true;
        assert.equal ((await registry.Execute ('commands.text', { text : 'array model 4x4x6' })).ok, false);
        assert.equal ((await registry.Execute ('commands.text', { text : 'move model' })).ok, false);
        assert.equal ((await registry.Execute ('commands.text', { text : 'add model' })).ok, false);
        assert.equal ((await registry.Execute ('commands.text', { text : 'export' })).ok, false);
        assert.equal ((await registry.Execute ('commands.text', { text : 'fit' })).ok, true);
        editor.readOnly = false; editor.selected = null;
        assert.equal ((await registry.Execute ('commands.text', { text : 'array model 4x4x6' })).ok, false);
        editor.website = { auth : { user : null }, accountReady : false };
        assert.equal ((await registry.Execute ('commands.text', { text : 'fit' })).ok, false); assert.deepEqual (events, ['fit']);
    });
    it ('executes a saved macro without queue deadlock and stops nested macros', async () => {
        const { registry, events } = fixture (); const macro = { version : 1, steps : [{ id : 'fit', command : 'view.fit' }] };
        registry.commands.get ('macro.list').handler = () => [{ name : 'Layout', macro }];
        const result = await registry.Execute ('commands.text', { text : 'run macro layout' });
        assert.equal (result.ok, true); assert.deepEqual (events, ['fit']);
        assert.equal ((await registry.Execute ('commands.text', { text : 'run macro missing' })).ok, false);
        const nested = await registry.RunMacro ({ version : 1, steps : [{ id : 'recursive', command : 'commands.text', arguments : { text : 'run macro layout' } }] });
        assert.equal (nested.ok, false); assert.match (nested.error.message, /Nested macros/); assert.equal (registry.running, null);
    });
    it ('prevalidates saved macros before mutation', async () => {
        const { registry, events } = fixture ();
        registry.commands.get ('macro.list').handler = () => [{ name : 'Invalid', macro : { version : 1, steps : [{ id : 'fit', command : 'view.fit' }, { id : 'bad', command : 'object.array', arguments : { width : 99, length : 1, height : 1 } }] } }];
        await assert.rejects (() => ExecuteCommandText (registry, 'macro Invalid'), /out of range/); assert.deepEqual (events, []);
    });
    it ('matches context-menu actions to tool-strip availability, including no selection and busy state', () => {
        const editor = Object.create (SessionEditor.prototype); editor.document = { objects : [] }; editor.history = { undo : [], redo : [] }; editor.busy = false; editor.readOnly = false; editor.selected = null;
        const tools = editor.ModelTools (); const menu = editor.ModelToolMenu (); assert.deepEqual (menu.map (item => item.name), tools.map (item => item[1]));
        assert.equal (menu.find (item => item.name === 'Array selected object').disabled, true);
        editor.selected = {}; assert.equal (editor.ModelToolMenu ().find (item => item.name === 'Array selected object').disabled, false);
        editor.busy = true; assert.ok (editor.ModelToolMenu ().every (item => item.disabled));
        editor.busy = false; editor.readOnly = true; assert.equal (editor.ModelToolMenu ().find (item => item.name === 'Delete object').disabled, true);
    });
});
