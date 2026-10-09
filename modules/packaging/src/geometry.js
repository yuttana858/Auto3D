import * as THREE from 'three';
import { ValidateFefco, FlapDepth, FefcoProfile } from './fefco.js';
import { BoardMaterials } from './material.js';
import { PackagingContours, ValidatePackaging } from './profile.js';
import { MeshData } from './mesh.js';

export function CreateFefcoBox (input)
{
    const data = ValidateFefco (input);
    const { width : w, length : l, height : h, thickness : t } = data; const depth = FlapDepth (data); const gap = Math.min (t * 0.4, 1); const model = { apiVersion : 1, units : 'mm', state : 'folded', materials : BoardMaterials (), meshes : [], profile : FefcoProfile (data), parameters : data };
    const innerLayers = 2 * depth > l ? 2 : 1; const outerLayers = data.code === '0202' || data.code === '0203' ? 2 : 1;
    const layers = innerLayers + outerLayers; const floor = layers * t; const wallHeight = h + floor;
    const panel = (name, width, height, center, rotation = [0, 0, 0]) => {
        const geometry = new THREE.BoxGeometry (width, height, t);
        const transform = new THREE.Matrix4 ().compose (new THREE.Vector3 (...center), new THREE.Quaternion ().setFromEuler (new THREE.Euler (...rotation)), new THREE.Vector3 (1, 1, 1)); geometry.applyMatrix4 (transform);
        model.meshes.push (MeshData (geometry, name, index => index >= 4 ? 0 : 1, (i, uv) => { const face = Math.floor (i / 4); return [uv.getX (i) * (face >= 4 ? width / 50 : (face < 2 ? height : width) / (t * 2)), uv.getY (i) * (face >= 4 ? height / 50 : 1)]; })); geometry.dispose ();
    };
    // Internal dimensions are W=X, L=Z, H=Y; thickness extends outside the cavity.
    panel ('Front wall', w + 2 * t, wallHeight, [0, wallHeight / 2, -l / 2 - t / 2]);
    panel ('Back wall', w + 2 * t, wallHeight, [0, wallHeight / 2, l / 2 + t / 2]);
    panel ('Left wall', l - gap, wallHeight, [-w / 2 - t / 2, wallHeight / 2, 0], [0, Math.PI / 2, 0]);
    panel ('Right wall', l - gap, wallHeight, [w / 2 + t / 2, wallHeight / 2, 0], [0, Math.PI / 2, 0]);
    panel ('Inside glued joint', Math.min (35, w / 5), wallHeight - 4 * t, [-w / 2 + Math.min (35, w / 5) / 2, wallHeight / 2, -l / 2 + t / 2]);
    const flaps = (top) => {
        // Closed flaps occupy separate board layers. Open top flaps hinge outward.
        const angle = top && data.closure === 'open' ? 110 * Math.PI / 180 : 0;
        const majorDepth = depth - gap; const minorDepth = Math.min (depth, l - gap); const rise = top ? wallHeight : 0;
        const hinge = (name, span, flapDepth, cx, cz, inwardX, inwardZ, layer) => {
            const cy = rise + (top ? (layer + 0.5) * t : (layers - layer - 0.5) * t) + Math.sin (angle) * flapDepth / 2;
            const center = [cx + inwardX * Math.cos (angle) * flapDepth / 2, cy, cz + inwardZ * Math.cos (angle) * flapDepth / 2];
            const normal = new THREE.Vector3 (-inwardX * Math.sin (angle), Math.cos (angle), -inwardZ * Math.sin (angle)); const vertical = new THREE.Vector3 (inwardX * Math.cos (angle), Math.sin (angle), inwardZ * Math.cos (angle)); const horizontal = new THREE.Vector3 ().crossVectors (vertical, normal); const basis = new THREE.Matrix4 ().makeBasis (horizontal, vertical, normal); const rotation = new THREE.Euler ().setFromRotationMatrix (basis);
            panel ((top ? 'Top ' : 'Base ') + name, span - gap * 2, flapDepth, center, [rotation.x, rotation.y, rotation.z]);
        };
        hinge ('front inner flap', w, minorDepth, 0, -l / 2, 0, 1, 0);
        hinge ('back inner flap', w, minorDepth, 0, l / 2, 0, -1, innerLayers - 1);
        hinge ('left outer flap', l, majorDepth, -w / 2, 0, 1, 0, innerLayers);
        hinge ('right outer flap', l, majorDepth, w / 2, 0, -1, 0, layers - 1);
    };
    // Long side walls lie on X = +/- W/2: their L-wide flaps close across W.
    // Keep these outer flaps uppermost, and the end-wall flaps underneath.
    flaps (false); if (data.code !== '0200') { flaps (true); }
    return model;
}

