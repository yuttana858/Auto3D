// Surface sensing for grouped products. Input triangles are world-space, canonical millimetres, Y-up, packed as
// [ax, ay, az, bx, by, bz, cx, cy, cz, ...]. The footprint plane is X (length) × Z (width).
//
// A straight-pull pulp tool only "sees" the product from below, so the forming surface is the lowest product surface
// at every point of the footprint. That heightfield is single-valued by construction: undercuts cannot be represented,
// which is exactly the constraint of conventional wet molding (negative draft is not moldable).
export const MaxSenseTriangles = 2000000;
export const MaxGridNodes = 360000;

export function SenseBounds (triangles)
{
    if (!(triangles instanceof Float32Array || triangles instanceof Float64Array) || triangles.length === 0 || triangles.length % 9 !== 0) { throw new Error ('Select at least one product with triangle geometry.'); }
    if (triangles.length / 9 > MaxSenseTriangles) { throw new Error ('The selected products exceed ' + MaxSenseTriangles.toLocaleString ('en-US') + ' triangles. Simplify them before forming pulp.'); }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < triangles.length; i += 3) {
        for (let a = 0; a < 3; a++) {
            const v = triangles[i + a]; if (!Number.isFinite (v)) { throw new Error ('Product geometry contains invalid coordinates.'); }
            if (v < min[a]) { min[a] = v; } if (v > max[a]) { max[a] = v; }
        }
    }
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    if (size[0] < 0.5 || size[2] < 0.5) { throw new Error ('The selected products need a footprint of at least 0.5 mm in length and width.'); }
    return { min, max, size, center : [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], triangleCount : triangles.length / 9 };
}

// Sheet rectangle directly under the grouped products: the exact footprint plus the requested additional material,
// split evenly on both sides. The top face of the sheet lies on the lowest product point (baseY).
export function SheetRect (bounds, draft)
{
    const x0 = bounds.min[0] - draft.extraLengthMm / 2, x1 = bounds.max[0] + draft.extraLengthMm / 2;
    const z0 = bounds.min[2] - draft.extraWidthMm / 2, z1 = bounds.max[2] + draft.extraWidthMm / 2;
    return { x0, x1, z0, z1, baseY : bounds.min[1], lengthMm : x1 - x0, widthMm : z1 - z0, footprintLengthMm : bounds.size[0], footprintWidthMm : bounds.size[2] };
}

// Node grid over the sheet. Automatic resolution targets ~1 mm, never coarser than needed for the node budget, and
// never coarser than the pulp thickness when the budget allows (so thin walls are resolved).
export function FormGrid (rect, draft)
{
    const area = rect.lengthMm * rect.widthMm, budget = Math.sqrt (area / MaxGridNodes);
    const wanted = draft.resolutionMm ?? Math.max (0.5, Math.min (2, draft.thicknessMm, Math.max (rect.lengthMm, rect.widthMm) / 300));
    const cell = Math.max (wanted, budget);
    const nx = Math.max (2, Math.ceil (rect.lengthMm / cell) + 1), nz = Math.max (2, Math.ceil (rect.widthMm / cell) + 1);
    return { x0 : rect.x0, z0 : rect.z0, dx : rect.lengthMm / (nx - 1), dz : rect.widthMm / (nz - 1), nx, nz, cell : Math.max (rect.lengthMm / (nx - 1), rect.widthMm / (nz - 1)) };
}

// Lowest product surface above each grid node, relative to baseY. Nodes with no product above them are Infinity.
// Triangles are rasterized by barycentric point-in-triangle tests at node positions; triangle edges are also walked so
// near-vertical walls and features thinner than a cell still register.
export function BottomHeightfield (triangles, grid, baseY)
{
    const { x0, z0, dx, dz, nx, nz } = grid, field = new Float64Array (nx * nz).fill (Infinity);
    const put = (i, j, y) => { if (i >= 0 && j >= 0 && i < nx && j < nz) { const k = j * nx + i; if (y < field[k]) { field[k] = y; } } };
    const edge = (ax, ay, az, bx, by, bz) => {
        const steps = Math.max (1, Math.ceil (Math.max (Math.abs (bx - ax) / dx, Math.abs (bz - az) / dz) * 2));
        for (let s = 0; s <= steps; s++) { const t = s / steps; put (Math.round ((ax + (bx - ax) * t - x0) / dx), Math.round ((az + (bz - az) * t - z0) / dz), ay + (by - ay) * t - baseY); }
    };
    for (let t = 0; t < triangles.length; t += 9) {
        const ax = triangles[t], ay = triangles[t + 1], az = triangles[t + 2], bx = triangles[t + 3], by = triangles[t + 4], bz = triangles[t + 5], cx = triangles[t + 6], cy = triangles[t + 7], cz = triangles[t + 8];
        edge (ax, ay, az, bx, by, bz); edge (bx, by, bz, cx, cy, cz); edge (cx, cy, cz, ax, ay, az);
        const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs (det) < 1e-12) { continue; }
        const i0 = Math.max (0, Math.floor ((Math.min (ax, bx, cx) - x0) / dx)), i1 = Math.min (nx - 1, Math.ceil ((Math.max (ax, bx, cx) - x0) / dx));
        const j0 = Math.max (0, Math.floor ((Math.min (az, bz, cz) - z0) / dz)), j1 = Math.min (nz - 1, Math.ceil ((Math.max (az, bz, cz) - z0) / dz));
        for (let j = j0; j <= j1; j++) {
            const z = z0 + j * dz;
            for (let i = i0; i <= i1; i++) {
                const x = x0 + i * dx;
                const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
                if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) { continue; }
                put (i, j, l1 * ay + l2 * by + l3 * cy - baseY);
            }
        }
    }
    return field;
}
