// Phase 2 output: the product side of a formed shell as one open shell of smooth faces, built from LoftPocketWalls.
// Faces: one cubic wall per pocket (closed around it), one per outer skirt side, a plane per pocket floor and the plateau
// plane with a hole at every pocket rim. Neighbouring faces share their boundary curves exactly (wall end rows, seam and
// corner columns), so the shell sews without gaps. The skirt's lower edge stays open: the tool side (thickening) is
// built in Cloud 3D Studio (docs/molded-pulp-nurbs.md).
//
// Orientation: every face normal points to the product side (away from the pulp): +y on the floors and plateau, into
// the pocket on pocket walls, away from the tray on the skirt. Loops run counter-clockwise seen from the normal.
// Neutral data in world millimetres (no STEP, no three.js), like brep.js.
import { SurfacePoint, SplitSurfaceV } from './bspline.js';
import { PullDirections } from '../orient.js';

// Why a smooth surface cannot be built from a loft result (null when it can).
export function ProductSurfaceProblem (loft, { floorFilletMm = 0 } = {})
{
    if (!(floorFilletMm >= 0) || !Number.isFinite (floorFilletMm)) { return 'The floor fillet radius must be zero or more.'; }
    if (!loft.ok) { return loft.reason || 'The smooth walls are outside the tolerance.'; }
    if (!loft.walls.some (w => w.kind === 'skirt')) { return 'Turn on the outer skirt wall: the plateau needs it as its outer edge.'; }
    const raised = loft.faces.find (f => f.kind !== 'plane');
    if (raised) { return `${raised.id} is raised ${raised.raisedMm.toFixed (1)} mm (a domed base); fitted floor patches are not built yet.`; }
    const depth = loft.walls[0].surface.knotsV.at (-1) - loft.walls[0].surface.knotsV[0];
    if (floorFilletMm > 0.4 * depth) { return `The floor fillet (${floorFilletMm} mm) must be at most 40% of the form depth (${(0.4 * depth).toFixed (1)} mm).`; }
    return null;
}

