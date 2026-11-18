import assert from 'node:assert/strict';
import { DefaultPulpDraft } from '../src/state.js';
import { PlanSheet, PlanTray } from '../src/plan.js';
import { ClampedKnots, Greville, FindSpan, BasisFuns, CurvePoint, SurfacePoint, AxisBasis, FitGrid, EvalGrid } from '../src/nurbs/bspline.js';
import { NurbsShell, MaxOutputSide } from '../src/nurbs/shell.js';
import { ShellBrep, BrepEdgeUses } from '../src/nurbs/brep.js';
import { WriteStep, StepReal } from '../src/nurbs/step.js';
import { FormShell } from '../src/plan.js';
import { PulpTypes } from '../src/state.js';
import { IsoContours, PolygonArea } from '../src/nurbs/contours.js';
import { SeamOrder, FitPeriodic, PeriodicPoint, OutlineDeviation } from '../src/nurbs/periodic.js';
import { SurfaceDistance } from '../src/nurbs/measure.js';
import { LoftPocketWalls } from '../src/nurbs/loft.js';

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
