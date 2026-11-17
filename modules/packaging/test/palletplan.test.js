import assert from 'node:assert/strict';
import { BestLayerPattern, CreatePallet, CreatePalletPlan, DefaultPalletMaxHeightMm, PalletPresets, RasterPoints } from '../src/index.js';

const pallet = PalletPresets['gma-40x48'];
const near = (a, b, tolerance = 1e-6) => assert.ok (Math.abs (a - b) < tolerance, `${a} != ${b}`);
// Every placement stays on the deck and no two footprints overlap.
function assertValidLayer (plan)
{
    const half = { x : plan.palletMm.width / 2, z : plan.palletMm.length / 2 };
    const rects = plan.placements.map (p => { const w = p.rotated ? plan.boxMm.length : plan.boxMm.width, l = p.rotated ? plan.boxMm.width : plan.boxMm.length; return { x0 : p.x - w / 2, x1 : p.x + w / 2, z0 : p.z - l / 2, z1 : p.z + l / 2 }; });
    for (const r of rects) { assert.ok (r.x0 >= -half.x - 1e-6 && r.x1 <= half.x + 1e-6 && r.z0 >= -half.z - 1e-6 && r.z1 <= half.z + 1e-6, 'placement overhangs the pallet'); }
    for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i], b = rects[j];
            assert.ok (a.x1 <= b.x0 + 1e-6 || b.x1 <= a.x0 + 1e-6 || a.z1 <= b.z0 + 1e-6 || b.z1 <= a.z0 + 1e-6, `boxes ${i} and ${j} overlap`);
        }
    }
}

describe ('Auto pallet plan', () => {
    it ('uses a 40 × 48 × 5 in pallet and a 55 in default overall height', () => {
        near (pallet.widthMm, 1016); near (pallet.lengthMm, 1219.2); near (pallet.heightMm, 127); near (DefaultPalletMaxHeightMm, 1397);
    });
    it ('column-stacks the demo RSC: 20 per layer × 8 layers under 55 in', () => {
        const plan = CreatePalletPlan ({ box : { width : 203, length : 303, height : 156 } });
        assert.equal (plan.perLayer, 20); assert.equal (plan.layers, 8); assert.equal (plan.total, 160); assert.equal (plan.stacking, 'column');
        near (plan.overallHeightMm, 127 + 8 * 156); assert.ok (plan.overallHeightMm <= 1397);
        assert.equal (plan.placements.length, 20); assertValidLayer (plan);
        // The load is centred on the pallet.
        near (plan.placements.reduce ((sum, p) => sum + p.x, 0) / 20, 0); near (plan.placements.reduce ((sum, p) => sum + p.z, 0) / 20, 0);
    });
    it ('beats a single-orientation grid when mixing orientations fits more', () => {
        for (const [a, b, expected, grid] of [[254, 355.6, 13, 12], [228.6, 304.8, 17, 16], [180, 260, 23, 20], [300, 400, 10, 9]]) {
            const plan = CreatePalletPlan ({ box : { width : a, length : b, height : 200 } });
            assert.equal (plan.perLayer, expected, `${a} × ${b}`); assert.ok (plan.perLayer > grid);
            assert.equal (plan.pattern, 'mixed orientation'); assertValidLayer (plan);
        }
    });
    it ('never does worse than the best single-orientation grid', () => {
        for (let a = 90; a <= 520; a += 37) {
            for (let b = 70; b <= 610; b += 53) {
                const grid = Math.max (Math.floor (1016 / a) * Math.floor (1219.2 / b), Math.floor (1016 / b) * Math.floor (1219.2 / a));
                const layer = BestLayerPattern (1016, 1219.2, a, b);
                assert.ok (layer.count >= grid, `${a} × ${b}: ${layer.count} < ${grid}`); assert.equal (layer.rects.length, layer.count);
            }
        }
    });
    it ('limits layers by the overall height including the pallet', () => {
        assert.equal (CreatePalletPlan ({ box : { width : 300, length : 400, height : 250 }, maxHeightMm : 127 + 500 }).layers, 2);
        assert.equal (CreatePalletPlan ({ box : { width : 300, length : 400, height : 250 }, maxHeightMm : 127 + 499.9 }).layers, 1);
        assert.throws (() => CreatePalletPlan ({ box : { width : 300, length : 400, height : 250 }, maxHeightMm : 300 }), /One box layer does not fit/);
    });
    it ('rejects boxes larger than the deck and invalid input', () => {
        assert.throws (() => CreatePalletPlan ({ box : { width : 1100, length : 1300, height : 100 } }), /larger than the pallet deck/);
        assert.equal (CreatePalletPlan ({ box : { width : 1200, length : 1000, height : 100 } }).perLayer, 1);
        assert.throws (() => CreatePalletPlan ({ box : { width : 0, length : 100, height : 100 } }), /Box width/);
        assert.throws (() => CreatePalletPlan ({ box : { width : 100, length : 100, height : NaN } }), /Box height/);
        assert.throws (() => CreatePalletPlan ({ box : { width : 10, length : 10, height : 10 } }), /More than/);
    });
    it ('lists raster points for the guillotine search', () => {
        assert.deepEqual (RasterPoints (10, 3, 4), [0, 3, 4, 6, 7, 8, 9, 10]);
    });
});

describe ('Procedural pallet', () => {
    it ('builds a 40 × 48 × 5 in block pallet centred on its bottom face', () => {
        for (const color of ['blue', 'brown', 'black']) {
            const data = CreatePallet ({ color }); const vertices = data.meshes[0].vertices;
            const min = [0, 1, 2].map (axis => Math.min (...vertices.map (v => v[axis]))), max = [0, 1, 2].map (axis => Math.max (...vertices.map (v => v[axis])));
            near (min[0], -508); near (max[0], 508); near (min[1], 0); near (max[1], 127); near (min[2], -609.6); near (max[2], 609.6);
            assert.equal (data.materials.length, 1); assert.equal (data.parameters.color, color); assert.equal (data.materials[0].role, 'pallet');
            assert.equal (data.meshes[0].triangles.length, 12 * (3 * (1 + 3 + 1) + 7));
        }
        assert.throws (() => CreatePallet ({ color : 'red' }), /blue, brown or black/);
    });
});
