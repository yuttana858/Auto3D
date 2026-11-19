import assert from 'node:assert/strict';
import { FilletPolygon, RoundedRectangle, CircleOutline, ReliefHoleOutline } from '../src/cadshapes.js';
import { SenseCanRim, CreateCanCollarPlan, CollarBoards } from '../src/cancollar.js';
import { PackagingContours } from '../src/profile.js';

const area = points => points.reduce ((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
// A revolved beverage-can surface: body radius 33, neck 28.4 under a 28.9 mm rim 1.8 mm tall, 122 mm high.
function Can (cx, cz, { body = 33, neck = 28.4, rim = 28.9, height = 122, rimHeight = 1.8, segments = 48 } = {})
{
    const profile = [[0, 0], [body * 0.93, 0], [body, 5], [body, 110], [neck, height - 4], [neck, height - rimHeight - 0.4], [rim * 0.93, height - rimHeight], [rim, height - rimHeight], [rim, height], [rim * 0.93, height], [0, height - 1]];
    const points = [];
    for (const [r, y] of profile) { for (let s = 0; s < segments; s++) { const a = Math.PI * 2 * s / segments; points.push (cx + r * Math.cos (a), y, cz + r * Math.sin (a)); } }
    return new Float64Array (points);
}

describe ('CAD shape tools', () => {
    it ('rounds every rectangle corner with tangent arcs of the requested radius', () => {
        const { points, rounded } = FilletPolygon ([[0, 0], [100, 0], [100, 60], [0, 60]], 10);
        assert.equal (rounded, 4);
        assert.ok (points.every (p => p[0] >= -1e-9 && p[0] <= 100 + 1e-9 && p[1] >= -1e-9 && p[1] <= 60 + 1e-9));
        // A rounded rectangle loses (4 − π) r² of area.
        assert.ok (Math.abs (Math.abs (area (points)) - (6000 - (4 - Math.PI) * 100)) < 6);
        // Every point on the bottom-left arc is 10 mm from its centre (10, 10).
        points.filter (p => p[0] < 10 && p[1] < 10).forEach (p => assert.ok (Math.abs (Math.hypot (p[0] - 10, p[1] - 10) - 10) < 1e-9));
    });
    it ('rounds concave corners and shrinks a radius that does not fit', () => {
        const ell = [[0, 0], [60, 0], [60, 20], [20, 20], [20, 60], [0, 60]];
        const { points, rounded } = FilletPolygon (ell, 5, { corners : [3] });
        assert.equal (rounded, 1); assert.ok (points.some (p => p[0] > 20 && p[1] > 20));
        assert.doesNotThrow (() => PackagingContours ({ version : 1, name : 'L', grade : 'Custom', thickness : 1, paths : [{ id : 'o', type : 'cut', closed : true, points }] }));
        const tight = FilletPolygon ([[0, 0], [10, 0], [10, 10], [0, 10]], 50).points;
        assert.ok (tight.every (p => Math.abs (Math.hypot (p[0] - 5, p[1] - 5) - 5) < 1e-9));
        assert.throws (() => FilletPolygon ([[0, 0], [1, 0]], 1), /three points/);
        assert.throws (() => FilletPolygon ([[0, 0], [1, 0], [1, 1]], 0), /greater than zero/);
    });
    it ('draws circles and relief holes with tabs and V slits', () => {
        const circle = CircleOutline ([5, 5], 20); assert.ok (circle.length >= 24); circle.forEach (p => assert.ok (Math.abs (Math.hypot (p[0] - 5, p[1] - 5) - 20) < 1e-9));
        const hole = ReliefHoleOutline ({ center : [0, 0], holeRadius : 27, reliefRadius : 32, tabs : 16, notchWidthMm : 1.2, tipPoints : 2 });
        assert.equal (hole.length, 16 * 5);
        const radii = hole.map (p => Math.hypot (...p));
        assert.equal (radii.filter (r => Math.abs (r - 32) < 1e-9).length, 16);
        assert.equal (radii.filter (r => Math.abs (r - 27) < 1e-9).length, 16 * 4);
        assert.throws (() => ReliefHoleOutline ({ center : [0, 0], holeRadius : 10, reliefRadius : 10.1 }), /0.2 mm/);
        assert.throws (() => ReliefHoleOutline ({ center : [0, 0], holeRadius : 5, reliefRadius : 8, tabs : 40, notchWidthMm : 2 }), /too wide/);
    });
});

describe ('Can collar', () => {
    it ('senses the rim, its underside and the neck under it from surface points', () => {
        const rim = SenseCanRim (Can (100, -50));
        assert.deepEqual (rim.center.map (v => Number (v.toFixed (6))), [100, -50]);
        assert.ok (Math.abs (rim.rimRadiusMm - 28.9) < 1e-6);
        assert.ok (Math.abs (rim.rimBottomMm - (122 - 1.8)) < 1e-6);
        assert.ok (Math.abs (rim.neckRadiusMm - 28.4) < 1e-6);
        assert.ok (rim.undercutMm > 0.4);
    });
    it ('refuses models that are not round or have no rim to tuck under', () => {
        assert.throws (() => SenseCanRim (new Float64Array ([0, 0, 0, 10, 0, 0, 10, 50, 3, 0, 50, 3])), /round/);
        const straight = []; for (const y of [0, 50, 100]) { for (let s = 0; s < 24; s++) { const a = Math.PI * s / 12; straight.push (30 * Math.cos (a), y, 30 * Math.sin (a)); } }
        assert.throws (() => SenseCanRim (straight), /No rim/);
    });
    it ('plans a 2 × 3 six-pack collar: rounded outline, a tabbed relief hole per can, tabs tucked under the rim', () => {
        const cans = []; for (let row = 0; row < 2; row++) { for (let col = 0; col < 3; col++) { cans.push ([col * 66, row * 66]); } }
        const board = CollarBoards.find (b => b.id === 'cuk-24pt');
        const plan = CreateCanCollarPlan ({ cans, rimRadiusMm : 28.9, thickness : board.caliperMm });
        assert.equal (plan.profile.paths.length, 7); assert.equal (plan.cans, 6);
        assert.ok (Math.abs (plan.holeRadiusMm - 27.4) < 1e-9);
        // Reliefs go 3 mm past the rim; touching cans still leave a web of board between the holes.
        assert.ok (Math.abs (plan.reliefRadiusMm - 31.9) < 1e-9); assert.ok (Math.abs (plan.webMm - 2.2) < 1e-9);
        // Closer cans keep a 1.5 mm web by shortening the reliefs.
        assert.ok (Math.abs (CreateCanCollarPlan ({ cans : [[0, 0], [62, 0]], rimRadiusMm : 28.9, thickness : 0.6 }).reliefRadiusMm - 30.25) < 1e-9);
        assert.equal (plan.tabs, 16);
        const contours = PackagingContours (plan.profile); assert.equal (contours.length, 1); assert.equal (contours[0].holes.length, 6);
        // The outline is the cans' relief rings plus the 5 mm margin, starting at the profile origin.
        assert.ok (Math.abs (plan.sizeMm.length - (132 + 2 * (31.9 + 5))) < 1e-9);
        assert.ok (Math.abs (plan.sizeMm.width - (66 + 2 * (31.9 + 5))) < 1e-9);
        assert.ok (plan.points <= 2000);
        // Measurement layer: overall size and the tab tip / relief diameters of the first hole.
        const measure = (id) => { const d = plan.profile.engineering.dimensions.find (item => item.id === id), path = plan.profile.paths.find (p => p.id === d.pathId); const a = path.points[d.start], b = path.points[d.end]; return Math.hypot (b[0] - a[0], b[1] - a[1]); };
        assert.ok (Math.abs (measure ('collar-length') - plan.sizeMm.length) < 1e-6); assert.ok (Math.abs (measure ('collar-width') - plan.sizeMm.width) < 1e-6);
        assert.ok (Math.abs (measure ('tab-tip-diameter') - 2 * plan.holeRadiusMm) < 1e-6); assert.ok (Math.abs (measure ('relief-diameter') - 2 * plan.reliefRadiusMm) < 1e-6);
        // Each hole is centred on its can: profile X = world X − min X, profile Y = −world Z − min.
        const hole = plan.profile.paths[1].points, cx = hole.reduce ((s, p) => s + p[0], 0) / hole.length;
        assert.ok (Math.abs (cx - (31.9 + 5)) < 0.5);
    });
    it ('refuses cans whose rims overlap and fits big packs inside the point budget', () => {
        assert.throws (() => CreateCanCollarPlan ({ cans : [[0, 0], [50, 0]], rimRadiusMm : 28.9, thickness : 0.6 }), /too close/);
        const cans = []; for (let row = 0; row < 4; row++) { for (let col = 0; col < 6; col++) { cans.push ([col * 70, row * 70]); } }
        const plan = CreateCanCollarPlan ({ cans, rimRadiusMm : 28.9, thickness : 0.6 });
        assert.equal (plan.profile.paths.length, 25); assert.ok (plan.points <= 2000);
        assert.throws (() => CreateCanCollarPlan ({ cans : [...cans, [500, 500]], rimRadiusMm : 28.9, thickness : 0.6 }), /1–24 cans/);
    });
});
