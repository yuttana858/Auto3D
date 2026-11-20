import assert from 'node:assert/strict';
import { StudioPrimitives, DefaultStudioParameters, CreatePrimitiveDefinition, ValidateStudioDefinition, UpdateStudioNode, SetStudioTip, CombineStudioDefinitions, CombineStudioDefinitionsWithMap } from '../src/definition.js';

const Identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const Copy = value => JSON.parse (JSON.stringify (value));
const Root = definition => definition.nodes.find (node => node.id === definition.rootId);
function Combined ()
{
    const box = CreatePrimitiveDefinition ('box', { widthMm : 80, heightMm : 60, depthMm : 40 }, { material : { color : '#c03020' } });
    const sphere = CreatePrimitiveDefinition ('sphere', { diameterMm : 30 }, { material : { color : '#20a0c0' } });
    sphere.nodes[0].id = box.rootId; sphere.rootId = box.rootId; sphere.tipId = box.rootId;
    const matrix = [...Identity]; matrix[12] = 15; matrix[13] = 20;
    const originalBox = Copy (box), originalSphere = Copy (sphere);
    return { box, sphere, matrix, originalBox, originalSphere, definition : CombineStudioDefinitions (box, sphere, matrix, 'subtract') };
}

describe ('3Dstudio authoring definitions', () => {
    it ('creates an independently editable canonical-mm definition for every primitive', () => {
        const expected = ['box', 'capsule', 'cone', 'cylinder', 'sphere', 'torus', 'tube'];
        assert.deepEqual (Object.keys (StudioPrimitives).sort (), expected);
        for (const type of expected) {
            const defaults = DefaultStudioParameters (type), definition = CreatePrimitiveDefinition (type), node = Root (definition);
            assert.equal (definition.schemaVersion, 1); assert.equal (definition.units, 'mm');
            assert.equal (definition.tipId, definition.rootId); assert.equal (definition.nodes.length, 1);
            assert.equal (node.kind, 'primitive'); assert.equal (node.type, type); assert.deepEqual (node.parameters, defaults);
            assert.deepEqual (node.transform, { position : [0, 0, 0], rotation : [0, 0, 0], scale : [1, 1, 1] });
            assert.deepEqual (ValidateStudioDefinition (Copy (definition)), definition);
            const key = Object.keys (defaults)[0]; defaults[key] = -10;
            assert.notEqual (DefaultStudioParameters (type)[key], -10, 'default parameters must not share mutable state');
        }
    });

    it ('updates dimensions, finish and local placement without mutating its input recipe', () => {
        const definition = CreatePrimitiveDefinition ('box'), original = Copy (definition), node = Root (definition);
        const updated = UpdateStudioNode (definition, node.id, { parameters : { widthMm : 125 }, material : { color : '#123456', roughness : .2 }, transform : { position : [2, 3, 4], scale : [-1, 2, .5] } });
        const changed = Root (updated);
        assert.equal (changed.parameters.widthMm, 125); assert.equal (changed.parameters.heightMm, node.parameters.heightMm);
        assert.equal (changed.material.color, '#123456'); assert.equal (changed.material.roughness, .2); assert.equal (changed.material.metalness, node.material.metalness);
        assert.deepEqual (changed.transform.position, [2, 3, 4]); assert.deepEqual (changed.transform.rotation, [0, 0, 0]); assert.deepEqual (changed.transform.scale, [-1, 2, .5]);
        changed.transform.position[0] = 900; changed.material.color = '#abcdef'; assert.deepEqual (definition, original);
    });

    it ('combines colliding IDs while preserving both operands, materials and relative placement', () => {
        const { box, sphere, matrix, definition, originalBox, originalSphere } = Combined ();
        const root = Root (definition), nodes = new Map (definition.nodes.map (node => [node.id, node]));
        assert.equal (new Set (definition.nodes.map (node => node.id)).size, definition.nodes.length);
        assert.equal (root.kind, 'boolean'); assert.equal (root.operation, 'subtract'); assert.equal (root.left, box.rootId);
        const transformed = nodes.get (root.right); assert.equal (transformed.kind, 'transform'); assert.deepEqual (transformed.matrix, matrix);
        const cutter = nodes.get (transformed.input); assert.equal (cutter.kind, 'primitive'); assert.equal (cutter.type, 'sphere');
        assert.notEqual (cutter.id, box.rootId); assert.equal (cutter.material.color, '#20a0c0'); assert.equal (nodes.get (root.left).material.color, '#c03020');
        assert.equal (definition.tipId, root.id); assert.deepEqual (box, originalBox); assert.deepEqual (sphere, originalSphere);
        matrix[12] = 999; assert.equal (transformed.matrix[12], 15, 'the recipe owns its captured placement');
    });

    it ('rolls back, edits an earlier primitive and resumes the complete downstream Boolean history', () => {
        const { definition } = Combined (), original = Copy (definition), operation = Root (definition), baseId = operation.left;
        const rolledBack = SetStudioTip (definition, baseId); assert.equal (rolledBack.rootId, baseId); assert.equal (rolledBack.tipId, definition.tipId);
        assert.deepEqual (rolledBack.nodes, definition.nodes, 'rollback must not discard future nodes');
        const edited = UpdateStudioNode (rolledBack, baseId, { parameters : { heightMm : 120 } }), resumed = SetStudioTip (edited);
        assert.equal (resumed.rootId, operation.id); assert.equal (resumed.nodes.find (node => node.id === baseId).parameters.heightMm, 120);
        assert.deepEqual (Root (resumed), operation); assert.equal (resumed.nodes.length, definition.nodes.length); assert.deepEqual (definition, original);
    });

    it ('suppresses or changes an operation without deleting its editable operands', () => {
        const { definition } = Combined (), original = Copy (definition), operation = Root (definition);
        const suppressed = UpdateStudioNode (definition, operation.id, { enabled : false });
        assert.equal (Root (suppressed).enabled, false); assert.equal (suppressed.nodes.length, definition.nodes.length);
        const changed = UpdateStudioNode (suppressed, operation.id, { enabled : true, operation : 'union' });
        assert.equal (Root (changed).operation, 'union'); assert.equal (Root (changed).left, operation.left); assert.equal (Root (changed).right, operation.right);
        assert.deepEqual (definition, original);
    });

    it ('keeps abandoned future branches when combining from an earlier history step', () => {
        const { definition } = Combined (), operation = Root (definition), rolledBack = SetStudioTip (definition, operation.left);
        const combined = CombineStudioDefinitions (rolledBack, CreatePrimitiveDefinition ('cylinder'), Identity, 'union');
        assert.equal (Root (combined).left, operation.left);
        assert.deepEqual (combined.nodes.find (node => node.id === operation.id), operation, 'earlier future remains inspectable and resumable');
        assert.equal (SetStudioTip (combined, operation.id).rootId, operation.id); assert.equal (SetStudioTip (combined).rootId, combined.tipId);
    });

    it ('returns an exhaustive tool provenance map and remaps nested references including inactive branches', () => {
        const target = Combined ().definition, completeTool = Combined ().definition;
        const tool = SetStudioTip (completeTool, Root (completeTool).left), original = Copy (tool);
        const { definition, toolNodeIds } = CombineStudioDefinitionsWithMap (target, tool, Identity, 'intersect');
        assert.deepEqual (Object.keys (toolNodeIds).sort (), tool.nodes.map (node => node.id).sort ());
        assert.equal (new Set (Object.values (toolNodeIds)).size, tool.nodes.length);
        const targetIds = new Set (target.nodes.map (node => node.id));
        for (const node of tool.nodes) {
            const mappedId = toolNodeIds[node.id], mapped = definition.nodes.find (item => item.id === mappedId);
            assert.ok (!targetIds.has (mappedId));
            const expected = { ...node, id : mappedId };
            if (node.kind === 'transform') { expected.input = toolNodeIds[node.input]; }
            if (node.kind === 'boolean') { expected.left = toolNodeIds[node.left]; expected.right = toolNodeIds[node.right]; }
            assert.deepEqual (mapped, expected);
        }
        const placement = definition.nodes.find (node => node.id === Root (definition).right);
        assert.equal (placement.input, toolNodeIds[tool.rootId]); assert.deepEqual (tool, original);
    });

    it ('validates all graph nodes, including missing references and cycles in inactive future steps', () => {
        const { definition } = Combined (), operation = Root (definition), rolledBack = SetStudioTip (definition, operation.left);
        for (const mutate of [
            value => { value.nodes.find (node => node.id === operation.id).left = operation.id; },
            value => { value.nodes.find (node => node.id === operation.id).right = 'missing-node'; },
            value => { value.nodes.push ({ id : 'cycle-a', kind : 'transform', name : 'A', input : 'cycle-b', matrix : Identity }, { id : 'cycle-b', kind : 'transform', name : 'B', input : 'cycle-a', matrix : Identity }); },
            value => { value.nodes[1].id = value.nodes[0].id; },
            value => { value.rootId = 'missing-node'; },
            value => { value.tipId = 'missing-node'; }
        ]) {
            const invalid = Copy (rolledBack); mutate (invalid); assert.throws (() => ValidateStudioDefinition (invalid));
        }
    });

    it ('rejects unknown fields and invalid numbers, materials or primitive constraints before mutation', () => {
        const definition = CreatePrimitiveDefinition ('box'), original = Copy (definition), id = definition.rootId;
        for (const patch of [{ parameters : { widthMm : -1 } }, { parameters : { heightMm : Infinity } }, { parameters : { custom : 1 } }, { material : { roughness : 2 } }, { material : { opacity : -.1 } }, { material : { color : 'red' } }, { transform : { scale : [1, 0, 1] } }, { transform : { position : [NaN, 0, 0] } }, { unexpected : true }, { kind : 'boolean' }]) {
            assert.throws (() => UpdateStudioNode (definition, id, patch)); assert.deepEqual (definition, original);
        }
        for (const [type, parameters] of [['sphere', { segments : 7 }], ['sphere', { segments : 32.5 }], ['sphere', { segments : 129 }], ['tube', { outerDiameterMm : 40, innerDiameterMm : 40 }], ['capsule', { diameterMm : 40, heightMm : 20 }], ['torus', { majorDiameterMm : 20, tubeDiameterMm : 25 }]]) { assert.throws (() => CreatePrimitiveDefinition (type, parameters)); }
        for (const field of ['extra', '__proto__']) { const invalid = Copy (definition); Object.defineProperty (invalid, field, { value : true, enumerable : true }); assert.throws (() => ValidateStudioDefinition (invalid)); }
        assert.throws (() => CreatePrimitiveDefinition ('unrecognized'));
        assert.throws (() => ValidateStudioDefinition ({ ...definition, schemaVersion : 2 }));
        assert.throws (() => ValidateStudioDefinition ({ ...definition, units : 'in' }));
        assert.throws (() => UpdateStudioNode (definition, 'missing-node', { name : 'New' }));
        assert.throws (() => SetStudioTip (definition, 'missing-node'));
    });

    it ('rejects singular or projective captured transforms and unknown Boolean operations', () => {
        const left = CreatePrimitiveDefinition ('box'), right = CreatePrimitiveDefinition ('sphere'), before = [Copy (left), Copy (right)];
        const singular = [...Identity]; singular[0] = 0;
        const projective = [...Identity]; projective[3] = .5;
        const nonfinite = [...Identity]; nonfinite[12] = Infinity;
        for (const matrix of [singular, projective, nonfinite, Identity.slice (1)]) { assert.throws (() => CombineStudioDefinitions (left, right, matrix, 'subtract')); }
        assert.throws (() => CombineStudioDefinitions (left, right, Identity, 'cut'));
        assert.deepEqual ([left, right], before);
    });

    it ('rejects explicit null authoring fields instead of silently replacing them with defaults', () => {
        const definition = CreatePrimitiveDefinition ('box'), id = definition.rootId;
        assert.throws (() => CreatePrimitiveDefinition ('box', null));
        for (const key of ['name', 'material', 'transform']) { assert.throws (() => CreatePrimitiveDefinition ('box', {}, { [key] : null })); }
        for (const key of ['name', 'type', 'parameters', 'material', 'transform']) { assert.throws (() => UpdateStudioNode (definition, id, { [key] : null }), key); }
        for (const key of ['position', 'rotation', 'scale']) {
            assert.throws (() => CreatePrimitiveDefinition ('box', {}, { transform : { [key] : null } }), key);
            assert.throws (() => UpdateStudioNode (definition, id, { transform : { [key] : null } }), key);
        }
        const combined = Combined ().definition;
        assert.throws (() => UpdateStudioNode (combined, combined.rootId, { enabled : null }));
        assert.throws (() => ValidateStudioDefinition ({ ...definition, nodes : [null] }));
    });

    it ('rejects sparse vectors and matrices before they reach geometry or serialization', () => {
        const definition = CreatePrimitiveDefinition ('box');
        for (const key of ['position', 'rotation', 'scale']) {
            const sparse = key === 'scale' ? [1, 1, 1] : [0, 0, 0]; delete sparse[1];
            assert.throws (() => UpdateStudioNode (definition, definition.rootId, { transform : { [key] : sparse } }), key);
        }
        const sparseMatrix = [...Identity]; delete sparseMatrix[12];
        assert.throws (() => CombineStudioDefinitions (definition, CreatePrimitiveDefinition ('sphere'), sparseMatrix, 'union'));
        const sparseNodes = [Root (definition), Root (definition)]; delete sparseNodes[1];
        assert.throws (() => ValidateStudioDefinition ({ ...definition, nodes : sparseNodes }));
    });

    it ('accepts physical minimum wall boundaries despite decimal subtraction roundoff', () => {
        assert.doesNotThrow (() => CreatePrimitiveDefinition ('tube', { outerDiameterMm : 20, innerDiameterMm : 19.98 }));
        assert.doesNotThrow (() => CreatePrimitiveDefinition ('torus', { majorDiameterMm : 20, tubeDiameterMm : 19.98 }));
        assert.throws (() => CreatePrimitiveDefinition ('tube', { outerDiameterMm : 20, innerDiameterMm : 19.981 }));
    });

    it ('bounds retained authoring history and refuses oversized combinations atomically', () => {
        const base = CreatePrimitiveDefinition ('box'), leaf = Root (base);
        const nodes = Array.from ({ length : 64 }, (_, index) => ({ ...Copy (leaf), id : 'node-' + index }));
        const maximum = { ...base, nodes, rootId : 'node-0', tipId : 'node-63' };
        assert.equal (ValidateStudioDefinition (maximum).nodes.length, 64);
        assert.throws (() => ValidateStudioDefinition ({ ...maximum, nodes : [...nodes, { ...Copy (leaf), id : 'overflow' }] }));
        const before = Copy (maximum); assert.throws (() => CombineStudioDefinitions (maximum, base, Identity, 'union')); assert.deepEqual (maximum, before);
    });
});
