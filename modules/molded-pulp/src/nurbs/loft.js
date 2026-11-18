// Phase 2: pocket walls as height-parameterized cubic lofts (docs/molded-pulp-nurbs.md). A drafted pocket wall is the
// stack of its outlines at increasing height, so each wall is one B-spline surface S(t, h): t runs once around the
// pocket (periodic cubic, uniform knots) and h is the height (clamped cubic; y = h exactly through Greville
// placement). Outlines come from iso-contours of the review field; the result is checked by true 3D distance to it.
import { Degree, ClampedKnots, Greville, AxisBasis, FitAxis, FindSpan, BasisFuns } from './bspline.js';
import { IsoContours, Centroid, PolygonArea, OutlineWindow } from './contours.js';
import { SeamOrder, FitPeriodic, PeriodicPoint, OutlineDeviation } from './periodic.js';
import { SurfaceDistance } from './measure.js';

function Inside (points, x, z)
{
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, zi] = points[i], [xj, zj] = points[j];
        if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) { inside = !inside; }
    }
    return inside;
}

// Uniform periodic cubic as a general (unclamped) B-spline: m distinct controls, written with the first three repeated
// at the end (m + 3 controls, m + 7 knots), so the standard evaluators and STEP can use it unchanged.
function PeriodicKnots (m) { return Float64Array.from ({ length : m + 2 * Degree + 1 }, (_, i) => (i - Degree) / m); }

