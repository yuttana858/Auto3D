import { FoldScorePairs, ScoreBandTrim, ScoreInward } from './scorebands.js';
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

    const specification = rig.profile.engineering?.materials.find (m => m.id === rig.profile.engineering.activeMaterialId);
    const pitch = specification?.flutePitchMm || rig.boardStack.flute.pitchMm;
    const direction = (specification?.fluteDirectionDegrees ?? 90) * Math.PI / 180;
    const pairs = FoldScorePairs (rig);
    return pairs.map (pair => {
        const segments = 16;
        const mesh = { name : 'Visual crease · ' + pair.id, visualOnly : true, segments, vertices : [], normals : [], uvs : [], triangles : [], lines : [] };
        const matrices = [pair.a, pair.b].map (index => new Matrix4 ().fromArray (pose.matrices[index]));
        const localAxis = new Vector3 (pair.rail[1][0] - pair.rail[0][0], 0, pair.rail[1][1] - pair.rail[0][1]).normalize ();
        const axis = localAxis.clone ().transformDirection (matrices[0]);
        const normals = matrices.map (m => new Vector3 (0, 1, 0).transformDirection (m));
        const angle = Math.acos (Math.max (-1, Math.min (1, normals[0].dot (normals[1]))));
        const trim = ScoreBandTrim (rig, pair);
        const inward = [pair.a, pair.b].map (index => ScoreInward (rig, pair, index));
        const curves = pair.rail.map (point => [0, 1].map (side => {
            const y = side * rig.parameters.thickness; const n = normals.map (v => v.clone ().multiplyScalar (side ? 1 : -1));
            const local = [new Vector3 (point[0], y, point[1]), new Vector3 (point[0], y, point[1])];
            // Same finite band as the display-panel trim, including when flat.
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
            // Top and glue-tab rails can reverse the surface winding. Keep
            // geometric orientation aligned with the outward shading normal
            // so DoubleSide does not invert otherwise correct liner lighting.
            const normal = cap ? new Vector3 (...flat) : [a, b, c].reduce ((sum, id) => sum.add (new Vector3 (...surfaceNormals[id])), new Vector3 ());
            const va = new Vector3 (...mesh.vertices[a]), vb = new Vector3 (...mesh.vertices[b]), vc = new Vector3 (...mesh.vertices[c]);
            if (vb.sub (va).cross (vc.sub (va)).dot (normal) < 0) { [b, c] = [c, b]; }
            const start = mesh.normals.length;
            for (const index of [a, b, c]) { mesh.normals.push (cap ? flat : surfaceNormals[index]); }
            let uvs = [a, b, c];
            if (cap) {
                uvs = [a, b, c].map (index => {
                    const sheet = mesh.uvs[index]; const cross = -Math.sin (direction) * sheet[0] * 50 + Math.cos (direction) * sheet[1] * 50;
                    mesh.uvs.push ([cross / (4 * pitch), index % 2]); return mesh.uvs.length - 1;
                });
            }
            mesh.triangles.push ({ vertices : [a, b, c], normals : [start, start + 1, start + 2], uvs, material : cap ? 1 : a % 2 ? 2 : 0 });
        };
        for (let step = 0; step < segments; step++) { const a = step * 4, b = a + 4;
            for (const [i, j, k, l, cap] of [[a, a + 2, b + 2, b, false], [a + 1, b + 1, b + 3, a + 3, false], [a, b, b + 1, a + 1, true], [a + 2, a + 3, b + 3, b + 2, true]]) { face (i, j, k, cap); face (i, k, l, cap); }
        }
        // Keep the same material-sorted buffer order as the host converter.
        // This also bounds each crease to three draw groups during playback.
        mesh.triangles.sort ((a, b) => a.material - b.material);
        return mesh;
    });
}
