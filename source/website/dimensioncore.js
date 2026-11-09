import * as THREE from 'three';
import { Unit } from '../engine/model/unit.js';
function UnitFactor (unit) { return { [Unit.Millimeter] : 1, [Unit.Centimeter] : 10, [Unit.Meter] : 1000, [Unit.Inch] : 25.4, [Unit.Foot] : 304.8 }[unit] || null; }

export function ValidateDimensions (input = [])
{
    if (!Array.isArray (input) || input.length > 500) { throw new Error ('A session supports up to 500 dimensions.'); }
    const ids = new Set ();
    return input.map (d => {
        if (!d || typeof d !== 'object' || Object.keys (d).some (k => !['id', 'objectId', 'kind', 'mesh', 'meshName', 'topology', 'a', 'b', 'pathId', 'pathSize', 'segment', 'offset', 'visible'].includes (k)) || typeof d.id !== 'string' || d.id.length > 100 || !d.id || ids.has (d.id) || typeof d.objectId !== 'string' || !d.objectId || d.objectId.length > 100 || !Number.isFinite (d.offset) || Math.abs (d.offset) > 2000 || typeof d.visible !== 'boolean') { throw new Error ('Invalid dimension annotation.'); }
        ids.add (d.id);
        if (d.kind === 'cad') {
            if (Object.keys (d).some (k => !['id', 'objectId', 'kind', 'pathId', 'pathSize', 'segment', 'offset', 'visible'].includes (k))) { throw new Error ('Invalid CAD reference fields.'); }
            if (typeof d.pathId !== 'string' || !d.pathId || d.pathId.length > 120 || !Number.isInteger (d.segment) || d.segment < 0 || d.segment > 200000 || !Number.isInteger (d.pathSize) || d.pathSize < 2 || d.pathSize > 200000) { throw new Error ('Invalid CAD dimension reference.'); }
        } else if (d.kind === 'edge') {
            if (Object.keys (d).some (k => !['id', 'objectId', 'kind', 'mesh', 'meshName', 'topology', 'a', 'b', 'offset', 'visible'].includes (k))) { throw new Error ('Invalid edge reference fields.'); }
            if (!Number.isInteger (d.mesh) || d.mesh < 0 || d.mesh > 200000 || typeof d.meshName !== 'string' || d.meshName.length > 1000 || !/^[a-f0-9]{8}$/.test (d.topology) || !Number.isInteger (d.a) || !Number.isInteger (d.b) || d.a < 0 || d.b < 0 || d.a === d.b || d.a > 10000000 || d.b > 10000000) { throw new Error ('Invalid mesh edge reference.'); }
        } else { throw new Error ('Choose a CAD segment or model edge.'); }
        return { ...d };
    });
}
export function ObjectInstances (document, object)
{
    const result = []; document.model.EnumerateMeshInstances (instance => { if (document.Owner (instance) === object) { result.push (instance); } }); return result;
}
export function TopologyKey (mesh)
{
    let hash = 2166136261; const add = n => { hash = Math.imul (hash ^ n, 16777619); };
    add (mesh.vertices.length);
    for (const t of mesh.triangles) { add (t.v0); add (t.v1); add (t.v2); }
    for (const line of mesh.lines) { add (line.vertices.length); for (const v of line.vertices) { add (v); } }
    return (hash >>> 0).toString (16).padStart (8, '0');
}
export function CachedTopologyKey (mesh, cache)
{
    let state = cache?.get (mesh);
    if (!state || state.vertices !== mesh.vertices || state.triangles !== mesh.triangles || state.lines !== mesh.lines || state.v !== mesh.vertices.length || state.t !== mesh.triangles.length || state.l !== mesh.lines.length) {
        state = { key : TopologyKey (mesh), vertices : mesh.vertices, triangles : mesh.triangles, lines : mesh.lines, v : mesh.vertices.length, t : mesh.triangles.length, l : mesh.lines.length }; cache?.set (mesh, state);
    }
    return state.key;
}
export function FeatureEdges (mesh)
{
    if (mesh.triangles.length > 200000 || mesh.vertices.length > 1000000) { throw new Error ('This mesh is too dense for edge annotation. Simplify it first.'); }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of mesh.vertices) { [p.x, p.y, p.z].forEach ((n, i) => { min[i] = Math.min (min[i], n); max[i] = Math.max (max[i], n); }); }
    const eps = Math.max (1e-12, ...max.map ((n, i) => (n - min[i]) * 1e-10));
    const key = index => { const p = mesh.vertices[index]; return [p.x, p.y, p.z].map ((n, i) => Math.round ((n - min[i]) / eps)).join (','); };
    const edges = new Map ();
    const add = (a, b, normal = null) => {
        const ka = key (a), kb = key (b); if (ka === kb) { return; }
        const id = [ka, kb].sort ().join ('/'); const edge = edges.get (id) || { a, b, ka, kb, normals : [], explicit : false };
        if (normal) { edge.normals.push (normal); } else { edge.explicit = true; } edges.set (id, edge);
    };
    for (const line of mesh.lines) { for (let i = 1; i < line.vertices.length; i++) { add (line.vertices[i - 1], line.vertices[i]); } }
    for (const t of mesh.triangles) {
        const [a, b, c] = [t.v0, t.v1, t.v2].map (i => new THREE.Vector3 (mesh.vertices[i].x, mesh.vertices[i].y, mesh.vertices[i].z));
        const normal = b.sub (a).cross (c.sub (a)); if (normal.lengthSq () < 1e-24) { continue; } normal.normalize ();
        add (t.v0, t.v1, normal); add (t.v1, t.v2, normal); add (t.v2, t.v0, normal);
    }
    // Coplanar tessellation diagonals are not CAD/model feature edges.
    return [...edges.values ()].filter (e => e.explicit || e.normals.length === 1 || e.normals.some (n => e.normals.some (m => n.dot (m) < 0.906307787))).map (({ a, b }) => ({ a, b }));
}
export function IsFlatCad (object)
{
    return object.packagingProfile && (!object.userData?._auto3dFefco || object.userData?._auto3dPackagingState === 'flat');
}
export function CadSegments (object)
{
    if (!IsFlatCad (object)) { return []; }
    return object.packagingProfile.paths.flatMap (p => Array.from ({ length : p.points.length - (p.closed ? 0 : 1) }, (_, segment) => ({ kind : 'cad', objectId : object.id, pathId : p.id, pathSize : p.points.length, segment })));
}
export function ResolveDimension (document, d, cache = null, instances = null)
{
    const object = document.objects.find (o => o.id === d.objectId); if (!object) { return { stale : true, reason : 'Source object removed.' }; }
    if (object.animationAsset || (object.userData?._auto3dFoldPreview !== undefined && Number (object.userData._auto3dFoldPreview) !== 1)) { return { stale : true, reason : 'Use static geometry or the flat CAD drawing; animated visual poses are not dimensioned.' }; }
    let a, b, sourceLengthMm = null;
    if (d.kind === 'cad') {
        if (!IsFlatCad (object)) { return { stale : true, reason : 'CAD drawing is currently folded or unavailable.' }; }
        const profile = object.packagingProfile, path = profile.paths.find (p => p.id === d.pathId), factor = UnitFactor (document.model.GetUnit (), 'metric');
        if (!factor || !path || path.points.length !== d.pathSize || d.segment >= path.points.length - (path.closed ? 0 : 1)) { return { stale : true, reason : 'CAD segment unavailable.' }; }
        const p = path.points[d.segment], q = path.points[(d.segment + 1) % path.points.length], matrix = new THREE.Matrix4 ().fromArray (object.node.GetWorldTransformation ().GetMatrix ().Get ());
        sourceLengthMm = Math.hypot (q[0] - p[0], q[1] - p[1]);
        a = new THREE.Vector3 (p[0] / factor, (profile.thickness + 0.02) / factor, -p[1] / factor).applyMatrix4 (matrix); b = new THREE.Vector3 (q[0] / factor, (profile.thickness + 0.02) / factor, -q[1] / factor).applyMatrix4 (matrix);
    } else {
        const instance = (instances?.get (object.id) || ObjectInstances (document, object))[d.mesh], mesh = instance?.mesh;
        if (!mesh || String (mesh.GetName () || '').slice (0, 1000) !== d.meshName || !mesh.vertices[d.a] || !mesh.vertices[d.b]) { return { stale : true, reason : 'Source mesh changed.' }; }
        const topology = CachedTopologyKey (mesh, cache);
        if (topology !== d.topology) { return { stale : true, reason : 'Source topology changed; recreate this dimension.' }; }
        const matrix = new THREE.Matrix4 ().fromArray (instance.GetTransformation ().GetMatrix ().Get ());
        const p = mesh.vertices[d.a], q = mesh.vertices[d.b];
        a = new THREE.Vector3 (p.x, p.y, p.z).applyMatrix4 (matrix); b = new THREE.Vector3 (q.x, q.y, q.z).applyMatrix4 (matrix);
        const factor = UnitFactor (document.model.GetUnit (), 'metric'); sourceLengthMm = factor ? Math.hypot (p.x - q.x, p.y - q.y, p.z - q.z) * factor : null;
    }
    const length = a.distanceTo (b), factor = UnitFactor (document.model.GetUnit (), 'metric');
    if (!Number.isFinite (length) || length < 1e-12) { return { stale : true, reason : 'Source edge is degenerate.' }; }
    return { a, b, length, lengthMm : factor ? length * factor : null, sourceLengthMm, object, hidden : object.visible === false || d.kind === 'edge' && object.hiddenParts?.includes (d.mesh) };
}
export function ProjectDimension (a, b, camera, width, height, offset)
{
    const p = a.clone ().project (camera), q = b.clone ().project (camera);
    if (![p.x, p.y, p.z, q.x, q.y, q.z].every (Number.isFinite) || p.z < -1 || p.z > 1 || q.z < -1 || q.z > 1) { return null; }
    const start = new THREE.Vector2 ((p.x + 1) * width / 2, (1 - p.y) * height / 2), end = new THREE.Vector2 ((q.x + 1) * width / 2, (1 - q.y) * height / 2);
    const delta = end.clone ().sub (start); if (delta.length () < 3) { return null; }
    const normal = new THREE.Vector2 (-delta.y, delta.x).normalize (), shift = normal.clone ().multiplyScalar (offset);
    return { start, end, normal, left : start.clone ().add (shift), right : end.clone ().add (shift) };
}
