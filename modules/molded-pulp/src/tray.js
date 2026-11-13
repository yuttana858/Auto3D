// Forming: turns the sensed bottom heightfield into a molded pulp tray surface.
//
// Heights are measured up from baseY, the top face of the flat sheet. The inner (product-side) surface H is:
//   • the product's own bottom surface where that surface is at or below the form depth (pockets and floors),
//   • the form depth everywhere else (the plateau between and around pockets),
//   • 0 along the sheet perimeter, so the outer wall drafts down to a foot that stands on the base plane.
// Product clearance widens pockets laterally (grey-scale erosion with a disc). The draft angle limits every slope to
// cot(draft) by a two-pass distance transform, which always opens pockets wider at the top — a straight-pull, demoldable
// shape. The outer (tool-side) surface is the inner surface offset by the pulp thickness along the surface normal
// (erosion with a ball), so steep walls keep their full thickness instead of thinning like a vertical offset would.
const Chamfer8Error = 1.0824; // worst-case overestimate of Euclidean distance by an 8-neighbour chamfer transform

function DiscOffsets (radius, dx, dz)
{
    const result = [], ri = Math.floor (radius / dx), rj = Math.floor (radius / dz);
    for (let j = -rj; j <= rj; j++) { for (let i = -ri; i <= ri; i++) { const d = Math.hypot (i * dx, j * dz); if (d <= radius + 1e-9) { result.push ([i, j, d]); } } }
    return result;
}

function MinFilter (values, grid, radius)
{
    if (radius <= 0) { return values; }
    const { nx, nz, dx, dz } = grid, offsets = DiscOffsets (radius, dx, dz), out = new Float64Array (values.length);
    for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
            let m = values[j * nx + i];
            for (const [oi, oj] of offsets) { const a = i + oi, b = j + oj; if (a >= 0 && b >= 0 && a < nx && b < nz) { const v = values[b * nx + a]; if (v < m) { m = v; } } }
            out[j * nx + i] = m;
        }
    }
    return out;
}

// Enforce H(p) <= H(q) + |p - q| * slope for all p, q (forward + backward 8-neighbour passes).
function LimitSlope (values, grid, slope)
{
    if (!Number.isFinite (slope)) { return values; }
    const { nx, nz, dx, dz } = grid, out = Float64Array.from (values), s = slope / Chamfer8Error;
    const hx = dx * s, hz = dz * s, hd = Math.hypot (dx, dz) * s;
    const forward = [[-1, 0, hx], [-1, -1, hd], [0, -1, hz], [1, -1, hd]], backward = [[1, 0, hx], [1, 1, hd], [0, 1, hz], [-1, 1, hd]];
    for (let pass = 0; pass < 2; pass++) {
        for (let j = 0; j < nz; j++) {
            for (let i = 0; i < nx; i++) {
                const k = j * nx + i; let m = out[k];
                for (const [oi, oj, h] of forward) { const a = i + oi, b = j + oj; if (a >= 0 && b >= 0 && a < nx && b < nz) { const v = out[b * nx + a] + h; if (v < m) { m = v; } } }
                out[k] = m;
            }
        }
        for (let j = nz - 1; j >= 0; j--) {
            for (let i = nx - 1; i >= 0; i--) {
                const k = j * nx + i; let m = out[k];
                for (const [oi, oj, h] of backward) { const a = i + oi, b = j + oj; if (a >= 0 && b >= 0 && a < nx && b < nz) { const v = out[b * nx + a] + h; if (v < m) { m = v; } } }
                out[k] = m;
            }
        }
    }
    return out;
}

// Normal offset of a heightfield by the thickness: L(p) = min over |q - p| <= t of H(q) - sqrt(t² - |q - p|²).
function OffsetDown (top, grid, thickness)
{
    const { nx, nz, dx, dz } = grid, offsets = DiscOffsets (thickness, dx, dz).map (([i, j, d]) => [i, j, Math.sqrt (Math.max (0, thickness * thickness - d * d))]), out = new Float64Array (top.length);
    for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
            let m = top[j * nx + i] - thickness;
            for (const [oi, oj, h] of offsets) { const a = i + oi, b = j + oj; if (a >= 0 && b >= 0 && a < nx && b < nz) { const v = top[b * nx + a] - h; if (v < m) { m = v; } } }
            out[j * nx + i] = m;
        }
    }
    return out;
}

