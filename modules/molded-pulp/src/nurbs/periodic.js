// Closed (periodic) cubic B-spline curves fitted to closed outlines. Uniform knots over t ∈ [0, 1); m control points wrap
// (control i + m = control i). Fitting is least squares at chord-length parameters with a shared seam, so outlines at
// different heights get compatible parameterizations for lofting.

// Cubic uniform B-spline basis on a unit span: weights of controls (s − 1 … s + 2) at local parameter f ∈ [0, 1).
export function UniformCubic (f)
{
    const g = 1 - f;
    return [g * g * g / 6, (3 * f * f * f - 6 * f * f + 4) / 6, (-3 * f * f * f + 3 * f * f + 3 * f + 1) / 6, f * f * f / 6];
}
export function PeriodicPoint (controls, t)
{
    const m = controls.length, x = ((t % 1) + 1) % 1 * m, s = Math.floor (x), w = UniformCubic (x - s), out = [0, 0];
    for (let r = 0; r < 4; r++) { const c = controls[((s - 1 + r) % m + m) % m]; out[0] += w[r] * c[0]; out[1] += w[r] * c[1]; }
    return out;
}

// Reorder a closed outline to run counter-clockwise (in x, z) starting at the point with the largest angle-zero
// projection from the centre (the +x seam), and return chord-length parameters in [0, 1).
export function SeamOrder (points, centre)
{
    // Drop repeated points (a contour through a grid node yields the same point from two cell edges) and the closing
    // duplicate, so chord-length parameters strictly increase.
    let pts = points.filter ((p, i) => i === 0 || Math.hypot (p[0] - points[i - 1][0], p[1] - points[i - 1][1]) > 1e-9);
    if (pts.length > 1 && Math.hypot (pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 1e-9) { pts.pop (); }
    let area = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) { pts.reverse (); }
    // Seam: the outline point closest to the ray from the centre along +x.
    let best = 0, bestScore = -Infinity;
    pts.forEach ((p, i) => { const dx = p[0] - centre[0], dz = p[1] - centre[1], score = dx / Math.hypot (dx, dz || 1e-12) - Math.abs (dz) * 1e-9; if (score > bestScore) { bestScore = score; best = i; } });
    pts = [...pts.slice (best), ...pts.slice (0, best)];
    const lengths = [0]; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; lengths.push (lengths[i - 1] + Math.hypot (b[0] - a[0], b[1] - a[1])); }
    const total = lengths[pts.length];
    return { points : pts, params : lengths.slice (0, pts.length).map (l => l / total), length : total };
}

// Least-squares periodic cubic fit with m controls (dense normal equations; m stays in the low hundreds).
export function FitPeriodic (points, params, m)
{
    const A = new Float64Array (m * m), bx = new Float64Array (m), bz = new Float64Array (m);
    points.forEach ((p, k) => {
        const x = params[k] * m, s = Math.floor (x), w = UniformCubic (x - s), idx = [0, 1, 2, 3].map (r => ((s - 1 + r) % m + m) % m);
        for (let a = 0; a < 4; a++) { bx[idx[a]] += w[a] * p[0]; bz[idx[a]] += w[a] * p[1]; for (let b = 0; b < 4; b++) { A[idx[a] * m + idx[b]] += w[a] * w[b]; } }
    });
    for (let i = 0; i < m; i++) { A[i * m + i] += 1e-9; }
    const L = Cholesky (A, m), cx = Solve (L, m, bx), cz = Solve (L, m, bz);
    return Array.from ({ length : m }, (_, i) => [cx[i], cz[i]]);
}
function Cholesky (A, m)
{
    const L = new Float64Array (m * m);
    for (let i = 0; i < m; i++) {
        for (let j = 0; j <= i; j++) {
            let s = A[i * m + j]; for (let k = 0; k < j; k++) { s -= L[i * m + k] * L[j * m + k]; }
            if (i === j) { if (!(s > 0)) { throw new Error ('Outline fit is singular: too few outline points for the control count.'); } L[i * m + i] = Math.sqrt (s); } else { L[i * m + j] = s / L[j * m + j]; }
        }
    }
    return L;
}
function Solve (L, m, b)
{
    const y = new Float64Array (m), x = new Float64Array (m);
    for (let i = 0; i < m; i++) { let s = b[i]; for (let k = 0; k < i; k++) { s -= L[i * m + k] * y[k]; } y[i] = s / L[i * m + i]; }
    for (let i = m - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < m; k++) { s -= L[k * m + i] * x[k]; } x[i] = s / L[i * m + i]; }
    return x;
}

// Largest distance from the outline points to the fitted curve, sampled densely (point-to-polyline of the curve).
export function OutlineDeviation (points, controls, samples = 8)
{
    const m = controls.length, curve = []; for (let i = 0; i < m * samples; i++) { curve.push (PeriodicPoint (controls, i / (m * samples))); }
    let max = 0;
    for (const p of points) {
        let best = Infinity;
        for (let i = 0; i < curve.length; i++) {
            const a = curve[i], b = curve[(i + 1) % curve.length], ex = b[0] - a[0], ez = b[1] - a[1], len = ex * ex + ez * ez;
            const t = len > 0 ? Math.max (0, Math.min (1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ez) / len)) : 0, d = Math.hypot (a[0] + t * ex - p[0], a[1] + t * ez - p[1]);
            if (d < best) { best = d; }
        }
        if (best > max) { max = best; }
    }
    return max;
}
