// Heightfield operators for forming, written to stay fast at multi-million-node grids (they run in a worker for the
// fine and ultra detail tiers). All fields are Float32Array, row-major, index j * n + i, X along i and Z along j.
import { PulpDetail } from './state.js';

// Square node grid of 2^k + 1 per side over the sheet (required by the adaptive mesher). Spacing may differ in X and Z.
export function DetailGrid (rect, draft, detailName = draft.detail || 'standard')
{
    const tier = PulpDetail[detailName] || PulpDetail.standard;
    const cell = draft.resolutionMm ?? (detailName === 'standard' ? Math.max (0.5, Math.min (tier.cellMm, draft.thicknessMm)) : tier.cellMm);
    const wanted = Math.ceil (Math.max (rect.lengthMm, rect.widthMm) / cell);
    let side = 3; while (side - 1 < wanted && side < tier.maxSide) { side = (side - 1) * 2 + 1; }
    const dx = rect.lengthMm / (side - 1), dz = rect.widthMm / (side - 1);
    return { x0 : rect.x0, z0 : rect.z0, dx, dz, nx : side, nz : side, n : side, cell : Math.max (dx, dz), detail : detailName, toleranceMm : tier.toleranceMm };
}

// Indexed binary min-heap over node ids keyed by a Float32Array (decrease-key in place).
class NodeHeap
{
    constructor (keys) { this.keys = keys; this.heap = new Int32Array (keys.length); this.pos = new Int32Array (keys.length).fill (-1); this.size = 0; }
    Less (a, b) { return this.keys[this.heap[a]] < this.keys[this.heap[b]]; }
    Swap (a, b) { const h = this.heap, t = h[a]; h[a] = h[b]; h[b] = t; this.pos[h[a]] = a; this.pos[h[b]] = b; }
    Up (i) { while (i > 0) { const p = (i - 1) >> 1; if (!this.Less (i, p)) { break; } this.Swap (i, p); i = p; } }
    Down (i)
    {
        for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < this.size && this.Less (l, m)) { m = l; } if (r < this.size && this.Less (r, m)) { m = r; } if (m === i) { return; } this.Swap (i, m); i = m; }
    }
    Push (id) { this.heap[this.size] = id; this.pos[id] = this.size; this.size++; this.Up (this.size - 1); }
    Pop () { const top = this.heap[0]; this.size--; if (this.size > 0) { this.heap[0] = this.heap[this.size]; this.pos[this.heap[0]] = 0; this.Down (0); } this.pos[top] = -2; return top; }
    Decrease (id) { this.Up (this.pos[id]); }
}

// Slope limit |∇H| <= slope as the viscosity solution of the eikonal equation: H(p) = min_q H0(q) + slope · |p − q|,
// solved by fast marching with every node seeded at its own value. First-order upwind updates keep the result close to
// Euclidean in all directions, so drafted pocket walls stay round instead of becoming octagons.
export function SlopeLimit (values, grid, slope)
{
    if (!Number.isFinite (slope)) { return values; }
    const { nx, nz, dx, dz } = grid, n = nx * nz, out = Float32Array.from (values), heap = new NodeHeap (out), done = new Uint8Array (n);
    for (let k = 0; k < n; k++) { heap.Push (k); }
    const sx = slope * dx, sz = slope * dz, ax = 1 / (dx * dx), az = 1 / (dz * dz), s2 = slope * slope;
    const along = (i, j, di, dj) => {
        let best = Infinity;
        for (const s of [-1, 1]) { const a = i + di * s, b = j + dj * s; if (a >= 0 && b >= 0 && a < nx && b < nz) { const q = b * nx + a; if (done[q] && out[q] < best) { best = out[q]; } } }
        return best;
    };
    while (heap.size) {
        const k = heap.Pop (); done[k] = 1; const i = k % nx, j = (k - i) / nx;
        for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
            if (a < 0 || b < 0 || a >= nx || b >= nz) { continue; }
            const q = b * nx + a; if (done[q]) { continue; }
            const tx = along (a, b, 1, 0), tz = along (a, b, 0, 1); let t;
            if (Number.isFinite (tx) && Number.isFinite (tz)) {
                // Solve ((t − tx)/dx)² + ((t − tz)/dz)² = slope² for the larger root; fall back to one-sided updates.
                const A = ax + az, B = -2 * (tx * ax + tz * az), C = tx * tx * ax + tz * tz * az - s2, disc = B * B - 4 * A * C;
                t = disc >= 0 ? (-B + Math.sqrt (disc)) / (2 * A) : Math.min (tx + sx, tz + sz);
                if (t < Math.max (tx, tz)) { t = Math.min (tx + sx, tz + sz); }
            } else { t = Number.isFinite (tx) ? tx + sx : tz + sz; }
            if (t < out[q]) { out[q] = t; heap.Decrease (q); }
        }
    }
    return out;
}

// Running minimum over a window of ±h along one line (van Herk / Gil-Werman, O(1) per sample).
function LineMin (line, length, h, scratch)
{
    if (h <= 0) { return; }
    const w = 2 * h + 1, g = scratch.g, f = scratch.f;
    for (let s = 0; s < length; s++) { g[s] = s % w === 0 ? line[s] : Math.min (g[s - 1], line[s]); }
    for (let s = length - 1; s >= 0; s--) { f[s] = s === length - 1 || (s + 1) % w === 0 ? line[s] : Math.min (f[s + 1], line[s]); }
    for (let s = 0; s < length; s++) { const lo = Math.max (0, s - h), hi = Math.min (length - 1, s + h); line[s] = Math.min (f[lo], g[hi]); }
}