export function FormSurfaces (field, grid, draft)
{
    const { nx, nz } = grid, depth = draft.formDepthMm, initial = new Float64Array (nx * nz);
    for (let k = 0; k < initial.length; k++) { const b = field[k]; initial[k] = Number.isFinite (b) && b <= depth ? Math.max (0, b) : depth; }
    for (let i = 0; i < nx; i++) { initial[i] = 0; initial[(nz - 1) * nx + i] = 0; }
    for (let j = 0; j < nz; j++) { initial[j * nx] = 0; initial[j * nx + nx - 1] = 0; }
    const cleared = MinFilter (initial, grid, draft.clearanceMm);
    const slope = draft.draftDeg > 0 ? 1 / Math.tan (draft.draftDeg * Math.PI / 180) : Infinity;
    const top = LimitSlope (cleared, grid, slope).map (v => Math.min (depth, Math.max (0, v)));
    return { top, bottom : OffsetDown (top, grid, draft.thicknessMm), slope };
}

// Flat sheet: the same shell representation with a constant top at 0 and bottom at −thickness.
export function SheetSurfaces (grid, draft)
{
    const n = grid.nx * grid.nz; return { top : new Float64Array (n), bottom : new Float64Array (n).fill (-draft.thicknessMm) };
}

// Connected pocket regions (H below the plateau) that do not touch the sheet perimeter, plus the narrowest plateau rib
// separating two pockets, found with a labelled multi-source distance propagation.
export function PocketMetrics (top, grid, depth)
{
    const { nx, nz, dx, dz } = grid, n = nx * nz, label = new Int32Array (n).fill (-1), low = k => top[k] < depth - 1e-6;
    let pockets = 0; const sizes = [];
    for (let start = 0; start < n; start++) {
        if (!low (start) || label[start] !== -1) { continue; }
        const stack = [start], cells = []; label[start] = -2;
        while (stack.length) {
            const k = stack.pop (); cells.push (k); const i = k % nx, j = (k - i) / nx;
            for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) { if (a >= 0 && b >= 0 && a < nx && b < nz) { const q = b * nx + a; if (label[q] === -1 && low (q)) { label[q] = -2; stack.push (q); } } }
        }
        const perimeter = cells.some (k => { const i = k % nx, j = (k - i) / nx; return i === 0 || j === 0 || i === nx - 1 || j === nz - 1; });
        const id = perimeter ? -3 : pockets++; for (const k of cells) { label[k] = id; }
        if (!perimeter) { sizes.push (cells.length * dx * dz); }
    }
    // Voronoi-style propagation over plateau nodes: where fronts from two different pockets meet, their summed distance
    // is the plateau rib width between those pockets.
    const dist = new Float64Array (n).fill (Infinity), owner = new Int32Array (n).fill (-1); let queue = [];
    for (let k = 0; k < n; k++) { if (label[k] >= 0) { dist[k] = 0; owner[k] = label[k]; queue.push (k); } }
    let minRib = Infinity;
    const steps = [[1, 0, dx], [-1, 0, dx], [0, 1, dz], [0, -1, dz]];
    while (queue.length) {
        const next = [];
        for (const k of queue) {
            const i = k % nx, j = (k - i) / nx;
            for (const [oi, oj, h] of steps) {
                const a = i + oi, b = j + oj; if (a < 0 || b < 0 || a >= nx || b >= nz) { continue; }
                const q = b * nx + a; if (label[q] === -3) { continue; }
                if (owner[q] >= 0 && owner[q] !== owner[k]) { minRib = Math.min (minRib, dist[k] + dist[q] + h); continue; }
                if (dist[k] + h < dist[q]) { dist[q] = dist[k] + h; owner[q] = owner[k]; next.push (q); }
            }
        }
        queue = next;
    }
    return { pocketCount : pockets, pocketAreasMm2 : sizes.map (a => Math.round (a)), minRibMm : Number.isFinite (minRib) ? Math.max (0, minRib - Math.max (dx, dz)) : null };
}

// Separate product footprints (4-connected nodes where a product surface was sensed), for comparing with pockets.
// Separate product footprints (4-connected nodes where a product surface was sensed) and the narrowest footprint
// extent among them, for comparing with pockets and for the per-product depth-to-width check.
export function FootprintIslands (field, grid)
{
    const { nx, nz, dx, dz } = grid, seen = new Uint8Array (nx * nz); let count = 0, narrowest = Infinity;
    for (let start = 0; start < seen.length; start++) {
        if (seen[start] || !Number.isFinite (field[start])) { continue; }
        count++; const stack = [start]; seen[start] = 1; let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
        while (stack.length) {
            const k = stack.pop (), i = k % nx, j = (k - i) / nx; i0 = Math.min (i0, i); i1 = Math.max (i1, i); j0 = Math.min (j0, j); j1 = Math.max (j1, j);
            for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) { if (a >= 0 && b >= 0 && a < nx && b < nz) { const q = b * nx + a; if (!seen[q] && Number.isFinite (field[q])) { seen[q] = 1; stack.push (q); } } }
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
