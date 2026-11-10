import { CreatePillowPouch } from './pouch.js';
import { GetArtworkZones } from './zones.js';
export function ValidateProductArtwork (draft, entries = [])
{
    if (!Array.isArray (entries) || entries.length > 2) { throw new Error ('Use up to two front/back labels or one wrap.'); }
    const seen = new Set (), zones = GetArtworkZones (draft);
    const result = entries.map (a => {
        if (!a || typeof a !== 'object' || Object.keys (a).some (k => !['resourceId', 'name', 'mime', 'zone', 'widthMm', 'heightMm'].includes (k)) || !/^[a-f0-9]{64}$/.test (a.resourceId) || typeof a.name !== 'string' || a.name.length > 80 || !['image/png', 'image/jpeg', 'image/webp'].includes (a.mime)) { throw new Error ('Invalid label artwork.'); }
        const z = zones.find (zone => zone.id === a.zone);
        if (!z || seen.has (a.zone) || !Number.isFinite (a.widthMm) || !Number.isFinite (a.heightMm) || a.widthMm < 1 || a.heightMm < 1 || a.widthMm > z.widthMm || a.heightMm > z.heightMm) { throw new Error ('Label must fit its physical zone. Resize or remove artwork before changing the product.'); }
        seen.add (a.zone); return { ...a };
    });
    if (seen.has ('wrap') && seen.size > 1) { throw new Error ('Remove front/back labels before assigning a wrap label.'); }
    return result;
}

// Surface-conforming label patch: separate dielectric material avoids metallic ink.
export function CreateLabelMesh (draft, art)
{
    if (draft.family === 'clamshell') { const top = art.zone === 'front', w = art.widthMm/2, d = art.heightMm/2, y = top ? draft.heightMm+.15 : -.15; return { id : 'label-'+art.zone, materialRole : 'label', artwork : art, positions : [-w, y, d, w, y, d, w, y, -d, -w, y, -d], normals : [0, top?1:-1, 0, 0, top?1:-1, 0, 0, top?1:-1, 0, 0, top?1:-1, 0], uvs : top ? [0, 0, 1, 0, 1, 1, 0, 1] : [1, 0, 0, 0, 0, 1, 1, 1], indices : top ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2] }; }
    if (draft.family === 'pouch') { return PouchLabel (draft, art); }
    const zone = GetArtworkZones (draft).find (z => z.id === art.zone);
    const mesh = { id : 'label-' + art.zone, materialRole : 'label', artwork : art, positions : [], normals : [], uvs : [], indices : [] };
    const n = 48, rows = draft.family === 'pouch' ? 24 : 1;
    const y0 = zone.bottomMm + (zone.heightMm - art.heightMm) / 2;
    for (let row = 0; row <= rows; row++) { for (let col = 0; col <= n; col++) {
        const u = col / n, v = row / rows, y = y0 + art.heightMm * v;
        let p, normal;
        const radius = draft.diameterMm / 2, center = art.zone === 'back' ? -Math.PI / 2 : Math.PI / 2;
        const angle = center + (0.5 - u) * art.widthMm / radius;
        normal = [Math.cos (angle), 0, Math.sin (angle)]; p = [normal[0] * (radius + 0.15), y, normal[2] * (radius + 0.15)];
        mesh.positions.push (...p); mesh.normals.push (...normal); mesh.uvs.push (u, v);
    } }
    for (let row = 0; row < rows; row++) { for (let col = 0; col < n; col++) { const a = row * (n + 1) + col, b = a + n + 1; mesh.indices.push (a, a + 1, b, a + 1, b + 1, b); } }
    return mesh;
}

function PouchLabel (draft, art)
{
    const mesh = { id : 'label-' + art.zone, materialRole : 'label', artwork : art, positions : [], normals : [], uvs : [], indices : [] };
    const body = CreatePillowPouch (draft, 64), side = art.zone === 'back' ? -1 : 1;
    const zone = GetArtworkZones (draft).find (z => z.id === art.zone), y0 = zone.bottomMm + (zone.heightMm - art.heightMm) / 2;
    // Clip the actual body triangles to the physical artwork rectangle. This
    // keeps labels on the exact faceted surface instead of approximating it.
    for (let i = 0; i < body.indices.length; i += 3) {
        const ids = body.indices.slice (i, i + 3), normal = body.normals.slice (ids[0] * 3, ids[0] * 3 + 3);
        if (normal[2] * side <= 0) { continue; }
        let polygon = ids.map (id => body.positions.slice (id * 3, id * 3 + 3));
        for (const [axis, boundary, sign] of [[0, -art.widthMm / 2, 1], [0, art.widthMm / 2, -1], [1, y0, 1], [1, y0 + art.heightMm, -1]]) {
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
            for (const p of points) { mesh.positions.push (p[0], p[1], p[2] + side * 0.15); mesh.normals.push (...normal); mesh.uvs.push (Math.max (0, Math.min (1, p[0] * side / art.widthMm + 0.5)), Math.max (0, Math.min (1, (p[1] - y0) / art.heightMm))); }
            mesh.indices.push (base, base + 1, base + 2);
        }
    }
    return mesh;
}
