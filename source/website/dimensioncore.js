import * as THREE from 'three';
import { FefcoDimensions } from '../../modules/packaging/src/dimensions.js';
import { EngineeringMeasurements } from '../../modules/packaging/src/engineering.js';
import { Unit } from '../engine/model/unit.js';
function UnitFactor (unit) { return { [Unit.Millimeter] : 1, [Unit.Centimeter] : 10, [Unit.Meter] : 1000, [Unit.Inch] : 25.4, [Unit.Foot] : 304.8 }[unit] || null; }

export function ValidateDimensions (input = [])
{
    if (!Array.isArray (input) || input.length > 500) { throw new Error ('A session supports up to 500 dimensions.'); }
    const ids = new Set ();
    return input.map (d => {
        if (!d || typeof d !== 'object' || Object.keys (d).some (k => !['id', 'objectId', 'kind', 'mesh', 'meshName', 'topology', 'a', 'b', 'pathId', 'pathSize', 'segment', 'offset', 'visible', 'placement', 'axis', 'corner'].includes (k)) || typeof d.id !== 'string' || d.id.length > 100 || !d.id || ids.has (d.id) || typeof d.objectId !== 'string' || !d.objectId || d.objectId.length > 100 || !Number.isFinite (d.offset) || Math.abs (d.offset) > 2000 || typeof d.visible !== 'boolean') { throw new Error ('Invalid dimension annotation.'); }
        ids.add (d.id);
        if (d.corner !== undefined && d.axis === undefined) { throw new Error ('A design corner requires an axis.'); }
        if (d.axis !== undefined && (!['length', 'width', 'height'].includes (d.axis) || !Array.isArray (d.corner) || d.corner.length !== 3 || d.corner.some (v => v !== 0 && v !== 1))) { throw new Error ('Invalid design dimension axis.'); }
        if (d.placement !== undefined) {
            const p = d.placement;
            if (!p || Object.keys (p).some (k => !['direction', 'distance', 'plane'].includes (k)) || !Array.isArray (p.direction) || p.direction.length !== 3 || p.direction.some (v => !Number.isFinite (v)) || Math.abs (Math.hypot (...p.direction) - 1) > 1e-6 || !Number.isFinite (p.distance) || Math.abs (p.distance) > 1e9 || ![0, 90].includes (p.plane)) { throw new Error ('Invalid 3D bracket placement.'); }
        }
        if (d.kind === 'cad') {
            if (Object.keys (d).some (k => !['id', 'objectId', 'kind', 'pathId', 'pathSize', 'segment', 'offset', 'visible', 'placement', 'axis', 'corner'].includes (k))) { throw new Error ('Invalid CAD reference fields.'); }
            if (typeof d.pathId !== 'string' || !d.pathId || d.pathId.length > 120 || !Number.isInteger (d.segment) || d.segment < 0 || d.segment > 200000 || !Number.isInteger (d.pathSize) || d.pathSize < 2 || d.pathSize > 200000) { throw new Error ('Invalid CAD dimension reference.'); }
        } else if (d.kind === 'edge') {
            if (Object.keys (d).some (k => !['id', 'objectId', 'kind', 'mesh', 'meshName', 'topology', 'a', 'b', 'offset', 'visible', 'placement', 'axis', 'corner'].includes (k))) { throw new Error ('Invalid edge reference fields.'); }
            if (!Number.isInteger (d.mesh) || d.mesh < 0 || d.mesh > 200000 || typeof d.meshName !== 'string' || d.meshName.length > 1000 || !/^[a-f0-9]{8}$/.test (d.topology) || !Number.isInteger (d.a) || !Number.isInteger (d.b) || d.a < 0 || d.b < 0 || d.a === d.b || d.a > 10000000 || d.b > 10000000) { throw new Error ('Invalid mesh edge reference.'); }
        } else { throw new Error ('Choose a CAD segment or model edge.'); }
        return { ...d, ...(d.corner ? { corner : [...d.corner] } : {}), ...(d.placement ? { placement : { ...d.placement, direction : d.placement.direction.map (v => v || 0) } } : {}) };
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
    if (d.axis) {
        if (!object.userData?._auto3dFefco) { return { stale : true, reason : 'Source design unavailable.' }; }
        try { return ResolveDesignDimension (document, object, d); } catch { return { stale : true, reason : 'Source design parameters unavailable.' }; }
    }
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

// Placement is stored in object coordinates, independent of the current camera.
export function ObjectMatrix (object) { return new THREE.Matrix4 ().fromArray (object.node.GetWorldTransformation ().GetMatrix ().Get ()); }
export function DimensionPlanes (document, anchor, resolved = ResolveDimension (document, anchor))
{
    if (resolved.stale) { return []; }
    const inverse = ObjectMatrix (resolved.object).invert (), edge = resolved.b.clone ().applyMatrix4 (inverse).sub (resolved.a.clone ().applyMatrix4 (inverse)).normalize (), directions = [];
    const add = normal => { const direction = normal.clone ().cross (edge).normalize (); if (direction.lengthSq () > .9 && !directions.some (v => Math.abs (v.dot (direction)) > .999)) { directions.push (direction); } };
    if (IsFlatCad (resolved.object)) { add (new THREE.Vector3 (0, 1, 0)); }
    else if (anchor.axis) { for (const n of [new THREE.Vector3 (1, 0, 0), new THREE.Vector3 (0, 1, 0), new THREE.Vector3 (0, 0, 1)]) { if (Math.abs (n.dot (edge)) < 1e-5) { add (n); } } }
    else {
        const instance = ObjectInstances (document, resolved.object)[anchor.mesh], mesh = instance?.mesh;
        if (mesh) {
            const matrix = inverse.clone ().multiply (new THREE.Matrix4 ().fromArray (instance.GetTransformation ().GetMatrix ().Get ())), a = mesh.vertices[anchor.a], b = mesh.vertices[anchor.b], tolerance = Math.max (1e-9, Math.hypot (a.x-b.x, a.y-b.y, a.z-b.z) * 1e-7);
            const match = (p, q) => Math.hypot (p.x-q.x, p.y-q.y, p.z-q.z) < tolerance;
            for (const t of mesh.triangles) {
                const vertices = [t.v0, t.v1, t.v2].map (i => mesh.vertices[i]);
                if (!vertices.some (p => match (p, a)) || !vertices.some (p => match (p, b))) { continue; }
                const [p, q, r] = vertices.map (v => new THREE.Vector3 (v.x, v.y, v.z).applyMatrix4 (matrix)); add (q.sub (p).cross (r.sub (p)).normalize ());
            }
        }
    }
    // Wires without faces use an object-axis plane; never a camera-facing plane.
    if (!directions.length) { for (const n of [new THREE.Vector3 (0, 1, 0), new THREE.Vector3 (0, 0, 1)]) { add (n); if (directions.length) { break; } } }
    return directions.slice (0, 2);
}
export function BracketPoints (resolved, placement)
{
    const matrix = ObjectMatrix (resolved.object), origin = new THREE.Vector3 ().applyMatrix4 (matrix); let direction = new THREE.Vector3 (...placement.direction);
    if (resolved.axis) {
        const inverse = matrix.clone ().invert (), edge = resolved.b.clone ().applyMatrix4 (inverse).sub (resolved.a.clone ().applyMatrix4 (inverse)).normalize ();
        if (Math.abs (direction.dot (edge)) > 1e-5 || IsFlatCad (resolved.object) && Math.abs (direction.y) > 1e-5) {
            direction = IsFlatCad (resolved.object) ? new THREE.Vector3 (0, 1, 0).cross (edge).normalize () : [new THREE.Vector3 (1, 0, 0), new THREE.Vector3 (0, 1, 0), new THREE.Vector3 (0, 0, 1)].filter (n => Math.abs (n.dot (edge)) < 1e-5)[placement.plane/90];
        }
    }
    const shift = direction.multiplyScalar (placement.distance).applyMatrix4 (matrix).sub (origin);
    return { a : resolved.a.clone ().add (shift), b : resolved.b.clone ().add (shift) };
}
export function ProjectPlacedDimension (resolved, placement, camera, width, height, offset = 0)
{
    const p = ProjectDimension (resolved.a, resolved.b, camera, width, height, offset); if (!p || !placement) { return p; }
    const bracket = BracketPoints (resolved, placement), q = ProjectDimension (bracket.a, bracket.b, camera, width, height, 0); if (!q) { return null; }
    return { ...p, left : q.start, right : q.end };
}
export function DesignAnchor (document, anchor)
{
    const r = ResolveDimension (document, anchor); if (r.stale || !r.object.userData?._auto3dFefco) { return anchor; }
    const inverse = ObjectMatrix (r.object).invert (), a = r.a.clone ().applyMatrix4 (inverse), b = r.b.clone ().applyMatrix4 (inverse), edge = b.clone ().sub (a).normalize ();
    let axis;
    if (IsFlatCad (r.object)) { const match = /^(base|top|wall)-([0-3])$/.exec (anchor.pathId); if (match) { axis = match[1] === 'wall' ? 'height' : Number (match[2]) % 2 ? 'width' : 'length'; } }
    else { const index = [edge.x, edge.y, edge.z].findIndex (v => Math.abs (v) > .99999); axis = ['width', 'height', 'length'][index]; }
    if (!axis) { return anchor; }
    const box = LocalBounds (document, r.object), midpoint = a.add (b).multiplyScalar (.5), center = box.getCenter (new THREE.Vector3 ());
    return { ...anchor, axis, corner : midpoint.toArray ().map ((v, i) => v >= center.getComponent (i) ? 1 : 0) };
}
const designBounds = new WeakMap ();
function LocalBounds (document, object)
{
    const cached = designBounds.get (object); if (cached?.model === document.model && cached.count === document.model.meshes.length) { return cached.box; }
    const box = new THREE.Box3 (), inverse = ObjectMatrix (object).invert ();
    for (const instance of ObjectInstances (document, object)) { const matrix = inverse.clone ().multiply (new THREE.Matrix4 ().fromArray (instance.GetTransformation ().GetMatrix ().Get ())); for (const v of instance.mesh.vertices) { box.expandByPoint (new THREE.Vector3 (v.x, v.y, v.z).applyMatrix4 (matrix)); } } designBounds.set (object, { model : document.model, count : document.model.meshes.length, box }); return box;
}
function ResolveDesignDimension (document, object, d)
{
    const factor = UnitFactor (document.model.GetUnit ()); if (!factor) { return { stale : true, reason : 'Set model units before dimensioning this design.' }; }
    const flat = IsFlatCad (object), basis = flat ? 'inside' : 'outside', params = JSON.parse (object.userData._auto3dFefco), profile = object.packagingProfile;
    const engineering = profile?.engineering ? EngineeringMeasurements (profile).dimensions.find (v => v.id === d.axis) : null;
    const value = engineering ? engineering[flat ? 'insideMm' : 'outsideMm'] : FefcoDimensions (params, Number (object.userData._auto3dFitTolerance || 0))[basis][d.axis];
    let a, b;
    if (flat) {
        const path = profile.paths.find (p => p.id === (d.kind === 'cad' ? d.pathId : { length : 'base-0', width : 'base-1', height : 'wall-0' }[d.axis])); if (!path) { return { stale : true, reason : 'Design axis path unavailable.' }; }
        a = new THREE.Vector3 (path.points[0][0]/factor, (profile.thickness+.02)/factor, -path.points[0][1]/factor); b = new THREE.Vector3 (path.points[1][0]/factor, a.y, -path.points[1][1]/factor);
    } else {
        // Folded dimensions use the closed OD datum envelope, including when flaps are open.
        const outside = FefcoDimensions (params).nominalOutside, box = new THREE.Box3 (new THREE.Vector3 (-outside.width/2/factor, 0, -outside.length/2/factor), new THREE.Vector3 (outside.width/2/factor, outside.height/factor, outside.length/2/factor));
        const index = { width : 0, height : 1, length : 2 }[d.axis]; a = new THREE.Vector3 (...d.corner.map ((side, i) => (side ? box.max : box.min).getComponent (i))); b = a.clone (); a.setComponent (index, box.min.getComponent (index)); b.setComponent (index, box.max.getComponent (index));
    }
    const matrix = ObjectMatrix (object); a.applyMatrix4 (matrix); b.applyMatrix4 (matrix);
    const unscaled = object.scale.every (v => Math.abs (v-1) < 1e-6);
    return { a, b, object, length : a.distanceTo (b), lengthMm : unscaled ? value : a.distanceTo (b)*factor, sourceLengthMm : value, basis : unscaled ? (flat ? 'ID' : 'OD') : 'scaled edge', axis : d.axis, editable : unscaled, hidden : object.visible === false };
}

export function LegacyPlacement (document, anchor, resolved)
{
    const direction = DimensionPlanes (document, anchor, resolved)[0];
    if (!direction) { return null; }
    const inverse = ObjectMatrix (resolved.object).invert (), distance = resolved.a.clone ().applyMatrix4 (inverse).distanceTo (resolved.b.clone ().applyMatrix4 (inverse))*anchor.offset/400;
    return { direction : direction.toArray ().map (v => v || 0), distance, plane : 0 };
}
