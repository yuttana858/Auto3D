import assert from 'node:assert/strict';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { CreatePrimitiveDefinition, UpdateStudioNode, SetStudioTip, CombineStudioDefinitions, StudioIdentityMatrix } from '../modules/3dstudio/src/definition.js';

const Copy = value => JSON.parse (JSON.stringify (value));
const Mutations = ['studio.create', 'studio.node.update', 'studio.history.set_tip', 'studio.boolean'];
const Readers = ['studio.primitives.list', 'studio.inspect', 'studio.history.inspect', 'studio.cancel', 'ui.3dstudio'];

function Fixture ()
{
    const calls = [], definitions = new Map ();
    const editor = { document : { objects : [] }, selected : null, busy : false, readOnly : false };
    const website = { sessionEditor : editor, auth : { user : { id : 'account-1' } }, accountReady : true };
    editor.website = website;
    const store = (definition, objectId = 'solid-' + (definitions.size + 1)) => {
        definitions.set (objectId, definition); editor.selected = { id : objectId };
        return { objectId, definition : Copy (definition), units : 'mm' };
    };
    const studio = {
        Create (args) { calls.push (['create', Copy (args)]); const { type, parameters, ...options } = args; return store (CreatePrimitiveDefinition (type, parameters, options)); },
        UpdateNode (args) { calls.push (['update', Copy (args)]); const { objectId = editor.selected.id, nodeId, ...patch } = args; return store (UpdateStudioNode (definitions.get (objectId), nodeId, patch), objectId); },
        SetTip (args) { calls.push (['tip', Copy (args)]); const objectId = args.objectId ?? editor.selected.id; return store (SetStudioTip (definitions.get (objectId), args.nodeId), objectId); },
        Boolean (args) { calls.push (['boolean', Copy (args)]); return store (CombineStudioDefinitions (definitions.get (args.targetId), definitions.get (args.toolId), StudioIdentityMatrix, args.operation)); },
        Inspect (args = {}) { calls.push (['inspect', Copy (args)]); const objectId = args.objectId ?? editor.selected?.id ?? null; return { objectId, definition : definitions.has (objectId) ? Copy (definitions.get (objectId)) : null, busy : editor.busy, units : 'mm' }; }
    };
    const panel = { studio, Inspect : args => studio.Inspect (args), Open () { calls.push (['open']); return { opened : true }; }, Cancel () { calls.push (['cancel']); return { cancelled : true }; } };
    website.studioPanel = panel;
    return { editor, website, panel, studio, calls, definitions, registry : CreateAgentCommands (website) };
}

async function Deadline (promise)
{
    let timer;
    try { return await Promise.race ([promise, new Promise ((resolve, reject) => { timer = setTimeout (() => reject (new Error ('Read/cancel command waited behind the pending modeling task.')), 500); })]); }
    finally { clearTimeout (timer); }
}

