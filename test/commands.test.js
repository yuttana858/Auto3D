import * as assert from 'node:assert/strict';
import { CommandRegistry } from '../source/website/commandregistry.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import * as fs from 'node:fs';

function Registry (context = {}) {
    const registry = new CommandRegistry (context);
    registry.Register ({ id : 'make', title : 'Create', category : 'Objects', description : 'Create an object', mutates : true, inputSchema : { type : 'object', properties : { value : { type : 'number' } }, required : ['value'] } }, ({ value }) => ({ id : 'copy', value }));
    return registry;
}
describe ('Agent commands and macros', () => {
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
