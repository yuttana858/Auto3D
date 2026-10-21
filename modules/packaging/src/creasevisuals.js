import { ValidateBoardAppearance } from './appearancesettings.js';
import { Matrix4, Vector3 } from 'three';

// Circular when rails admit a common centre. A smooth translation correction
// handles deliberate stacking offsets without breaking endpoint tangency.
export function CreaseArc (a, b, na, nb, axis, u)
{
    const angle = Math.atan2 (axis.dot (new Vector3 ().crossVectors (na, nb)), Math.max (-1, Math.min (1, na.dot (nb))));
    const delta = b.clone ().sub (a); const dn = nb.clone ().sub (na);
    if (Math.abs (angle) < 1e-7) { return { point : a.clone ().lerp (b, u), normal : na.clone (), radius : 0, angle }; }
    const radius = delta.dot (dn) / dn.lengthSq ();
    const normal = na.clone ().applyAxisAngle (axis, angle * u);
    const correction = delta.clone ().addScaledVector (dn, -radius);
    const point = a.clone ().addScaledVector (normal.clone ().sub (na), radius).addScaledVector (correction, u * u * (3 - 2 * u));
    const tangent = new Vector3 ().crossVectors (axis, normal).multiplyScalar (angle * radius).addScaledVector (correction, 6 * u * (1 - u));
    const shading = new Vector3 ().crossVectors (axis, tangent);
    if (shading.lengthSq () > 1e-16) { shading.normalize (); if (shading.dot (normal) < 0) { shading.negate (); } } else { shading.copy (normal); }
    return { point, normal : shading, radius : Math.abs (radius), angle };
}

