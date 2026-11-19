// Display mesh of a formed tray from its smooth product surface (ProductSurface): what the viewer and GLB show instead of
// the heightfield review mesh, whose near-vertical walls saw-tooth between grid cells.
//
//   • Product side: every B-spline face tessellated on a (u, v) grid; neighbouring faces use the same parameters along
//     their shared edges (bands of a stack share their U knots and sample counts), so the mesh has no cracks. Flat faces
//     (floors, caps, plateau) are triangulated inside their boundary polygons, sampled at those same parameters.
//   • Tool side: the product side offset by the pulp thickness along its vertex normals. Every crease is a tangent blend
//     with a radius above the thickness, so the offset does not fold (OpenCASCADE builds the exact tool side for STEP).
//   • The open skirt edge is closed with a strip between the two sides.
// Positions are in the shell's forming frame relative to `origin` (as the review mesh), normals unit length.
import { SurfacePoint } from './bspline.js';

function Sub (a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function Cross (a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function Unit (a) { const l = Math.hypot (a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// Ear clipping of a simple polygon with holes (holes are joined to the outer ring by bridges). points: [x, y] in order;
// returns triangles as index triples into the concatenated input (outer, then holes). Counter-clockwise outer ring.
export function Triangulate (outer, holes = [])
{
    const all = [...outer, ...holes.flat ()], area = ring => { let s = 0; for (let i = 0; i < ring.length; i++) { const a = all[ring[i]], b = all[ring[(i + 1) % ring.length]]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
    let ring = outer.map ((_, i) => i); if (area (ring) < 0) { ring.reverse (); }
    let offset = outer.length;
    const holeRings = holes.map (h => { const r = h.map ((_, i) => offset + i); offset += h.length; if (area (r) > 0) { r.reverse (); } return r; });
    // Bridge holes in order of their rightmost point: connect it to the nearest visible outer-ring vertex to its right.
    const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const segmentsCross = (p1, p2, q1, q2) => { const d1 = cross2 (q1, q2, p1), d2 = cross2 (q1, q2, p2), d3 = cross2 (p1, p2, q1), d4 = cross2 (p1, p2, q2); return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0; };
    holeRings.sort ((a, b) => Math.max (...b.map (i => all[i][0])) - Math.max (...a.map (i => all[i][0])));
    for (const hole of holeRings) {
        let start = 0; for (let k = 1; k < hole.length; k++) { if (all[hole[k]][0] > all[hole[start]][0]) { start = k; } }
        const h = all[hole[start]], candidates = ring.map ((index, position) => ({ index, position, d : Math.hypot (all[index][0] - h[0], all[index][1] - h[1]) })).sort ((a, b) => a.d - b.d);
        const visible = candidates.find (c => { const p = all[c.index]; for (let k = 0; k < ring.length; k++) { const a = all[ring[k]], b = all[ring[(k + 1) % ring.length]]; if (ring[k] !== c.index && ring[(k + 1) % ring.length] !== c.index && segmentsCross (h, p, a, b)) { return false; } } for (const other of holeRings) { for (let k = 0; k < other.length; k++) { const a = all[other[k]], b = all[other[(k + 1) % other.length]]; if (other[k] !== hole[start] && other[(k + 1) % other.length] !== hole[start] && segmentsCross (h, p, a, b)) { return false; } } } return true; }) || candidates[0];
        const rotated = [...hole.slice (start), ...hole.slice (0, start)];
        ring = [...ring.slice (0, visible.position + 1), ...rotated, hole[start], ...ring.slice (visible.position)];
    }
    // Ear clipping on the merged ring (bridge vertices appear twice; their duplicates are skipped in the inside test).
    const triangles = [], inside = (p, a, b, c) => cross2 (a, b, p) >= 0 && cross2 (b, c, p) >= 0 && cross2 (c, a, p) >= 0;
    let guard = 0;
    while (ring.length > 3 && guard++ < 1e6) {
        let clipped = false;
        for (let k = 0; k < ring.length; k++) {
            const i0 = ring[(k - 1 + ring.length) % ring.length], i1 = ring[k], i2 = ring[(k + 1) % ring.length], a = all[i0], b = all[i1], c = all[i2];
            if (cross2 (a, b, c) <= 1e-12) { continue; }
            let ear = true;
            for (const j of ring) { if (j === i0 || j === i1 || j === i2) { continue; } const p = all[j]; if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]) || (p[0] === c[0] && p[1] === c[1])) { continue; } if (inside (p, a, b, c)) { ear = false; break; } }
            if (!ear) { continue; }
            triangles.push ([i0, i1, i2]); ring.splice (k, 1); clipped = true; break;
        }
        // A degenerate remainder (collinear points) is dropped rather than looping forever.
        if (!clipped) { ring.splice (ring.findIndex ((_, k) => cross2 (all[ring[(k - 1 + ring.length) % ring.length]], all[ring[k]], all[ring[(k + 1) % ring.length]]) <= 1e-12) >>> 0, 1); }
    }
    if (ring.length === 3) { triangles.push ([ring[0], ring[1], ring[2]]); }
    return triangles;
}

// surface: ProductSurface built with direction '+y' (forming frame). Returns a review-mesh-compatible component.
export function SmoothShellMesh (surface, { thicknessMm, origin = [0, 0, 0], id = 'pulp-tray', spacingMm = 0 } = {})
{
    const positions = [], normals = [], indices = [], add = (p, n) => { positions.push (p[0], p[1], p[2]); normals.push (n[0], n[1], n[2]); return positions.length / 3 - 1; };
    // Sample counts come from the control counts, which faces sharing an edge share (bands of a stack have the same U
    // knots; the two halves of a band, and neighbouring skirt sides, the same V knots): their samples coincide.
    void spacingMm;
    const product = [], boundary = new Map ();   // boundary: edge index → product vertex indices along the edge (forward)
    const normalAt = (sf, u, v, sameSense) => {
        const h = 1e-5, u0 = sf.knotsU[0], u1 = sf.knotsU.at (-1), v0 = sf.knotsV[0], v1 = sf.knotsV.at (-1);
        const uu = Math.min (u1 - h * (u1 - u0), Math.max (u0, u)), vv = Math.min (v1 - h * (v1 - v0), Math.max (v0, v));
        const p = SurfacePoint (sf, uu, vv), du = Sub (SurfacePoint (sf, uu + h * (u1 - u0), vv), p), dv = Sub (SurfacePoint (sf, uu, vv + h * (v1 - v0)), p), n = Unit (Cross (du, dv));
        return sameSense ? n : n.map (x => -x);
    };
    // B-spline faces: loop is [ring below, seam/corner, ring above, seam/corner] (possibly reversed): the U count comes from
    // the ring edges, the V count from the side edges.
    for (const face of surface.faces.filter (f => f.kind === 'bspline')) {
        // CCW loop [ring below, side at u1, ring above, side at u0]; a reversed face lists it backwards.
        const loop = face.bounds[0].loop.map (([e]) => e), [e0, , e2] = face.sameSense ? loop : [loop[3], loop[2], loop[1], loop[0]];
        const sf = face.surface, nu = Math.max (8, 4 * sf.countU), nv = Math.max (4, 3 * sf.countV), u0 = sf.knotsU[0], u1 = sf.knotsU.at (-1), v0 = sf.knotsV[0], v1 = sf.knotsV.at (-1), grid = [];
        for (let j = 0; j <= nv; j++) { for (let i = 0; i <= nu; i++) { const u = u0 + (u1 - u0) * i / nu, v = v0 + (v1 - v0) * j / nv; grid.push (add (SurfacePoint (sf, u, v), normalAt (sf, u, v, face.sameSense))); } }
        for (let j = 0; j < nv; j++) { for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; product.push (...(face.sameSense ? [grid[a], grid[b], grid[d], grid[a], grid[d], grid[c]] : [grid[a], grid[d], grid[b], grid[a], grid[c], grid[d]])); } }
        // Rows v0 and v1 are the ring edges (u increasing), the columns the side edges.
        boundary.set (e0, Array.from ({ length : nu + 1 }, (_, i) => grid[i]));
        boundary.set (e2, Array.from ({ length : nu + 1 }, (_, i) => grid[nv * (nu + 1) + i]));
    }
    // Flat faces: polygons from their boundary edges (sampled where the neighbouring B-spline faces sampled them).
    for (const face of surface.faces.filter (f => f.kind === 'plane')) {
        const n = Unit (face.normal), x = Unit (face.xAxis), y = Cross (n, x);
        const rings = face.bounds.map (b => b.loop.flatMap (([e, forward]) => { const ids = boundary.get (e); const ordered = forward ? ids : ids.slice ().reverse (); return ordered.slice (0, -1); }));
        const flat = id => { const p = positions.slice (id * 3, id * 3 + 3), d = Sub (p, face.origin); return [d[0] * x[0] + d[1] * x[1] + d[2] * x[2], d[0] * y[0] + d[1] * y[1] + d[2] * y[2]]; };
        const outerIndex = face.bounds.findIndex (b => b.outer), outer = rings[outerIndex], holes = rings.filter ((_, k) => k !== outerIndex);
        const lookup = [...outer, ...holes.flat ()], copies = lookup.map (id => add (positions.slice (id * 3, id * 3 + 3), n));
        for (const [a, b, c] of Triangulate (outer.map (flat), holes.map (h => h.map (flat)))) { product.push (copies[a], copies[b], copies[c]); }
    }
    // Weld coincident product vertices for smooth offset normals at the seams between faces.
    const key = id => positions.slice (id * 3, id * 3 + 3).map (v => Math.round (v * 1e5)).join (','), groups = new Map ();
    for (let id = 0; id < positions.length / 3; id++) { const k = key (id); if (!groups.has (k)) { groups.set (k, []); } groups.get (k).push (id); }
    const offsetNormal = new Map ();
    for (const ids of groups.values ()) { const sum = [0, 0, 0]; for (const id of ids) { for (let c = 0; c < 3; c++) { sum[c] += normals[id * 3 + c]; } } const u = Unit (sum); for (const id of ids) { offsetNormal.set (id, u); } }
    // Tool side: offset copy, reversed winding, normals flipped.
    const count = positions.length / 3, tool = new Int32Array (count);
    for (let id = 0; id < count; id++) { const p = positions.slice (id * 3, id * 3 + 3), m = offsetNormal.get (id); tool[id] = add ([p[0] - thicknessMm * m[0], p[1] - thicknessMm * m[1], p[2] - thicknessMm * m[2]], normals.slice (id * 3, id * 3 + 3).map (v => -v)); }
    for (let k = 0; k < product.length; k += 3) { indices.push (product[k], product[k + 1], product[k + 2], tool[product[k]], tool[product[k + 2]], tool[product[k + 1]]); }
    // Close the free boundary (edges used by one face only) with a strip between the two sides.
    const uses = new Map (); for (const face of surface.faces) { for (const b of face.bounds) { for (const [e, forward] of b.loop) { (uses.get (e) || uses.set (e, []).get (e)).push (forward); } } }
    for (const [e, list] of uses) {
        if (list.length !== 1 || !boundary.has (e)) { continue; }
        const ids = list[0] ? boundary.get (e) : boundary.get (e).slice ().reverse ();
        for (let k = 0; k + 1 < ids.length; k++) {
            const a = ids[k], b = ids[k + 1], pa = positions.slice (a * 3, a * 3 + 3), pb = positions.slice (b * 3, b * 3 + 3), out = Unit (Cross (Sub (pb, pa), offsetNormal.get (a)));
            const v = [add (pa, out), add (pb, out), add (positions.slice (tool[b] * 3, tool[b] * 3 + 3), out), add (positions.slice (tool[a] * 3, tool[a] * 3 + 3), out)];
            indices.push (v[0], v[2], v[1], v[0], v[3], v[2]);
        }
    }
    const p = Float32Array.from (positions, (v, i) => v - origin[i % 3]);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity; for (let i = 0; i < p.length; i += 3) { minX = Math.min (minX, p[i]); maxX = Math.max (maxX, p[i]); minZ = Math.min (minZ, p[i + 2]); maxZ = Math.max (maxZ, p[i + 2]); }
    const uvs = new Float32Array (p.length / 3 * 2); for (let i = 0, k = 0; i < p.length; i += 3, k += 2) { uvs[k] = (p[i] - minX) / (maxX - minX || 1); uvs[k + 1] = (p[i + 2] - minZ) / (maxZ - minZ || 1); }
    return { id, materialRole : 'pulp', positions : p, normals : Float32Array.from (normals), uvs, indices : (p.length / 3 > 65535 ? Uint32Array : Uint16Array).from (indices), triangleCount : indices.length / 3, display : 'smooth', faces : surface.faces.length };
}
