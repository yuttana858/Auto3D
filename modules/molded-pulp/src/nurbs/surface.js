// Phase 2 output: the product side of a formed shell as one open shell of smooth faces, built from LoftPocketWalls.
// Faces: one cubic wall per pocket (closed around it), one per outer skirt side, a plane per pocket floor and the plateau
// plane with a hole at every pocket rim. Neighbouring faces share their boundary curves exactly (wall end rows, seam and
// corner columns), so the shell sews without gaps. The skirt's lower edge stays open: the tool side (thickening) is
// built in Cloud 3D Studio (docs/molded-pulp-nurbs.md).
//
// Orientation: every face normal points to the product side (away from the pulp): +y on the floors and plateau, into
// the pocket on pocket walls, away from the tray on the skirt. Loops run counter-clockwise seen from the normal.
// Neutral data in world millimetres (no STEP, no three.js), like brep.js.
import { SurfacePoint } from './bspline.js';
import { PullDirections } from '../orient.js';

// Why a smooth surface cannot be built from a loft result (null when it can).
export function ProductSurfaceProblem (loft)
{
    if (!loft.ok) { return loft.reason || 'The smooth walls are outside the tolerance.'; }
    if (!loft.walls.some (w => w.kind === 'skirt')) { return 'Turn on the outer skirt wall: the plateau needs it as its outer edge.'; }
    const raised = loft.faces.find (f => f.kind !== 'plane');
    if (raised) { return `${raised.id} is raised ${raised.raisedMm.toFixed (1)} mm (a domed base); fitted floor patches are not built yet.`; }
    return null;
}

function Cross (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

// loft: LoftPocketWalls result in the shell's forming frame (y = height above baseY).
export function ProductSurface (loft, { baseY = 0, direction = '+y', id = 'Tray' } = {})
{
    const problem = ProductSurfaceProblem (loft); if (problem) { throw new Error (problem); }
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
    for (const wall of pocketWalls) {
        const sf = wall.surface, last = sf.countV - 1;
        const vb = vertex (local (sf, 0, 0)), vt = vertex (local (sf, 0, last));
        const bottom = edge (vb, vb, row (sf, 0), sf.knotsU), top = edge (vt, vt, row (sf, last), sf.knotsU), seam = edge (vb, vt, column (sf, 0), sf.knotsV);
        // Into the pocket: towards its seed in plan.
        const { n, at } = normal (sf), sameSense = n[0] * (wall.seed[0] - at[0]) + n[2] * (wall.seed[1] - at[2]) > 0;
        const loop = [[bottom, true], [seam, true], [top, false], [seam, false]];
        faces.push ({ name : wall.id, kind : 'bspline', surface : worldSurface (sf), sameSense, bounds : [{ outer : true, loop : sameSense ? loop : reverse (loop) }] });
        rims.push (top); floors.push ({ name : wall.id + ' floor', edge : bottom, y : sf.points[1] });
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

// Every edge used once in each direction, except the open skirt bottom (once).
export function SurfaceEdgeUses (surface)
{
    const uses = surface.edges.map (() => ({ forward : 0, reversed : 0 }));
    for (const face of surface.faces) { for (const b of face.bounds) { for (const [e, f] of b.loop) { uses[e][f ? 'forward' : 'reversed']++; } } }
    return uses;
}
