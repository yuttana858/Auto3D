import assert from 'node:assert/strict';
import { CreatePadPlan, CreatePartitionPlan, CreateBoard, ValidatePackaging, PackagingContours } from '../src/index.js';

const near = (a, b, tolerance = 1e-9) => assert.ok (Math.abs (a - b) < tolerance, `${a} != ${b}`);
const inside = { length : 300, width : 200, height : 150 };
// Slot intervals cut into a strip's outline, as [start, end] along the strip.
function Slots (strip)
{
    const points = strip.profile.paths[0].points, edge = strip.slots === 'top' ? strip.heightMm : 0, slots = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if (Math.abs (a[1] - edge) < 1e-9 && Math.abs (b[1] - edge) > 1e-9 && Math.abs (a[0] - b[0]) < 1e-9 && a[0] > 1e-9 && a[0] < strip.lengthMm - 1e-9) { const next = points[(i + 2) % points.length]; slots.push ([Math.min (a[0], next[0]), Math.max (a[0], next[0])]); }
    }
    return slots.sort ((x, y) => x[0] - y[0]);
}

describe ('Carton accessories', () => {
    it ('sizes horizontal and vertical pads to fit as valid CAD boards and reports the box growth', () => {
        const plan = CreatePadPlan ({ insideMm : inside, thickness : 3, positions : ['front', 'top', 'bottom', 'back'] });
        assert.deepEqual (plan.pads.map (p => p.position), ['bottom', 'top', 'front', 'back']);
        const [bottom, top, front] = plan.pads;
        assert.equal (bottom.orientation, 'horizontal'); near (bottom.lengthMm, 298); near (bottom.widthMm, 198); near (top.widthMm, 198);
        // Vertical pads stand between the two horizontal pads: 150 − 2 × 3 − 2 × 1 clearance.
        assert.equal (front.orientation, 'vertical'); near (front.lengthMm, 298); near (front.heightMm, 142);
        assert.deepEqual (plan.growthMm, { length : 0, width : 6, height : 6 });
        for (const pad of plan.pads) { assert.deepEqual (ValidatePackaging (pad.profile), pad.profile); assert.equal (pad.profile.thickness, 3); }
        const vertices = CreateBoard (bottom.profile).meshes[0].vertices, span = axis => Math.max (...vertices.map (v => v[axis])) - Math.min (...vertices.map (v => v[axis]));
        near (span (0), 298, 1e-6); near (span (2), 198, 1e-6); near (span (1), 3, 1e-6);
        assert.deepEqual (CreatePadPlan ({ insideMm : inside, thickness : 1.5 }).growthMm, { length : 0, width : 0, height : 1.5 });
        assert.throws (() => CreatePadPlan ({ insideMm : { length : 300, width : 200, height : 5 }, thickness : 3, positions : ['bottom', 'top'] }), /fill the carton height/);
        assert.throws (() => CreatePadPlan ({ insideMm : inside, thickness : 3, positions : ['side'] }), /bottom, top, front or back/);
        assert.throws (() => CreatePadPlan ({ insideMm : inside, thickness : 3, positions : ['top', 'top'] }), /bottom, top, front or back/);
    });
    it ('plans interlocking partitions whose slots meet the crossing strips at half height', () => {
        const plan = CreatePartitionPlan ({ insideMm : inside, thickness : 3, columns : 3, rows : 2 });
        assert.equal (plan.cells, 6); assert.equal (plan.strips.length, 3);
        const lengthStrips = plan.strips.filter (s => s.axis === 'length'), widthStrips = plan.strips.filter (s => s.axis === 'width');
        assert.equal (lengthStrips.length, 1); assert.equal (widthStrips.length, 2);
        // Equal cells: walls plus cells fill the inside exactly.
        near (3 * plan.cellMm.length + 2 * 3, 300); near (2 * plan.cellMm.width + 1 * 3, 200); near (plan.cellMm.height, 148);
        for (const strip of plan.strips) {
            const crossing = strip.axis === 'length' ? widthStrips : lengthStrips, slots = Slots (strip);
            assert.equal (slots.length, crossing.length, strip.id);
            // Strips start 1 mm from the wall, so a crossing centre at offset o sits at o − 1 along the strip.
            slots.forEach ((slot, i) => { near ((slot[0] + slot[1]) / 2, crossing[i].offsetMm - plan.clearanceMm); near (slot[1] - slot[0], plan.slotWidthMm); assert.ok (slot[1] - slot[0] > plan.thicknessMm); });
            ValidatePackaging (strip.profile); assert.equal (PackagingContours (strip.profile).length, 1);
        }
        assert.ok (lengthStrips.every (s => s.slots === 'top') && widthStrips.every (s => s.slots === 'bottom'));
        near (plan.slotDepthMm * 2, plan.cellMm.height);
    });
    it ('validates cell counts, caliper and carton size before planning', () => {
        assert.throws (() => CreatePartitionPlan ({ insideMm : inside, thickness : 3, columns : 1, rows : 1 }), /at least two/);
        assert.throws (() => CreatePartitionPlan ({ insideMm : inside, thickness : 3, columns : 13, rows : 2 }), /1 to 12/);
        assert.throws (() => CreatePartitionPlan ({ insideMm : inside, thickness : 3, columns : 2.5, rows : 2 }), /whole number/);
        assert.throws (() => CreatePartitionPlan ({ insideMm : { length : 20, width : 200, height : 150 }, thickness : 3, columns : 6, rows : 2 }), /narrower than the board caliper/);
        assert.throws (() => CreatePartitionPlan ({ insideMm : { length : 300, width : 200, height : 10 }, thickness : 3, columns : 2, rows : 2 }), /too shallow/);
        assert.throws (() => CreatePadPlan ({ insideMm : { length : 0, width : 200, height : 150 }, thickness : 3 }), /Inside length/);
        assert.equal (CreatePartitionPlan ({ insideMm : inside, thickness : 3, columns : 4, rows : 1 }).strips.length, 3);
    });
});