export function CreateBoard (input, { textured = false, guides = false } = {})
{
    const profile = ValidatePackaging (input); const shapes = PackagingContours (profile).map (contour => { const shape = new THREE.Shape (contour.outer.map (point => new THREE.Vector2 (...point))); shape.holes = contour.holes.map (points => new THREE.Path (points.map (point => new THREE.Vector2 (...point)))); return shape; });
    const thickness = profile.thickness;
    const uvGenerator = {
        generateTopUV : (geometry, vertices, a, b, c) => [a, b, c].map (index => new THREE.Vector2 (vertices[index * 3] / 50, vertices[index * 3 + 1] / 50)),
        generateSideWallUV : (geometry, vertices, a, b, c, d) => {
            const length = Math.hypot (vertices[a * 3] - vertices[b * 3], vertices[a * 3 + 1] - vertices[b * 3 + 1]);
            return [a, b, c, d].map ((index, i) => new THREE.Vector2 ((i === 1 || i === 2 ? length : 0) / (thickness * 2), vertices[index * 3 + 2] / thickness));
        }
    };
    const geometry = new THREE.ExtrudeGeometry (shapes, { depth : thickness, bevelEnabled : false, steps : 1, curveSegments : 1, UVGenerator : uvGenerator });
    // Preserve canonical profile X/Y as world X/-Z; the board rests on Y=0.
    geometry.rotateX (-Math.PI / 2);
    const materials = textured ? BoardMaterials () : [{ role : 'liner', name : 'Board', color : [184, 146, 97], roughness : 0.9, metalness : 0 }];
    const meshes = [MeshData (geometry, profile.name + ' · Dieline board', group => textured && group === 1 ? 1 : 0)]; geometry.dispose ();
    if (guides) {
        const cut = { name : 'CUT · dieline edges', vertices : [], normals : [], uvs : [], triangles : [], lines : [] };
        const score = { name : 'SCORE · fold hinges', vertices : [], normals : [], uvs : [], triangles : [], lines : [] };
        materials.push ({ role : 'cut', name : 'CUT · red', color : [221, 63, 63], roughness : 1 }, { role : 'score', name : 'SCORE · blue', color : [38, 125, 222], roughness : 1 });
        const add = (mesh, a, b, material) => { const offset = mesh.vertices.length; mesh.vertices.push ([a[0], thickness + 0.02, -a[1]], [b[0], thickness + 0.02, -b[1]]); mesh.lines.push ({ vertices : [offset, offset + 1], material }); };
        for (const path of profile.paths) {
            const points = path.closed ? [...path.points, path.points[0]] : path.points;
            for (let index = 1; index < points.length; index++) {
                const a = points[index - 1]; const b = points[index];
                if (path.type === 'cut') { add (cut, a, b, materials.length - 2); } else {
                    const length = Math.hypot (b[0] - a[0], b[1] - a[1]); const step = Math.max (8, length / 128);
                    for (let at = 0; at < length; at += step) { const start = at / length; const end = Math.min (at + step * 0.6, length) / length; add (score, [a[0] + (b[0] - a[0]) * start, a[1] + (b[1] - a[1]) * start], [a[0] + (b[0] - a[0]) * end, a[1] + (b[1] - a[1]) * end], materials.length - 1); }
                }
            }
        }
        meshes.push (cut, score);
    }
    return { apiVersion : 1, units : 'mm', materials, meshes, profile, state : 'flat' };
}
export function UnfoldFefco (input, savedProfile = null)
{
    const parameters = ValidateFefco (input); const profile = savedProfile ? ValidatePackaging (savedProfile) : FefcoProfile (parameters);
    return { ...CreateBoard (profile, { textured : true, guides : true }), parameters };
}
