import { Revolve } from './revolve.js';
function RecalculateNormals (mesh)
{
    const sums = new Array (mesh.positions.length).fill (0);
    for (let i = 0; i < mesh.indices.length; i += 3) {
        const ids = mesh.indices.slice (i, i + 3), [a, b, c] = ids.map (id => mesh.positions.slice (id * 3, id * 3 + 3));
        const u = b.map ((v, k) => v - a[k]), v = c.map ((v, k) => v - a[k]), n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
        for (const id of ids) { n.forEach ((n, k) => { sums[id*3+k] += n; }); }
    }
    for (let i = 0; i < sums.length; i += 3) { const length = Math.hypot (...sums.slice (i, i + 3)); if (length > 0) { for (let k = 0; k < 3; k++) { mesh.normals[i+k] = sums[i+k] / length; } } } return mesh;
}
export function SmoothMesh (mesh, angle = .7)
{
    const groups = new Map (), key = i => mesh.positions.slice (i, i + 3).map (n => Math.round (n * 1e7)).join (',');
    for (let i = 0; i < mesh.positions.length; i += 3) { const k = key (i); if (!groups.has (k)) { groups.set (k, []); } groups.get (k).push (i); }
    const before = [...mesh.normals];
    for (const ids of groups.values ()) { for (const i of ids) { const normal = before.slice (i, i + 3), sum = [0, 0, 0]; for (const j of ids) { const n = before.slice (j, j + 3); if (n.reduce ((s, v, k) => s + v * normal[k], 0) > angle) { n.forEach ((v, k) => { sum[k] += v; }); } } const length = Math.hypot (...sum) || 1; sum.forEach ((v, k) => { mesh.normals[i + k] = v / length; }); } }
    return mesh;
}
// Offset a welded surface inward, retaining a closed inner cavity and the exact outer envelope.
// This is a presentation shell, not a manufacturing thickness/capacity guarantee at tight seams.
export function AddInnerWall (mesh, wall)
{
    const count = mesh.positions.length / 3, p = [...mesh.positions], n = [...mesh.normals], indices = [...mesh.indices], groups = new Map ();
    const key = i => p.slice (i, i + 3).map (v => Math.round (v * 1e7)).join (',');
    for (let i = 0; i < p.length; i += 3) { const k = key (i), sum = groups.get (k) || [0, 0, 0]; for (let j = 0; j < 3; j++) { sum[j] += n[i + j]; } groups.set (k, sum); }
    for (let i = 0; i < p.length; i += 3) { const sum = groups.get (key (i)), length = Math.hypot (...sum) || 1; for (let j = 0; j < 3; j++) { mesh.positions.push (p[i + j] - wall * sum[j] / length); mesh.normals.push (-n[i + j]); } }
    mesh.uvs.push (...mesh.uvs.slice ());
    for (let i = 0; i < indices.length; i += 3) { mesh.indices.push (count + indices[i], count + indices[i + 2], count + indices[i + 1]); }
    return mesh;
}
export function CapMesh (id, radius, low, high, style = 'ribbed')
{
    const bevel = Math.min ((high - low) * .12, radius * .06), profile = [[0, low], [radius * .94, low], [radius, low + bevel], [radius, high - bevel], [radius * .94, high], [0, high]];
    const mesh = Revolve (id, 'closure', profile, 128);
    if (style === 'ribbed') { for (let i = 0; i < mesh.positions.length; i += 3) { const a = Math.atan2 (mesh.positions[i + 2], mesh.positions[i]), f = .987 + .013 * Math.cos (a * 32); mesh.positions[i] *= f; mesh.positions[i + 2] *= f; } }
    return SmoothMesh (RecalculateNormals (mesh));
}
export function DetailBox (id, center, size, role = 'body')
{
    const mesh = { id, materialRole : role, positions : [], normals : [], uvs : [], indices : [] };
    for (let axis = 0; axis < 3; axis++) { for (const sign of [-1, 1]) {
        const u = (axis + 1) % 3, v = (axis + 2) % 3, start = mesh.positions.length / 3;
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const p = [...center], n = [0, 0, 0]; p[axis] += sign * size[axis] / 2; p[u] += a * size[u] / 2; p[v] += b * size[v] / 2; n[axis] = sign; mesh.positions.push (...p); mesh.normals.push (...n); mesh.uvs.push ((a + 1) / 2, (b + 1) / 2); }
        mesh.indices.push (...(sign > 0 ? [start, start + 1, start + 2, start, start + 2, start + 3] : [start, start + 2, start + 1, start, start + 3, start + 2]));
    } } return mesh;
}
export function DetailCan (d, segments)
{
    const r = d.diameterMm / 2, h = d.heightMm, t = d.details.wallMm, style = d.details.canStyle, low = h * .04, high = h * .90, neck = style === 'beverage' ? r * .86 : r * .98;
    const profile = [[0, low], [r * .84, low], [r * .93, 0], [r * .97, h * .02], [r, low]];
    if (style === 'food') { for (let i = 0; i <= 24; i++) { const y = low + (high - low) * i / 24; profile.push ([r * (i % 6 === 3 ? .985 : 1), y + .00001]); } }
    else { profile.push ([r, high]); }
    // The body closes below the separate end so its disk cannot hide the score or tab.
    profile.push ([r * .99, h * .92], [neck, h * .965], [neck, h * .97], [0, h * .97]);
    const body = SmoothMesh (Revolve ('body', 'body', profile, segments)); AddInnerWall (body, Math.min (t, h * .008));
    const ring = (id, y, radius, height) => Revolve (id, 'end', [[radius * .91, y], [radius, y], [radius, y + height], [radius * .91, y + height], [radius * .91, y]], segments);
    const bottom = ring ('bottom', 0, r * .94, Math.min (1.5, h * .02));
    const end = Revolve ('top', 'end', [[0, h * .97], [neck * .88, h * .97], [neck * .94, h * .985], [neck * 1.02, h * .985], [neck * 1.02, h], [neck * .94, h], [neck * .88, h * .98], [0, h * .98]], segments);
    const result = [body, bottom, end];
    if (style === 'beverage') {
        const tabRadius = r * .24, tabLow = h * .982, tabHigh = h * .991;
        const tab = Revolve ('pull-tab', 'end', [[tabRadius * .55, tabLow], [tabRadius * .94, tabLow], [tabRadius, tabLow + h * .002], [tabRadius * .94, tabHigh], [tabRadius * .55, tabHigh], [tabRadius * .55, tabLow]], segments);
        for (let i = 0; i < tab.positions.length; i += 3) { tab.positions[i + 2] = tab.positions[i + 2] * 1.45 - r * .20; }
        const rivet = Revolve ('tab-rivet', 'end', [[0, tabLow], [r * .065, tabLow], [r * .065, h * .993], [r * .04, h * .997], [0, h * .997]], segments);
        const score = Revolve ('opening-score', 'end', [[r * .25, h * .9801], [r * .265, h * .9801], [r * .265, h * .9806], [r * .25, h * .9806], [r * .25, h * .9801]], segments);
        for (let i = 0; i < score.positions.length; i += 3) { score.positions[i + 2] = score.positions[i + 2] * 1.15 + r * .38; }
        result.push (RecalculateNormals (tab), rivet, RecalculateNormals (score));
    }
    return result;
}
