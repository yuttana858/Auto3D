// Forming: turns the sensed bottom heightfield into a molded pulp tray surface.
//
// Heights are measured up from baseY, the top face of the flat sheet. The inner (product-side) surface H is:
//   • the product's own bottom surface where that surface is at or below the form depth (pockets and floors),
//   • the form depth everywhere else (the plateau between and around pockets),
//   • 0 along the sheet perimeter, so the outer wall drafts down to a foot that stands on the base plane.
// Product clearance widens pockets laterally (octagonal erosion, field.js). The draft angle limits every slope to
// cot(draft) by fast marching, which always opens pockets wider at the top — a straight-pull, demoldable shape. The outer
// (tool-side) surface is the inner surface offset by the pulp thickness along the surface normal (ball erosion), so steep
// walls keep their full thickness instead of thinning like a vertical offset would.
import { MinFilterOctagon, SlopeLimit, OffsetDown } from './field.js';

export function InitialSurface (field, grid, depth)
{
    const { nx, nz } = grid, initial = new Float32Array (nx * nz);
    for (let k = 0; k < initial.length; k++) { const b = field[k]; initial[k] = Number.isFinite (b) && b <= depth ? Math.max (0, b) : depth; }
    for (let i = 0; i < nx; i++) { initial[i] = 0; initial[(nz - 1) * nx + i] = 0; }
    for (let j = 0; j < nz; j++) { initial[j * nx] = 0; initial[j * nx + nx - 1] = 0; }
    return initial;
}

export function DraftSlope (draftDeg) { return draftDeg > 0 ? 1 / Math.tan (draftDeg * Math.PI / 180) : Infinity; }

// Inner surface only (features are applied before the offset, see plan.js).
export function FormTop (field, grid, draft, depth = draft.formDepthMm)
{
    const cleared = MinFilterOctagon (InitialSurface (field, grid, depth), grid, draft.clearanceMm), slope = DraftSlope (draft.draftDeg);
    const top = SlopeLimit (cleared, grid, slope);
    for (let k = 0; k < top.length; k++) { top[k] = Math.min (depth, Math.max (0, top[k])); }
    return { top, slope };
}

export function FormSurfaces (field, grid, draft, depth = draft.formDepthMm)
{
    const { top, slope } = FormTop (field, grid, draft, depth);
    return { top, bottom : OffsetDown (top, grid, draft.thicknessMm), slope };
}

// Flat sheet: the same shell representation with a constant top at 0 and bottom at −thickness.
export function SheetSurfaces (grid, draft)
{
    const n = grid.nx * grid.nz; return { top : new Float32Array (n), bottom : new Float32Array (n).fill (-draft.thicknessMm) };
}