// grid { nx, nz, dx, dz, x0, z0 }, H product-side heights (mm above the base). Options: depthMm (plateau height),
// outlineToleranceMm (outline fit; the review outlines carry about a cell of grid noise), wallToleranceMm (3D distance
// limit), levelStepMm, insetMm (levels stop this far from floor and plateau; the creases become fillets later).
export function LoftPocketWalls (grid, H, { depthMm, outlineToleranceMm = Math.max (0.15, 0.6 * Math.max (grid.dx, grid.dz)), wallToleranceMm = 0.3, levelStepMm = 1, insetMm = 0.25, maxOutlineControls = 256, skirtWall = false } = {})
{
    const lo = insetMm, hi = depthMm - insetMm;
    if (!(hi - lo > 2 * levelStepMm)) { return { ok : false, reason : 'The form depth is too shallow for lofted walls.', walls : [], merges : [] }; }
    const count = Math.max (8, Math.ceil ((hi - lo) / levelStepMm)) + 1, levels = Float64Array.from ({ length : count }, (_, k) => lo + (hi - lo) * k / (count - 1));
    const closed = (h, window = null) => IsoContours (H, grid, h, window).filter (c => c.closed && c.points.length >= 8);
    const height = (x, z) => { const i = Math.min (grid.nx - 1, Math.max (0, Math.round ((x - grid.x0) / grid.dx))), j = Math.min (grid.nz - 1, Math.max (0, Math.round ((z - grid.z0) / grid.dz))); return H[j * grid.nx + i]; };
    // An outline encloses low ground (a pocket) when the ground just inside it is below its level. Sampled next to the
    // outline, not at its centre, so a raised floor (a domed can base) still counts as a pocket.
    const step = 1.5 * Math.max (grid.dx, grid.dz);
    const enclosesLow = (c, level) => {
        const [cx, cz] = Centroid (c.points); let low = 0, n = 0;
        for (let q = 0; q < 12; q++) {
            const [x, z] = c.points[Math.floor (q * c.points.length / 12)], d = Math.hypot (cx - x, cz - z) || 1;
            if (d <= step) { continue; } n++; if (height (x + (cx - x) * step / d, z + (cz - z) * step / d) < level) { low++; }
        }
        return n > 0 && low * 2 > n;
    };
    const owns = (c, level, seed) => enclosesLow (c, level) && Inside (c.points, seed[0], seed[1]);
    // Pockets: closed outlines at the lowest level that enclose low ground (a floor), not islands of plateau. Only the
    // lowest and highest levels scan the whole grid; every pocket's levels scan a window around its floor and rim.
    const bottom = closed (lo), top = closed (hi);
    const pockets = bottom.filter (c => enclosesLow (c, lo)).map ((c, index) => {
        const seed = Centroid (c.points), rim = top.find (t => owns (t, hi, seed));
        return { index, seed, outlines : [], window : OutlineWindow (rim ? [c.points, rim.points] : [c.points], grid, 3) };
    });
    const merges = [];
    for (let k = 0; k < count; k++) {
        for (const pocket of pockets) {
            if (pocket.mergedAt !== undefined) { continue; }
            const here = k === 0 ? bottom : k === count - 1 ? top : closed (levels[k], pocket.window);
            const owner = here.find (c => owns (c, levels[k], pocket.seed));
            const shared = owner && pockets.filter (other => other !== pocket && Inside (owner.points, other.seed[0], other.seed[1]));
            if (!owner || shared.length) { pocket.mergedAt = levels[k]; if (shared?.length) { merges.push ({ heightMm : levels[k], pockets : [pocket.index, ...shared.map (o => o.index)] }); } continue; }
            pocket.outlines.push (SeamOrder (owner.points, pocket.seed));
        }
    }
    if (merges.length || pockets.some (p => p.mergedAt !== undefined)) {
        const at = Math.min (...pockets.filter (p => p.mergedAt !== undefined).map (p => p.mergedAt));
        return { ok : false, reason : `Pockets join below the plateau (about ${at.toFixed (1)} mm up): the land between them is too narrow for separate walls.`, walls : [], merges, pockets : pockets.length };
    }
    // Search only as far as the tolerance needs: anything farther fails the check either way.
    const distance = SurfaceDistance (grid, H, Math.min (2.5, 3 * wallToleranceMm + 2 * Math.max (grid.dx, grid.dz))), walls = [];
    // One cubic wall surface through a stack of outlines (one per level, all with a shared seam).
    const loft = (outlines, seed, id, kind) => {
        // Outline controls: the smallest m (growing ×1.5) that fits every level within the outline tolerance.
        let m = 12, fits;
        for (;;) {
            fits = outlines.map (o => FitPeriodic (o.points, o.params, m));
            const worst = Math.max (...outlines.map ((o, k) => OutlineDeviation (o.points, fits[k], 4, o.params)));
            if (worst <= outlineToleranceMm || m >= maxOutlineControls) { break; }
            m = Math.min (maxOutlineControls, Math.ceil (m * 1.5));
        }
        // Height controls: the smallest n (doubling from 4) whose wall stays within the 3D distance tolerance.
        const values = new Float64Array (count * m * 2);
        for (let k = 0; k < count; k++) { for (let i = 0; i < m; i++) { values[(k * m + i) * 2] = fits[k][i][0]; values[(k * m + i) * 2 + 1] = fits[k][i][1]; } }
        let n = 4, wall;
        for (;;) {
            const knotsV = ClampedKnots (Array.from ({ length : n - Degree - 1 }, (_, i) => lo + (hi - lo) * (i + 1) / (n - Degree)), lo, hi);
            const controls = FitAxis (values, m * 2, AxisBasis (knotsV, levels)), gv = Greville (knotsV);
            const ringAt = h => { const s = FindSpan (knotsV, h), N = BasisFuns (knotsV, s, h), ring = []; for (let i = 0; i < m; i++) { let x = 0, z = 0; for (let r = 0; r <= Degree; r++) { const b = s - Degree + r; x += N[r] * controls[(b * m + i) * 2]; z += N[r] * controls[(b * m + i) * 2 + 1]; } ring.push ([x, z]); } return ring; };
            let max = 0; const rows = 2 * (count - 1);
            for (let r = 0; r <= rows; r++) { const h = lo + (hi - lo) * r / rows, ring = ringAt (h); for (let q = 0; q < 2 * m; q++) { const [x, z] = PeriodicPoint (ring, q / (2 * m)); max = Math.max (max, distance (x, h, z)); } }
            wall = { knotsV, controls, gv, max };
            if (max <= wallToleranceMm || n >= count) { break; }
            n = Math.min (count, n * 2);
        }
        // Surface: U periodic (m + 3 wrapped controls), V clamped in height; point (x, y = Greville height, z).
        const countU = m + Degree, points = new Float64Array (countU * n * 3);
        for (let b = 0; b < n; b++) { for (let a = 0; a < countU; a++) { const i = a % m, k = (b * countU + a) * 3; points[k] = wall.controls[(b * m + i) * 2]; points[k + 1] = wall.gv[b]; points[k + 2] = wall.controls[(b * m + i) * 2 + 1]; } }
        return {
            id, kind, seed, areaMm2 : Math.abs (PolygonArea (outlines[0].points)),
            surface : { degreeU : Degree, degreeV : Degree, periodicU : true, knotsU : PeriodicKnots (m), knotsV : wall.knotsV, countU, countV : n, points },
            outlineControls : m, heightControls : n, maxDistanceMm : wall.max, withinTolerance : wall.max <= wallToleranceMm
        };
    };
    for (const pocket of pockets) { walls.push (loft (pocket.outlines, pocket.seed, 'Pocket ' + (pocket.index + 1), 'pocket')); }
    // Outer skirt: at every level the outermost closed outline that holds all pockets (ground inside it is high).
    const centre = [grid.x0 + grid.dx * (grid.nx - 1) / 2, grid.z0 + grid.dz * (grid.nz - 1) / 2], skirt = [];
    for (let k = 0; k < count && skirtWall; k++) {
        const outer = (k === 0 ? bottom : k === count - 1 ? top : closed (levels[k])).filter (c => Inside (c.points, centre[0], centre[1]) && pockets.every (p => Inside (c.points, p.seed[0], p.seed[1])));
        const largest = outer.sort ((a, b) => Math.abs (PolygonArea (b.points)) - Math.abs (PolygonArea (a.points)))[0];
        if (!largest) { skirt.length = 0; break; }
        skirt.push (SeamOrder (largest.points, centre));
    }
    if (skirt.length === count) { walls.push (loft (skirt, centre, 'Outer skirt', 'skirt')); }
    const controls = walls.reduce ((s, w) => s + w.surface.countU * w.surface.countV, 0), maxDistanceMm = Math.max (0, ...walls.map (w => w.maxDistanceMm));
    if (!pockets.length) { return { ok : false, reason : 'No pockets were found below the plateau.', walls, merges, levels : count, range : [lo, hi], controls : 0, maxDistanceMm : 0, outlineToleranceMm, wallToleranceMm }; }
    return { ok : walls.every (w => w.withinTolerance) && (!skirtWall || walls.some (w => w.kind === 'skirt')), reason : walls.every (w => w.withinTolerance) ? (skirtWall && !walls.some (w => w.kind === 'skirt') ? 'No closed outer skirt outline at every level.' : null) : 'A wall is outside the tolerance.', walls, merges, levels : count, range : [lo, hi], controls, maxDistanceMm, outlineToleranceMm, wallToleranceMm };
}
