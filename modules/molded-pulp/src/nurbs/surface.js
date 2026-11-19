// Phase 2 output: the product side of a formed shell as one open shell of smooth faces, built from LoftPocketWalls.
// Faces: one cubic wall per pocket (closed around it), one per outer skirt side, a plane per pocket floor and the plateau
// plane with a hole at every pocket rim. Neighbouring faces share their boundary curves exactly (wall end rows, seam and
// corner columns), so the shell sews without gaps. The skirt's lower edge stays open: the tool side (thickening) is
// built in Cloud 3D Studio (docs/molded-pulp-nurbs.md).
//
// Orientation: every face normal points to the product side (away from the pulp): +y on the floors and plateau, into
// the pocket on pocket walls, away from the tray on the skirt. Loops run counter-clockwise seen from the normal.
// Neutral data in world millimetres (no STEP, no three.js), like brep.js.
import { SurfacePoint, SplitSurfaceV, SplitSurfaceU } from './bspline.js';
import { PullDirections } from '../orient.js';

// Why a smooth surface cannot be built from a loft result (null when it can).
export function ProductSurfaceProblem (loft, { floorFilletMm = 0, rimFilletMm = 0 } = {})
{
    for (const [name, value] of [['floor fillet', floorFilletMm], ['rim fillet', rimFilletMm]]) { if (!(value >= 0) || !Number.isFinite (value)) { return `The ${name} radius must be zero or more.`; } }
    if (!loft.ok) { return loft.reason || 'The smooth walls are outside the tolerance.'; }
    if (!loft.walls.some (w => w.kind === 'skirt')) { return 'Turn on the outer skirt wall: the plateau needs it as its outer edge.'; }
    if (rimFilletMm > 0 && !loft.walls.some (w => w.kind === 'skirt' && w.surface.closedU)) { return 'Round the skirt corners to fillet the rims: the skirt top needs one closed wall.'; }
    const raised = loft.faces.find (f => f.kind !== 'plane');
    if (raised) { return `${raised.id} is raised ${raised.raisedMm.toFixed (1)} mm (a domed base); fitted floor patches are not built yet.`; }
    const depth = loft.walls[0].surface.knotsV.at (-1) - loft.walls[0].surface.knotsV[0];
    if (rimFilletMm > 0) {
        // Rim fillets spread over the plateau: every strip of plateau between two rims (pocket to pocket, pocket to skirt)
        // must hold both fillets.
        const land = PlateauLand (loft);
        if (land.narrowestMm < 2 * rimFilletMm + 0.5) { return `The plateau is ${land.narrowestMm.toFixed (1)} mm wide between ${land.between}: too narrow for two ${rimFilletMm} mm rim fillets (needs ${(2 * rimFilletMm + 0.5).toFixed (1)} mm). Use a smaller rim fillet or more extra material.`; }
    }
    if (floorFilletMm + rimFilletMm > 0.8 * depth) { return `The floor and rim fillets (${floorFilletMm + rimFilletMm} mm together) must be at most 80% of the form depth (${(0.8 * depth).toFixed (1)} mm).`; }
    return null;
}

// Narrowest strip of plateau between the walls' top curves (pocket rims and the skirt top), in plan.
export function PlateauLand (loft, samples = 160)
{
    const top = w => { const sf = w.surface, u0 = sf.knotsU[0], u1 = sf.knotsU.at (-1), v = sf.knotsV.at (-1); return Array.from ({ length : samples }, (_, q) => SurfacePoint (sf, u0 + (u1 - u0) * q / (samples - (sf.closedU ? 0 : 1)), v)); };
    const rings = loft.walls.map (w => ({ id : w.id, points : top (w) }));
    let narrowestMm = Infinity, between = '';
    for (let i = 0; i < rings.length; i++) {
        for (let j = i + 1; j < rings.length; j++) {
            let best = Infinity; for (const a of rings[i].points) { for (const b of rings[j].points) { const d = Math.hypot (a[0] - b[0], a[2] - b[2]); if (d < best) { best = d; } } }
            if (best < narrowestMm) { narrowestMm = best; between = rings[i].id + ' and ' + rings[j].id; }
        }
    }
    return { narrowestMm, between };
}

