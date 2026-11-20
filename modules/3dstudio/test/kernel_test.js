import assert from 'node:assert/strict';
import ManifoldModule from 'manifold-3d';
import { CreatePrimitiveDefinition, CombineStudioDefinitions, SetStudioTip, StudioIdentityMatrix, UpdateStudioNode } from '../src/definition.js';
import { EvaluateStudio } from '../src/kernel.js';

function Near (actual, expected, tolerance = 1e-5)
{
    assert.ok (Math.abs (actual - expected) <= tolerance, actual + ' != ' + expected);
}

function ClosedTopology (result, genus = 0)
{
    const points = new Map ();
    const welded = [];
    for (let index = 0; index < result.positions.length; index += 3) {
        const point = Array.from (result.positions.slice (index, index + 3), value => Math.round (value * 100000)).join (',');
        if (!points.has (point)) { points.set (point, points.size); }
        welded.push (points.get (point));
        Near (Math.hypot (...result.normals.slice (index, index + 3)), 1, 0.00001);
    }
    const edges = new Map ();
    for (let index = 0; index < result.indices.length; index += 3) {
        const triangle = Array.from (result.indices.slice (index, index + 3), vertex => welded[vertex]);
        assert.equal (new Set (triangle).size, 3, 'nondegenerate triangle');
        for (let corner = 0; corner < 3; corner++) {
            const a = triangle[corner], b = triangle[(corner + 1) % 3];
            const key = Math.min (a, b) + ':' + Math.max (a, b);
            const edge = edges.get (key) || { count: 0, orientation: 0 };
            edge.count++;
            edge.orientation += a < b ? 1 : -1;
            edges.set (key, edge);
        }
    }
    for (const edge of edges.values ()) {
        assert.equal (edge.count, 2, 'each welded edge is shared by exactly two faces');
        assert.equal (edge.orientation, 0, 'neighboring faces have consistent outward winding');
    }
    assert.equal (points.size - edges.size + result.indices.length / 3, 2 - 2 * genus);
    assert.equal (result.statistics.closed, true);
    assert.equal (result.statistics.components, 1);
}

function Box (size = 10, color = '#00aaff')
{
    return CreatePrimitiveDefinition ('box', { widthMm: size, heightMm: size, depthMm: size }, { material: { color } });
}

function Translate (x, y = 0, z = 0)
{
    const matrix = [...StudioIdentityMatrix];
    matrix[12] = x; matrix[13] = y; matrix[14] = z;
    return matrix;
}

