import assert from 'node:assert/strict';
import { DefaultPulpDraft } from '../src/state.js';
import { PlanSheet, PlanTray } from '../src/plan.js';
import { ClampedKnots, Greville, FindSpan, BasisFuns, CurvePoint, SurfacePoint, AxisBasis, FitGrid, EvalGrid } from '../src/nurbs/bspline.js';
import { NurbsShell, MaxOutputSide } from '../src/nurbs/shell.js';
import { ShellBrep, BrepEdgeUses } from '../src/nurbs/brep.js';
import { WriteStep, WriteSurfaceStep, StepReal } from '../src/nurbs/step.js';
import { ProductSurface, ProductSurfaceProblem, SurfaceEdgeUses, FloorBlend, EndBlend } from '../src/nurbs/surface.js';
import { ClampUniformPeriodic, InsertKnot, SplitSurfaceV } from '../src/nurbs/bspline.js';
import { FormShell } from '../src/plan.js';
import { PulpTypes } from '../src/state.js';
import { IsoContours, PolygonArea } from '../src/nurbs/contours.js';
import { SeamOrder, FitPeriodic, PeriodicPoint, OutlineDeviation } from '../src/nurbs/periodic.js';
import { SurfaceDistance } from '../src/nurbs/measure.js';
import { LoftPocketWalls } from '../src/nurbs/loft.js';
import { FitOpen, OpenPoint, OpenKnots, OpenParams, OutlineCorners, RoundedOutline } from '../src/nurbs/open.js';

function Cylinder (cx, cz, radius, height, out, segments = 48)
{
    for (let s = 0; s < segments; s++) {
        const a = s / segments * Math.PI * 2, b = (s + 1) / segments * Math.PI * 2, p = [cx + Math.cos (a) * radius, cz + Math.sin (a) * radius], q = [cx + Math.cos (b) * radius, cz + Math.sin (b) * radius];
        out.push (cx, 0, cz, q[0], 0, q[1], p[0], 0, p[1], cx, height, cz, p[0], height, p[1], q[0], height, q[1], p[0], 0, p[1], q[0], 0, q[1], q[0], height, q[1], p[0], 0, p[1], q[0], height, q[1], p[0], height, p[1]);
    }
    return out;
}
const SixPack = (pitch = 86, segments = 48) => { const out = []; for (let i = 0; i < 3; i++) { for (let j = 0; j < 2; j++) { Cylinder (i * pitch, j * pitch, 33, 122, out, segments); } } return Float32Array.from (out); };

// Signed volume of a shell's B-rep from its oriented faces (each bilinear cell split in two triangles, wound
// counter-clockwise in parameter space and flipped for reversed faces). Positive means outward-facing faces.
function BrepVolume (shell)
{
    const brep = ShellBrep (shell), nets = { t : shell.top, b : shell.bottom }; let volume = 0;
    const tri = (a, b, c, flip) => { if (flip) { [b, c] = [c, b]; } volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; };
    const at = (net, index) => [net.points[index * 3], net.points[index * 3 + 1], net.points[index * 3 + 2]];
    for (const face of brep.faces) {
        const flip = !face.sameSense;
        if (face.kind === 'surface') {
            const net = nets[face.face];
            for (let b = 0; b + 1 < net.countV; b++) { for (let a = 0; a + 1 < net.countU; a++) { const p = (i, j) => at (net, j * net.countU + i); tri (p (a, b), p (a + 1, b), p (a + 1, b + 1), flip); tri (p (a, b), p (a + 1, b + 1), p (a, b + 1), flip); } }
        } else {
            const top = face.perimeter.top, bottom = face.perimeter.bottom;
            for (let s = 0; s + 1 < top.length; s++) { const t0 = at (nets.t, top[s]), t1 = at (nets.t, top[s + 1]), b0 = at (nets.b, bottom[s]), b1 = at (nets.b, bottom[s + 1]); tri (t0, t1, b1, flip); tri (t0, b1, b0, flip); }
        }
    }
    return volume;
}

describe ('Molded Pulp NURBS core', () => {
    it ('evaluates clamped cubic B-splines with partition of unity and linear precision at the Greville abscissae', () => {
        const knots = ClampedKnots ([1, 2.5, 4], 0, 6), N = new Float64Array (4);
        for (let u = 0; u <= 6; u += 0.37) { const span = FindSpan (knots, u); BasisFuns (knots, span, u, 3, N); assert.ok (Math.abs (N.reduce ((s, v) => s + v, 0) - 1) < 1e-12); }
        const g = Greville (knots), points = new Float64Array (g.length * 3); g.forEach ((x, i) => { points[i * 3] = x; points[i * 3 + 1] = 2 * x + 1; });
        for (const u of [0, 0.5, 2.5, 5.99, 6]) { const p = CurvePoint ({ degree : 3, knots, points }, u); assert.ok (Math.abs (p[0] - u) < 1e-12 && Math.abs (p[1] - (2 * u + 1)) < 1e-12); }
    });
    it ('fits grid data with separable least squares and reproduces a bicubic polynomial exactly', () => {
        const nx = 41, nz = 33, xs = Float64Array.from ({ length : nx }, (_, i) => i * 0.5), zs = Float64Array.from ({ length : nz }, (_, j) => j * 0.75);
        const f = (x, z) => 0.01 * x * x * x - 0.2 * x * z + 0.03 * z * z * z + 1, values = new Float32Array (nx * nz);
        for (let j = 0; j < nz; j++) { for (let i = 0; i < nx; i++) { values[j * nx + i] = f (xs[i], zs[j]); } }
        const bx = AxisBasis (ClampedKnots ([5, 10, 15], 0, 20), xs), bz = AxisBasis (ClampedKnots ([8, 16], 0, 24), zs), C = FitGrid (values, bx, bz), fitted = EvalGrid (C, bx, bz);
        let max = 0; for (let k = 0; k < values.length; k++) { max = Math.max (max, Math.abs (fitted[k] - values[k]) / Math.max (1, Math.abs (values[k]))); }
        assert.ok (max < 1e-5, 'relative error ' + max);
        const gu = Greville (bx.knots), gv = Greville (bz.knots), points = new Float64Array (bx.count * bz.count * 3);
        for (let b = 0; b < bz.count; b++) { for (let a = 0; a < bx.count; a++) { const k = (b * bx.count + a) * 3; points[k] = gu[a]; points[k + 1] = C[b * bx.count + a]; points[k + 2] = gv[b]; } }
        const p = SurfacePoint ({ degreeU : 3, degreeV : 3, knotsU : bx.knots, knotsV : bz.knots, countU : bx.count, points }, 7.3, 11.1);
        assert.ok (Math.abs (p[0] - 7.3) < 1e-9 && Math.abs (p[2] - 11.1) < 1e-9 && Math.abs (p[1] - f (7.3, 11.1)) < 1e-3);
    });
});

