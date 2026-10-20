import * as THREE from 'three';
import { ValidateFefco, FefcoProfile } from './fefco.js';
import { CreateFefcoFoldRig, FefcoFoldFrame } from './folding.js';
import { BoardMaterials } from './material.js';
import { ReferenceSingleWallStack } from './boardlayers.js';
import { PackagingContours, ValidatePackaging } from './profile.js';
import { MeshData } from './mesh.js';

export function CreateFefcoBox (input, savedProfile = null)
{
    // Generation and animation use exactly the same finite board solids.
    // No shape/caliper jump when playback completes.
    const rig = CreateFefcoFoldRig (input, savedProfile); const p = rig.parameters;
    const frame = FefcoFoldFrame (rig, p.code === '0200' || p.closure === 'closed' ? 1 : 0.72);
    return { ...frame, parameters : p };
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
    return { apiVersion : 1, units : 'mm', materials, meshes, profile, state : 'flat', boardStack : ReferenceSingleWallStack (thickness), artworkMapping : { coordinates : 'global-dieline-mm', repeat : false } };
}
export function UnfoldFefco (input, savedProfile = null)
{
    const parameters = ValidateFefco (input); const profile = savedProfile ? ValidatePackaging (savedProfile) : FefcoProfile (parameters);
    return { ...CreateBoard (profile, { textured : true, guides : true }), parameters };
}
