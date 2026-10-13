import * as assert from 'node:assert/strict';
import { CommandRegistry } from '../source/website/commandregistry.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import * as fs from 'node:fs';
import { Unit } from '../source/engine/model/unit.js';

function Registry (context = {}) {
    const registry = new CommandRegistry (context);
    registry.Register ({ id : 'make', title : 'Create', category : 'Objects', description : 'Create an object', mutates : true, inputSchema : { type : 'object', properties : { value : { type : 'number' } }, required : ['value'] } }, ({ value }) => ({ id : 'copy', value }));
    return registry;
}
describe ('Agent commands and macros', () => {
    it ('opens the same save service for account/file destinations and rejects invalid macro inputs', async () => {
        const calls = [];
        const commands = CreateAgentCommands ({ sessionEditor : { library : { SaveDialog : async file => { calls.push (file); } } } });
        assert.equal ((await commands.Execute ('ui.save')).ok, true); assert.deepEqual (calls, [true]);
        const macro = await commands.RunMacro ({ version : 1, steps : [{ id : 'save', command : 'ui.save', arguments : { destination : 'account' } }] });
        assert.equal (macro.ok, true); assert.deepEqual (calls, [true, false]);
        assert.equal ((await commands.Execute ('ui.save', { destination : 'invalid' })).ok, false); assert.deepEqual (calls, [true, false]);
    });
    it ('converts array gaps once, validates before mutation and supports macros', async () => {
        const item = { id : 'box', unit : Unit.Millimeter }; const calls = [];
        const editor = { document : { objects : [item] }, selected : item, Select : value => { editor.selected = value; }, CreateArray : async (...args) => { calls.push (args); return [{}]; } };
        const registry = CreateAgentCommands ({ sessionEditor : editor, preferences : { units : 'standard' } });
        assert.equal ((await registry.Execute ('object.array', { width : 2, length : 1, height : 1, gap : { width : 1, height : 2, length : 3 } })).ok, true);
        assert.deepEqual (calls[0][3].gap, { x : 25.4, y : 50.8, z : 76.2 });
        const macro = await registry.RunMacro ({ version : 1, steps : [{ id : 'array', command : 'object.array', arguments : { width : 2, length : 1, height : 1, gap : { width : 10 }, units : 'model' } }] });
        assert.equal (macro.ok, true); assert.deepEqual (calls[1][3].gap, { x : 10, y : 0, z : 0 });
        for (const gap of [{ width : -1 }, { width : Infinity }, { depth : 2 }]) { assert.equal ((await registry.Execute ('object.array', { width : 2, length : 1, height : 1, gap })).ok, false); }
        assert.equal (calls.length, 2); editor.readOnly = true;
        assert.equal ((await registry.Execute ('object.array', { width : 2, length : 1, height : 1 })).ok, false);
    });
    it ('searches metadata without exposing handlers and matches published catalog', () => {
        const commands = CreateAgentCommands ({ sessionEditor : {} });
        assert.ok (commands.Catalog ('material').length > 0);
        assert.ok (commands.Catalog ().every ((command) => !command.handler));
        assert.deepEqual (JSON.parse (fs.readFileSync ('website/assets/commands.json')).commands, commands.Catalog ());
    });
    it ('rejects unknown, malformed, nonfinite and read-only mutations', async () => {
        const registry = Registry ();
        for (const [id, args] of [['nope', {}], ['make', {}], ['make', { value : NaN }], ['make', { value : 1, extra : true }]]) { assert.equal ((await registry.Execute (id, args)).ok, false); }
        assert.equal ((await Registry ({ readOnly : true }).Execute ('make', { value : 1 })).ok, false);
    });
    it ('resolves prior results and stops without executing later failed steps', async () => {
        const registry = Registry ();
        const macro = { version : 1, steps : [
            { id : 'first', command : 'make', arguments : { value : 2 } },
            { id : 'next', command : 'make', arguments : { value : { $ref : 'first.value' } } }
        ] };
        const success = await registry.RunMacro (macro); assert.equal (success.ok, true); assert.equal (success.completed[1].result.value, 2);
        macro.steps[1].arguments.value.$ref = 'first.missing';
        const failure = await registry.RunMacro (macro); assert.equal (failure.failedStep, 'next'); assert.equal (failure.completed.length, 1);
    });
    it ('preflights invalid static inputs before mutating', async () => {
        const result = await Registry ().RunMacro ({ version : 1, steps : [
            { id : 'first', command : 'make', arguments : { value : 1 } }, { id : 'bad', command : 'make', arguments : { value : 'wrong' } }
        ] });
        assert.equal (result.ok, false); assert.equal (result.completed.length, 0);
    });
    it ('serializes execution and cancels between completed steps', async () => {
        const registry = Registry (); let release; let started;
        const began = new Promise ((resolve) => { started = resolve; });
        registry.Register ({ id : 'wait', inputSchema : { type : 'object', properties : {} } }, async () => { started (); await new Promise ((resolve) => { release = resolve; }); return 'done'; });
        const running = registry.RunMacro ({ version : 1, steps : [{ id : 'wait', command : 'wait' }, { id : 'later', command : 'make', arguments : { value : 1 } }] });
        await began; const queued = registry.Execute ('make', { value : 3 }); registry.Cancel (); release ();
        const result = await running; assert.equal (result.cancelled, true); assert.equal (result.completed.length, 1);
        assert.equal ((await queued).result.value, 3);
    });
});

describe ('Polygon worker cancellation commands', () => {
    it ('can interrupt a pending preview without bypassing auth or input validation', async () => {
        const context = { busy : false }; const registry = new CommandRegistry (context); let release;
        registry.Register ({ id : 'preview', inputSchema : { type : 'object', properties : {}, required : [] } }, async () => { context.busy = true; await new Promise ((resolve) => { release = resolve; }); context.busy = false; return {}; });
        registry.Register ({ id : 'polygon.cancel', inputSchema : { type : 'object', properties : {}, required : [], additionalProperties : false } }, () => { release (); return { cancelled : true }; });
        const pending = registry.Execute ('preview'); await new Promise ((resolve) => setTimeout (resolve, 0));
        assert.equal ((await registry.Execute ('polygon.cancel', { extra : true })).ok, false); assert.equal (context.busy, true);
        assert.equal ((await registry.Execute ('polygon.cancel')).result.cancelled, true); assert.equal ((await pending).ok, true);
        context.website = { auth : { user : null } }; assert.equal ((await registry.Execute ('polygon.cancel')).ok, false);
    });
});
