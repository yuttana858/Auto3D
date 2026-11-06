// Filled closed-envelope presentation pouch. The thin perimeter represents seals,
// not manufacturing walls or a volume/filling simulation.
export function CreatePillowPouch (draft, segments)
{
    const mesh = { id : 'body', materialRole : 'body', positions : [], normals : [], uvs : [], indices : [] };
    const n = segments / 2, w = draft.widthMm, h = draft.heightMm, d = draft.depthMm;
    const point = (u, v, side) => [w * (u - 0.5), h * v, side * d * (0.01 + 0.49 * Math.sin (Math.PI * u) * Math.sin (Math.PI * v))];
    const triangle = (a, b, c, uv) => {
        const ab = b.map ((x, i) => x - a[i]), ac = c.map ((x, i) => x - a[i]);
        const normal = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
        const length = Math.hypot (...normal), base = mesh.positions.length / 3;
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
    // Counterclockwise boundary viewed from the front; bridge back to front.
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
