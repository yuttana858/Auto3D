// Surface of revolution about +Y from an (r, y) profile, in millimeters.
export function Revolve (id, role, profile, segments)
{
    const positions = []; const normals = []; const uvs = []; const indices = [];
    // Separate strips retain hard profile corners and a duplicated UV seam.
    const add = (p, n, uv) => { positions.push (...p); normals.push (...n); uvs.push (...uv); };
    for (let row = 0; row < profile.length - 1; row++) {
        const [r0, y0] = profile[row]; const [r1, y1] = profile[row + 1];
        const length = Math.hypot (y1 - y0, r1 - r0);
        for (let col = 0; col < segments; col++) {
            const start = positions.length / 3;
            for (const [r, y, u, v] of [[r0, y0, col / segments, 0], [r0, y0, (col + 1) / segments, 0], [r1, y1, col / segments, 1], [r1, y1, (col + 1) / segments, 1]]) {
                const angle = u * Math.PI * 2; const c = Math.cos (angle); const s = Math.sin (angle);
                add ([r * c, y, r * s], [(y1 - y0) * c / length, (r0 - r1) / length, (y1 - y0) * s / length], [u, (row + v) / (profile.length - 1)]);
            }
            if (r0 > 0) { indices.push (start, start + 2, start + 1); }
            if (r1 > 0) { indices.push (start + 1, start + 2, start + 3); }
        }
    }
    return { id, materialRole : role, positions, normals, uvs, indices };
}