function Cross (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

// loft: LoftPocketWalls result in the shell's forming frame (y = height above baseY).
// floorFilletMm: radius of the tangent blend between each pocket wall and its floor (0: a sharp crease). A sharp floor
// crease is convex on the tool side, so thickening has to extend the wall's offset down to the floor's, and OCCT stops
// joining them from about 2 mm (docs/molded-pulp-nurbs.md); with a tangent blend the offsets meet without a join.
export function ProductSurface (loft, { baseY = 0, direction = '+y', id = 'Tray', floorFilletMm = 0 } = {})
{
    const problem = ProductSurfaceProblem (loft, { floorFilletMm }); if (problem) { throw new Error (problem); }
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
    // Normal direction (Su × Sv) at the middle of a wall, in the forming frame.
    const normal = sf => {
        const u0 = sf.knotsU[0], u1 = sf.knotsU[sf.knotsU.length - 1], v0 = sf.knotsV[0], v1 = sf.knotsV[sf.knotsV.length - 1], u = (u0 + u1) / 2, v = (v0 + v1) / 2, h = 1e-4;
        const du = SurfacePoint (sf, u + h * (u1 - u0), v).map ((x, i) => x - SurfacePoint (sf, u - h * (u1 - u0), v)[i]);
        const dv = SurfacePoint (sf, u, v + h * (v1 - v0)).map ((x, i) => x - SurfacePoint (sf, u, v - h * (v1 - v0))[i]);
        return { n : Cross (du, dv), at : SurfacePoint (sf, u, v) };
    };
    const pocketWalls = loft.walls.filter (w => w.kind === 'pocket'), sides = loft.walls.filter (w => w.kind === 'skirt');
    const rims = [], floors = [];
    // A closed band (pocket wall or floor blend) between two rings: [ring below, ring above] are closed edges, the seam
    // its first control column. Its normal points into the pocket (towards the seed in plan).
    const band = (sf, name, seed, below, above, belowVertex, aboveVertex) => {
        const seam = edge (belowVertex, aboveVertex, column (sf, 0), sf.knotsV);
        const { n, at } = normal (sf), sameSense = n[0] * (seed[0] - at[0]) + n[2] * (seed[1] - at[2]) > 0;
        const loop = [[below, true], [seam, true], [above, false], [seam, false]];
        faces.push ({ name, kind : 'bspline', surface : worldSurface (sf), sameSense, bounds : [{ outer : true, loop : sameSense ? loop : reverse (loop) }] });
    };
    for (const wall of pocketWalls) {
        let sf = wall.surface;
        const top = sf.countV - 1, vt = vertex (local (sf, 0, top)), topRing = edge (vt, vt, row (sf, top), sf.knotsU);
        let floorRing, floorY = sf.points[1];
        if (floorFilletMm > 0) {
            const blend = FloorBlend (sf, wall.seed, floorFilletMm);
            sf = blend.wall;
            const vw = vertex (local (sf, 0, 0)), wallRing = edge (vw, vw, row (sf, 0), sf.knotsU);
            const vf = vertex (local (blend.surface, 0, 0)); floorRing = edge (vf, vf, row (blend.surface, 0), blend.surface.knotsU);
            band (blend.surface, wall.id + ' floor fillet', wall.seed, floorRing, wallRing, vf, vw);
            band (sf, wall.id, wall.seed, wallRing, topRing, vw, vt);
            floorY = blend.surface.points[1];
        } else {
            const vb = vertex (local (sf, 0, 0)); floorRing = edge (vb, vb, row (sf, 0), sf.knotsU);
            band (sf, wall.id, wall.seed, floorRing, topRing, vb, vt);
        }
        rims.push (topRing); floors.push ({ name : wall.id + ' floor', edge : floorRing, y : floorY });
    }
    // Skirt sides run corner to corner in order around the tray; side i's first column is corner i, its last column
    // corner i + 1 (the next side's first column).
    const k = sides.length, cornerBottom = [], cornerTop = [], corner = [];
    for (let i = 0; i < k; i++) { const sf = sides[i].surface; cornerBottom.push (vertex (local (sf, 0, 0))); cornerTop.push (vertex (local (sf, 0, sf.countV - 1))); }
    for (let i = 0; i < k; i++) { corner.push (edge (cornerBottom[i], cornerTop[i], column (sides[i].surface, 0), sides[i].surface.knotsV)); }
    const outer = [];
    for (let i = 0; i < k; i++) {
        const sf = sides[i].surface, next = (i + 1) % k, last = sf.countV - 1;
        const bottom = edge (cornerBottom[i], cornerBottom[next], row (sf, 0), sf.knotsU), top = edge (cornerTop[i], cornerTop[next], row (sf, last), sf.knotsU);
        // Away from the tray: away from the skirt's centre in plan.
        const { n, at } = normal (sf), sameSense = n[0] * (at[0] - sides[i].seed[0]) + n[2] * (at[2] - sides[i].seed[1]) > 0;
        const loop = [[bottom, true], [corner[next], true], [top, false], [corner[i], false]];
        faces.push ({ name : sides[i].id, kind : 'bspline', surface : worldSurface (sf), sameSense, bounds : [{ outer : true, loop : sameSense ? loop : reverse (loop) }] });
        outer.push (top);
    }
    // Planes (normal +y in the forming frame). Seen from +y, counter-clockwise has negative signed area in (x, z).
    const area = loop => { let s = 0; const pts = loop.flatMap (([e, f]) => { const p = edges[e].local; return f ? p : p.slice ().reverse (); }); for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[2] - b[0] * a[2]; } return s; };
    const bound = (loop, isOuter) => ({ outer : isOuter, loop : (area (loop) < 0) === isOuter ? loop : reverse (loop) });
    const plane = (name, y, bounds) => faces.push ({ name, kind : 'plane', origin : toWorld (0, y, 0), normal : vector ([0, 1, 0]), xAxis : vector ([1, 0, 0]), sameSense : true, bounds });
    for (const floor of floors) { plane (floor.name, floor.y, [bound ([[floor.edge, true]], true)]); }
    plane ('Plateau', loft.walls[0].surface.points[(loft.walls[0].surface.countV - 1) * loft.walls[0].surface.countU * 3 + 1], [bound (outer.map (e => [e, true]), true), ...rims.map (e => bound ([[e, true]], false))]);
    return { id, direction, vertices, edges, faces, walls : loft.walls.length, maxDistanceMm : loft.maxDistanceMm, toleranceMm : loft.wallToleranceMm };
}