// Connected pocket regions (H below the plateau) that do not touch the sheet perimeter, with their bounding boxes in mm,
// plus the narrowest plateau rib separating two pockets (labelled multi-source distance propagation).
export function PocketMetrics (top, grid, depth)
{
    const { nx, nz, dx, dz, x0, z0 } = grid, n = nx * nz, label = new Int32Array (n).fill (-1), low = k => top[k] < depth - 1e-4;
    const pockets = [], stack = new Int32Array (n);
    for (let start = 0; start < n; start++) {
        if (!low (start) || label[start] !== -1) { continue; }
        let size = 0, head = 0, perimeter = false, i0 = nx, i1 = 0, j0 = nz, j1 = 0; stack[size++] = start; label[start] = -2; const cells = [];
        while (head < size) {
            const k = stack[head++]; cells.push (k); const i = k % nx, j = (k - i) / nx;
            if (i === 0 || j === 0 || i === nx - 1 || j === nz - 1) { perimeter = true; }
            if (i < i0) { i0 = i; } if (i > i1) { i1 = i; } if (j < j0) { j0 = j; } if (j > j1) { j1 = j; }
            if (i > 0) { const q = k - 1; if (label[q] === -1 && low (q)) { label[q] = -2; stack[size++] = q; } }
            if (i < nx - 1) { const q = k + 1; if (label[q] === -1 && low (q)) { label[q] = -2; stack[size++] = q; } }
            if (j > 0) { const q = k - nx; if (label[q] === -1 && low (q)) { label[q] = -2; stack[size++] = q; } }
            if (j < nz - 1) { const q = k + nx; if (label[q] === -1 && low (q)) { label[q] = -2; stack[size++] = q; } }
        }
        const id = perimeter ? -3 : pockets.length; for (const k of cells) { label[k] = id; }
        if (!perimeter) { pockets.push ({ x0 : x0 + i0 * dx, x1 : x0 + i1 * dx, z0 : z0 + j0 * dz, z1 : z0 + j1 * dz, areaMm2 : Math.round (cells.length * dx * dz) }); }
    }
    const dist = new Float32Array (n).fill (Infinity), owner = new Int32Array (n).fill (-1); let queue = [];
    for (let k = 0; k < n; k++) { if (label[k] >= 0) { dist[k] = 0; owner[k] = label[k]; queue.push (k); } }
    let minRib = Infinity;
    while (queue.length) {
        const next = [];
        for (const k of queue) {
            const i = k % nx, j = (k - i) / nx;
            for (let s = 0; s < 4; s++) {
                const a = s === 0 ? i + 1 : s === 1 ? i - 1 : i, b = s === 2 ? j + 1 : s === 3 ? j - 1 : j, h = s < 2 ? dx : dz;
                if (a < 0 || b < 0 || a >= nx || b >= nz) { continue; }
                const q = b * nx + a; if (label[q] === -3) { continue; }
                if (owner[q] >= 0 && owner[q] !== owner[k]) { minRib = Math.min (minRib, dist[k] + dist[q] + h); continue; }
                if (dist[k] + h < dist[q]) { dist[q] = dist[k] + h; owner[q] = owner[k]; next.push (q); }
            }
        }
        queue = next;
    }
    return { pocketCount : pockets.length, pockets, pocketAreasMm2 : pockets.map (p => p.areaMm2), minRibMm : Number.isFinite (minRib) ? Math.max (0, minRib - Math.max (dx, dz)) : null };
}

// Separate product footprints (4-connected nodes where a product surface was sensed) and the narrowest footprint
// extent among them, for comparing with pockets and for the per-product depth-to-width check.
export function FootprintIslands (field, grid)
{
    const { nx, nz, dx, dz } = grid, seen = new Uint8Array (nx * nz), stack = new Int32Array (nx * nz); let count = 0, narrowest = Infinity;
    for (let start = 0; start < seen.length; start++) {
        if (seen[start] || !Number.isFinite (field[start])) { continue; }
        count++; let size = 0, i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity; stack[size++] = start; seen[start] = 1;
        while (size) {
            const k = stack[--size], i = k % nx, j = (k - i) / nx; i0 = Math.min (i0, i); i1 = Math.max (i1, i); j0 = Math.min (j0, j); j1 = Math.max (j1, j);
            if (i > 0 && !seen[k - 1] && Number.isFinite (field[k - 1])) { seen[k - 1] = 1; stack[size++] = k - 1; }
            if (i < nx - 1 && !seen[k + 1] && Number.isFinite (field[k + 1])) { seen[k + 1] = 1; stack[size++] = k + 1; }
            if (j > 0 && !seen[k - nx] && Number.isFinite (field[k - nx])) { seen[k - nx] = 1; stack[size++] = k - nx; }
            if (j < nz - 1 && !seen[k + nx] && Number.isFinite (field[k + nx])) { seen[k + nx] = 1; stack[size++] = k + nx; }
        }
        narrowest = Math.min (narrowest, (i1 - i0) * dx, (j1 - j0) * dz);
    }
    return { count, narrowestMm : Number.isFinite (narrowest) ? narrowest : null };
}

export function ShellVolume (surfaces, grid)
{
    const { nx, nz, dx, dz } = grid; let volume = 0;
    for (let j = 0; j < nz; j++) { for (let i = 0; i < nx; i++) { const k = j * nx + i, w = (i === 0 || i === nx - 1 ? 0.5 : 1) * (j === 0 || j === nz - 1 ? 0.5 : 1); volume += (surfaces.top[k] - surfaces.bottom[k]) * w; } }
    return volume * dx * dz;
}
