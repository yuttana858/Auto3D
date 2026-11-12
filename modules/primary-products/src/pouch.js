// Filled closed-envelope presentation pouches. The thin perimeter represents seals, not manufacturing walls or a
// volume/filling simulation. Pillow packs bulge from all four seals; stand-up packs open into a flat elliptical bottom
// gusset that lets them stand, then taper to the flat top seal.
export const StandUpTopSeal = .08;
function Thickness (draft)
{
    if (draft.pouchShape?.style !== 'standup') { return (u, v) => .01 + .49 * Math.sin (Math.PI * u) * Math.sin (Math.PI * v); }
    const h = draft.heightMm, gusset = draft.pouchShape.gussetMm / h, top = 1 - StandUpTopSeal;
    return (u, v) => {
        // Full gusset depth up to the fold line, then a smooth taper to the top seal band.
        const t = Math.max (0, Math.min (1, (v - gusset) / Math.max (1e-6, top - gusset))), taper = v <= gusset ? 1 : Math.cos (t * Math.PI / 2) ** .75;
        return .01 + .49 * Math.sin (Math.PI * u) ** (v <= gusset ? .5 : .5 + .5 * t) * taper;
    };
}
export function CreatePouch (draft, segments)
{
    const mesh = { id : 'body', materialRole : 'body', positions : [], normals : [], uvs : [], indices : [] };
    const n = segments / 2, w = draft.widthMm, h = draft.heightMm, d = draft.depthMm, thickness = Thickness (draft);
    const point = (u, v, side) => [w * (u - 0.5), h * v, side * d * thickness (u, v)];
    const triangle = (a, b, c, uv) => {
        const ab = b.map ((x, i) => x - a[i]), ac = c.map ((x, i) => x - a[i]);
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const length = Math.hypot (...normal); if (length < 1e-12) { return; }
        const base = mesh.positions.length / 3;
        for (const p of [a, b, c]) { mesh.positions.push (...p); mesh.normals.push (...normal.map (x => x / length)); }
        mesh.uvs.push (...uv.flat ()); mesh.indices.push (base, base + 1, base + 2);
    };
    const quad = (a, b, c, e, uv) => { triangle (a, b, c, [uv[0], uv[1], uv[2]]); triangle (a, c, e, [uv[0], uv[2], uv[3]]); };
    for (let row = 0; row < n; row++) { for (let col = 0; col < n; col++) {
        const u = col / n, v = row / n, u1 = (col + 1) / n, v1 = (row + 1) / n;
        const uv = [[u, v], [u1, v], [u1, v1], [u, v1]];
        quad (point (u, v, 1), point (u1, v, 1), point (u1, v1, 1), point (u, v1, 1), uv);
        quad (point (u1, v, -1), point (u, v, -1), point (u, v1, -1), point (u1, v1, -1), uv);
    } }
    // Counterclockwise boundary viewed from the front; bridge back to front. On a stand-up pouch the bottom bridge is
    // the flat gusset base.
    const boundary = [];
    for (let i = 0; i < n; i++) { boundary.push ([i / n, 0]); }
    for (let i = 0; i < n; i++) { boundary.push ([1, i / n]); }
    for (let i = 0; i < n; i++) { boundary.push ([1 - i / n, 1]); }
    for (let i = 0; i < n; i++) { boundary.push ([0, 1 - i / n]); }
    for (let i = 0; i < boundary.length; i++) {
        const a = boundary[i], b = boundary[(i + 1) % boundary.length];
        quad (point (...a, -1), point (...b, -1), point (...b, 1), point (...a, 1), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
    return mesh;
}