function Cross (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

// loft: LoftPocketWalls result in the shell's forming frame (y = height above baseY).
// floorFilletMm: tangent blend between each pocket wall and its floor. rimFilletMm: tangent blend between each pocket
// wall, and the closed outer skirt, and the plateau. 0 leaves a sharp crease. Sharp creases make thickening join offset
// faces (extend or trim them to meet), which OCCT stops doing reliably from about 2 mm (docs/molded-pulp-nurbs.md); with
// every crease a tangent blend the offsets meet without joins. On the tool side a rim radius shrinks by the thickness,
// so it must exceed it.
// Closed walls and blends are written as two halves (u in [0, ½] and [½, 1]): OCCT treats a face closed on itself as
// self-intersecting in its checks, and every ring becomes two edges with two vertices.
export function ProductSurface (loft, { baseY = 0, direction = '+y', id = 'Tray', floorFilletMm = 0, rimFilletMm = 0 } = {})
{
    const problem = ProductSurfaceProblem (loft, { floorFilletMm, rimFilletMm }); if (problem) { throw new Error (problem); }
    const world = PullDirections[direction].world, toWorld = (x, y, z) => world (x, baseY + y, z), vector = v => world (v[0], v[1], v[2]);
    const vertices = [], edges = [], faces = [];
    const vertex = (local) => { vertices.push ({ point : toWorld (...local) }); return vertices.length - 1; };
    const local = (sf, a, b) => { const k = (b * sf.countU + a) * 3; return [sf.points[k], sf.points[k + 1], sf.points[k + 2]]; };
    const row = (sf, b) => Array.from ({ length : sf.countU }, (_, a) => local (sf, a, b));
    const column = (sf, a) => Array.from ({ length : sf.countV }, (_, b) => local (sf, a, b));
    // Edge geometry is kept in the forming frame too (for orientation checks) and written in world mm.
    const edge = (from, to, points, knots) => { edges.push ({ from, to, degree : 3, knots, local : points, points : points.map (p => toWorld (...p)) }); return edges.length - 1; };
    const worldSurface = sf => {
        const points = new Float64Array (sf.points.length);
        for (let k = 0; k < points.length; k += 3) { const p = toWorld (sf.points[k], sf.points[k + 1], sf.points[k + 2]); points[k] = p[0]; points[k + 1] = p[1]; points[k + 2] = p[2]; }
        return { degreeU : sf.degreeU, degreeV : sf.degreeV, knotsU : sf.knotsU, knotsV : sf.knotsV, countU : sf.countU, countV : sf.countV, points };
    };
    // Loop [edge, forward] counter-clockwise in parameter space (u, v); reversed for a face whose normal is −(Su × Sv).
    const reverse = loop => loop.slice ().reverse ().map (([e, f]) => [e, !f]);
    // Normal direction (Su × Sv) at the middle of a face, in the forming frame.
    const normal = sf => {
        const u0 = sf.knotsU[0], u1 = sf.knotsU[sf.knotsU.length - 1], v0 = sf.knotsV[0], v1 = sf.knotsV[sf.knotsV.length - 1], u = (u0 + u1) / 2, v = (v0 + v1) / 2, h = 1e-4;
        const du = SurfacePoint (sf, u + h * (u1 - u0), v).map ((x, i) => x - SurfacePoint (sf, u - h * (u1 - u0), v)[i]);
        const dv = SurfacePoint (sf, u, v + h * (v1 - v0)).map ((x, i) => x - SurfacePoint (sf, u, v - h * (v1 - v0))[i]);
        return { n : Cross (du, dv), at : SurfacePoint (sf, u, v) };
    };
    // A stack of closed bands (bottom to top) sharing their U knots: each band is split into halves at the middle of U,
    // and neighbouring bands share their ring edges. inward: +1 when the product side faces the seed in plan (pockets),
    // −1 when it faces away (the skirt). Returns the rings, each [half A edge, half B edge] running with increasing u.
    const stack = (bands, seed, inward) => {
        const halves = bands.map (({ surface }) => { const u0 = surface.knotsU[0], u1 = surface.knotsU.at (-1), { left, right } = SplitSurfaceU (surface, (u0 + u1) / 2); return [left, right]; });
        const ringOf = j => { const [a, b] = j < halves.length ? halves[j] : halves[j - 1], r = j < halves.length ? 0 : a.countV - 1; return { a, b, r }; };
        const rings = [], starts = [], middles = [];
        for (let j = 0; j <= halves.length; j++) {
            const { a, b, r } = ringOf (j), v0 = vertex (local (a, 0, r)), vm = vertex (local (b, 0, r));
            starts.push (v0); middles.push (vm);
            rings.push ([edge (v0, vm, row (a, r), a.knotsU), edge (vm, v0, row (b, r), b.knotsU)]);
        }
        halves.forEach (([a, b], i) => {
            const seam0 = edge (starts[i], starts[i + 1], column (a, 0), a.knotsV), seamM = edge (middles[i], middles[i + 1], column (b, 0), b.knotsV);
            for (const [sf, half, loop] of [[a, 'a', [[rings[i][0], true], [seamM, true], [rings[i + 1][0], false], [seam0, false]]], [b, 'b', [[rings[i][1], true], [seam0, true], [rings[i + 1][1], false], [seamM, false]]]]) {
                const { n, at } = normal (sf), sameSense = inward * (n[0] * (seed[0] - at[0]) + n[2] * (seed[1] - at[2])) > 0;
                faces.push ({ name : bands[i].name + ' ' + half, kind : 'bspline', surface : worldSurface (sf), sameSense, bounds : [{ outer : true, loop : sameSense ? loop : reverse (loop) }] });
            }
        });
        return rings;
    };
    const pocketWalls = loft.walls.filter (w => w.kind === 'pocket'), skirtWalls = loft.walls.filter (w => w.kind === 'skirt');
    const rims = [], floors = [];
    for (const wall of pocketWalls) {
        const bands = [];
        let sf = wall.surface, floorY = sf.points[1];
        if (floorFilletMm > 0) { const blend = EndBlend (sf, wall.seed, floorFilletMm, 'bottom', 1); bands.push ({ name : wall.id + ' floor fillet', surface : blend.surface }); sf = blend.wall; }
        let rim = null;
        if (rimFilletMm > 0) { const blend = EndBlend (sf, wall.seed, rimFilletMm, 'top', -1); sf = blend.wall; rim = { name : wall.id + ' rim fillet', surface : blend.surface }; }
        bands.push ({ name : wall.id, surface : sf }); if (rim) { bands.push (rim); }
        const rings = stack (bands, wall.seed, 1);
        rims.push (rings.at (-1)); floors.push ({ name : wall.id + ' floor', ring : rings[0], y : floorY });
    }
    let outer;
    const closedSkirt = skirtWalls.find (w => w.surface.closedU);
    if (closedSkirt) {
        // Closed skirt (rounded plan corners): its lower ring stays open; its upper ring bounds the plateau.
        let sf = closedSkirt.surface; const bands = [];
        if (rimFilletMm > 0) { const blend = EndBlend (sf, closedSkirt.seed, rimFilletMm, 'top', 1); bands.push ({ name : closedSkirt.id, surface : blend.wall }, { name : closedSkirt.id + ' top fillet', surface : blend.surface }); }
        else { bands.push ({ name : closedSkirt.id, surface : sf }); }
        outer = stack (bands, closedSkirt.seed, -1).at (-1).map (e => [e, true]);
    } else {
        // Skirt sides run corner to corner in order around the tray; side i's first column is corner i, its last column
        // corner i + 1 (the next side's first column).
        const k = skirtWalls.length, cornerBottom = [], cornerTop = [], corner = [];
        for (let i = 0; i < k; i++) { const sf = skirtWalls[i].surface; cornerBottom.push (vertex (local (sf, 0, 0))); cornerTop.push (vertex (local (sf, 0, sf.countV - 1))); }
        for (let i = 0; i < k; i++) { corner.push (edge (cornerBottom[i], cornerTop[i], column (skirtWalls[i].surface, 0), skirtWalls[i].surface.knotsV)); }
        outer = [];
        for (let i = 0; i < k; i++) {
            const sf = skirtWalls[i].surface, next = (i + 1) % k, last = sf.countV - 1;
            const bottom = edge (cornerBottom[i], cornerBottom[next], row (sf, 0), sf.knotsU), top = edge (cornerTop[i], cornerTop[next], row (sf, last), sf.knotsU);
            const { n, at } = normal (sf), sameSense = n[0] * (at[0] - skirtWalls[i].seed[0]) + n[2] * (at[2] - skirtWalls[i].seed[1]) > 0;
            const loop = [[bottom, true], [corner[next], true], [top, false], [corner[i], false]];
            faces.push ({ name : skirtWalls[i].id, kind : 'bspline', surface : worldSurface (sf), sameSense, bounds : [{ outer : true, loop : sameSense ? loop : reverse (loop) }] });
            outer.push ([top, true]);
        }
    }
    // Planes (normal +y in the forming frame). Seen from +y, counter-clockwise has negative signed area in (x, z).
    const area = loop => { let s = 0; const pts = loop.flatMap (([e, f]) => { const p = edges[e].local; return f ? p : p.slice ().reverse (); }); for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[2] - b[0] * a[2]; } return s; };
    const bound = (loop, isOuter) => ({ outer : isOuter, loop : (area (loop) < 0) === isOuter ? loop : reverse (loop) });
    const plane = (name, y, bounds) => faces.push ({ name, kind : 'plane', origin : toWorld (0, y, 0), normal : vector ([0, 1, 0]), xAxis : vector ([1, 0, 0]), sameSense : true, bounds });
    for (const floor of floors) { plane (floor.name, floor.y, [bound (floor.ring.map (e => [e, true]), true)]); }
    const plateauY = loft.walls[0].surface.knotsV.at (-1);
    plane ('Plateau', plateauY, [bound (outer, true), ...rims.map (ring => bound (ring.map (e => [e, true]), false))]);
    return { id, direction, vertices, edges, faces, walls : loft.walls.length, maxDistanceMm : loft.maxDistanceMm, toleranceMm : loft.wallToleranceMm };
}

