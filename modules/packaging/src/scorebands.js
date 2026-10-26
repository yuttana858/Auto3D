import { Vector3 } from 'three';
import { ValidateBoardAppearance } from './appearancesettings.js';

export function FoldScorePairs (rig)
{
    const h = rig.parameters.height; const at = (kind, index) => rig.panels.findIndex (p => p.kind === kind && p.index === index); const pairs = [];
    for (let i = 1; i < 4; i++) { pairs.push ({ id : 'wall-' + i, a : at ('wall', i - 1), b : at ('wall', i), rail : [[rig.edges[i], 0], [rig.edges[i], -h]] }); }
    pairs.push ({ id : 'joint-score', a : at ('wall', 0), b : at ('joint', 0), rail : [[0, 0], [0, -h]] });
    for (const [index, panel] of rig.panels.entries ()) {
        if (!['base', 'top'].includes (panel.kind)) { continue; }
        const x = rig.meshes[index].vertices.map (v => v[0]); const z = panel.kind === 'top' ? -h : 0;
        pairs.push ({ id : panel.kind + '-' + panel.index, a : at ('wall', panel.index), b : index, rail : [[Math.min (...x), z], [Math.max (...x), z]] });
    }
    return pairs;
}
export function ScoreBandTrim (rig, pair)
{
    const t = rig.parameters.thickness; const settings = ValidateBoardAppearance (rig.profile.appearance);
    if (!settings.enabled) { return 0; }
    const board = rig.profile.engineering?.materials.find (m => m.id === rig.profile.engineering.activeMaterialId);
    const pitch = board?.flutePitchMm || rig.boardStack.flute.pitchMm, direction = (board?.fluteDirectionDegrees ?? 90) * Math.PI / 180;
    const axis = new Vector3 (pair.rail[1][0] - pair.rail[0][0], 0, pair.rail[1][1] - pair.rail[0][1]).normalize ();
    const alignment = Math.abs (axis.x * Math.cos (direction) - axis.z * Math.sin (direction));
    return Math.min (t, (settings.enabled ? settings.foldSoftness : 1) * Math.min ((board?.scoreWidthMm || t * 2) / 4, t * .14 + Math.min (pitch, t * 4) * .03 * (1 - .3 * alignment)));
}
export function ScoreInward (rig, pair, index)
{
    const vertices = rig.meshes[index].vertices; const centre = vertices.reduce ((sum, p) => sum.add (new Vector3 (...p)), new Vector3 ()).multiplyScalar (1 / vertices.length);
    const axis = new Vector3 (pair.rail[1][0] - pair.rail[0][0], 0, pair.rail[1][1] - pair.rail[0][1]).normalize ();
    const d = centre.sub (new Vector3 (pair.rail[0][0], 0, pair.rail[0][1])); d.y = 0; return d.addScaledVector (axis, -d.dot (axis)).normalize ();
}

// Only display triangles are clipped. Original vertices/solids remain authoritative.
export function TrimScoreDisplay (rig)
{
    const pairs = FoldScorePairs (rig);
    return rig.presentationMeshes.map ((mesh, index) => {
        const planes = pairs.filter (p => p.a === index || p.b === index).map (pair => ({ origin : new Vector3 (pair.rail[0][0], 0, pair.rail[0][1]), inward : ScoreInward (rig, pair, index), trim : ScoreBandTrim (rig, pair) })).filter (p => p.trim > 1e-8);
        if (!planes.length) { return mesh; }
        const result = { ...mesh, presentationOnly : true, vertices : [], normals : [], uvs : [], triangles : [] };
        for (const triangle of mesh.triangles) {
            let polygon = triangle.vertices.map ((id, i) => ({ p : new Vector3 (...mesh.vertices[id]), n : new Vector3 (...mesh.normals[triangle.normals[i]]), uv : [...mesh.uvs[triangle.uvs[i]]] }));
            for (const plane of planes) {
                const output = []; const distance = v => v.p.clone ().sub (plane.origin).dot (plane.inward) - plane.trim;
                for (let i = 0; i < polygon.length; i++) {
                    const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distance (a), db = distance (b);
                    if (da >= -1e-9) { output.push (a); }
                    if ((da >= -1e-9) !== (db >= -1e-9)) { const u = da / (da - db); output.push ({ p : a.p.clone ().lerp (b.p, u), n : a.n.clone ().lerp (b.n, u).normalize (), uv : a.uv.map ((v, j) => v + (b.uv[j] - v) * u) }); }
                }
                polygon = output;
            }
            for (let i = 1; i + 1 < polygon.length; i++) {
                const ids = [polygon[0], polygon[i], polygon[i + 1]].map (v => { const id = result.vertices.length; result.vertices.push (v.p.toArray ()); result.normals.push (v.n.toArray ()); result.uvs.push (v.uv); return id; });
                result.triangles.push ({ ...triangle, vertices : ids, normals : ids, uvs : ids });
            }
        }
        return result;
    });
}