describe ('3Dstudio actual solid kernel', function () {
    this.timeout (20000);

    for (const [type, parameters, genus, height] of [
        ['box', { widthMm: 10, heightMm: 20, depthMm: 30 }, 0, 20],
        ['sphere', { diameterMm: 20 }, 0, 20],
        ['cylinder', { diameterMm: 20, heightMm: 40 }, 0, 40],
        ['tube', { outerDiameterMm: 20, innerDiameterMm: 10, heightMm: 40 }, 1, 40],
        ['cone', { diameterMm: 20, topDiameterMm: 8, heightMm: 40 }, 0, 40],
        ['torus', { majorDiameterMm: 40, tubeDiameterMm: 10 }, 1, 10],
        ['capsule', { diameterMm: 20, heightMm: 40 }, 0, 40]
    ]) {
        it ('creates a closed, Y-up ' + type + ' with valid normals and material provenance', async () => {
            const result = await EvaluateStudio (CreatePrimitiveDefinition (type, parameters));
            ClosedTopology (result, genus);
            Near (result.statistics.bounds.min[1], 0);
            Near (result.statistics.bounds.max[1], height);
            assert.ok (result.statistics.volumeMm3 > 0);
            assert.equal (result.materials[0].sourcePrimitiveId, 'primitive-1');
            assert.ok (result.materialIndices.every (index => index === 0));
            assert.equal (result.materialIndices.length, result.indices.length / 3);
            assert.equal (result.positions.length, result.normals.length);
        });
    }

    it ('computes the expected primitive volumes, including the open tube bore and torus hole', async () => {
        const cases = [
            ['box', { widthMm: 10, heightMm: 20, depthMm: 30 }, 6000],
            ['sphere', { diameterMm: 20, segments: 64 }, 4 / 3 * Math.PI * 1000],
            ['cylinder', { diameterMm: 20, heightMm: 40, segments: 64 }, Math.PI * 100 * 40],
            ['tube', { outerDiameterMm: 20, innerDiameterMm: 10, heightMm: 40, segments: 64 }, Math.PI * 75 * 40],
            ['cone', { diameterMm: 20, topDiameterMm: 10, heightMm: 40, segments: 64 }, Math.PI * 40 / 3 * (100 + 50 + 25)],
            ['torus', { majorDiameterMm: 40, tubeDiameterMm: 10, segments: 64, tubeSegments: 64 }, 2 * Math.PI ** 2 * 20 * 25],
            ['capsule', { diameterMm: 20, heightMm: 40, segments: 64 }, Math.PI * 100 * 20 + 4 / 3 * Math.PI * 1000]
        ];
        for (const [type, parameters, volume] of cases) {
            const result = await EvaluateStudio (CreatePrimitiveDefinition (type, parameters));
            Near (result.statistics.volumeMm3, volume, volume * 0.007);
        }
    });

    it ('preserves axis dimensions at non-multiple-of-four detail levels', async () => {
        const result = await EvaluateStudio (CreatePrimitiveDefinition ('torus', { majorDiameterMm: 40, tubeDiameterMm: 10, segments: 9, tubeSegments: 9 }));
        assert.deepEqual (result.statistics.bounds, { min: [-25, 0, -25], max: [25, 10, 25] });
    });

    it ('orients tube bore normals into the hollow space and outer normals away from it', async () => {
        const result = await EvaluateStudio (CreatePrimitiveDefinition ('tube', { outerDiameterMm: 20, innerDiameterMm: 10, heightMm: 40 }));
        let inner = 0, outer = 0;
        for (let index = 0; index < result.positions.length; index += 3) {
            const x = result.positions[index], z = result.positions[index + 2];
            if (Math.abs (result.normals[index + 1]) > 0.1) { continue; }
            const dot = x * result.normals[index] + z * result.normals[index + 2];
            if (Math.hypot (x, z) < 7.5) { assert.ok (dot < 0); inner++; }
            else { assert.ok (dot > 0); outer++; }
        }
        assert.ok (inner > 0 && outer > 0);
    });

    for (const [operation, volume] of [['union', 1500], ['subtract', 500], ['intersect', 500]]) {
        it ('evaluates overlapping box ' + operation + ' with exact volume and closed topology', async () => {
            const recipe = CombineStudioDefinitions (Box (), Box (10, '#ff0000'), Translate (5), operation);
            const result = await EvaluateStudio (recipe);
            Near (result.statistics.volumeMm3, volume);
            ClosedTopology (result);
            assert.equal (result.materials.length, 2);
            assert.equal (new Set (result.materialIndices).size, 2, 'the result retains both source and cutter faces');
        });
    }

    it ('preserves flat target normals and inward cutter normals along curved Boolean seams', async () => {
        const result = await EvaluateStudio (CombineStudioDefinitions (Box (), CreatePrimitiveDefinition ('sphere', { diameterMm: 12 }), Translate (4, -1), 'subtract'));
        const targetIndex = result.materials.findIndex (material => material.id === 'primitive-1');
        let targetFaces = 0, cutterFaces = 0;
        for (let triangle = 0; triangle < result.materialIndices.length; triangle++) {
            const target = result.materialIndices[triangle] === targetIndex;
            for (let corner = 0; corner < 3; corner++) {
                const vertex = result.indices[3 * triangle + corner] * 3;
                const normal = result.normals.slice (vertex, vertex + 3);
                if (target) {
                    assert.ok (Array.from (normal).some (value => Math.abs (value) === 1), 'box faces stay flat through the cut seam');
                    targetFaces++;
                } else {
                    const point = result.positions.slice (vertex, vertex + 3);
                    assert.ok ((point[0] - 4) * normal[0] + (point[1] - 5) * normal[1] + point[2] * normal[2] < 0, 'cutter normals point into the removed sphere');
                    cutterFaces++;
                }
            }
        }
        assert.ok (targetFaces > 0 && cutterFaces > 0);
        ClosedTopology (result);
    });

    it ('supports disjoint components and reports empty cuts/intersections without invalid measurements', async () => {
        const union = await EvaluateStudio (CombineStudioDefinitions (Box (), Box (), Translate (30), 'union'));
        Near (union.statistics.volumeMm3, 2000);
        assert.equal (union.statistics.components, 2);
        for (const [operation, matrix] of [['intersect', Translate (30)], ['subtract', Translate (0)]]) {
            const result = await EvaluateStudio (CombineStudioDefinitions (Box (), Box (), matrix, operation));
            assert.equal (result.statistics.empty, true);
            assert.equal (result.statistics.closed, false);
            assert.equal (result.statistics.volumeMm3, 0);
            assert.equal (result.indices.length, 0);
        }
    });

    it ('edits earlier operands, disables operations and rolls the active result backward without changing history', async () => {
        const original = CombineStudioDefinitions (Box (), Box (), Translate (5), 'subtract');
        const before = JSON.stringify (original);
        const edited = UpdateStudioNode (original, 'primitive-1', { parameters: { widthMm: 20 } });
        Near ((await EvaluateStudio (edited)).statistics.volumeMm3, 1000);
        const disabled = UpdateStudioNode (original, original.rootId, { enabled: false });
        Near ((await EvaluateStudio (disabled)).statistics.volumeMm3, 1000);
        const rolledBack = SetStudioTip (original, 'primitive-1');
        Near ((await EvaluateStudio (rolledBack)).statistics.volumeMm3, 1000);
        assert.equal (rolledBack.nodes.length, original.nodes.length);
        assert.equal (JSON.stringify (original), before);
    });

    it ('applies local scale/XYZ rotation/translation and affine operand placement in millimeters', async () => {
        const definition = CreatePrimitiveDefinition ('box', { widthMm: 10, heightMm: 20, depthMm: 30 }, {
            transform: { scale: [-2, 1, 0.5], rotation: [0, 0, 90], position: [100, 10, -5] }
        });
        const result = await EvaluateStudio (definition);
        Near (result.statistics.volumeMm3, 6000);
        assert.deepEqual (result.statistics.bounds, { min: [80, 0, -12.5], max: [100, 20, 2.5] });
        ClosedTopology (result);
    });

    it ('matches viewer intrinsic XYZ rotation when multiple Euler axes are nonzero', async () => {
        const definition = CreatePrimitiveDefinition ('box', { widthMm: 10, heightMm: 20, depthMm: 30 }, {
            transform: { rotation: [90, 90, 0] }
        });
        const result = await EvaluateStudio (definition);
        // Rx(90) * Ry(90) maps (x,y,z) to (z,x,y), preserving the
        // original Y-up base location as the new Z interval [0,20].
        assert.deepEqual (result.statistics.bounds, { min: [-15, -5, 0], max: [15, 5, 20] });
        Near (result.statistics.volumeMm3, 6000);
        ClosedTopology (result);
        assert.equal (result.materials[0].id, 'primitive-1');
        assert.ok (result.materialIndices.every (value => value === 0));
    });

    it ('rejects invalid future history before loading or evaluating any geometry', async () => {
        const definition = Box ();
        definition.nodes.push ({ id: 'bad', kind: 'transform', input: 'missing', matrix: [...StudioIdentityMatrix] });
        await assert.rejects (EvaluateStudio (definition, { module: { Manifold: null } }), /missing input/);
    });

    it ('rejects an internally valid solid whose large translation collapses Float32 export triangles', async () => {
        const definition = Box (1);
        definition.nodes.push ({ id: 'far', kind: 'transform', input: definition.rootId, matrix: Translate (1e9) });
        definition.rootId = 'far'; definition.tipId = 'far';
        await assert.rejects (EvaluateStudio (definition), /coordinate precision/);
    });

    it ('enforces an aggregate geometry budget for many high-detail operands', async () => {
        let definition = CreatePrimitiveDefinition ('torus', { segments: 128, tubeSegments: 128 });
        for (let index = 1; index < 8; index++) {
            definition = CombineStudioDefinitions (definition, CreatePrimitiveDefinition ('torus', { segments: 128, tubeSegments: 128 }), Translate (index * 200), 'union');
        }
        await assert.rejects (EvaluateStudio (definition), /triangle budget/);
    });

    it ('deletes every allocated native wrapper on success and after a late export failure', async () => {
        const native = await ManifoldModule (); native.setup ();
        let alive = 0, shouldFail = false;
        const rawByProxy = new WeakMap ();
        const wrap = solid => {
            alive++;
            const proxy = new Proxy (solid, {
                get: (target, key) => typeof target[key] !== 'function' ? target[key] : (...args) => {
                    if (key === 'getMesh' && shouldFail) { throw new Error ('test export failure'); }
                    if (key === 'delete') { alive--; }
                    const result = target[key] (...args.map (arg => rawByProxy.get (arg) || arg));
                    if (result instanceof native.Manifold) { return wrap (result); }
                    if (key === 'decompose') { return result.map (wrap); }
                    return result;
                }
            });
            rawByProxy.set (proxy, solid);
            return proxy;
        };
        const Manifold = new Proxy (native.Manifold, {
            get: (target, key) => typeof target[key] !== 'function' ? target[key] : (...args) => wrap (target[key] (...args))
        });
        const definition = CombineStudioDefinitions (Box (), Box (), Translate (5), 'subtract');
        await EvaluateStudio (definition, { module: { Manifold } });
        assert.equal (alive, 0);
        shouldFail = true;
        await assert.rejects (EvaluateStudio (definition, { module: { Manifold } }), /test export failure/);
        assert.equal (alive, 0);
    });
});