// Tangent blend between a clamped wall (y = v) and a horizontal plane at one end of it, radius r. The wall is split exactly
// r from that end; the blend is a cubic in its second direction (bottom to top) with the wall's U knots. Rows run from
// the lower curve to the upper one: at the plane end the curve is the wall's end curve moved r horizontally (towards the
// seed when side is +1, away when −1) with a horizontal handle; at the wall end the wall's new end curve with a handle
// along its height derivative (one constant scale, so the two are tangent along the whole edge; y = v makes the
// derivative's vertical part exactly 1). 0.5523 r is the cubic quarter-circle handle length.
// end 'bottom': the floor below the wall; 'top': the plateau above it. Returns { wall (the trimmed wall), surface }.
export function EndBlend (wallSurface, seed, r, end, side)
{
    const bottom = end === 'bottom', v0 = wallSurface.knotsV[0], v1 = wallSurface.knotsV.at (-1);
    const parts = SplitSurfaceV (wallSurface, bottom ? v0 + r : v1 - r), trimmed = bottom ? parts.upper : parts.lower, U = trimmed.countU, k = 0.5523 * r;
    const at = (sf, a, b) => { const i = (b * sf.countU + a) * 3; return [sf.points[i], sf.points[i + 1], sf.points[i + 2]]; };
    // Height derivative of the trimmed wall at its cut, as control vectors: p / Δt (row next to the cut − cut row).
    const q = trimmed.degreeV, K = trimmed.knotsV, n = trimmed.countV;
    const cut = bottom ? 0 : n - 1, inner = bottom ? 1 : n - 2, scale = bottom ? q / (K[q + 1] - K[q]) : q / (K[K.length - 1] - K[K.length - 2 - q]);
    const corner = Array.from ({ length : U }, (_, a) => at (wallSurface, a, bottom ? 0 : wallSurface.countV - 1));
    const toward = corner.map ((p, a) => {
        const prev = corner[a === 0 ? U - 2 : a - 1], next = corner[a === U - 1 ? 1 : a + 1], tx = next[0] - prev[0], tz = next[2] - prev[2], l = Math.hypot (tx, tz) || 1;
        let nx = tz / l, nz = -tx / l; if (nx * (seed[0] - p[0]) + nz * (seed[1] - p[2]) < 0) { nx = -nx; nz = -nz; }
        return [side * nx, side * nz];
    });
    const points = new Float64Array (U * 4 * 3), put = (b, a, p) => { const i = (b * U + a) * 3; points[i] = p[0]; points[i + 1] = p[1]; points[i + 2] = p[2]; };
    for (let a = 0; a < U; a++) {
        const [nx, nz] = toward[a], c = corner[a], w = at (trimmed, a, cut), wn = at (trimmed, a, inner);
        // d: derivative pointing up the wall (∂W/∂v).
        const d = [0, 1, 2].map (i => (bottom ? 1 : -1) * scale * (wn[i] - w[i])), plane = [c[0] + r * nx, c[1], c[2] + r * nz], planeHandle = [plane[0] - k * nx, c[1], plane[2] - k * nz];
        if (bottom) { put (0, a, plane); put (1, a, planeHandle); put (2, a, [w[0] - k * d[0], w[1] - k * d[1], w[2] - k * d[2]]); put (3, a, w); }
        else { put (0, a, w); put (1, a, [w[0] + k * d[0], w[1] + k * d[1], w[2] + k * d[2]]); put (2, a, planeHandle); put (3, a, plane); }
    }
    // Seam columns stay bitwise equal on a closed wall (its first and last controls coincide).
    if (wallSurface.closedU !== false) { for (let b = 0; b < 4; b++) { for (let c = 0; c < 3; c++) { points[(b * U + U - 1) * 3 + c] = points[(b * U) * 3 + c]; } } }
    return { wall : trimmed, surface : { degreeU : trimmed.degreeU, degreeV : 3, knotsU : trimmed.knotsU, knotsV : Float64Array.of (0, 0, 0, 0, 1, 1, 1, 1), countU : U, countV : 4, points, closedU : true } };
}
export function FloorBlend (wallSurface, seed, r) { return EndBlend (wallSurface, seed, r, 'bottom', 1); }

// Every edge used once in each direction, except the open skirt bottom (once).
export function SurfaceEdgeUses (surface)
{
    const uses = surface.edges.map (() => ({ forward : 0, reversed : 0 }));
    for (const face of surface.faces) { for (const b of face.bounds) { for (const [e, f] of b.loop) { uses[e][f ? 'forward' : 'reversed']++; } } }
    return uses;
}
