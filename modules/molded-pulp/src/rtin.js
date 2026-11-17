// Adaptive shell mesh: a right-triangulated irregular network (RTIN, the scheme used by terrain meshers such as
// Martini) over a square 2^k + 1 grid. One triangulation is shared by the inner (top) and outer (bottom) surfaces,
// refined wherever either deviates from its linear interpolation by more than the tolerance, so both surfaces have the
// same perimeter vertices and the perimeter walls close the shell watertight. Flat plateaus and floors collapse to a few
// large triangles while pocket walls keep full detail. Positions are canonical mm relative to the origin, Y-up, in the
// flat component format { id, materialRole, positions, normals, uvs, indices }.
function Errors (values, n)
{
    const tile = n - 1, count = tile * tile * 2 - 2, parents = count - tile * tile, coords = new Uint16Array (count * 4), errors = new Float32Array (n * n);
    for (let t = 0; t < count; t++) {
        let id = t + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
        if (id & 1) { bx = by = cx = tile; } else { ax = ay = cy = tile; }
        while ((id >>= 1) > 1) {
            const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
            if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; } else { ax = bx; ay = by; bx = cx; by = cy; }
            cx = mx; cy = my;
        }
        coords[t * 4] = ax; coords[t * 4 + 1] = ay; coords[t * 4 + 2] = bx; coords[t * 4 + 3] = by;
    }
    for (let t = count - 1; t >= 0; t--) {
        const ax = coords[t * 4], ay = coords[t * 4 + 1], bx = coords[t * 4 + 2], by = coords[t * 4 + 3];
        const mx = (ax + bx) >> 1, my = (ay + by) >> 1, cx = mx + my - ay, cy = my + ax - mx, m = my * n + mx;
        let e = Math.abs ((values[ay * n + ax] + values[by * n + bx]) / 2 - values[m]);
        if (t < parents) { e = Math.max (e, errors[((ay + cy) >> 1) * n + ((ax + cx) >> 1)], errors[((by + cy) >> 1) * n + ((bx + cx) >> 1)]); }
        if (e > errors[m]) { errors[m] = e; }
    }
    return errors;
}

// Shared triangle list (grid node ids) for the two surfaces at the given tolerance.
export function AdaptiveTriangles (top, bottom, n, tolerance)
{
    const a = Errors (top, n), b = Errors (bottom, n), max = n - 1, tris = [];
    for (let k = 0; k < a.length; k++) { if (b[k] > a[k]) { a[k] = b[k]; } }
    const stack = [[0, 0, max, max, max, 0], [max, max, 0, 0, 0, max]];
    while (stack.length) {
        const [ax, ay, bx, by, cx, cy] = stack.pop (), mx = (ax + bx) >> 1, my = (ay + by) >> 1;
        if (Math.abs (ax - cx) + Math.abs (ay - cy) > 1 && a[my * n + mx] > tolerance) { stack.push ([cx, cy, ax, ay, mx, my], [bx, by, cx, cy, mx, my]); }
        else { tris.push (ay * n + ax, by * n + bx, cy * n + cx); }
    }
    return tris;
}

// Vertex normals from a heightfield using central differences over ±span nodes (a light smoothing of the shading only;
// positions stay exact).
function Normal (values, grid, i, j, span, sign)
{
    const { nx, nz, dx, dz } = grid, i0 = Math.max (0, i - span), i1 = Math.min (nx - 1, i + span), j0 = Math.max (0, j - span), j1 = Math.min (nz - 1, j + span);
    const gx = (values[j * nx + i1] - values[j * nx + i0]) / ((i1 - i0) * dx), gz = (values[j1 * nx + i] - values[j0 * nx + i]) / ((j1 - j0) * dz), len = Math.hypot (gx, 1, gz);
    return [-gx * sign / len, sign / len, -gz * sign / len];
}

export function AdaptiveShellMesh (grid, surfaces, origin, id = 'pulp-tray', tolerance = grid.toleranceMm ?? 0.05, smoothMm = 0.6)
{
    const { nx, dx, dz, x0, z0 } = grid, n = nx, length = dx * (n - 1), width = dz * (n - 1), span = Math.max (1, Math.round (smoothMm / Math.max (dx, dz)));
    const tris = AdaptiveTriangles (surfaces.top, surfaces.bottom, n, tolerance);
    const positions = [], normals = [], uvs = [], indices = [], maps = [new Int32Array (n * n).fill (-1), new Int32Array (n * n).fill (-1)];
    const add = (x, y, z, normal) => { positions.push (x - origin[0], y, z - origin[2]); normals.push (normal[0], normal[1], normal[2]); uvs.push ((x - x0) / length, (z - z0) / width); return positions.length / 3 - 1; };
    const vertex = (side, k) => {
        if (maps[side][k] < 0) { const i = k % n, j = (k - i) / n, values = side ? surfaces.bottom : surfaces.top; maps[side][k] = add (x0 + i * dx, values[k], z0 + j * dz, Normal (values, grid, i, j, span, side ? -1 : 1)); }
        return maps[side][k];
    };
    const edges = new Map ();
    for (let t = 0; t < tris.length; t += 3) {
        let p = tris[t], q = tris[t + 1], r = tris[t + 2];
        const pi = p % n, pj = (p - pi) / n, qi = q % n, qj = (q - qi) / n, ri = r % n, rj = (r - ri) / n;
        // In (x, z) index space a negative cross product winds counter-clockwise seen from +Y (outward for the top surface).
        if ((qi - pi) * (rj - pj) - (qj - pj) * (ri - pi) > 0) { const s = q; q = r; r = s; }
        indices.push (vertex (0, p), vertex (0, q), vertex (0, r), vertex (1, p), vertex (1, r), vertex (1, q));
        for (const [u, v] of [[p, q], [q, r], [r, p]]) { const key = u < v ? u * n * n + v : v * n * n + u; edges.set (key, edges.has (key) ? null : [u, v]); }
    }
    // Perimeter walls on edges used by a single triangle (always on the grid border). [u, v] keeps the top winding, so the
    // wall quad (top u, top v, bottom v, bottom u) faces outward.
    for (const edge of edges.values ()) {
        if (!edge) { continue; }
        const [u, v] = edge, ui = u % n, uj = (u - ui) / n, vi = v % n, vj = (v - vi) / n;
        const normal = ui === 0 && vi === 0 ? [-1, 0, 0] : ui === n - 1 && vi === n - 1 ? [1, 0, 0] : uj === 0 && vj === 0 ? [0, 0, -1] : [0, 0, 1];
        const xu = x0 + ui * dx, zu = z0 + uj * dz, xv = x0 + vi * dx, zv = z0 + vj * dz;
        const tu = add (xu, surfaces.top[u], zu, normal), tv = add (xv, surfaces.top[v], zv, normal), bu = add (xu, surfaces.bottom[u], zu, normal), bv = add (xv, surfaces.bottom[v], zv, normal);
        indices.push (tu, bv, tv, tu, bu, bv);
    }
    const p = Float32Array.from (positions);
    return { id, materialRole : 'pulp', positions : p, normals : Float32Array.from (normals), uvs : Float32Array.from (uvs), indices : (p.length / 3 > 65535 ? Uint32Array : Uint16Array).from (indices), triangleCount : indices.length / 3, gridTriangles : (n - 1) * (n - 1) * 4 };
}
