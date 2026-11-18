import assert from 'node:assert/strict';
import { AnalyzeProductLayout, CreateNestedPartitionPlan, ClusterAxis, ValidatePackaging } from '../src/index.js';

const near = (a, b, tolerance = 1e-9) => assert.ok (Math.abs (a - b) < tolerance, `${a} != ${b}`);
// A grid of products (carton frame: 0 = length, 1 = height, 2 = width), with an edge gap between them.
function Grid ({ columns, rows, layers = 1, size = [66, 120, 66], gap = 0 })
{
    const boxes = [];
    for (let l = 0; l < layers; l++) { for (let c = 0; c < columns; c++) { for (let r = 0; r < rows; r++) {
        const min = [c * (size[0] + gap), l * size[1], r * (size[2] + gap)]; boxes.push ({ id : [c, r, l].join ('-'), min, max : min.map ((v, a) => v + size[a]) });
    } } }
    return boxes;
}
// Product boxes after the plan's moves.
const Moved = (boxes, plan) => boxes.map (box => { const move = plan.moves.find (m => m.id === box.id), d = move ? move.offset : [0, 0, 0]; return { id : box.id, min : box.min.map ((v, a) => v + d[a]), max : box.max.map ((v, a) => v + d[a]) }; });
// Strip footprints in the carton frame.
function StripBoxes (plan)
{
    const env = plan.envelope, t = plan.thicknessMm;
    return plan.layers.flatMap (layer => layer.set.strips.map (s => s.axis === 'length'
        ? { id : s.id, min : [env.min[0], layer.baseMm, env.min[2] + s.offsetMm - t / 2], max : [env.min[0] + s.lengthMm, layer.baseMm + s.heightMm, env.min[2] + s.offsetMm + t / 2] }
        : { id : s.id, min : [env.min[0] + s.offsetMm - t / 2, layer.baseMm, env.min[2]], max : [env.min[0] + s.offsetMm + t / 2, layer.baseMm + s.heightMm, env.min[2] + s.lengthMm] }));
}
const Overlap = (a, b, eps = 1e-9) => [0, 1, 2].every (i => a.min[i] < b.max[i] - eps && b.min[i] < a.max[i] - eps);