// Presentation surfaces only. CAD points and rigid collision prisms stay intact.
export function CreaseVisualMeshes (rig, pose)
{
    const { height : h, thickness : t } = rig.parameters; const appearance = ValidateBoardAppearance (rig.profile.appearance);
    const specification = rig.profile.engineering?.materials.find (m => m.id === rig.profile.engineering.activeMaterialId);
    const scoreWidth = specification?.scoreWidthMm || t * 2;
    const pitch = specification?.flutePitchMm || rig.boardStack.flute.pitchMm;
    const direction = (specification?.fluteDirectionDegrees ?? 90) * Math.PI / 180;
    const pairs = []; const at = (kind, index) => rig.panels.findIndex (p => p.kind === kind && p.index === index);
    for (let i = 1; i < 4; i++) { pairs.push ({ id : 'wall-' + i, a : at ('wall', i - 1), b : at ('wall', i), rail : [[rig.edges[i], 0], [rig.edges[i], -h]] }); }
    pairs.push ({ id : 'joint-score', a : at ('wall', 0), b : at ('joint', 0), rail : [[0, 0], [0, -h]] });
    for (const [index, panel] of rig.panels.entries ()) {
        if (!['base', 'top'].includes (panel.kind)) { continue; }
        const x = rig.meshes[index].vertices.map (v => v[0]); const z = panel.kind === 'top' ? -h : 0;
        pairs.push ({ id : panel.kind + '-' + panel.index, a : at ('wall', panel.index), b : index, rail : [[Math.min (...x), z], [Math.max (...x), z]] });
    }
    return pairs.map (pair => {
        const segments = 16;
        const mesh = { name : 'Visual crease · ' + pair.id, visualOnly : true, segments, vertices : [], normals : [], uvs : [], triangles : [], lines : [] };
        const matrices = [pair.a, pair.b].map (index => new Matrix4 ().fromArray (pose.matrices[index]));
        const localAxis = new Vector3 (pair.rail[1][0] - pair.rail[0][0], 0, pair.rail[1][1] - pair.rail[0][1]).normalize ();
        const axis = localAxis.clone ().transformDirection (matrices[0]);
        const normals = matrices.map (m => new Vector3 (0, 1, 0).transformDirection (m));
        const angle = Math.acos (Math.max (-1, Math.min (1, normals[0].dot (normals[1]))));
        const alignment = Math.abs (localAxis.x * Math.cos (direction) - localAxis.z * Math.sin (direction));
        // Visual reference only: paper, pitch and score orientation modulate the
        // compressed radius. This is not a converter-calibrated bend allowance.
        const compressedRadius = (appearance.enabled ? appearance.foldSoftness : 1) * Math.min (scoreWidth / 4, t * 0.14 + Math.min (pitch, t * 4) * 0.03 * (1 - 0.3 * alignment));
        const inward = [pair.a, pair.b].map (index => {
            const vertices = rig.meshes[index].vertices; const centre = vertices.reduce ((sum, p) => sum.add (new Vector3 (...p)), new Vector3 ()).multiplyScalar (1 / vertices.length);
            const d = centre.sub (new Vector3 (pair.rail[0][0], 0, pair.rail[0][1])); d.y = 0; d.addScaledVector (localAxis, -d.dot (localAxis)); return d.normalize ();
        });
        const curves = pair.rail.map (point => [0, 1].map (side => {
            const y = side * t; const n = normals.map (v => v.clone ().multiplyScalar (side ? 1 : -1));
            const local = [new Vector3 (point[0], y, point[1]), new Vector3 (point[0], y, point[1])];
            const endpoints = local.map ((p, i) => p.clone ().applyMatrix4 (matrices[i]));
            const natural = CreaseArc (endpoints[0], endpoints[1], n[0], n[1], axis, 0.5);
            // An inner score can collapse to a line. A small face-tangent fillet
            // overlays the inner corner instead of exposing a sharp empty seam.
            const trim = natural.radius < compressedRadius && angle > 1e-7 ? Math.min (compressedRadius * Math.tan (Math.min (angle, Math.PI * 0.95) / 2), scoreWidth / 2, t) : 0;
            local.forEach ((p, i) => p.addScaledVector (inward[i], trim));
            const anchors = local.map ((p, i) => p.clone ().applyMatrix4 (matrices[i]));
            return { local, anchors, n, radius : CreaseArc (...anchors, ...n, axis, 0.5).radius };
        }));
        mesh.foldAngleRadians = angle; mesh.insideRadiusMm = Math.min (...curves[0].map (c => c.radius)); mesh.outsideRadiusMm = Math.max (...curves[0].map (c => c.radius));
        mesh.fluteDirectionDegrees = direction * 180 / Math.PI; mesh.flutePitchMm = pitch;
        const surfaceNormals = [];
        for (let step = 0; step <= segments; step++) {
            const u = step / segments;
            for (let end = 0; end < 2; end++) { for (let side = 0; side < 2; side++) {
                const curve = curves[end][side]; const sample = CreaseArc (...curve.anchors, ...curve.n, axis, u);
                mesh.vertices.push (sample.point.toArray ()); surfaceNormals.push (sample.normal.toArray ());
                const sheet = curve.local[0].clone ().lerp (curve.local[1], u); mesh.uvs.push ([sheet.x / 50, -sheet.z / 50]);
            } }
        }
        const face = (a, b, c, cap = false) => {
            let flat;
            if (cap) { flat = axis.clone ().multiplyScalar (a % 4 < 2 ? -1 : 1).toArray (); }
            const start = mesh.normals.length;
            for (const index of [a, b, c]) { mesh.normals.push (cap ? flat : surfaceNormals[index]); }
            let uvs = [a, b, c];
            if (cap) {
                uvs = [a, b, c].map (index => {
                    const sheet = mesh.uvs[index]; const cross = -Math.sin (direction) * sheet[0] * 50 + Math.cos (direction) * sheet[1] * 50;
                    mesh.uvs.push ([cross / (4 * pitch), index % 2]); return mesh.uvs.length - 1;
                });
            }
            mesh.triangles.push ({ vertices : [a, b, c], normals : [start, start + 1, start + 2], uvs, material : cap ? 1 : a % 2 ? 3 : 2 });
        };
        for (let step = 0; step < segments; step++) { const a = step * 4, b = a + 4;
            for (const [i, j, k, l, cap] of [[a, a + 2, b + 2, b, false], [a + 1, b + 1, b + 3, a + 3, false], [a, b, b + 1, a + 1, true], [a + 2, a + 3, b + 3, b + 2, true]]) { face (i, j, k, cap); face (i, k, l, cap); }
        }
        return mesh;
    });
}
