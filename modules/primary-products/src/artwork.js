import { ValidateLabelCAD } from './labelcad.js';
import { ValidateLabelSource } from './labelsource.js';
import { LabelFinishes } from './surfaces.js';
import { SmoothMesh } from './detailmesh.js';
import { CreatePouch } from './pouch.js';
import { GetArtworkZones } from './zones.js';
import { BottleSectionOf, SectionAt } from './section.js';
export function ValidateProductArtwork (draft, entries = [])
{
    if (!Array.isArray (entries) || entries.length > 3) { throw new Error ('Use front/back labels or one wrap, plus a bottle cap label.'); }
    const seen = new Set (), zones = GetArtworkZones (draft);
    const result = entries.map (a => {
        if (!a || typeof a !== 'object' || Object.keys (a).some (k => !['resourceId', 'name', 'mime', 'zone', 'widthMm', 'heightMm', 'finish', 'offsetXmm', 'offsetYmm', 'bleedMm', 'source', 'cad'].includes (k)) || !/^[a-f0-9]{64}$/.test (a.resourceId) || typeof a.name !== 'string' || a.name.length > 80 || !['image/png', 'image/jpeg', 'image/webp'].includes (a.mime)) { throw new Error ('Invalid label artwork.'); }
        const z = zones.find (zone => zone.id === a.zone);
        if (!z || seen.has (a.zone) || !Number.isFinite (a.widthMm) || !Number.isFinite (a.heightMm) || a.widthMm < 1 || a.heightMm < 1 || a.widthMm > z.widthMm || a.heightMm > z.heightMm) { throw new Error ('Label must fit its physical zone. Resize or remove artwork before changing the product.'); }
        if (a.finish !== undefined && !Object.hasOwn (LabelFinishes, a.finish)) { throw new Error ('Choose a supported label finish.'); }
        // Artwork designed on a dieline includes its bleed: that margin is cropped so the trim fills the label.
        if (a.bleedMm !== undefined && (!Number.isFinite (a.bleedMm) || a.bleedMm < 0 || a.bleedMm > 20)) { throw new Error ('Artwork bleed must be 0–20 mm.'); }
        const x = a.offsetXmm ?? 0, y = a.offsetYmm ?? 0;
        if (!Number.isFinite (x) || !Number.isFinite (y) || a.widthMm + 2*Math.abs (x) > z.widthMm + 1e-7 || a.heightMm + 2*Math.abs (y) > z.heightMm + 1e-7) { throw new Error ('Label position must remain within its physical zone.'); }
        if (z.surface === 'disc' && Math.hypot (x, y) + Math.max (a.widthMm, a.heightMm) / 2 > z.radiusMm + 1e-7) { throw new Error ('Keep the cap label within the circular cap top.'); }
        const cad = a.cad === undefined ? null : ValidateLabelCAD (a.cad);
        if (cad && (Math.abs (cad.widthMm - a.widthMm) > 1e-7 || Math.abs (cad.heightMm - a.heightMm) > 1e-7)) { throw new Error ('Label CAD sheet must match its physical artwork size.'); }
        seen.add (a.zone); return { ...a, ...(cad ? { cad } : {}), ...(a.source !== undefined ? { source : ValidateLabelSource (a.source) } : {}) };
    });
    if (seen.has ('wrap') && (seen.has ('front') || seen.has ('back'))) { throw new Error ('Remove front/back labels before assigning a wrap label.'); }
    if (JSON.stringify (result).length > 240000) { throw new Error ('Simplify label CAD or SVG artwork to fit the portable product metadata limit.'); }
    return result;
}

// Surface-conforming label patch: separate dielectric material avoids metallic ink. Artwork with a bleed (designed on a
// dieline) maps only its trim area onto the label: the texture coordinates are inset by the bleed on every side.
export function CreateLabelMesh (draft, art)
{
    const mesh = LabelMesh (draft, art), b = art.bleedMm || 0;
    if (b > 0) {
        const su = art.widthMm / (art.widthMm + 2 * b), sv = art.heightMm / (art.heightMm + 2 * b);
        for (let i = 0; i < mesh.uvs.length; i += 2) { mesh.uvs[i] = (1 - su) / 2 + mesh.uvs[i] * su; mesh.uvs[i + 1] = (1 - sv) / 2 + mesh.uvs[i + 1] * sv; }
    }
    return mesh;
}

