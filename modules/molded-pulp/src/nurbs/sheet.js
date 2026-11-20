// Flat sheet with rounded plan corners: a closed solid of two planes (top, bottom), four flat sides and four corner
// faces, as exact B-rep data for STEP (WriteSolidStep) and as a display mesh. Neutral data like brep.js and surface.js.
//
// The outline runs counter-clockwise in (x, z) (positive signed area): the −z side, the +x+z… corners in turn. Arcs are
// cubic Bézier quarter circles (handle 0.5523 R, radial error below 0.03% of R). Loops run counter-clockwise seen from
// each face's outward side.
import { PullDirections } from '../orient.js';
import { Triangulate } from './display.js';

const K = 0.5523;

// rect: { x0, z0, x1, z1 } in the forming frame, y0 (bottom) < y1 (top). r: corner radius (0 < r < half the shorter side).
function Outline (rect, r)
{
    const { x0, z0, x1, z1 } = rect, centres = [[x1 - r, z0 + r], [x1 - r, z1 - r], [x0 + r, z1 - r], [x0 + r, z0 + r]], starts = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
    const segments = [];
    centres.forEach (([cx, cz], i) => {
        const a = starts[i], b = a + Math.PI / 2, p0 = [cx + r * Math.cos (a), cz + r * Math.sin (a)], p3 = [cx + r * Math.cos (b), cz + r * Math.sin (b)];
        const t0 = [-Math.sin (a), Math.cos (a)], t1 = [-Math.sin (b), Math.cos (b)];
        // Straight side into this corner, then the corner arc.
        const previous = segments.length ? segments.at (-1).points.at (-1) : null;
        if (previous) { segments.push ({ kind : 'line', points : [previous, p0] }); }
        segments.push ({ kind : 'arc', centre : [cx, cz], start : a, points : [p0, [p0[0] + K * r * t0[0], p0[1] + K * r * t0[1]], [p3[0] - K * r * t1[0], p3[1] - K * r * t1[1]], p3] });
    });
    segments.push ({ kind : 'line', points : [segments.at (-1).points.at (-1), segments[0].points[0]] });
    // The closing line is the −z side: start the outline there.
    return [segments.at (-1), ...segments.slice (0, -1)];
}

export function RoundedSheetSurface (rect, r, { y0, y1, baseY = 0, direction = '+y', id = 'Sheet' } = {})
{
    const world = PullDirections[direction].world, at = (x, y, z) => world (x, baseY + y, z), vector = v => world (v[0], v[1], v[2]);
    const segments = Outline (rect, r), n = segments.length, vertices = [], edges = [], faces = [];
    const vertex = (p, y) => { vertices.push ({ point : at (p[0], y, p[1]) }); return vertices.length - 1; };
    const bottomV = segments.map (s => vertex (s.points[0], y0)), topV = segments.map (s => vertex (s.points[0], y1));
    const curve = (s, y) => s.kind === 'line' ? { degree : 1, knots : Float64Array.of (0, 0, 1, 1), points : s.points.map (p => at (p[0], y, p[1])) } : { degree : 3, knots : Float64Array.of (0, 0, 0, 0, 1, 1, 1, 1), points : s.points.map (p => at (p[0], y, p[1])) };
    const edge = (from, to, c) => { edges.push ({ from, to, ...c }); return edges.length - 1; };
    const bottom = segments.map ((s, i) => edge (bottomV[i], bottomV[(i + 1) % n], curve (s, y0)));
    const top = segments.map ((s, i) => edge (topV[i], topV[(i + 1) % n], curve (s, y1)));
    const vertical = segments.map ((s, i) => edge (bottomV[i], topV[i], { degree : 1, knots : Float64Array.of (0, 0, 1, 1), points : [at (s.points[0][0], y0, s.points[0][1]), at (s.points[0][0], y1, s.points[0][1])] }));
    // Top (normal +y): seen from above, counter-clockwise is the outline reversed. Bottom (normal −y): the outline itself.
    faces.push ({ name : 'Sheet top', kind : 'plane', origin : at (0, y1, 0), normal : vector ([0, 1, 0]), xAxis : vector ([1, 0, 0]), sameSense : true, bounds : [{ outer : true, loop : top.slice ().reverse ().map (e => [e, false]) }] });
    faces.push ({ name : 'Sheet bottom', kind : 'plane', origin : at (0, y0, 0), normal : vector ([0, -1, 0]), xAxis : vector ([1, 0, 0]), sameSense : true, bounds : [{ outer : true, loop : bottom.map (e => [e, true]) }] });
    segments.forEach ((s, i) => {
        // Seen from outside: up the start edge, along the top, down the end edge, back along the bottom.
        const loop = [[vertical[i], true], [top[i], true], [vertical[(i + 1) % n], false], [bottom[i], false]];
        if (s.kind === 'line') {
            const d = [s.points[1][0] - s.points[0][0], s.points[1][1] - s.points[0][1]], l = Math.hypot (...d), out = [d[1] / l, -d[0] / l];
            faces.push ({ name : 'Sheet side', kind : 'plane', origin : at (s.points[0][0], y0, s.points[0][1]), normal : vector ([out[0], 0, out[1]]), xAxis : vector ([d[0] / l, 0, d[1] / l]), sameSense : true, bounds : [{ outer : true, loop }] });
        } else {
            // u along the arc, v up: Su × Sv points inward, so the face is reversed relative to its surface.
            const points = new Float64Array (4 * 2 * 3);
            for (let b = 0; b < 2; b++) { for (let a = 0; a < 4; a++) { const p = at (s.points[a][0], b ? y1 : y0, s.points[a][1]); points.set (p, (b * 4 + a) * 3); } }
            faces.push ({ name : 'Sheet corner', kind : 'bspline', surface : { degreeU : 3, degreeV : 1, knotsU : Float64Array.of (0, 0, 0, 0, 1, 1, 1, 1), knotsV : Float64Array.of (0, 0, 1, 1), countU : 4, countV : 2, points }, sameSense : false, bounds : [{ outer : true, loop }] });
        }
    });
    return { id, direction, vertices, edges, faces };
}

