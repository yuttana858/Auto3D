// Watertight shell mesh from inner (top) and outer (bottom) heightfields. Positions are canonical millimetres relative
// to the origin (sheet centre on the base plane), Y-up, in the same flat component format as Primary Products:
// { id, materialRole, positions, normals, uvs, indices }.
export function ShellMesh (grid, surfaces, origin, id = 'tray')
{
    const { nx, nz, dx, dz, x0, z0 } = grid, positions = [], normals = [], uvs = [], indices = [];
    const length = dx * (nx - 1), width = dz * (nz - 1);
    const vertex = (x, y, z, n) => { positions.push (x - origin[0], y, z - origin[2]); normals.push (...n); uvs.push ((x - x0) / length, (z - z0) / width); return positions.length / 3 - 1; };
    const surface = (values, up) => {
        const start = positions.length / 3, at = (i, j) => values[Math.min (nz - 1, Math.max (0, j)) * nx + Math.min (nx - 1, Math.max (0, i))];
        for (let j = 0; j < nz; j++) {
            for (let i = 0; i < nx; i++) {
                const gx = (at (i + 1, j) - at (i - 1, j)) / ((Math.min (nx - 1, i + 1) - Math.max (0, i - 1)) * dx), gz = (at (i, j + 1) - at (i, j - 1)) / ((Math.min (nz - 1, j + 1) - Math.max (0, j - 1)) * dz);
                const s = up ? 1 : -1, len = Math.hypot (gx, 1, gz);
                vertex (x0 + i * dx, values[j * nx + i], z0 + j * dz, [-gx * s / len, s / len, -gz * s / len]);
            }
        }
        for (let j = 0; j < nz - 1; j++) {
            for (let i = 0; i < nx - 1; i++) {
                const a = start + j * nx + i, b = a + 1, c = a + nx, d = c + 1;
                // Split each quad along its flatter diagonal to avoid creases across pocket walls.
                const flat = Math.abs (values[j * nx + i] - values[(j + 1) * nx + i + 1]) <= Math.abs (values[j * nx + i + 1] - values[(j + 1) * nx + i]);
                const tris = flat ? [[a, c, d], [a, d, b]] : [[a, c, b], [b, c, d]];
                for (const [p, q, r] of tris) { if (up) { indices.push (p, q, r); } else { indices.push (p, r, q); } }
            }
        }
    };
    surface (surfaces.top, true); surface (surfaces.bottom, false);
    // Perimeter walls connect the outer edge of the top and bottom surfaces with outward-facing flat normals.
    const ring = [];
    for (let i = 0; i < nx - 1; i++) { ring.push ([i, 0, i + 1, 0, [0, 0, -1]]); }
    for (let j = 0; j < nz - 1; j++) { ring.push ([nx - 1, j, nx - 1, j + 1, [1, 0, 0]]); }
    for (let i = nx - 1; i > 0; i--) { ring.push ([i, nz - 1, i - 1, nz - 1, [0, 0, 1]]); }
    for (let j = nz - 1; j > 0; j--) { ring.push ([0, j, 0, j - 1, [-1, 0, 0]]); }
    for (const [i1, j1, i2, j2, n] of ring) {
        const k1 = j1 * nx + i1, k2 = j2 * nx + i2, xa = x0 + i1 * dx, za = z0 + j1 * dz, xb = x0 + i2 * dx, zb = z0 + j2 * dz;
        const ta = vertex (xa, surfaces.top[k1], za, n), tb = vertex (xb, surfaces.top[k2], zb, n), ba = vertex (xa, surfaces.bottom[k1], za, n), bb = vertex (xb, surfaces.bottom[k2], zb, n);
        // With the ring order above, (ta, bb, ba) and (ta, tb, bb) wind outward (verified by the signed-volume test).
        indices.push (ta, bb, ba, ta, tb, bb);
    }
    const p = Float32Array.from (positions);
    return { id, materialRole : 'pulp', positions : p, normals : Float32Array.from (normals), uvs : Float32Array.from (uvs), indices : (p.length / 3 > 65535 ? Uint32Array : Uint16Array).from (indices) };
}
