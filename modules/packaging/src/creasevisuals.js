import { Matrix4, Vector3 } from 'three';

// Presentation surfaces only. Rigid collision prisms and CAD paths stay intact.
// Rails follow each side of the SAME score, including deliberate stack shifts.
export function CreaseVisualMeshes (rig, pose)
{
    const { height : h, thickness : t } = rig.parameters;
    const specification = rig.profile.engineering?.materials.find (m => m.id === rig.profile.engineering.activeMaterialId);
    const scoreWidth = specification?.scoreWidthMm || t * 2;
    const pairs = []; const at = (kind, index) => rig.panels.findIndex (p => p.kind === kind && p.index === index);
    for (let i = 1; i < 4; i++) { pairs.push ({ id : 'wall-' + i, a : at ('wall', i - 1), b : at ('wall', i), rail : [[rig.edges[i], 0], [rig.edges[i], -h]] }); }
    pairs.push ({ id : 'joint-score', a : at ('wall', 0), b : at ('joint', 0), rail : [[0, 0], [0, -h]] });
    for (const [index, panel] of rig.panels.entries ()) {
        if (!['base', 'top'].includes (panel.kind)) { continue; }
        const x = rig.meshes[index].vertices.map (v => v[0]); const z = panel.kind === 'top' ? -h : 0;
        pairs.push ({ id : panel.kind + '-' + panel.index, a : at ('wall', panel.index), b : index, rail : [[Math.min (...x), z], [Math.max (...x), z]] });
    }
    return pairs.map (pair => {
        const mesh = { name : 'Visual crease · ' + pair.id, visualOnly : true, vertices : [], normals : [], uvs : [], triangles : [], lines : [] };
        const matrices = [pair.a, pair.b].map (index => new Matrix4 ().fromArray (pose.matrices[index]));
        const normal = new Vector3 (0, 1, 0).transformDirection (matrices[0]).add (new Vector3 (0, 1, 0).transformDirection (matrices[1])).normalize ();
        const segments = 8;
        for (let step = 0; step <= segments; step++) {
            const u = step / segments;
            for (const point of pair.rail) { for (const y of [0, t]) {
                const a = new Vector3 (point[0], y, point[1]).applyMatrix4 (matrices[0]); const b = new Vector3 (point[0], y, point[1]).applyMatrix4 (matrices[1]);
                // Bounded visual rounding, anchored exactly on both rail surfaces.
                const bulge = Math.min (a.distanceTo (b) * 0.12, scoreWidth * 0.03) * Math.sin (Math.PI * u) * (y ? 1 : -1);
                mesh.vertices.push (a.lerp (b, u).addScaledVector (normal, bulge).toArray ()); mesh.uvs.push ([point[0] / 50, -point[1] / 50]);
            } }
        }
        const face = (a, b, c) => {
            const p = new Vector3 (...mesh.vertices[a]); const n = new Vector3 (...mesh.vertices[b]).sub (p).cross (new Vector3 (...mesh.vertices[c]).sub (p)); if (n.lengthSq () < 1e-18) { n.set (0, 1, 0); } n.normalize ();
            const start = mesh.normals.length; mesh.normals.push (n.toArray (), n.toArray (), n.toArray ()); mesh.triangles.push ({ vertices : [a, b, c], normals : [start, start + 1, start + 2], uvs : [a, b, c], material : 0 });
        };
        for (let step = 0; step < segments; step++) { const a = step * 4, b = a + 4;
            for (const [i, j, k, l] of [[a, a + 2, b + 2, b], [a + 1, b + 1, b + 3, a + 3], [a, b, b + 1, a + 1], [a + 2, a + 3, b + 3, b + 2]]) { face (i, j, k); face (i, k, l); }
        }
        return mesh;
    });
}