describe ('Nested partitions between products', () => {
    it ('reads columns, rows and layers from product bounds', () => {
        const layout = AnalyzeProductLayout ({ boxes : Grid ({ columns : 4, rows : 3, layers : 2 }) });
        assert.equal (layout.columns.length, 4); assert.equal (layout.rows.length, 3); assert.equal (layout.layers.length, 2); assert.equal (layout.cells, 24);
        assert.deepEqual (layout.gaps.length, [0, 0, 0]);
        // Mixed sizes in one column still form one cluster when they overlap along that axis.
        assert.equal (ClusterAxis ([{ id : 'a', min : [0, 0, 0], max : [60, 1, 1] }, { id : 'b', min : [5, 0, 0], max : [66, 1, 1] }, { id : 'c', min : [70, 0, 0], max : [130, 1, 1] }], 0).length, 2);
    });
    it ('opens touching products just enough for a board and nests strips in every gap', () => {
        const boxes = Grid ({ columns : 4, rows : 3, layers : 2 }), plan = CreateNestedPartitionPlan ({ boxes, thickness : 3 });
        assert.equal (plan.requiredGapMm, 4); assert.deepEqual (plan.growthMm, { length : 12, width : 8, height : 0 });
        assert.equal (plan.layers.length, 2); assert.equal (plan.strips, 10); assert.equal (plan.moves.length, 24);
        const moved = Moved (boxes, plan), after = AnalyzeProductLayout ({ boxes : moved });
        for (const gap of [...after.gaps.length, ...after.gaps.width]) { near (gap, 4, 1e-9); }
        // Strips sit in the middle of every gap and never touch a product.
        const strips = StripBoxes (plan);
        for (const strip of strips) { for (const product of moved) { assert.ok (!Overlap (strip, product), strip.id + ' hits ' + product.id); } }
        for (const strip of strips) { for (const product of moved) { const clear = [0, 2].map (a => Math.max (strip.min[a] - product.max[a], product.min[a] - strip.max[a])); if (Overlap ({ min : [strip.min[0], strip.min[1], -1e9], max : [strip.max[0], strip.max[1], 1e9] }, product) && Overlap ({ min : [-1e9, strip.min[1], strip.min[2]], max : [1e9, strip.max[1], strip.max[2]] }, product)) { assert.ok (Math.max (...clear) >= .5 - 1e-9); } } }
        // Each layer's strips are as tall as the layer and span the whole envelope.
        for (const layer of plan.layers) { near (layer.heightMm, 120); for (const s of layer.set.strips) { near (s.lengthMm, s.axis === 'length' ? plan.envelope.max[0] - plan.envelope.min[0] : plan.envelope.max[2] - plan.envelope.min[2]); ValidatePackaging (s.profile); } }
    });
    it ('keeps products in place when the gaps already hold a board', () => {
        const plan = CreateNestedPartitionPlan ({ boxes : Grid ({ columns : 3, rows : 2, gap : 10 }), thickness : 3 });
        assert.equal (plan.moves.length, 0); assert.deepEqual (plan.growthMm, { length : 0, width : 0, height : 0 });
        // Cuts at the gap centres: 66 + 5 and 2 × 66 + 10 + 5 along the length, 66 + 5 across.
        assert.deepEqual (plan.lengthCuts, [71, 147]); assert.deepEqual (plan.widthCuts, [71]);
    });
    it ('opens only the gaps that are too narrow, keeping the layout centred', () => {
        const boxes = [0, 70, 200].map ((x, i) => ({ id : 'p' + i, min : [x, 0, 0], max : [x + 66, 100, 66] }));
        const plan = CreateNestedPartitionPlan ({ boxes, thickness : 3 }), offsets = Object.fromEntries (plan.moves.map (m => [m.id, m.offset[0]]));
        // First gap is 4 mm (enough), second is 64 mm: nothing moves.
        assert.equal (plan.moves.length, 0); assert.equal (plan.layers[0].set.strips.length, 2);
        const tight = CreateNestedPartitionPlan ({ boxes : [0, 67, 200].map ((x, i) => ({ id : 'p' + i, min : [x, 0, 0], max : [x + 66, 100, 66] })), thickness : 3 });
        assert.deepEqual (tight.growthMm.length, 3); assert.deepEqual (Object.fromEntries (tight.moves.map (m => [m.id, m.offset[0]])), { p0 : -1.5, p1 : 1.5, p2 : 1.5 });
        assert.equal (offsets.p0, undefined);
    });
    it ('interlocks: every slot lines up with the strip that crosses it, at half height', () => {
        const plan = CreateNestedPartitionPlan ({ boxes : Grid ({ columns : 3, rows : 3 }), thickness : 3 });
        const set = plan.layers[0].set, lengthStrips = set.strips.filter (s => s.axis === 'length'), widthStrips = set.strips.filter (s => s.axis === 'width');
        for (const strip of set.strips) {
            const crossing = strip.axis === 'length' ? widthStrips : lengthStrips, edge = strip.slots === 'top' ? strip.heightMm : 0, points = strip.profile.paths[0].points, slots = [];
            for (let i = 0; i < points.length; i++) { const a = points[i], b = points[(i + 1) % points.length]; if (Math.abs (a[1] - edge) < 1e-9 && Math.abs (b[1] - edge) > 1e-9 && Math.abs (a[0] - b[0]) < 1e-9 && a[0] > 1e-9 && a[0] < strip.lengthMm - 1e-9) { const next = points[(i + 2) % points.length]; slots.push ((a[0] + next[0]) / 2); } }
            slots.sort ((x, y) => x - y); assert.equal (slots.length, crossing.length);
            slots.forEach ((centre, i) => near (centre, crossing[i].offsetMm));
        }
        near (set.slotDepthMm * 2, set.strips[0].heightMm); assert.equal (set.collapsedMm.stackThickness, 4 * 3);
    });
    it ('refuses a single product or a single file of products in neither direction', () => {
        assert.throws (() => CreateNestedPartitionPlan ({ boxes : Grid ({ columns : 1, rows : 1 }), thickness : 3 }), /at least two products/);
        assert.throws (() => CreateNestedPartitionPlan ({ boxes : Grid ({ columns : 1, rows : 1, layers : 3 }), thickness : 3 }), /at least two products/);
        assert.equal (CreateNestedPartitionPlan ({ boxes : Grid ({ columns : 4, rows : 1 }), thickness : 3 }).strips, 3);
        assert.throws (() => AnalyzeProductLayout ({ boxes : [{ min : [0, 0, 0], max : [0, 1, 1] }] }), /positive bounds/);
    });
});