// Display mesh in the forming frame relative to origin (as ShellMesh): flat top and bottom, flat sides, smooth corners.
export function RoundedSheetMesh (rect, r, { y0, y1, origin = [0, 0, 0], id = 'pulp-sheet', arcSteps = 16 } = {})
{
    const positions = [], normals = [], uvs = [], indices = [], length = rect.x1 - rect.x0, width = rect.z1 - rect.z0;
    const add = (x, y, z, n) => { positions.push (x - origin[0], y, z - origin[2]); normals.push (...n); uvs.push ((x - rect.x0) / length, (z - rect.z0) / width); return positions.length / 3 - 1; };
    const ring = [];
    for (const s of Outline (rect, r)) {
        if (s.kind === 'line') { ring.push ({ p : s.points[0], n : null }); continue; }
        for (let k = 0; k < arcSteps; k++) { const g = s.start + Math.PI / 2 * k / arcSteps; ring.push ({ p : [s.centre[0] + r * Math.cos (g), s.centre[1] + r * Math.sin (g)], n : [Math.cos (g), Math.sin (g)] }); }
    }
    const flat = ring.map (v => v.p), triangles = Triangulate (flat);
    const topIds = flat.map (p => add (p[0], y1, p[1], [0, 1, 0])), bottomIds = flat.map (p => add (p[0], y0, p[1], [0, -1, 0]));
    // Ring is counter-clockwise in (x, z); seen from +y that is clockwise, so the top uses the reversed winding.
    for (const [a, b, c] of triangles) { indices.push (topIds[a], topIds[c], topIds[b], bottomIds[a], bottomIds[b], bottomIds[c]); }
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], d = [b.p[0] - a.p[0], b.p[1] - a.p[1]], l = Math.hypot (...d) || 1, side = [d[1] / l, -d[0] / l];
        // Arc points use their radial normals (smooth corners); straight sides one flat normal.
        const na = a.n && b.n ? a.n : side, nb = a.n && b.n ? b.n : side;
        const q = [add (a.p[0], y0, a.p[1], [na[0], 0, na[1]]), add (b.p[0], y0, b.p[1], [nb[0], 0, nb[1]]), add (b.p[0], y1, b.p[1], [nb[0], 0, nb[1]]), add (a.p[0], y1, a.p[1], [na[0], 0, na[1]])];
        indices.push (q[0], q[2], q[1], q[0], q[3], q[2]);
    }
    const p = Float32Array.from (positions);
    return { id, materialRole : 'pulp', positions : p, normals : Float32Array.from (normals), uvs : Float32Array.from (uvs), indices : (p.length / 3 > 65535 ? Uint32Array : Uint16Array).from (indices), triangleCount : indices.length / 3, corners : r };
}