// Tangent blend between a closed pocket wall (clamped, y = v) and the floor plane at the wall's lowest height, radius r:
// the wall is split exactly at height floor + r; the blend is a cubic in its second direction with the wall's U knots.
// Rows: the floor curve (the wall foot moved r towards the pocket, on the floor), a handle along the floor, a handle down
// the wall (the wall's height derivative, scaled), and the wall's new lowest curve. The two inner rows make the blend
// tangent to the floor (horizontal handles) and to the wall (handles along ∂W/∂v); 0.5523 r is the cubic quarter-circle
// handle length. Returns { wall, surface }.
export function FloorBlend (wallSurface, seed, r)
{
    const v0 = wallSurface.knotsV[0], { upper } = SplitSurfaceV (wallSurface, v0 + r), U = upper.countU, k = 0.5523 * r;
    const at = (sf, a, b) => { const i = (b * sf.countU + a) * 3; return [sf.points[i], sf.points[i + 1], sf.points[i + 2]]; };
    // Height derivative of the upper wall at its start, as control vectors: p / (t[p + 1] − t[p]) (row 1 − row 0).
    const q = upper.degreeV, scale = q / (upper.knotsV[q + 1] - upper.knotsV[q]);
    const foot = Array.from ({ length : U }, (_, a) => at (wallSurface, a, 0)), lift = Array.from ({ length : U }, (_, a) => at (upper, a, 0));
    // Horizontal direction towards the pocket at each control, from the control polygon's tangent (closed: the first and
    // last controls coincide, so their neighbours wrap).
    const toward = foot.map ((p, a) => {
        const prev = foot[a === 0 ? U - 2 : a - 1], next = foot[a === U - 1 ? 1 : a + 1], tx = next[0] - prev[0], tz = next[2] - prev[2], l = Math.hypot (tx, tz) || 1;
        let nx = tz / l, nz = -tx / l; if (nx * (seed[0] - p[0]) + nz * (seed[1] - p[2]) < 0) { nx = -nx; nz = -nz; }
        return [nx, nz];
    });
    const points = new Float64Array (U * 4 * 3), put = (b, a, p) => { const i = (b * U + a) * 3; points[i] = p[0]; points[i + 1] = p[1]; points[i + 2] = p[2]; };
    for (let a = 0; a < U; a++) {
        const [nx, nz] = toward[a], f = foot[a], w = lift[a], w1 = at (upper, a, 1), d = [0, 1, 2].map (c => scale * (w1[c] - w[c]));
        const base = [f[0] + r * nx, f[1], f[2] + r * nz];
        put (0, a, base); put (1, a, [base[0] - k * nx, f[1], base[2] - k * nz]);
        // One constant scale for every control (y = v gives d a vertical part of exactly 1): the blend's derivative is then a fixed multiple of the wall's, so the two are tangent along the whole edge.
        put (2, a, [w[0] - k * d[0], w[1] - k * d[1], w[2] - k * d[2]]); put (3, a, w);
    }
    // Seam columns stay bitwise equal (first and last controls coincide on a closed wall).
    for (let b = 0; b < 4; b++) { for (let c = 0; c < 3; c++) { points[(b * U + U - 1) * 3 + c] = points[(b * U) * 3 + c]; } }
    return { wall : upper, surface : { degreeU : upper.degreeU, degreeV : 3, knotsU : upper.knotsU, knotsV : Float64Array.of (0, 0, 0, 0, 1, 1, 1, 1), countU : U, countV : 4, points, closedU : true } };
}

// Every edge used once in each direction, except the open skirt bottom (once).
export function SurfaceEdgeUses (surface)
{
    const uses = surface.edges.map (() => ({ forward : 0, reversed : 0 }));
    for (const face of surface.faces) { for (const b of face.bounds) { for (const [e, f] of b.loop) { uses[e][f ? 'forward' : 'reversed']++; } } }
    return uses;
}