// Exact disc erosion for radii of a few cells (where an octagon of whole-cell segments would be too coarse).
function DiscMin (values, grid, radius)
{
    const { nx, nz, dx, dz } = grid, offsets = [], ri = Math.floor (radius / dx), rj = Math.floor (radius / dz), out = new Float32Array (values.length);
    for (let b = -rj; b <= rj; b++) { for (let a = -ri; a <= ri; a++) { if (Math.hypot (a * dx, b * dz) <= radius + 1e-9) { offsets.push (a, b); } } }
    for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
            let m = values[j * nx + i];
            for (let o = 0; o < offsets.length; o += 2) { const a = i + offsets[o], b = j + offsets[o + 1]; if (a >= 0 && b >= 0 && a < nx && b < nz) { const v = values[b * nx + a]; if (v < m) { m = v; } } }
            out[j * nx + i] = m;
        }
    }
    return out;
}

// Erosion by a regular octagon of across-flats width 2·radius: the Minkowski sum of four line segments (0°, 90°, 45°,
// 135°), each a 1-D running minimum. Within ~8% of a disc and linear in the node count.
export function MinFilterOctagon (values, grid, radius)
{
    if (radius <= 0) { return values; }
    if (radius / Math.min (grid.dx, grid.dz) <= 4) { return DiscMin (values, grid, radius); }
    const { nx, nz, dx, dz } = grid, out = Float32Array.from (values), segment = 2 * radius / (1 + Math.SQRT2);
    const longest = Math.max (nx, nz), line = new Float32Array (longest), ids = new Int32Array (longest), scratch = { g : new Float32Array (longest), f : new Float32Array (longest) };
    const pass = (di, dj, step) => {
        const h = Math.round (segment / 2 / step); if (h < 1) { return; }
        const starts = [];
        if (dj === 0) { for (let j = 0; j < nz; j++) { starts.push ([0, j]); } }
        else if (di === 0) { for (let i = 0; i < nx; i++) { starts.push ([i, 0]); } }
        else { for (let i = 0; i < nx; i++) { starts.push ([di > 0 ? i : i, 0]); } for (let j = 1; j < nz; j++) { starts.push ([di > 0 ? 0 : nx - 1, j]); } }
        for (const [si, sj] of starts) {
            let length = 0;
            for (let i = si, j = sj; i >= 0 && j >= 0 && i < nx && j < nz; i += di, j += dj) { ids[length] = j * nx + i; line[length] = out[ids[length]]; length++; }
            LineMin (line, length, h, scratch);
            for (let s = 0; s < length; s++) { out[ids[s]] = line[s]; }
        }
    };
    pass (1, 0, dx); pass (0, 1, dz); pass (1, 1, Math.hypot (dx, dz)); pass (-1, 1, Math.hypot (dx, dz));
    return out;
}

// Exact ball erosion on a (possibly coarser) grid: L(p) = min over |q − p| <= t of H(q) − sqrt(t² − |q − p|²).
function BallErosion (top, grid, thickness)
{
    const { nx, nz, dx, dz } = grid, ri = Math.floor (thickness / dx), rj = Math.floor (thickness / dz), offsets = [];
    for (let b = -rj; b <= rj; b++) { for (let a = -ri; a <= ri; a++) { const d = Math.hypot (a * dx, b * dz); if (d <= thickness) { offsets.push (a, b, Math.sqrt (thickness * thickness - d * d)); } } }
    const out = new Float32Array (top.length);
    for (let j = 0; j < nz; j++) {
        for (let i = 0; i < nx; i++) {
            let m = top[j * nx + i] - thickness;
            for (let o = 0; o < offsets.length; o += 3) { const a = i + offsets[o], b = j + offsets[o + 1]; if (a >= 0 && b >= 0 && a < nx && b < nz) { const v = top[b * nx + a] - offsets[o + 2]; if (v < m) { m = v; } } }
            out[j * nx + i] = m;
        }
    }
    return out;
}

// Outer (tool-side) surface: the inner surface offset by the wall thickness along its normal. On fine grids the exact
// ball erosion runs on a grid about thickness/3 per cell (min-pooled, so it is conservative) and is upsampled
// bilinearly; the result is never closer than the full thickness vertically.
export function OffsetDown (top, grid, thickness)
{
    const { nx, nz, dx, dz } = grid, factor = Math.max (1, Math.floor (thickness / 3 / Math.max (dx, dz)));
    if (factor === 1) { return BallErosion (top, grid, thickness); }
    const cx = Math.ceil ((nx - 1) / factor) + 1, cz = Math.ceil ((nz - 1) / factor) + 1, coarse = new Float32Array (cx * cz).fill (Infinity);
    for (let j = 0; j < nz; j++) { const cj = Math.round (j / factor); for (let i = 0; i < nx; i++) { const ci = Math.round (i / factor), k = cj * cx + ci; if (top[j * nx + i] < coarse[k]) { coarse[k] = top[j * nx + i]; } } }
    const low = BallErosion (coarse, { nx : cx, nz : cz, dx : dx * factor, dz : dz * factor }, thickness), out = new Float32Array (nx * nz);
    for (let j = 0; j < nz; j++) {
        const fj = Math.min (cz - 1.000001, j / factor), j0 = Math.floor (fj), tj = fj - j0;
        for (let i = 0; i < nx; i++) {
            const fi = Math.min (cx - 1.000001, i / factor), i0 = Math.floor (fi), ti = fi - i0, k = j0 * cx + i0;
            const v = (low[k] * (1 - ti) + low[k + 1] * ti) * (1 - tj) + (low[k + cx] * (1 - ti) + low[k + cx + 1] * ti) * tj;
            out[j * nx + i] = Math.min (v, top[j * nx + i] - thickness);
        }
    }
    return out;
}
