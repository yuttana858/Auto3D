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
export function CapMesh (id, radius, low, high, style = 'ribbed', wallMm = null)
{
    if (wallMm !== null) {
        const bevel = Math.min ((high - low) * .12, radius * .06), inner = radius - wallMm;
        const profile = [[0, high - wallMm], [inner - bevel * .25, high - wallMm], [inner, high - wallMm - bevel * .25], [inner, low], [radius - bevel * .3, low], [radius, low + bevel * .3], [radius, low + bevel], [radius, high - bevel]];
        for (let i = 1; i <= 4; i++) { const angle = i / 4 * Math.PI / 2; profile.push ([radius - bevel + bevel * Math.cos (angle), high - bevel + bevel * Math.sin (angle)]); }
        profile.push ([0, high]);
        const mesh = Revolve (id, 'closure', profile, 128);
        if (style === 'ribbed') {
            for (let i = 0; i < mesh.positions.length; i += 3) {
                const y = mesh.positions[i + 1], r = Math.hypot (mesh.positions[i], mesh.positions[i + 2]);
                if (Math.abs (r - radius) < 1e-8 && y >= low + bevel && y <= high - bevel) {
                    const a = Math.atan2 (mesh.positions[i + 2], mesh.positions[i]), factor = 1 - Math.min (.014, wallMm / radius * .18) * (1 - Math.cos (a * 32));
                    mesh.positions[i] *= factor; mesh.positions[i + 2] *= factor;
                }
            }
        }
        for (let i = 0; i < mesh.positions.length; i += 3) {
            if (Math.abs (mesh.positions[i + 1] - high) < 1e-8) { mesh.uvs[i / 3 * 2] = .5 + mesh.positions[i] / (2 * (radius - bevel)); mesh.uvs[i / 3 * 2 + 1] = .5 - mesh.positions[i + 2] / (2 * (radius - bevel)); }
        }
        return SmoothMesh (RecalculateNormals (mesh));
    }
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
// Real-world can construction from the overall diameter and height (the outer envelope stays exactly D × H).
// beverage: two-piece drawn and wall-ironed aluminium, as a 355 ml 211/202 × 413 can (66 × 122 mm): a tapered lower wall
//   into a standing ring of about 3/4 of the diameter, a spherical dome about 10 mm deep inside it, a straight printed
//   wall, a necked shoulder into a 202-style end (about 0.82 of the diameter), the end's double seam and a countersunk
//   lid panel with the tab.
// food: three-piece steel, as a 300 × 407 can (76 × 113 mm): double seams at both ends set the overall diameter, the body
//   sits just inside them with circumferential beads, and both end panels are countersunk with expansion rings.
// tin: a short tin with a slip lid.
// Dimensions scale with the can but stay within real limits (dome depth, seam height). Shared by the mesh, label zones
// and the label dieline.
export function CanProfile (d)
{
    const r = d.diameterMm / 2, h = d.heightMm, style = d.details?.canStyle || (d.material === 'aluminum' ? 'beverage' : 'food');
    if (style === 'beverage') {
        const standRadius = r * .757, domeDepth = Math.min (r * .31, h * .09), taperTop = Math.min (r * .29, h * .09), neckStart = h - Math.min (r * .5, h * .14);
        // A 202 end on a 211 body: neck about Ø 52.6 mm under a double seam about Ø 56.6 mm (0.795 and 0.855 of the body
        // radius), so the seam overhangs the neck by about 2 mm (what a can collar tucks under).
        const neckRadius = r * .795, seamHeight = Math.min (3, h * .025), countersink = Math.min (6.4, h * .052);
        return { style, r, h, bodyRadius : r, standRadius, domeDepth, taperTop, neckStart, neckRadius, seamRadius : r * .855, seamHeight, countersink, labelBottomMm : taperTop + Math.min (1, h * .01), labelHeightMm : neckStart - taperTop - 2 * Math.min (1, h * .01) };
    }
    if (style === 'food') {
        const seamHeight = Math.min (3.2, h * .03), bodyRadius = r - Math.min (1.4, r * .03), countersink = Math.min (3.2, h * .03), clear = seamHeight + Math.min (1.5, h * .015);
        return { style, r, h, bodyRadius, seamHeight, countersink, labelBottomMm : clear, labelHeightMm : h - 2 * clear };
    }
    const lid = Math.min (h * .3, 12);
    return { style, r, h, bodyRadius : r * .985, lidHeight : lid, labelBottomMm : h * .06, labelHeightMm : h - lid - h * .1 };
}

export function DetailCan (d, segments)
{
    const c = CanProfile (d), { r, h } = c, t = d.details.wallMm, result = [];
    const smooth = (from, to, steps, ease = f => (1 - Math.cos (Math.PI * f)) / 2) => Array.from ({ length : steps - 1 }, (_, i) => { const f = ease ((i + 1) / steps); return [from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * ((i + 1) / steps)]; });
    if (c.style === 'beverage') {
        // Dome: a spherical cap from the apex down to the stand's inner wall.
        const domeEdge = c.standRadius - Math.min (1.2, r * .04), base = Math.min (1.6, h * .013), sag = c.domeDepth - base, R = (domeEdge * domeEdge + sag * sag) / (2 * sag), profile = [];
        for (let i = 0; i <= 10; i++) { const rho = domeEdge * i / 10; profile.push ([rho, base + sag - (R - Math.sqrt (R * R - rho * rho))]); }
        const stand = Math.min (.8, r * .025);
        profile.push ([c.standRadius - stand, stand * .6], [c.standRadius, 0], [c.standRadius + stand, stand * .6]);
        // Lower wall: a convex taper from the stand to the full diameter.
        const from = [c.standRadius + stand, stand * .6];
        for (let i = 1; i <= 8; i++) { const f = i / 8; profile.push ([from[0] + (r - from[0]) * Math.sin (f * Math.PI / 2), from[1] + (c.taperTop - from[1]) * f]); }
        profile.push ([r, c.neckStart]);
        // Neck: an S-curve from the body into the end; the body closes below the separate end.
        const neckTop = h - c.seamHeight - Math.min (1.5, h * .012);
        // The body closes below the countersunk lid panel so it cannot hide the score or tab.
        const panel = h - c.countersink;
        profile.push (...smooth ([r, c.neckStart], [c.neckRadius, neckTop], 8), [c.neckRadius, neckTop], [c.neckRadius, h - c.seamHeight], [c.neckRadius * .9, panel - .8], [0, panel - .8]);
        const body = SmoothMesh (Revolve ('body', 'body', profile, segments)); AddInnerWall (body, Math.min (t, h * .008)); result.push (body);
        // End: double seam ring and a countersunk panel (the panel sits countersink below the seam top).
        // Closed end: its underside, out and up the countersink wall to the seam, over the seam, down the inside of the
        // countersink and across the lid panel (facing up).
        const n = c.neckRadius, seam = c.seamRadius, s2 = c.seamHeight;
        result.push (Revolve ('top', 'end', [[0, panel - .3], [n * .84, panel - .3], [n * .9, panel + .3], [n * .95, h - s2], [seam, h - s2], [seam, h], [n * .97, h], [n * .93, h - s2 * .4], [n * .9, panel + .6], [n * .84, panel], [0, panel]], segments));
        const tabRadius = r * .24, tabLow = panel + .15, tabHigh = panel + Math.min (1.2, h * .009);
        const tab = Revolve ('pull-tab', 'end', [[tabRadius * .55, tabLow], [tabRadius * .94, tabLow], [tabRadius, tabLow + (tabHigh - tabLow) * .3], [tabRadius * .94, tabHigh], [tabRadius * .55, tabHigh], [tabRadius * .55, tabLow]], segments);
        for (let i = 0; i < tab.positions.length; i += 3) { tab.positions[i + 2] = tab.positions[i + 2] * 1.45 - r * .20; }
        const rivet = Revolve ('tab-rivet', 'end', [[0, tabLow], [r * .065, tabLow], [r * .065, tabHigh + .2], [r * .04, tabHigh + .4], [0, tabHigh + .4]], segments);
        const score = Revolve ('opening-score', 'end', [[r * .25, panel + .01], [r * .265, panel + .01], [r * .265, panel + .06], [r * .25, panel + .06], [r * .25, panel + .01]], segments);
        for (let i = 0; i < score.positions.length; i += 3) { score.positions[i + 2] = score.positions[i + 2] * 1.15 + r * .38; }
        result.push (RecalculateNormals (tab), rivet, RecalculateNormals (score));
        return result;
    }
    if (c.style === 'food') {
        const s = c.seamHeight, b = c.bodyRadius, cs = c.countersink, step = Math.min (.6, r * .015), bead = Math.min (.5, r * .012);
        // Body between the seams, with circumferential beads on the middle of the wall.
        // The body overlaps the seams slightly and closes above (and below) the countersunk end panels, inside the can.
        const low = s - step, high = h - s + step, inset = cs + .4, profile = [[0, inset], [b - .3, inset], [b, low]], beads = Math.max (3, Math.round ((high - low) / 9));
        for (let i = 0; i <= beads * 6; i++) { const y = low + (high - low) * (.12 + .76 * i / (beads * 6)); profile.push ([b - (i % 6 === 3 ? bead : 0), y]); }
        profile.push ([b, high], [b - .3, h - inset], [0, h - inset]);
        const body = SmoothMesh (Revolve ('body', 'body', profile, segments)); AddInnerWall (body, Math.min (t, h * .008)); result.push (body);
        // Ends: the seam ring (outer diameter) around a countersunk panel with two expansion rings.
        const end = (id, flip) => {
            const y = v => flip ? h - v : v, rc = b - Math.min (1.6, r * .04), ring = Math.min (.7, h * .006), points = [[0, cs], [rc * .35, cs], [rc * .4, cs + ring], [rc * .45, cs], [rc * .62, cs], [rc * .67, cs + ring], [rc * .72, cs], [rc, cs], [b - .4, .5], [r - .5, 0], [r, .5], [r, s], [b, s], [0, s]];
            const profile = points.map (([x, v]) => [x, y (v)]); if (flip) { profile.reverse (); }
            return Revolve (id, 'end', profile, segments);
        };
        result.push (end ('bottom', false), end ('top', true));
        return result;
    }
    // Tin: body with a slip lid.
    const lid = c.lidHeight, b = c.bodyRadius;
    const body = SmoothMesh (Revolve ('body', 'body', [[0, 0], [b * .97, 0], [b, h * .02], [b, h - lid * .7], [0, h - lid * .7]], segments)); AddInnerWall (body, Math.min (t, h * .008)); result.push (body);
    result.push (Revolve ('top', 'end', [[0, h - lid], [r, h - lid], [r, h - Math.min (1, lid * .1)], [r * .97, h], [0, h]], segments));
    return result;
}
