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
