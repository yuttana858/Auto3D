import { Vector3, Matrix4, Matrix3 } from 'three';
import { ValidateBoardAppearance } from './appearancesettings.js';
function distance (x, z, a, b) { const dx = b[0] - a[0], dz = b[2] - a[2]; const u = Math.max (0, Math.min (1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot (x - a[0] - u * dx, z - a[2] - u * dz); }
export function BoardAppearanceMesh (mesh, profile, polygon = null)
{
    const settings = ValidateBoardAppearance (profile.appearance); if (!settings.enabled) { return mesh; }
    const t = profile.thickness; const boundaries = polygon?.[0]?.points ? polygon : [{ points : polygon || [...new Map (mesh.vertices.map (p => [p[0] + ',' + p[2], [p[0], 0, p[2]]])).values ()] }]; const points = boundaries.flatMap (boundary => boundary.points);
    const minX = Math.min (...points.map (p => p[0])), maxX = Math.max (...points.map (p => p[0])), minZ = Math.min (...points.map (p => p[2])), maxZ = Math.max (...points.map (p => p[2]));
    const width = maxX - minX, height = maxZ - minZ; const board = profile.engineering?.materials.find (m => m.id === profile.engineering.activeMaterialId); const angle = (board?.fluteDirectionDegrees ?? 90) * Math.PI / 180;
    const edges = boundaries.flatMap (boundary => boundary.points.map ((a, i) => { const b = boundary.points[(i + 1) % boundary.points.length]; const mid = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2]; const score = profile.paths.some (path => path.type === 'score' && path.points.some ((p, j) => j > 0 && distance (...[mid[0], mid[2]], [path.points[j - 1][0], 0, -path.points[j - 1][1]], [p[0], 0, -p[1]]) < 1e-5)); return { a, b, score, hole : boundary.hole === true, points : boundary.points }; }));
    const amplitude = Math.min (t * .22, Math.min (width, height) * .006) * settings.panelBow;
    // A die-cut shoulder deforms both liner faces. Bound the deformation to
    // less than half the caliper so even maximum compression retains an edge.
    const radius = Math.min (t * .49, Math.min (t * .9, Math.min (width, height) * .03) * settings.cutCompression);
    const field = (x, z, side) => {
        const u = Math.max (0, Math.min (1, (x - minX) / (width || 1))), v = Math.max (0, Math.min (1, (z - minZ) / (height || 1)));
        const all = Math.min (...edges.map (edge => distance (x, z, edge.a, edge.b))); const cut = Math.min (...edges.filter (edge => !edge.score).map (edge => distance (x, z, edge.a, edge.b)));
        const pin = Math.pow (1 - Math.exp (-Math.pow (all / Math.max (t, 1e-6), 2)), 2);
        const variation = 1 + .14 * Math.sin ((x * Math.cos (angle) + z * Math.sin (angle)) / 53);
        const bow = amplitude * Math.pow (Math.sin (Math.PI * u) * Math.sin (Math.PI * v), 2) * pin * variation;
        const compression = radius > 0 && cut < radius ? radius - Math.sqrt (Math.max (0, radius * radius - (radius - cut) ** 2)) : 0;
        return bow + (side ? -compression : compression);
    };
    const result = { ...mesh, presentationOnly : true, vertices : [], normals : [], uvs : [], triangles : [], lines : mesh.lines || [] };
    const sample = (triangle, weights) => {
        const clustered = weights.map (weight => Math.pow (Math.max (0, weight), 4)); const total = clustered.reduce ((a, b) => a + b, 0); weights = clustered.map (weight => weight / total);
        const p = [0, 0, 0], uv = [0, 0], normal = new Vector3 ();
        weights.forEach ((weight, i) => { const point = mesh.vertices[triangle.vertices[i]], texture = mesh.uvs[triangle.uvs[i]], n = mesh.normals[triangle.normals[i]]; p.forEach ((_, k) => { p[k] += point[k] * weight; }); uv.forEach ((_, k) => { uv[k] += texture[k] * weight; }); normal.addScaledVector (new Vector3 (...n), weight); });
        const side = p[1] > t / 2; const originalY = p[1]; const blend = originalY / t; p[1] += field (p[0], p[2], false) * (1 - blend) + field (p[0], p[2], true) * blend;
        if (Math.abs (normal.y) > .9) { const e = Math.max (1e-5, t * .0001); const dx = (field (p[0] + e, p[2], side) - field (p[0] - e, p[2], side)) / (2 * e), dz = (field (p[0], p[2] + e, side) - field (p[0], p[2] - e, side)) / (2 * e); normal.set (-dx, 1, -dz).multiplyScalar (side ? 1 : -1);
            const nearest = edges.filter (edge => !edge.score && distance (p[0], p[2], edge.a, edge.b) < e);
            if (radius > 0 && nearest.length) { const inward = new Vector3 (); for (const edge of nearest) { const centre = edge.points.reduce ((sum, point) => [sum[0] + point[0] / edge.points.length, sum[1] + point[2] / edge.points.length], [0, 0]); const direction = new Vector3 (edge.b[0] - edge.a[0], 0, edge.b[2] - edge.a[2]).normalize (); const n = new Vector3 (-direction.z, 0, direction.x); if (n.dot (new Vector3 (centre[0] - edge.a[0], 0, centre[1] - edge.a[2])) < 0) { n.negate (); } if (edge.hole) { n.negate (); } inward.add (n); } inward.normalize (); normal.set (-inward.x * 100, 1, -inward.z * 100).multiplyScalar (side ? 1 : -1); } }
        const index = result.vertices.length; result.vertices.push (p); result.normals.push (normal.normalize ().toArray ()); result.uvs.push (uv); return index;
    };
    for (const triangle of mesh.triangles) {
        const face = Math.abs (mesh.normals[triangle.normals[0]][1]) > .9; const steps = face ? 8 : 4; const indices = new Map (); const at = (i, j) => { const key = i + ',' + j; if (!indices.has (key)) { indices.set (key, sample (triangle, [1 - (i + j) / steps, i / steps, j / steps])); } return indices.get (key); };
        const add = ids => result.triangles.push ({ vertices : ids, normals : ids, uvs : ids, material : triangle.material });
        for (let i = 0; i < steps; i++) { for (let j = 0; j < steps - i; j++) { add ([at (i, j), at (i + 1, j), at (i, j + 1)]); if (i + j < steps - 1) { add ([at (i + 1, j), at (i + 1, j + 1), at (i, j + 1)]); } } }
    }
    return result;
}
export function TransformAppearanceMesh (mesh, values)
{
    const matrix = new Matrix4 ().fromArray (values), normals = new Matrix3 ().getNormalMatrix (matrix);
    return { ...mesh, vertices : mesh.vertices.map (p => new Vector3 (...p).applyMatrix4 (matrix).toArray ()), normals : mesh.normals.map (n => new Vector3 (...n).applyMatrix3 (normals).normalize ().toArray ()) };
}
