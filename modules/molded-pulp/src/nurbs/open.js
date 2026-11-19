// Open (clamped) cubic B-spline curves between two fixed end points: the sides of an outline split at its corners. The
// ends are interpolated exactly, so neighbouring sides share their corner point and the lofted sides meet in a shared
// corner edge.
import { Degree, ClampedKnots, FindSpan, BasisFuns } from './bspline.js';

export function OpenKnots (m) { return ClampedKnots (Array.from ({ length : m - Degree - 1 }, (_, i) => (i + 1) / (m - Degree)), 0, 1); }

export function OpenPoint (controls, knots, t)
{
    const s = FindSpan (knots, Math.min (1, Math.max (0, t))), N = BasisFuns (knots, s, Math.min (1, Math.max (0, t))), out = [0, 0];
    for (let r = 0; r <= Degree; r++) { const c = controls[s - Degree + r]; out[0] += N[r] * c[0]; out[1] += N[r] * c[1]; }
    return out;
}

// Chord-length parameters of an open polyline.
export function OpenParams (points)
{
    const lengths = [0]; for (let i = 1; i < points.length; i++) { lengths.push (lengths[i - 1] + Math.hypot (points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])); }
    const total = lengths[lengths.length - 1] || 1; return lengths.map (l => l / total);
}

// Least squares with the first and last controls pinned to the end points (m >= 4 controls).
export function FitOpen (points, params, m)
{
    const knots = OpenKnots (m), first = points[0], last = points[points.length - 1], inner = m - 2;
    const A = new Float64Array (inner * inner), bx = new Float64Array (inner), bz = new Float64Array (inner);
    points.forEach ((p, k) => {
        const t = params[k], s = FindSpan (knots, t), N = BasisFuns (knots, s, t);
        let rx = p[0], rz = p[1]; const idx = [];
        for (let r = 0; r <= Degree; r++) { const j = s - Degree + r; if (j === 0) { rx -= N[r] * first[0]; rz -= N[r] * first[1]; } else if (j === m - 1) { rx -= N[r] * last[0]; rz -= N[r] * last[1]; } else { idx.push ([j - 1, N[r]]); } }
        for (const [a, wa] of idx) { bx[a] += wa * rx; bz[a] += wa * rz; for (const [b, wb] of idx) { A[a * inner + b] += wa * wb; } }
    });
    for (let i = 0; i < inner; i++) { A[i * inner + i] += 1e-9; }
    const solve = b => { const M = A.slice (), x = b.slice (), n = inner; for (let i = 0; i < n; i++) { let piv = i; for (let r = i + 1; r < n; r++) { if (Math.abs (M[r * n + i]) > Math.abs (M[piv * n + i])) { piv = r; } } if (piv !== i) { for (let c = 0; c < n; c++) { const t = M[i * n + c]; M[i * n + c] = M[piv * n + c]; M[piv * n + c] = t; } const t = x[i]; x[i] = x[piv]; x[piv] = t; } for (let r = i + 1; r < n; r++) { const f = M[r * n + i] / M[i * n + i]; if (f) { for (let c = i; c < n; c++) { M[r * n + c] -= f * M[i * n + c]; } x[r] -= f * x[i]; } } } for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let c = i + 1; c < n; c++) { s -= M[i * n + c] * x[c]; } x[i] = s / M[i * n + i]; } return x; };
    const cx = solve (bx), cz = solve (bz);
    return [first.slice (), ...Array.from ({ length : inner }, (_, i) => [cx[i], cz[i]]), last.slice ()];
}

export function OpenDeviation (points, controls, params, samples = 6)
{
    const knots = OpenKnots (controls.length), count = controls.length * samples, curve = []; for (let i = 0; i <= count; i++) { curve.push (OpenPoint (controls, knots, i / count)); }
    const reach = 2 * samples + 2; let max = 0;
    points.forEach ((p, k) => {
        const c = Math.round (params[k] * count); let best = Infinity;
        for (let i = Math.max (0, c - reach); i < Math.min (count, c + reach); i++) {
            const a = curve[i], b = curve[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], len = ex * ex + ez * ez;
            const t = len > 0 ? Math.max (0, Math.min (1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / len)) : 0; best = Math.min (best, Math.hypot (a[0] + t * ex - p[0], a[1] + t * ez - p[1]));
        }
        if (best > max) { max = best; }
    });
    return max;
}

