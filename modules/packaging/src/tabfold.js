// Fold-up tabs: the board inside each closed crease ring (a convex polygon of straight hinge lines, such as
// a can collar's crease around each opening) folds upward by angleDeg, each tab about its own hinge line.
// Works on a CreateBoard mesh (profile X/Y = world X/−Z, caliper 0..t up). Pure: no host imports.

export function ValidateTabFold (input)
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || input.version !== 1 || Object.keys (input).some (key => !['version', 'angleDeg'].includes (key))) { throw new Error ('Invalid tab fold.'); }
    if (typeof input.angleDeg !== 'number' || !Number.isFinite (input.angleDeg) || input.angleDeg < 0 || input.angleDeg > 90) { throw new Error ('Tab fold angle must be 0–90°.'); }
    return { version : 1, angleDeg : input.angleDeg };
}

const Signed = points => points.reduce ((sum, p, i) => { const q = points[(i + 1) % points.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
// The crease rings of a profile, as convex CCW polygons with inward hinge normals.
export function CreaseRings (profile)
{
    return profile.paths.filter (path => path.type === 'score' && path.closed && path.process?.kind === 'crease' && path.points.length >= 3).map (path => {
        const points = Signed (path.points) < 0 ? [...path.points].reverse () : path.points.map (p => [...p]);
        const centre = points.reduce ((sum, p) => [sum[0] + p[0] / points.length, sum[1] + p[1] / points.length], [0, 0]);
        const edges = points.map ((a, i) => {
            const b = points[(i + 1) % points.length], length = Math.hypot (b[0] - a[0], b[1] - a[1]);
            return { a, b, normal : [-(b[1] - a[1]) / length, (b[0] - a[0]) / length] }; // CCW: left normal points inward
        });
        if (edges.some (e => points.some (p => (p[0] - e.a[0]) * e.normal[0] + (p[1] - e.a[1]) * e.normal[1] < -1e-7))) { throw new Error ('Crease rings for fold-up tabs must be convex.'); }
        const xs = points.map (p => p[0]), ys = points.map (p => p[1]);
        return { id : path.id, points, centre, edges, min : [Math.min (...xs), Math.min (...ys)], max : [Math.max (...xs), Math.max (...ys)] };
    });
}

const Inside = (edge, p) => (p[0] - edge.a[0]) * edge.normal[0] + (p[1] - edge.a[1]) * edge.normal[1];
// Clips a convex polygon of { p : [x, y], w : [weights] } to the side of edge where sign * Inside >= 0.
function Clip (polygon, edge, sign)
{
    const result = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = sign * Inside (edge, a.p), db = sign * Inside (edge, b.p);
        if (da >= 0) { result.push (a); }
        if ((da >= 0) !== (db >= 0)) { const f = da / (da - db); result.push ({ p : [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f], w : a.w.map ((v, k) => v + (b.w[k] - v) * f) }); }
    }
    return result.length >= 3 ? result : [];
}
const Area = polygon => Math.abs (Signed (polygon.map (v => v.p)));

// Folds the mesh in place and returns the number of tab triangles.
export function FoldTabs (mesh, profile)
{
    const fold = ValidateTabFold (profile.tabFold), angle = fold.angleDeg * Math.PI / 180, t = profile.thickness;
    const rings = CreaseRings (profile); if (!angle || !rings.length) { return 0; }
    const cos = Math.cos (angle), sin = Math.sin (angle), kept = [], added = [];
    const flat = index => { const v = mesh.vertices[index]; return [v[0], -v[2]]; };
    // Each tab is rigid and turns about its hinge line, pivoting on the top face.
    const hingeFor = (ring, p) => {
        const o = ring.centre, angleOf = q => Math.atan2 (q[1] - o[1], q[0] - o[0]), at = angleOf (p);
        return ring.edges.find (e => { const a = angleOf (e.a), b = angleOf (e.b), span = (b - a + 2 * Math.PI) % (2 * Math.PI), offset = (at - a + 2 * Math.PI) % (2 * Math.PI); return offset <= span + 1e-9; }) || ring.edges[0];
    };
    const turn = (edge, x, py, y) => {
        const d = Inside (edge, [x, py]), d2 = d * cos - (y - t) * sin, y2 = t + d * sin + (y - t) * cos, shift = d2 - d;
        return [x + edge.normal[0] * shift, y2, -(py + edge.normal[1] * shift)];
    };
    const turnNormal = (edge, n) => {
        const inward = [edge.normal[0], 0, -edge.normal[1]], c = n[0] * inward[0] + n[2] * inward[2], c2 = c * cos - n[1] * sin, up = c * sin + n[1] * cos;
        return [n[0] + inward[0] * (c2 - c), up, n[2] + inward[2] * (c2 - c)];
    };
    const emit = (corners, material, edge) => {
        // corners: [{ position : [x, y, z], normal, uv }]; a fan of triangles, folded when edge is given.
        const ids = corners.map (c => {
            const position = edge ? turn (edge, c.position[0], -c.position[2], c.position[1]) : c.position;
            return { v : mesh.vertices.push (position) - 1, n : mesh.normals.push (edge ? turnNormal (edge, c.normal) : c.normal) - 1, uv : mesh.uvs.push (c.uv) - 1 };
        });
        for (let i = 1; i + 1 < ids.length; i++) { const tri = [ids[0], ids[i], ids[i + 1]]; added.push ({ vertices : tri.map (c => c.v), normals : tri.map (c => c.n), uvs : tri.map (c => c.uv), material }); }
    };
    let tabs = 0;
    for (const triangle of mesh.triangles) {
        const pts = triangle.vertices.map (flat), minX = Math.min (...pts.map (p => p[0])), maxX = Math.max (...pts.map (p => p[0])), minY = Math.min (...pts.map (p => p[1])), maxY = Math.max (...pts.map (p => p[1]));
        const ring = rings.find (r => maxX >= r.min[0] - 1e-6 && minX <= r.max[0] + 1e-6 && maxY >= r.min[1] - 1e-6 && minY <= r.max[1] + 1e-6);
        if (!ring) { kept.push (triangle); continue; }
        const corners = triangle.vertices.map ((v, i) => ({ position : mesh.vertices[v], normal : mesh.normals[triangle.normals[i]], uv : mesh.uvs[triangle.uvs[i]] }));
        const inside = pts.every (p => ring.edges.every (e => Inside (e, p) >= -1e-7)), outside = ring.edges.some (e => pts.every (p => Inside (e, p) <= 1e-7));
        if (outside) { kept.push (triangle); continue; }
        const centroid = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3];
        if (inside) { emit (corners, triangle.material, hingeFor (ring, centroid)); tabs++; continue; }
        // A face triangle crossing the crease: the parts outside stay with the sheet, the part inside folds.
        if (Math.abs (corners[0].normal[1]) < .5) { kept.push (triangle); continue; }
        const lerp = w => { const c = (k, key) => corners.reduce ((sum, corner, i) => sum + corner[key][k] * w[i], 0); return { position : [0, 1, 2].map (k => c (k, 'position')), normal : corners[0].normal, uv : [c (0, 'uv'), c (1, 'uv')] }; };
        let rest = pts.map ((p, i) => ({ p, w : [0, 1, 2].map (k => k === i ? 1 : 0) }));
        for (const edge of ring.edges) {
            const out = Clip (rest, edge, -1); if (out.length && Area (out) > 1e-10) { emit (out.map (v => lerp (v.w)), triangle.material, null); }
            rest = Clip (rest, edge, 1); if (!rest.length) { break; }
        }
        if (rest.length && Area (rest) > 1e-10) { const c = rest.reduce ((s, v) => [s[0] + v.p[0] / rest.length, s[1] + v.p[1] / rest.length], [0, 0]); emit (rest.map (v => lerp (v.w)), triangle.material, hingeFor (ring, c)); tabs++; }
    }
    mesh.triangles = [...kept, ...added];
    return tabs;
}
