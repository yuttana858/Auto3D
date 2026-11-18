// Phase 2: pocket walls as height-parameterized cubic lofts (docs/molded-pulp-nurbs.md). A drafted pocket wall is the
// stack of its outlines at increasing height, so each wall is one B-spline surface S(t, h): t runs once around the
// pocket (periodic cubic, uniform knots) and h is the height (clamped cubic; y = h exactly through Greville
// placement). Outlines come from iso-contours of the review field; the result is checked by true 3D distance to it.
import { Degree, ClampedKnots, Greville, AxisBasis, FitAxis, FindSpan, BasisFuns } from './bspline.js';
import { IsoContours, Centroid, PolygonArea, OutlineWindow } from './contours.js';
import { SeamOrder, FitPeriodic, PeriodicPoint } from './periodic.js';
import { SurfaceDistance } from './measure.js';
import { OpenKnots, OpenPoint, OpenParams, FitOpen, OutlineCorners } from './open.js';

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
// floorMm: the floor height of this surface (0 for the product side; −thickness for the tool side); depthMm is the plateau
// height, measured on the same scale.
export function LoftPocketWalls (grid, H, { depthMm, floorMm = 0, outlineToleranceMm = Math.max (0.15, 0.6 * Math.max (grid.dx, grid.dz)), wallToleranceMm = 0.3, levelStepMm = 1, insetMm = 0.25, maxOutlineControls = 256, skirtWall = false } = {})
{
    const lo = floorMm + insetMm, hi = depthMm - insetMm;
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
    // open: the outlines are sides between two corners (clamped cubics with pinned ends) instead of closed loops.
    // Walls span the floor (y = 0) to the plateau (y = depthMm) exactly, so the flat faces attach to them: outline level
    // k (traced at h_k between the insets) sits at v_k, mapped proportionally onto [0, depthMm]. On drafted walls the
    // stretch moves points sideways by about inset / slope (hundredths of a millimetre).
    const v0 = floorMm, v1 = depthMm, vs = Float64Array.from (levels, h => v0 + (h - lo) * (v1 - v0) / (hi - lo));
    // One cubic wall surface through a stack of outlines (one per level, shared seam). The outline control count m and
    // the height control count n grow only until the wall is within the 3D distance tolerance of the review surface, so
    // a straight side stays at a few controls instead of following the review grid's ripple. open: sides between two
    // corners (clamped cubics with pinned ends) instead of closed loops.
    const loft = (outlines, seed, id, kind, open = false) => {
        let best = null;
        for (let m = open ? 4 : 12; ; m = Math.min (maxOutlineControls, Math.ceil (m * 1.5))) {
            const fits = outlines.map (o => open ? FitOpen (o.points, o.params, m) : FitPeriodic (o.points, o.params, m));
            const knotsU = open ? OpenKnots (m) : PeriodicKnots (m), values = new Float64Array (count * m * 2);
            for (let k = 0; k < count; k++) { for (let i = 0; i < m; i++) { values[(k * m + i) * 2] = fits[k][i][0]; values[(k * m + i) * 2 + 1] = fits[k][i][1]; } }
            for (let n = 4; ; n = Math.min (count, n * 2)) {
                const knotsV = ClampedKnots (Array.from ({ length : n - Degree - 1 }, (_, i) => v0 + (v1 - v0) * (i + 1) / (n - Degree)), v0, v1);
                const controls = FitAxis (values, m * 2, AxisBasis (knotsV, vs));
                const ringAt = v => { const s = FindSpan (knotsV, v), N = BasisFuns (knotsV, s, v), ring = []; for (let i = 0; i < m; i++) { let x = 0, z = 0; for (let r = 0; r <= Degree; r++) { const b = s - Degree + r; x += N[r] * controls[(b * m + i) * 2]; z += N[r] * controls[(b * m + i) * 2 + 1]; } ring.push ([x, z]); } return ring; };
                // Worst 3D distance over the wall, stopping at the first sample beyond the tolerance (a failed try is cheap).
                let max = 0; const rows = 2 * (count - 1);
                rows : for (let r = 0; r <= rows; r++) {
                    const v = v0 + (v1 - v0) * r / rows, ring = ringAt (v);
                    for (let q = 0; q <= 2 * m - (open ? 0 : 1); q++) { const [x, z] = open ? OpenPoint (ring, knotsU, q / (2 * m)) : PeriodicPoint (ring, q / (2 * m)); max = Math.max (max, distance (x, v, z)); if (max > wallToleranceMm) { break rows; } }
                }
                const wall = { m, n, knotsU, knotsV, controls, gv : Greville (knotsV), max };
                if (!best || wall.max < best.max) { best = wall; }
                if (max <= wallToleranceMm) { best = wall; break; }
                if (n >= count) { break; }
            }
            if (best.max <= wallToleranceMm || m >= maxOutlineControls) { break; }
        }
        const { m, n, knotsU } = best;
        // Surface: U periodic (m + 3 wrapped controls) or clamped (open sides), V clamped in height; point (x, y = v, z).
        const countU = open ? m : m + Degree, points = new Float64Array (countU * n * 3);
        for (let b = 0; b < n; b++) { for (let a = 0; a < countU; a++) { const i = a % m, k = (b * countU + a) * 3; points[k] = best.controls[(b * m + i) * 2]; points[k + 1] = best.gv[b]; points[k + 2] = best.controls[(b * m + i) * 2 + 1]; } }
        return {
            id, kind, seed, areaMm2 : Math.abs (PolygonArea (outlines[0].points)),
            surface : { degreeU : Degree, degreeV : Degree, periodicU : !open, knotsU, knotsV : best.knotsV, countU, countV : n, points },
            outlineControls : m, heightControls : n, maxDistanceMm : best.max, withinTolerance : best.max <= wallToleranceMm
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
    if (skirt.length === count) {
        // A sheet edge has sharp plan corners that one smooth closed curve cannot follow: split every level at the same
        // corners and loft each side between them. Neighbouring sides share the corner points, so they meet in a common
        // corner edge. Without stable corners (a rounded outline) the skirt is one closed loft.
        const corners = skirt.map (o => OutlineCorners (o.points));
        if (corners[0].length >= 3 && corners.every (c => c.length === corners[0].length)) {
            for (let side = 0; side < corners[0].length; side++) {
                const sides = skirt.map ((o, k) => {
                    const c = corners[k], from = c[side], to = c[(side + 1) % c.length], points = [];
                    for (let i = from; ; i = (i + 1) % o.points.length) { points.push (o.points[i]); if (i === to) { break; } }
                    return { points, params : OpenParams (points) };
                });
                walls.push (loft (sides, centre, 'Outer skirt side ' + (side + 1), 'skirt', true));
            }
        } else { walls.push (loft (skirt, centre, 'Outer skirt', 'skirt')); }
    }
    // Flat faces bounded by the walls' end curves. A wall is clamped in height, so its bottom (v = 0) and top (v = depthMm)
    // curves are exactly its first and last control rows: the faces and walls share these edges.
    const edge = (wall, top) => { const sf = wall.surface, b = top ? sf.countV - 1 : 0, pts = []; for (let a = 0; a < sf.countU; a++) { const k = (b * sf.countU + a) * 3; pts.push ([sf.points[k], sf.points[k + 2]]); } return { wall : wall.id, periodic : sf.periodicU, degree : sf.degreeU, knots : sf.knotsU, points : pts, y : top ? v1 : v0 }; };
    const pocketWalls = walls.filter (w => w.kind === 'pocket'), skirtWalls = walls.filter (w => w.kind === 'skirt');
    const faces = [];
    // Pocket floors: planes at y = 0 only where the review floor is flat inside the pocket's lowest outline (within the
    // wall tolerance); a raised floor (a domed can base) needs a fitted patch, reported as not yet built.
    for (const [index, wall] of pocketWalls.entries ()) {
        const outline = pockets[index].outlines[0].points; let peak = -Infinity;
        const w = OutlineWindow ([outline], grid, 0);
        for (let j = Math.max (0, w.j0); j <= Math.min (grid.nz - 1, w.j1); j++) { for (let i = Math.max (0, w.i0); i <= Math.min (grid.nx - 1, w.i1); i++) { if (Inside (outline, grid.x0 + i * grid.dx, grid.z0 + j * grid.dz)) { peak = Math.max (peak, H[j * grid.nx + i]); } } }
        faces.push (peak <= floorMm + wallToleranceMm ? { id : wall.id + ' floor', kind : 'plane', y : v0, outer : [edge (wall, false)], holes : [] } : { id : wall.id + ' floor', kind : 'patch-needed', raisedMm : peak - floorMm, outer : [edge (wall, false)], holes : [] });
    }
    // Plateau: the plane at the form depth inside the skirt's top curves, with a hole at every pocket rim.
    if (skirtWalls.length) { faces.push ({ id : 'Plateau', kind : 'plane', y : v1, outer : skirtWalls.map (w => edge (w, true)), holes : pocketWalls.map (w => edge (w, true)) }); }
    const controls = walls.reduce ((s, w) => s + w.surface.countU * w.surface.countV, 0), maxDistanceMm = Math.max (0, ...walls.map (w => w.maxDistanceMm));
    if (!pockets.length) { return { ok : false, reason : 'No pockets were found below the plateau.', walls, merges, levels : count, range : [lo, hi], controls : 0, maxDistanceMm : 0, outlineToleranceMm, wallToleranceMm }; }
    return { faces, ok : walls.every (w => w.withinTolerance) && (!skirtWall || walls.some (w => w.kind === 'skirt')), reason : walls.every (w => w.withinTolerance) ? (skirtWall && !walls.some (w => w.kind === 'skirt') ? 'No closed outer skirt outline at every level.' : null) : 'A wall is outside the tolerance.', walls, merges, levels : count, range : [lo, hi], controls, maxDistanceMm, outlineToleranceMm, wallToleranceMm };
}