// Corners of a closed outline: points where the chord direction turns by at least minDeg over ±spanMm of arc length,
// kept at local maxima at least minGap points apart. Returns point indices in outline order.
export function OutlineCorners (points, { spanMm = 3, minDeg = 50, minGap = 10 } = {})
{
    const n = points.length, at = (i, d) => { let j = i, acc = 0; const step = Math.sign (d); for (let guard = 0; acc < Math.abs (d) && guard < n; guard++) { const k = (j + step + n) % n; acc += Math.hypot (points[k][0] - points[j][0], points[k][1] - points[j][1]); j = k; } return points[j]; };
    const turn = points.map ((p, i) => { const a = at (i, -spanMm), b = at (i, spanMm), u = [p[0] - a[0], p[1] - a[1]], v = [b[0] - p[0], b[1] - p[1]]; return Math.abs (Math.atan2 (u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1])) * 180 / Math.PI; });
    const corners = [];
    for (let i = 0; i < n; i++) {
        if (turn[i] < minDeg) { continue; }
        let peak = true; for (let d = -minGap; d <= minGap && peak; d++) { if (d && turn[(i + d + n) % n] > turn[i]) { peak = false; } }
        if (peak && !corners.some (j => Math.min (Math.abs (j - i), n - Math.abs (j - i)) < minGap)) { corners.push (i); }
    }
    return corners.sort ((a, b) => a - b);
}

// A closed outline with sharp corners (indices from OutlineCorners) rebuilt as straight sides joined by arcs of radius r:
// each side is the least-squares line through its middle 80%, neighbouring lines meet at an apex, and the arc is tangent
// to both. Returns { points (about every spacingMm), apexes, reach (largest apex-to-tangent-point distance) }.
export function RoundedOutline (points, corners, r, spacingMm = 0.5)
{
    const n = points.length, k = corners.length, lines = [];
    for (let i = 0; i < k; i++) {
        const from = corners[i], to = corners[(i + 1) % k], side = [];
        for (let j = from; ; j = (j + 1) % n) { side.push (points[j]); if (j === to) { break; } }
        const middle = side.slice (Math.floor (side.length * 0.1), Math.ceil (side.length * 0.9));
        const cx = middle.reduce ((s, p) => s + p[0], 0) / middle.length, cz = middle.reduce ((s, p) => s + p[1], 0) / middle.length;
        let xx = 0, xz = 0, zz = 0; for (const [x, z] of middle) { xx += (x - cx) ** 2; xz += (x - cx) * (z - cz); zz += (z - cz) ** 2; }
        const angle = 0.5 * Math.atan2 (2 * xz, xx - zz); let d = [Math.cos (angle), Math.sin (angle)];
        // Point the direction along the outline (from this side's start corner to its end corner).
        if ((side.at (-1)[0] - side[0][0]) * d[0] + (side.at (-1)[1] - side[0][1]) * d[1] < 0) { d = [-d[0], -d[1]]; }
        lines.push ({ c : [cx, cz], d });
    }
    const meet = (a, b) => { const det = a.d[0] * -b.d[1] + b.d[0] * a.d[1], t = ((b.c[0] - a.c[0]) * -b.d[1] + b.d[0] * (b.c[1] - a.c[1])) / det; return [a.c[0] + t * a.d[0], a.c[1] + t * a.d[1]]; };
    const apexes = lines.map ((line, i) => meet (lines[(i - 1 + k) % k], line));
    const out = [], arcs = []; let reach = 0;
    for (let i = 0; i < k; i++) {
        const a = lines[(i - 1 + k) % k].d, b = lines[i].d, Q = apexes[i], cross = a[0] * b[1] - a[1] * b[0], turn = Math.atan2 (Math.abs (cross), a[0] * b[0] + a[1] * b[1]);
        const t = r * Math.tan (turn / 2); reach = Math.max (reach, t);
        const tin = [Q[0] - a[0] * t, Q[1] - a[1] * t], side = Math.sign (cross) || 1, centre = [tin[0] - a[1] * r * side, tin[1] + a[0] * r * side];
        const start = Math.atan2 (tin[1] - centre[1], tin[0] - centre[0]), steps = Math.max (2, Math.ceil (r * turn / spacingMm));
        arcs.push (Array.from ({ length : steps + 1 }, (_, s) => { const g = start + side * turn * s / steps; return [centre[0] + r * Math.cos (g), centre[1] + r * Math.sin (g)]; }));
    }
    for (let i = 0; i < k; i++) {
        const arc = arcs[i], next = arcs[(i + 1) % k][0], end = arc.at (-1), length = Math.hypot (next[0] - end[0], next[1] - end[1]), steps = Math.max (1, Math.ceil (length / spacingMm));
        out.push (...arc);
        for (let s = 1; s < steps; s++) { out.push ([end[0] + (next[0] - end[0]) * s / steps, end[1] + (next[1] - end[1]) * s / steps]); }
    }
    return { points : out, apexes, reach };
}