describe ('Molded Pulp NURBS output and STEP', function () {
    this.timeout (120000);
    const draft = { ...DefaultPulpDraft ('type2'), formDepthMm : 35, detail : 'draft' };
    it ('builds a closed shell through every review node, oriented outward, with the review volume', () => {
        const plan = PlanTray (SixPack (), draft), shell = plan.nurbs.shells[0];
        assert.equal (plan.nurbs.units, 'mm'); assert.equal (plan.nurbs.shells.length, 1); assert.equal (shell.id, 'Tray');
        assert.equal (shell.top.countU * shell.top.countV * 3, shell.top.points.length); assert.deepEqual (shell.nodes, [shell.top.countU, shell.top.countV]);
        const uses = BrepEdgeUses (ShellBrep (shell)); assert.equal (Object.keys (uses).length, 12);
        for (const [edge, use] of Object.entries (uses)) { assert.deepEqual (use, { forward : 1, reversed : 1 }, edge); }
        const volume = BrepVolume (shell) / 1000; assert.ok (volume > 0, 'outward faces');
        assert.ok (Math.abs (volume - plan.metrics.volumeCm3) / plan.metrics.volumeCm3 < 0.02, volume + ' vs review ' + plan.metrics.volumeCm3);
        // The product-side face lies on the formed surface: a perimeter node sits on the base plane (y = 0 here).
        assert.ok (Math.abs (shell.top.points[1]) < 1e-6); assert.ok (shell.bottom.points[1] < -draft.thicknessMm + 1e-6);
    });
    it ('keeps outward orientation for clamshell shells formed along other pull directions, and for sheets', () => {
        for (const clamshell of ['top-bottom', 'side-x', 'side-z']) {
            const plan = PlanTray (SixPack (), { ...draft, clamshell, hinge : false });
            assert.deepEqual (plan.nurbs.shells.map (s => s.id), ['Shell A', 'Shell B']);
            for (const shell of plan.nurbs.shells) { assert.ok (BrepVolume (shell) > 0, clamshell + ' ' + shell.id); }
        }
        const sheet = PlanSheet (SixPack (), draft); assert.equal (sheet.nurbs.shells.length, 1);
        const box = sheet.nurbs.shells[0]; assert.deepEqual (box.nodes, [2, 2]);
        assert.ok (Math.abs (BrepVolume (box) / 1000 - sheet.metrics.volumeCm3) < 0.05 + sheet.metrics.volumeCm3 * 1e-6);
    });
    it ('subsamples fine review grids to at most 513 nodes per side, exactly on review nodes', () => {
        const n = 1025, grid = { nx : n, nz : n, dx : 0.25, dz : 0.25, x0 : 0, z0 : 0 }, top = new Float32Array (n * n), bottom = new Float32Array (n * n);
        for (let k = 0; k < top.length; k++) { top[k] = (k % 7) * 0.5; bottom[k] = top[k] - 2; }
        const shell = NurbsShell (grid, { top, bottom });
        assert.equal (shell.stride, 2); assert.deepEqual (shell.nodes, [MaxOutputSide, MaxOutputSide]);
        assert.equal (shell.top.points[(1 * 513 + 3) * 3 + 1], top[2 * n + 6]);
    });
    it ('writes valid AP214 STEP text with one manifold solid per shell and every reference defined', () => {
        for (const clamshell of ['none', 'top-bottom']) {
            const plan = PlanTray (SixPack (), { ...draft, clamshell }), text = WriteStep (plan.nurbs.shells, { name : 'Six pack ' + clamshell, timestamp : '2026-11-18T00:00:00' });
            assert.match (text, /^ISO-10303-21;\nHEADER;/); assert.match (text, /FILE_SCHEMA\(\('AUTOMOTIVE_DESIGN \{ 1 0 10303 214 1 1 1 1 \}'\)\);/); assert.match (text, /END-ISO-10303-21;\n$/);
            assert.equal ((text.match (/MANIFOLD_SOLID_BREP\(/g) || []).length, plan.nurbs.shells.length);
            assert.equal ((text.match (/ADVANCED_FACE\(/g) || []).length, 6 * plan.nurbs.shells.length);
            assert.equal ((text.match (/EDGE_CURVE\(/g) || []).length, 12 * plan.nurbs.shells.length);
            assert.match (text, /SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
            const data = text.slice (text.indexOf ('DATA;') + 5, text.indexOf ('ENDSEC;', text.indexOf ('DATA;'))).trim ().split ('\n');
            const defined = new Set (data.map (line => line.slice (0, line.indexOf ('='))));
            for (const line of data) { assert.match (line, /^#\d+=.*;$/); for (const ref of line.slice (line.indexOf ('=')).match (/#\d+/g) || []) { assert.ok (defined.has (ref), ref + ' in ' + line.slice (0, 80)); } }
            assert.ok (!/[^.\dE+-]\d+e/.test (text), 'no lowercase exponents');
        }
        assert.deepEqual ([1, 0, -0, 0.5, 1e-7, 1e21].map (StepReal), ['1.', '0.', '0.', '0.5', '1.E-7', '1.E+21']);
        assert.throws (() => WriteStep ([]), /Form a sheet or tray/);
    });
});

describe ('Molded Pulp Phase 2: lofted pocket walls', function () {
    this.timeout (120000);
    it ('traces closed iso-contours and fits them with periodic cubics', () => {
        const n = 65, grid = { nx : n, nz : n, dx : 1, dz : 1, x0 : -32, z0 : -32 }, cone = new Float32Array (n * n);
        for (let j = 0; j < n; j++) { for (let i = 0; i < n; i++) { cone[j * n + i] = Math.hypot (i - 32, j - 32); } }
        const [ring] = IsoContours (cone, grid, 20); assert.equal (ring.closed, true); assert.ok (Math.abs (Math.abs (PolygonArea (ring.points)) - Math.PI * 400) < 4);
        const o = SeamOrder (ring.points, [0, 0]); assert.ok (o.points[0][0] > 19.5 && Math.abs (o.points[0][1]) < 1, 'seam on +x'); assert.ok (o.params.every ((t, k) => k === 0 || t > o.params[k - 1]));
        const fit = FitPeriodic (o.points, o.params, 16); assert.ok (OutlineDeviation (o.points, fit) < 0.05);
        const p = PeriodicPoint (fit, 0.25); assert.ok (Math.abs (Math.hypot (p[0], p[1]) - 20) < 0.05 && p[1] > 19, 'counter-clockwise in (x, z)');
        const distance = SurfaceDistance (grid, cone); assert.ok (Math.abs (distance (0, 25, 20) - 5 / Math.SQRT2) < 0.05, 'true 3D distance to a 45° cone');
    });
    it ('lofts each pocket wall as one cubic surface within a quarter of the Type 2 tolerance (T1)', () => {
        const draft = { ...DefaultPulpDraft ('type2'), formDepthMm : 35, ribs : 'off', lugs : 'off' }, shell = FormShell (SixPack (86, 96), draft, { keepSurfaces : true });
        const result = LoftPocketWalls (shell.grid, shell.surfaces.top, { depthMm : shell.metrics.achievedDepthMm, wallToleranceMm : 0.25 * PulpTypes.type2.toleranceMm });
        assert.equal (result.ok, true, result.reason); assert.equal (result.walls.length, 6); assert.deepEqual (result.merges, []);
        assert.ok (result.maxDistanceMm <= 0.3125, 'max ' + result.maxDistanceMm); assert.ok (result.controls < 1000, result.controls + ' controls vs ' + shell.grid.n ** 2 + ' per Phase 1 face');
        for (const wall of result.walls) {
            const s = wall.surface; assert.equal (s.countU, wall.outlineControls + 3); assert.equal (s.knotsU.length, s.countU + 4); assert.equal (s.knotsV.length, s.countV + 4);
            for (const [t, h] of [[0, 1], [0.37, 17], [0.9, 33]]) { assert.ok (Math.abs (SurfacePoint (s, t, h)[1] - h) < 1e-9, 'y follows the height parameter'); }
            const a = SurfacePoint (s, 0, 10), b = SurfacePoint (s, 1 - 1e-12, 10); assert.ok (Math.hypot (a[0] - b[0], a[2] - b[2]) < 1e-6, 'closed around the pocket');
        }
    });
    it ('reports pockets that join below the plateau instead of writing a wrong wall (T2)', () => {
        const shell = FormShell (SixPack (70, 48), { ...DefaultPulpDraft ('type2'), formDepthMm : 35, detail : 'draft', ribs : 'off', lugs : 'off' }, { keepSurfaces : true });
        const result = LoftPocketWalls (shell.grid, shell.surfaces.top, { depthMm : shell.metrics.achievedDepthMm });
        assert.equal (result.ok, false); assert.match (result.reason, /join below the plateau/); assert.ok (result.merges.length > 0); assert.deepEqual (result.walls, []);
    });
});

describe ('Molded Pulp open sides and outline corners', () => {
    it ('pins open side fits to their end points and finds the corners of a rectangle', () => {
        const side = Array.from ({ length : 41 }, (_, i) => [i, Math.sin (i / 40 * Math.PI) * 3]), fit = FitOpen (side, OpenParams (side), 8);
        assert.deepEqual (fit[0], side[0]); assert.deepEqual (fit[7], side[40]); assert.deepEqual (OpenPoint (fit, OpenKnots (8), 1), side[40]);
        const rect = []; for (let i = 0; i < 40; i++) { rect.push ([i, 0]); } for (let i = 0; i < 20; i++) { rect.push ([40, i]); } for (let i = 40; i > 0; i--) { rect.push ([i, 20]); } for (let i = 20; i > 0; i--) { rect.push ([0, i]); }
        assert.deepEqual (OutlineCorners (rect).map (i => rect[i]), [[0, 0], [40, 0], [40, 20], [0, 20]]);
    });
});

describe ('Molded Pulp smooth wall check and the outer skirt option', function () {
    this.timeout (180000);
    it ('keeps the skirt option off by default and validates it', async () => {
        const { UpdatePulpDraft } = await import ('../src/state.js');
        const draft = DefaultPulpDraft ('type2'); assert.equal (draft.skirtWall, false);
        assert.equal (UpdatePulpDraft (draft, { skirtWall : true }).skirtWall, true);
        assert.throws (() => UpdatePulpDraft (draft, { skirtWall : 'yes' }), /Outer skirt wall must be true or false/);
    });
    it ('reports pocket walls only with the skirt off, and the skirt wall when it is on', () => {
        // Standard detail: at Draft (about 2 mm cells) a 4° wall is about one cell wide, too coarse to judge a smooth wall.
        const base = { ...DefaultPulpDraft ('type2'), formDepthMm : 35, detail : 'standard', ribs : 'off', lugs : 'off' };
        const off = PlanTray (SixPack (86, 48), base, { loftCheck : true }).loft[0];
        assert.equal (off.ok, true, off.reason); assert.equal (off.walls.length, 6); assert.ok (off.walls.every (w => w.kind === 'pocket'));
        assert.equal (PlanTray (SixPack (86, 48), base).loft, undefined, 'no check unless asked');
        const on = PlanTray (SixPack (86, 48), { ...base, skirtWall : true }, { loftCheck : true }).loft[0];
        // The rectangular sheet gives the skirt four sharp plan corners: it is lofted as four sides that meet at them.
        const sides = on.walls.filter (w => w.kind === 'skirt');
        assert.deepEqual (sides.map (w => w.id), ['Outer skirt side 1', 'Outer skirt side 2', 'Outer skirt side 3', 'Outer skirt side 4']);
        assert.equal (on.ok, true, on.reason); assert.ok (sides.every (w => w.withinTolerance && w.maxDistanceMm <= 0.3125), JSON.stringify (sides));
        // Straight sides stay at the minimum control count; walls span floor (y = 0) to plateau (y = depth) exactly.
        assert.ok (sides.every (w => w.outlineControls === 4), JSON.stringify (sides.map (w => w.outlineControls)));
        assert.deepEqual (on.faces.map (f => f.kind), ['plane', 'plane', 'plane', 'plane', 'plane', 'plane', 'plane']);
        assert.equal (on.faces.at (-1).id, 'Plateau'); assert.equal (on.faces.at (-1).holes, 6);
    });
});

describe ('Molded Pulp smooth product surface output', function () {
    this.timeout (180000);
    it ('rewrites a periodic cubic in clamped form without changing it', () => {
        for (const m of [4, 9, 31]) {
            const ring = Array.from ({ length : m }, (_, i) => [Math.cos (i) * 10 + i, Math.sin (i * 1.3) * 7]), c = ClampUniformPeriodic (ring.flat (), m);
            assert.equal (c.knots.length, m + 7); assert.equal (c.points.length, (m + 3) * 2);
            const points = new Float64Array ((m + 3) * 3); for (let i = 0; i < m + 3; i++) { points[i * 3] = c.points[i * 2]; points[i * 3 + 2] = c.points[i * 2 + 1]; }
            for (let q = 0; q <= 100; q++) {
                // Standard indexing puts the curve at parameter t where PeriodicPoint has t + 1/m.
                const a = CurvePoint ({ degree : 3, knots : c.knots, points }, q / 100), b = PeriodicPoint (ring, q / 100 + 1 / m);
                assert.ok (Math.hypot (a[0] - b[0], a[2] - b[1]) < 1e-9);
            }
        }
        const line = InsertKnot (Float64Array.of (0, 0, 1, 1), Float64Array.of (0, 2), 1, 0.25, 1);
        assert.deepEqual ([...line.knots], [0, 0, 0.25, 1, 1]); assert.deepEqual ([...line.points], [0, 0.5, 2]);
    });
    it ('builds the six-can product side as one open shell with shared edges and writes it as STEP', () => {
        const draft = { ...DefaultPulpDraft ('type2'), formDepthMm : 35, detail : 'standard', ribs : 'off', lugs : 'off', skirtWall : true };
        const shell = FormShell (SixPack (86, 48), draft, { keepSurfaces : true });
        const loft = LoftPocketWalls (shell.grid, shell.surfaces.top, { depthMm : shell.metrics.achievedDepthMm, wallToleranceMm : 0.25 * PulpTypes.type2.toleranceMm, skirtWall : true });
        assert.equal (ProductSurfaceProblem (loft), null);
        assert.match (ProductSurfaceProblem ({ ...loft, walls : loft.walls.filter (w => w.kind !== 'skirt') }), /outer skirt wall/);
        assert.match (ProductSurfaceProblem ({ ...loft, faces : [{ id : 'Pocket 1 floor', kind : 'patch-needed', raisedMm : 4.2 }] }), /raised 4\.2 mm/);
        // Skirt sides share one height knot vector, so neighbours share their corner columns.
        const sides = loft.walls.filter (w => w.kind === 'skirt'); assert.equal (new Set (sides.map (w => w.heightControls)).size, 1);
        const surface = ProductSurface (loft, { baseY : shell.rect.baseY, id : 'Tray' });
        // Closed pocket walls are written as two halves each: 12 + 4 skirt sides + 6 floors + the plateau.
        assert.equal (surface.faces.length, 23); assert.deepEqual (surface.faces.map (f => f.kind).filter (k => k === 'plane').length, 7);
        // Every edge is used once in each direction, except the four open skirt bottom edges (once each).
        const uses = SurfaceEdgeUses (surface), once = uses.filter (u => u.forward + u.reversed === 1);
        assert.equal (once.length, 4); assert.ok (uses.every (u => (u.forward === 1 && u.reversed === 1) || u.forward + u.reversed === 1));
        // Edge curves end exactly on their vertices; plane boundaries lie in their planes.
        for (const e of surface.edges) {
            assert.deepEqual (e.points[0], surface.vertices[e.from].point); assert.deepEqual (e.points.at (-1), surface.vertices[e.to].point);
        }
        for (const face of surface.faces.filter (f => f.kind === 'plane')) {
            for (const b of face.bounds) { for (const [e] of b.loop) { assert.ok (surface.edges[e].points.every (p => Math.abs (p[1] - face.origin[1]) < 1e-9), face.name); } }
        }
        // Face normals (Su × Sv, flipped when not sameSense) point to the product side: into each pocket (towards its seed)
        // and away from the tray on the skirt.
        const centre = [shell.rect.x0 + shell.rect.lengthMm / 2, shell.rect.z0 + shell.rect.widthMm / 2];
        for (const face of surface.faces.filter (f => f.kind === 'bspline')) {
            const sf = face.surface, u = 0.37 * sf.knotsU.at (-1) + 0.63 * sf.knotsU[0], v = (sf.knotsV[0] + sf.knotsV.at (-1)) / 2, h = 1e-5;
            const p = SurfacePoint (sf, u, v), du = SurfacePoint (sf, u + h, v).map ((x, i) => x - p[i]), dv = SurfacePoint (sf, u, v + h).map ((x, i) => x - p[i]);
            const n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]].map (x => face.sameSense ? x : -x);
            const pocket = loft.walls.find (w => w.kind === 'pocket' && (face.name === w.id + ' a' || face.name === w.id + ' b'));
            const towards = pocket ? [pocket.seed[0] - p[0], pocket.seed[1] - p[2]] : [p[0] - centre[0], p[2] - centre[1]];
            assert.ok (n[0] * towards[0] + n[2] * towards[1] > 0, face.name + ' faces the product side');
        }
        const text = WriteSurfaceStep ([surface], { name : 'Six can tray', timestamp : '2026-11-19T00:00:00' });
        assert.match (text, /^ISO-10303-21;/); assert.match (text, /OPEN_SHELL\('Tray'/); assert.match (text, /SHELL_BASED_SURFACE_MODEL/); assert.match (text, /MANIFOLD_SURFACE_SHAPE_REPRESENTATION/);
        assert.equal ((text.match (/ADVANCED_FACE\(/g) || []).length, 23); assert.equal ((text.match (/EDGE_CURVE\(/g) || []).length, surface.edges.length);
        assert.throws (() => WriteSurfaceStep ([]), /Form a tray/);

        // Floor fillets: each wall is split exactly at floor + r and a cubic blend joins it to the floor, tangent to both.
        const wall = loft.walls[0], r = 4, { lower, upper } = SplitSurfaceV (wall.surface, r);
        for (const [u, v] of [[0.2, 1], [0.7, 3], [0.4, 20]]) { const a = SurfacePoint (wall.surface, u, v), b = SurfacePoint (v <= r ? lower : upper, u, v); assert.ok (Math.hypot (a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-9); }
        const { wall : trimmed, surface : blend } = FloorBlend (wall.surface, wall.seed, r), h = 1e-6;
        for (let q = 0; q <= 20; q++) {
            const u = q / 20, top = SurfacePoint (blend, u, 1), foot = SurfacePoint (trimmed, u, r);
            assert.ok (Math.hypot (top[0] - foot[0], top[1] - foot[1], top[2] - foot[2]) < 1e-9, 'blend meets the trimmed wall');
            assert.ok (Math.abs (SurfacePoint (blend, u, 0)[1]) < 1e-12, 'blend starts on the floor');
            // Tangent to the floor: the blend leaves it horizontally. Tangent to the wall: parallel height derivatives.
            const b0 = SurfacePoint (blend, u, h); assert.ok (Math.abs (b0[1]) < 1e-9);
            const b1 = SurfacePoint (blend, u, 1 - h).map ((x, i) => top[i] - x), w1 = SurfacePoint (trimmed, u, r + h).map ((x, i) => x - foot[i]);
            const cross = [b1[1] * w1[2] - b1[2] * w1[1], b1[2] * w1[0] - b1[0] * w1[2], b1[0] * w1[1] - b1[1] * w1[0]];
            assert.ok (Math.hypot (...cross) < 1e-6 * Math.hypot (...b1) * Math.hypot (...w1), 'tangent to the wall');
        }
        const filleted = ProductSurface (loft, { baseY : shell.rect.baseY, id : 'Tray', floorFilletMm : 4 });
        assert.equal (filleted.faces.length, 35); assert.equal (filleted.faces.filter (f => / floor fillet [ab]$/.test (f.name)).length, 12);
        assert.equal (SurfaceEdgeUses (filleted).filter (u => u.forward + u.reversed === 1).length, 4);
        assert.match (ProductSurfaceProblem (loft, { floorFilletMm : 30 }), /at most 80% of the form depth/);
        assert.match (ProductSurfaceProblem (loft, { rimFilletMm : 4 }), /Round the skirt corners/);
    });
});

describe ('Molded Pulp fully rounded product surface', function () {
    this.timeout (180000);
    it ('rounds the skirt corners and fillets every rim, tangent to the walls and the plateau', () => {
        const base = { ...DefaultPulpDraft ('type2'), formDepthMm : 35, detail : 'standard', ribs : 'off', lugs : 'off', skirtWall : true };
        const loftOf = draft => { const shell = FormShell (SixPack (86, 48), draft, { keepSurfaces : true }); return { shell, loft : LoftPocketWalls (shell.grid, shell.surfaces.top, { depthMm : shell.metrics.achievedDepthMm, wallToleranceMm : 0.25 * PulpTypes.type2.toleranceMm, skirtWall : true, skirtCornerMm : 10 }) }; };
        // Default extra material leaves 3.5 mm of plateau between the corner pockets and the skirt: no room for 4 mm rims.
        const narrow = loftOf (base).loft;
        assert.equal (narrow.ok, true, narrow.reason); assert.match (ProductSurfaceProblem (narrow, { rimFilletMm : 4 }), /too narrow for two 4 mm rim fillets/);
        const { shell, loft } = loftOf ({ ...base, extraLengthMm : 40, extraWidthMm : 40 });
        const skirt = loft.walls.find (w => w.kind === 'skirt');
        assert.equal (skirt.id, 'Outer skirt'); assert.equal (skirt.surface.closedU, true); assert.ok (skirt.withinTolerance, String (skirt.maxDistanceMm));
        assert.equal (ProductSurfaceProblem (loft, { floorFilletMm : 4, rimFilletMm : 4 }), null);
        const surface = ProductSurface (loft, { baseY : shell.rect.baseY, floorFilletMm : 4, rimFilletMm : 4 });
        // 6 pockets × 3 bands × 2 halves, the skirt and its top fillet × 2 halves, 6 floors, the plateau.
        assert.equal (surface.faces.length, 47);
        const uses = SurfaceEdgeUses (surface); assert.equal (uses.filter (u => u.forward + u.reversed === 1).length, 2, 'only the skirt bottom is open');
        assert.ok (uses.every (u => (u.forward === 1 && u.reversed === 1) || u.forward + u.reversed === 1));
        const plateau = surface.faces.find (f => f.name === 'Plateau'); assert.equal (plateau.bounds.length, 7);
        for (const b of plateau.bounds) { for (const [e] of b.loop) { assert.ok (surface.edges[e].points.every (p => Math.abs (p[1] - plateau.origin[1]) < 1e-9)); } }
        // Rim blend: meets the trimmed wall and leaves the plateau horizontally (tangent to both).
        const wall = loft.walls[0], { wall : trimmed, surface : rim } = EndBlend (wall.surface, wall.seed, 4, 'top', -1), top = trimmed.knotsV.at (-1), h = 1e-6;
        for (let q = 0; q <= 20; q++) {
            const u = q / 20, a = SurfacePoint (rim, u, 0), w = SurfacePoint (trimmed, u, top);
            assert.ok (Math.hypot (a[0] - w[0], a[1] - w[1], a[2] - w[2]) < 1e-9);
            const r1 = SurfacePoint (rim, u, 1); assert.ok (Math.abs (r1[1] - (top + 4)) < 1e-9, 'ends on the plateau');
            assert.ok (Math.abs (SurfacePoint (rim, u, 1 - h)[1] - r1[1]) < 1e-9, 'horizontal into the plateau');
            const b0 = SurfacePoint (rim, u, h).map ((x, i) => x - a[i]), w0 = SurfacePoint (trimmed, u, top - h).map ((x, i) => w[i] - x);
            const cross = [b0[1] * w0[2] - b0[2] * w0[1], b0[2] * w0[0] - b0[0] * w0[2], b0[0] * w0[1] - b0[1] * w0[0]];
            assert.ok (Math.hypot (...cross) < 1e-6 * Math.hypot (...b0) * Math.hypot (...w0), 'tangent to the wall');
            // Away from the pocket: the plateau side of the rim is farther from the seed than the wall top.
            assert.ok (Math.hypot (r1[0] - wall.seed[0], r1[2] - wall.seed[1]) > Math.hypot (w[0] - wall.seed[0], w[2] - wall.seed[1]));
        }
        const text = WriteSurfaceStep ([surface], { name : 'Rounded six can tray', timestamp : '2026-11-19T00:00:00' });
        assert.equal ((text.match (/ADVANCED_FACE\(/g) || []).length, 47);
    });
    it ('rebuilds a sharp-cornered outline with tangent arcs', () => {
        const rect = []; for (let i = 0; i < 40; i++) { rect.push ([i, 0]); } for (let i = 0; i < 20; i++) { rect.push ([40, i]); } for (let i = 40; i > 0; i--) { rect.push ([i, 20]); } for (let i = 20; i > 0; i--) { rect.push ([0, i]); }
        const r = RoundedOutline (rect, OutlineCorners (rect), 5);
        assert.ok (r.apexes.every ((p, i) => Math.hypot (p[0] - [0, 40, 40, 0][i], p[1] - [0, 0, 20, 20][i]) < 1e-9)); assert.ok (Math.abs (r.reach - 5) < 1e-9);
        const arc = r.points.filter (p => p[0] < 5 && p[1] < 5).map (p => Math.hypot (p[0] - 5, p[1] - 5)); assert.ok (arc.length > 5 && arc.every (d => Math.abs (d - 5) < 1e-9));
        // Only the corner zones change: a bump in the middle of a side (a stacking lug) is kept as traced.
        const bumped = rect.map (([x, z]) => [x, z === 0 && x >= 15 && x <= 25 ? -1.5 : z]), kept = RoundedOutline (bumped, OutlineCorners (bumped), 5);
        assert.equal (kept.points.filter (p => p[1] === -1.5).length, 11);
        let area = 0; for (let i = 0; i < r.points.length; i++) { const a = r.points[i], b = r.points[(i + 1) % r.points.length]; area += a[0] * b[1] - b[0] * a[1]; }
        assert.ok (Math.abs (area / 2 - (800 - (4 - Math.PI) * 25)) < 0.5, 'each arc inserted once');
    });
});

describe ('Molded Pulp smooth surface plan with automatic extra material', function () {
    this.timeout (240000);
    it ('raises the extra material until the rim fillets fit and builds the rounded surface', async () => {
        const { PlanSmoothSurface, SmoothSurfaceRadii } = await import ('../src/plan.js');
        const draft = { ...DefaultPulpDraft ('type2'), formDepthMm : 35, detail : 'standard', ribs : 'off', lugs : 'off' };
        assert.deepEqual (SmoothSurfaceRadii (draft), { floorFilletMm : 4, rimFilletMm : 4, skirtCornerMm : 10 });
        const plan = PlanSmoothSurface (SixPack (86, 48), draft);
        // Default 20 mm leaves 3.5 mm of plateau at the edge; 4 mm rims need 8.5 mm.
        assert.ok (plan.raisedExtraMm > 0, String (plan.raisedExtraMm)); assert.equal (plan.smoothDraft.extraLengthMm, 20 + plan.raisedExtraMm); assert.equal (plan.smoothDraft.extraWidthMm, 20 + plan.raisedExtraMm);
        assert.equal (draft.extraLengthMm, 20, 'the input draft is not changed');
        const [shell] = plan.smooth; assert.equal (shell.problem, undefined); assert.equal (shell.faces, 47);
        assert.ok (shell.land.skirtMm >= 8.5 && shell.land.pocketMm >= 8.5, JSON.stringify (shell.land));
        assert.equal (SurfaceEdgeUses (shell.surface).filter (u => u.forward + u.reversed === 1).length, 2);
        // Pockets that join below the plateau cannot be fixed with extra material: the loft's reason is reported.
        assert.throws (() => PlanSmoothSurface (SixPack (70, 48), draft), /join below the plateau/);
    });
});

describe ('Molded Pulp raised floors (domed and recessed can bases)', function () {
    this.timeout (300000);
    const cans = async id => {
        const { CreatePrimaryProduct, ProductDesign } = await import ('../../primary-products/src/index.js');
        const d = ProductDesign (id), can = CreatePrimaryProduct (d), pitch = d.diameterMm + 20, tris = [];
        for (let i = 0; i < 3; i++) { for (let j = 0; j < 2; j++) { for (const c of can.components) { for (const k of c.indices) { tris.push (c.positions[k * 3] + i * pitch, c.positions[k * 3 + 1], c.positions[k * 3 + 2] + j * pitch); } } } }
        return Float32Array.from (tris);
    };
    it ('fits a floor band from the wall to a flat cap on a domed beverage base, smooth at the wall, the cap and the seam', async () => {
        const draft = { ...DefaultPulpDraft ('type2'), formDepthMm : 35, detail : 'standard' }, shell = FormShell (await cans ('standard-beverage'), draft, { keepSurfaces : true });
        const loft = LoftPocketWalls (shell.grid, shell.surfaces.top, { depthMm : shell.metrics.achievedDepthMm, wallToleranceMm : 0.3125, skirtWall : true, skirtCornerMm : 10 });
        const floors = loft.faces.filter (f => / floor$/.test (f.id));
        assert.equal (floors.length, 6); assert.ok (floors.every (f => f.kind === 'patch' && f.raisedMm > 9 && f.patch.maxDistanceMm <= 0.3125), JSON.stringify (floors.map (f => [f.kind, f.raisedMm, f.patch?.maxDistanceMm])));
        const wall = loft.walls[0], { patch } = floors[0], band = patch.surface, h = 1e-6;
        for (let q = 0; q <= 24; q++) {
            const u = q / 24, foot = SurfacePoint (band, u, 1), wallFoot = SurfacePoint (wall.surface, u, wall.surface.knotsV[0]);
            assert.ok (Math.hypot (foot[0] - wallFoot[0], foot[1] - wallFoot[1], foot[2] - wallFoot[2]) < 1e-9, 'shares the wall foot');
            // Tangent to the wall: the band's derivative into the foot is parallel to the wall's height derivative.
            const b1 = SurfacePoint (band, u, 1 - h).map ((x, i) => foot[i] - x), w1 = SurfacePoint (wall.surface, u, wall.surface.knotsV[0] + h).map ((x, i) => x - wallFoot[i]);
            const cross = [b1[1] * w1[2] - b1[2] * w1[1], b1[2] * w1[0] - b1[0] * w1[2], b1[0] * w1[1] - b1[1] * w1[0]];
            assert.ok (Math.hypot (...cross) < 1e-5 * Math.hypot (...b1) * Math.hypot (...w1), 'tangent to the wall');
            // Level at the cap ring, so it meets the flat cap tangentially.
            const ring = SurfacePoint (band, u, 0); assert.ok (Math.abs (ring[1] - patch.capY) < 1e-9); assert.ok (Math.abs (SurfacePoint (band, u, h)[1] - patch.capY) < 1e-6);
        }
        // Smooth across the seam: the derivative around the pocket matches on both sides of u = 0.
        for (const v of [0.2, 0.5, 0.8]) {
            const a = SurfacePoint (band, h, v).map ((x, i) => (x - SurfacePoint (band, 0, v)[i]) / h), b = SurfacePoint (band, 1, v).map ((x, i) => (x - SurfacePoint (band, 1 - h, v)[i]) / h);
            assert.ok (Math.hypot (a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-3 * Math.hypot (...a), 'C1 at the seam');
        }
        const surface = ProductSurface (loft, { baseY : shell.rect.baseY, floorFilletMm : 0, rimFilletMm : 0 }).faces;
        assert.equal (surface.filter (f => / floor [ab]$/.test (f.name)).length, 12); assert.equal (surface.filter (f => / floor cap$/.test (f.name)).length, 6);
    });
    it ('plans the rounded smooth surface for real beverage and food cans', async () => {
        const { PlanSmoothSurface } = await import ('../src/plan.js');
        for (const id of ['standard-beverage', 'food-can']) {
            const plan = PlanSmoothSurface (await cans (id), { ...DefaultPulpDraft ('type2'), formDepthMm : 35, detail : 'standard' });
            const [shell] = plan.smooth; assert.equal (shell.problem, undefined, id); assert.equal (shell.faces, 47, id);
            assert.equal (SurfaceEdgeUses (shell.surface).filter (u => u.forward + u.reversed === 1).length, 2, id);
        }
    });
});

describe ('Molded Pulp smooth display mesh', function () {
    this.timeout (300000);
    it ('shows a formed tray from its smooth surface: watertight, and the review mesh at Draft', async () => {
        const { CreatePrimaryProduct, ProductDesign } = await import ('../../primary-products/src/index.js');
        const d = ProductDesign ('standard-beverage'), can = CreatePrimaryProduct (d), tris = [];
        for (let i = 0; i < 3; i++) { for (let j = 0; j < 2; j++) { for (const c of can.components) { for (const k of c.indices) { tris.push (c.positions[k * 3] + i * 86.2, c.positions[k * 3 + 1], c.positions[k * 3 + 2] + j * 86.2); } } } }
        const draft = { ...DefaultPulpDraft ('type2'), formDepthMm : 35, detail : 'standard' }, shell = FormShell (Float32Array.from (tris), draft, { smoothDisplay : true }), c = shell.component;
        assert.equal (shell.metrics.display, 'smooth'); assert.equal (c.display, 'smooth'); assert.equal (c.triangleCount, c.indices.length / 3);
        // Watertight: every edge of the welded mesh is shared by exactly two triangles.
        const key = i => [0, 1, 2].map (k => Math.round (c.positions[i * 3 + k] * 1e4)).join (','), ids = new Map (), weld = [];
        for (let i = 0; i < c.positions.length / 3; i++) { const k = key (i); if (!ids.has (k)) { ids.set (k, ids.size); } weld.push (ids.get (k)); }
        const edges = new Map (); for (let t = 0; t < c.indices.length; t += 3) { for (let e = 0; e < 3; e++) { const a = weld[c.indices[t + e]], b = weld[c.indices[t + (e + 1) % 3]], k = a < b ? a + '/' + b : b + '/' + a; edges.set (k, (edges.get (k) || 0) + 1); } }
        assert.ok ([...edges.values ()].every (n => n === 2), 'closed');
        let volume = 0; for (let t = 0; t < c.indices.length; t += 3) { const [a, b, e] = [0, 1, 2].map (k => [0, 1, 2].map (x => c.positions[c.indices[t + k] * 3 + x])); volume += (a[0] * (b[1] * e[2] - e[1] * b[2]) - b[0] * (a[1] * e[2] - e[1] * a[2]) + e[0] * (a[1] * b[2] - b[1] * a[2])) / 6; }
        assert.ok (Math.abs (volume / 1000 - shell.metrics.volumeCm3) < 0.05 * shell.metrics.volumeCm3, volume / 1000 + ' vs ' + shell.metrics.volumeCm3);
        const coarse = FormShell (Float32Array.from (tris), { ...draft, detail : 'draft' }, { smoothDisplay : true });
        assert.equal (coarse.metrics.display, 'review'); assert.equal (coarse.component.display, undefined);
        const { Triangulate } = await import ('../src/nurbs/display.js');
        const square = [[0, 0], [10, 0], [10, 10], [0, 10]], hole = [[3, 3], [3, 7], [7, 7], [7, 3]], triangles = Triangulate (square, [hole]);
        let area = 0; for (const [a, b, e] of triangles) { const p = [...square, ...hole]; area += ((p[b][0] - p[a][0]) * (p[e][1] - p[a][1]) - (p[b][1] - p[a][1]) * (p[e][0] - p[a][0])) / 2; }
        assert.ok (Math.abs (area - 84) < 1e-9, 'square minus the hole: ' + area);
    });
});