describe ('3Dstudio agent commands', () => {
    it ('publishes modeling and history tools with the correct mutation boundaries', () => {
        const catalog = Fixture ().registry.Catalog ();
        for (const id of Mutations) { assert.equal (catalog.find (command => command.id === id)?.mutates, true, id); }
        for (const id of Readers) { assert.equal (catalog.find (command => command.id === id)?.mutates, false, id); }
        assert.equal (catalog.filter (command => [...Mutations, ...Readers].includes (command.id)).length, 9);
    });

    it ('passes physical dimensions, material and editable local placement to the shared workspace', async () => {
        const { registry, calls, definitions } = Fixture ();
        const args = { type : 'box', parameters : { widthMm : 25.4, heightMm : 50.8, depthMm : 76.2 }, name : 'Carton insert', material : { color : '#abcdef', roughness : .23, metalness : .5, opacity : .8 }, transform : { position : [12, 0, -9], rotation : [0, 90, 0], scale : [1, 2, 1] } };
        const before = Copy (args), created = await registry.Execute ('studio.create', args);
        assert.equal (created.ok, true, created.error?.message); assert.equal (created.result.units, 'mm'); assert.deepEqual (calls[0], ['create', args]); assert.deepEqual (args, before);
        const nodeId = created.result.definition.rootId, objectId = created.result.objectId;
        const updated = await registry.Execute ('studio.node.update', { objectId, nodeId, parameters : { widthMm : 40 }, material : { opacity : .4 } });
        assert.equal (updated.ok, true, updated.error?.message); assert.equal (updated.result.objectId, objectId);
        assert.equal (definitions.get (objectId).nodes[0].parameters.widthMm, 40); assert.equal (definitions.get (objectId).nodes[0].material.opacity, .4);
        assert.deepEqual (created.result.definition.nodes[0].parameters, before.parameters, 'the earlier command result remains an immutable snapshot');
        const inspected = await registry.Execute ('studio.history.inspect', { objectId });
        assert.deepEqual (inspected.result.definition, updated.result.definition);
        assert.equal ((await registry.Execute ('ui.3dstudio')).result.opened, true);
    });

    it ('rejects malformed nested arguments and impossible primitive shapes before generation begins', async () => {
        const { registry, calls } = Fixture ();
        const invalid = [
            ['studio.create', { type : 'box', parameters : { unexpected : 12 } }],
            ['studio.create', { type : 'sphere', parameters : { diameterMm : Infinity } }],
            ['studio.create', { type : 'sphere', parameters : { segments : 32.5 } }],
            ['studio.create', { type : 'tube', parameters : { outerDiameterMm : 40, innerDiameterMm : 45 } }],
            ['studio.create', { type : 'box', parameters : { diameterMm : 40 } }],
            ['studio.create', { type : 'box', material : { opacity : 2 } }],
            ['studio.create', { type : 'box', transform : { scale : [1, 0, 1] } }],
            ['studio.create', { type : 'box', transform : { position : [0, 1] } }],
            ['studio.create', { type : 'box', url : 'https://invalid.example/model' }],
            ['studio.node.update', { nodeId : 'primitive-1', parameters : { custom : 1 } }],
            ['studio.node.update', { nodeId : 'primitive-1', material : { roughness : -1 } }],
            ['studio.node.update', { nodeId : 'primitive-1', transform : { rotation : [0, null, 0] } }],
            ['studio.node.update', { nodeId : 'primitive-1', kind : 'boolean' }],
            ['studio.history.set_tip', {}],
            ['studio.history.set_tip', { nodeId : 1 }],
            ['studio.boolean', { operation : 'cut' }],
            ['studio.boolean', { operation : 'union', keepOperands : 'yes' }],
            ['studio.cancel', { anything : true }]
        ];
        for (const [id, args] of invalid) { const result = await registry.Execute (id, args); assert.equal (result.ok, false, id + ': ' + JSON.stringify (args)); }
        assert.deepEqual (calls, [], 'invalid requests never enter workspace mutation methods');
    });

    it ('creates solids, combines them and revisits editable history through macro result references', async () => {
        const { registry, definitions } = Fixture ();
        const run = await registry.RunMacro ({ version : 1, steps : [
            { id : 'base', command : 'studio.create', arguments : { type : 'box', parameters : { widthMm : 80 } } },
            { id : 'cutter', command : 'studio.create', arguments : { type : 'cylinder', parameters : { diameterMm : 20, heightMm : 100 } } },
            { id : 'cut', command : 'studio.boolean', arguments : { operation : 'subtract', targetId : { $ref : 'base.objectId' }, toolId : { $ref : 'cutter.objectId' }, keepOperands : true, name : 'Cut block' } },
            { id : 'edit', command : 'studio.node.update', arguments : { objectId : { $ref : 'cut.objectId' }, nodeId : { $ref : 'base.definition.rootId' }, parameters : { widthMm : 120 } } },
            { id : 'back', command : 'studio.history.set_tip', arguments : { objectId : { $ref : 'cut.objectId' }, nodeId : { $ref : 'base.definition.rootId' } } },
            { id : 'resume', command : 'studio.history.set_tip', arguments : { objectId : { $ref : 'cut.objectId' }, nodeId : null } }
        ] });
        assert.equal (run.ok, true, run.error?.message); assert.equal (run.completed.length, 6);
        const [base, , cut, edit, back, resumed] = run.completed.map (step => step.result);
        assert.equal (back.definition.rootId, base.definition.rootId); assert.equal (back.definition.tipId, cut.definition.rootId);
        assert.equal (resumed.definition.rootId, cut.definition.rootId); assert.equal (resumed.definition.nodes.find (node => node.id === base.definition.rootId).parameters.widthMm, 120);
        assert.equal (definitions.get (base.objectId).nodes[0].parameters.widthMm, 80, 'editing copied history leaves the original operand intact');
        assert.equal (edit.objectId, cut.objectId); assert.equal (resumed.definition.nodes.length, cut.definition.nodes.length);
    });

    it ('blocks modeling mutations in read-only, busy and unauthenticated sessions', async () => {
        const cases = [
            ['studio.create', { type : 'box' }],
            ['studio.node.update', { nodeId : 'primitive-1', parameters : { widthMm : 100 } }],
            ['studio.history.set_tip', { nodeId : null }],
            ['studio.boolean', { operation : 'union' }]
        ];
        for (const mode of ['readOnly', 'busy', 'signedOut']) {
            const { registry, editor, website, calls } = Fixture ();
            if (mode === 'signedOut') { website.auth.user = null; } else { editor[mode] = true; }
            for (const [id, args] of cases) { assert.equal ((await registry.Execute (id, args)).ok, false, mode + ': ' + id); }
            assert.deepEqual (calls, []);
            if (mode === 'readOnly') { assert.equal ((await registry.Execute ('studio.inspect')).ok, true); }
            if (mode === 'signedOut') { assert.equal ((await registry.Execute ('studio.cancel')).ok, false); }
        }
    });

    it ('allows bounded inspection and cancellation to bypass a pending modeling command', async () => {
        const { registry, editor, studio, panel } = Fixture ();
        let release, began; const started = new Promise (resolve => { began = resolve; });
        studio.Create = () => { editor.busy = true; began (); return new Promise (resolve => { release = () => { editor.busy = false; resolve ({ cancelled : true }); }; }); };
        panel.Cancel = () => { release (); return { cancelled : true }; };
        const pending = registry.Execute ('studio.create', { type : 'box' }); await started;
        try {
            for (const id of ['studio.inspect', 'studio.history.inspect', 'studio.primitives.list']) { assert.equal ((await Deadline (registry.Execute (id))).ok, true, id); }
            const result = await Deadline (registry.Execute ('studio.cancel')); assert.equal (result.ok, true); assert.equal (result.result.cancelled, true);
        } finally { release (); await pending; }
    });
});
