// True 3D distance from points to the review surface (a heightfield drawn as two triangles per cell), searching cells
// within a radius. Used to judge NURBS output against the review model: on steep pulp walls a vertical difference
// overstates the error (1 mm sideways is ~14 mm vertically at 4°), so only the 3D distance is meaningful.

function PointTriangle (p, a, b, c)
{
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], len = v => Math.hypot (v[0], v[1], v[2]);
    const d1 = dot (ab, ap), d2 = dot (ac, ap); if (d1 <= 0 && d2 <= 0) { return len (ap); }
    const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dot (ab, bp), d4 = dot (ac, bp); if (d3 >= 0 && d4 <= d3) { return len (bp); }
    const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return len ([ap[0] - v * ab[0], ap[1] - v * ab[1], ap[2] - v * ab[2]]); }
    const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dot (ab, cp), d6 = dot (ac, cp); if (d6 >= 0 && d5 <= d6) { return len (cp); }
    const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return len ([ap[0] - w * ac[0], ap[1] - w * ac[1], ap[2] - w * ac[2]]); }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return len ([p[0] - (b[0] + w * (c[0] - b[0])), p[1] - (b[1] + w * (c[1] - b[1])), p[2] - (b[2] + w * (c[2] - b[2]))]); }
    const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
    return len ([p[0] - (a[0] + ab[0] * v + ac[0] * w), p[1] - (a[1] + ab[1] * v + ac[1] * w), p[2] - (a[2] + ab[2] * v + ac[2] * w)]);
}

// Returns (x, y, z) => distance (mm) for heights H (relative, same frame as y) on grid { nx, nz, dx, dz, x0, z0 }.
export function SurfaceDistance (grid, H, radiusMm = 2.5)
{
    const { nx, nz, dx, dz, x0, z0 } = grid, ri = Math.max (1, Math.ceil (radiusMm / dx)), rj = Math.max (1, Math.ceil (radiusMm / dz));
    const node = (i, j) => [x0 + i * dx, H[j * nx + i], z0 + j * dz];
    return (x, y, z) => {
        const ci = Math.round ((x - x0) / dx), cj = Math.round ((z - z0) / dz), p = [x, y, z]; let best = Infinity;
        for (let j = Math.max (0, cj - rj); j < Math.min (nz - 1, cj + rj); j++) {
            for (let i = Math.max (0, ci - ri); i < Math.min (nx - 1, ci + ri); i++) {
                const a = node (i, j), b = node (i + 1, j), c = node (i + 1, j + 1), d = node (i, j + 1);
                best = Math.min (best, PointTriangle (p, a, b, c), PointTriangle (p, a, c, d));
            }
        }
        return best;
    };
}