function LabelMesh (draft, art)
{
    const offsetX = art.offsetXmm || 0, offsetY = art.offsetYmm || 0;
    if (art.zone === 'cap-top') {
        const zone = GetArtworkZones (draft).find (item => item.id === art.zone);
        const mesh = { id : 'label-cap-top', materialRole : 'label', artwork : art, positions : [offsetX, zone.topMm + .08, -offsetY], normals : [0, 1, 0], uvs : [.5, .5], indices : [] };
        for (let i = 0; i < 64; i++) { const a = i * Math.PI / 32, x = Math.cos (a), z = Math.sin (a); mesh.positions.push (offsetX + x * art.widthMm / 2, zone.topMm + .08, -offsetY - z * art.heightMm / 2); mesh.normals.push (0, 1, 0); mesh.uvs.push (.5 + x / 2, .5 + z / 2); mesh.indices.push (0, i + 1, (i + 1) % 64 + 1); }
        return mesh;
    }
    if (draft.family === 'clamshell') { const top = art.zone === 'front', x = offsetX * (top ? 1 : -1), w = art.widthMm/2, d = art.heightMm/2, y = top ? draft.heightMm+.15 : -.15; return { id : 'label-'+art.zone, materialRole : 'label', artwork : art, positions : [-w+x, y, d-offsetY, w+x, y, d-offsetY, w+x, y, -d-offsetY, -w+x, y, -d-offsetY], normals : [0, top?1:-1, 0, 0, top?1:-1, 0, 0, top?1:-1, 0, 0, top?1:-1, 0], uvs : top ? [0, 0, 1, 0, 1, 1, 0, 1] : [1, 0, 0, 0, 0, 1, 1, 1], indices : top ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2] }; }
    if (draft.family === 'pouch') { return PouchLabel (draft, art); }
    const zone = GetArtworkZones (draft).find (z => z.id === art.zone);
    const mesh = { id : 'label-' + art.zone, materialRole : 'label', artwork : art, positions : [], normals : [], uvs : [], indices : [] };
    const n = zone.surface === 'section' ? 96 : 48, rows = draft.family === 'pouch' ? 24 : 1, section = zone.surface === 'section' ? BottleSectionOf (draft) : null;
    const y0 = zone.bottomMm + (zone.heightMm - art.heightMm) / 2 + offsetY;
    for (let row = 0; row <= rows; row++) { for (let col = 0; col <= n; col++) {
        const u = col / n, v = row / rows, y = y0 + art.heightMm * v;
        let p, normal;
        if (zone.surface === 'section') {
            // Arc length from +X counter-clockwise: the front centre is a quarter of the perimeter, the back three quarters.
            const at = SectionAt (section, zone.perimeterMm * (art.zone === 'back' ? .75 : .25) + (0.5 - u) * art.widthMm - offsetX);
            normal = [at.nx, 0, at.nz]; p = [at.x + at.nx * 0.15, y, at.z + at.nz * 0.15];
        } else {
            // The zone's radius: the printed body (inside a three-piece can's seams), else the overall radius.
            const radius = zone.radiusMm ?? draft.diameterMm / 2, center = art.zone === 'back' ? -Math.PI / 2 : Math.PI / 2;
            const angle = center + ((0.5 - u) * art.widthMm - offsetX) / radius;
            normal = [Math.cos (angle), 0, Math.sin (angle)]; p = [normal[0] * (radius + 0.15), y, normal[2] * (radius + 0.15)];
        }
        mesh.positions.push (...p); mesh.normals.push (...normal); mesh.uvs.push (u, v);
    } }
    for (let row = 0; row < rows; row++) { for (let col = 0; col < n; col++) { const a = row * (n + 1) + col, b = a + n + 1; mesh.indices.push (a, a + 1, b, a + 1, b + 1, b); } }
    return mesh;
}

function PouchLabel (draft, art)
{
    const mesh = { id : 'label-' + art.zone, materialRole : 'label', artwork : art, positions : [], normals : [], uvs : [], indices : [] };
    const body = CreatePouch (draft, 64), side = art.zone === 'back' ? -1 : 1;
    if (draft.details) { SmoothMesh (body); }
    const zone = GetArtworkZones (draft).find (z => z.id === art.zone), x0 = (art.offsetXmm || 0) * side, y0 = zone.bottomMm + (zone.heightMm - art.heightMm) / 2 + (art.offsetYmm || 0);
    // Clip the actual body triangles to the physical artwork rectangle. This
    // keeps labels on the exact faceted surface instead of approximating it.
    for (let i = 0; i < body.indices.length; i += 3) {
        const ids = body.indices.slice (i, i + 3), normal = body.normals.slice (ids[0] * 3, ids[0] * 3 + 3);
        if (normal[2] * side <= 0) { continue; }
        let polygon = ids.map (id => body.positions.slice (id * 3, id * 3 + 3));
        for (const [axis, boundary, sign] of [[0, x0-art.widthMm / 2, 1], [0, x0+art.widthMm / 2, -1], [1, y0, 1], [1, y0 + art.heightMm, -1]]) {
            const clipped = [];
            for (let j = 0; j < polygon.length; j++) {
                const a = polygon[j], b = polygon[(j + 1) % polygon.length], ai = (a[axis] - boundary) * sign >= 0, bi = (b[axis] - boundary) * sign >= 0;
                if (ai) { clipped.push (a); }
                if (ai !== bi) { const t = (boundary - a[axis]) / (b[axis] - a[axis]); clipped.push (a.map ((n, k) => n + (b[k] - n) * t)); }
            }
            polygon = clipped;
        }
        for (let j = 1; j < polygon.length - 1; j++) {
            const points = [polygon[0], polygon[j], polygon[j + 1]], [a, b, c] = points;
            if (Math.abs ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-10) { continue; }
            const base = mesh.positions.length / 3;
            for (const p of points) {
                let n = normal;
                if (draft.details) {
                    const [a, b, c] = ids.map (id => body.positions.slice (id*3, id*3+3)), det = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
                    if (Math.abs (det) > 1e-10) { const u = ((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/det, v = ((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/det, weights = [u, v, 1-u-v]; n = [0, 1, 2].map (axis => ids.reduce ((sum, id, k) => sum + weights[k]*body.normals[id*3+axis], 0)); const length = Math.hypot (...n) || 1; n = n.map (v => v/length); }
                }
                mesh.positions.push (p[0], p[1], p[2] + side * 0.15); mesh.normals.push (...n); mesh.uvs.push (Math.max (0, Math.min (1, (p[0]-x0) * side / art.widthMm + 0.5)), Math.max (0, Math.min (1, (p[1] - y0) / art.heightMm)));
            }
            mesh.indices.push (base, base + 1, base + 2);
        }
    }
    return mesh;
}
