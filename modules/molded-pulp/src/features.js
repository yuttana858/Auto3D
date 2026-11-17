// Applies rule-base features to the formed heightfields (heights relative to the sheet top, plateau at depth).
// Ribs: hollow U corrugations cut down from the plateau, with drafted walls, applied to the inner surface before the
// thickness offset so the outer surface follows them (molded pulp ribs are wall folds, not solid ribs).
// Denest lugs: local thickenings of the drafted outer wall applied after the offset. The inner surface moves outward by
// the stand-off (raised by stand-off × cot(draft)) while the outer surface stays put, so a nested part rests on the lug
// instead of wedging along the whole wall.
function SegmentDistance (x, z, r)
{
    const ux = r.x1 - r.x0, uz = r.z1 - r.z0, len2 = ux * ux + uz * uz;
    const s = len2 > 0 ? Math.max (0, Math.min (1, ((x - r.x0) * ux + (z - r.z0) * uz) / len2)) : 0;
    return Math.hypot (x - r.x0 - ux * s, z - r.z0 - uz * s);
}

export function ApplyRibs (top, grid, ribs, depth, slope)
{
    const { nx, nz, dx, dz, x0, z0 } = grid; let touched = 0;
    for (const rib of ribs) {
        const half = rib.floorWidthMm / 2, reach = half + rib.depthMm / slope, floor = depth - rib.depthMm;
        const i0 = Math.max (0, Math.floor ((Math.min (rib.x0, rib.x1) - reach - x0) / dx)), i1 = Math.min (nx - 1, Math.ceil ((Math.max (rib.x0, rib.x1) + reach - x0) / dx));
        const j0 = Math.max (0, Math.floor ((Math.min (rib.z0, rib.z1) - reach - z0) / dz)), j1 = Math.min (nz - 1, Math.ceil ((Math.max (rib.z0, rib.z1) + reach - z0) / dz));
        for (let j = j0; j <= j1; j++) {
            for (let i = i0; i <= i1; i++) {
                const k = j * nx + i, groove = floor + slope * Math.max (0, SegmentDistance (x0 + i * dx, z0 + j * dz, rib) - half);
                if (groove < top[k]) { top[k] = groove; touched++; }
            }
        }
    }
    return touched;
}

export function ApplyLugs (top, grid, lugs, depth, slope)
{
    const { nx, nz, dx, dz, x0, z0 } = grid, applied = [], original = Float32Array.from (top);
    for (const lug of lugs) {
        const lift = lug.standoffMm * slope, half = lug.lengthMm / 2, alongX = lug.side === '−Z' || lug.side === '+Z';
        const inward = { '−Z' : [0, 1], '+Z' : [0, -1], '−X' : [1, 0], '+X' : [-1, 0] }[lug.side];
        let count = 0;
        // Walk inward from the border across the tangential span; thicken nodes on the drafted wall (0 < H < plateau).
        for (let s = -half; s <= half; s += Math.min (dx, dz) / 2) {
            const weight = 0.5 + 0.5 * Math.cos (Math.PI * s / half);
            const bx = alongX ? lug.x + s : lug.x, bz = alongX ? lug.z : lug.z + s;
            for (let step = 0; step < Math.max (nx, nz); step++) {
                const x = bx + inward[0] * step * dx, z = bz + inward[1] * step * dz, i = Math.round ((x - x0) / dx), j = Math.round ((z - z0) / dz);
                if (i < 0 || j < 0 || i >= nx || j >= nz) { break; }
                const k = j * nx + i, h = original[k];
                if (h >= depth - 1e-4) { break; }
                if (h <= 1e-4) { continue; }
                const raised = Math.min (depth, h + lift * weight); if (raised > top[k]) { top[k] = raised; count++; } /* relative to the unlugged wall, never compounded */
            }
        }
        applied.push ({ ...lug, nodes : count });
    }
    return applied;
}
