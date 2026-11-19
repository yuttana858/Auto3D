// B-spline core for the NURBS output. Non-rational, clamped, degree 3 by default. Kept independent of forming so the
// future solid modeling module can build on it (curves, surfaces, knot vectors, fitting, evaluation).
//
// Conventions: a clamped knot vector over [a, b] for degree p repeats a and b p + 1 times; a curve or surface direction
// with c control points has c + p + 1 knots. Greville abscissae ξᵢ = (tᵢ₊₁ + … + tᵢ₊ₚ) / p reproduce linear functions,
// so placing control x at ξᵢ makes x(u) = u exactly (graph surfaces over a rectangle are true NURBS surfaces).

export const Degree = 3;

export function ClampedKnots (interior, a, b, p = Degree)
{
    const knots = new Float64Array (interior.length + 2 * (p + 1));
    for (let i = 0; i <= p; i++) { knots[i] = a; knots[knots.length - 1 - i] = b; }
    interior.forEach ((k, i) => { knots[p + 1 + i] = k; });
    return knots;
}

export function Greville (knots, p = Degree)
{
    const count = knots.length - p - 1, out = new Float64Array (count);
    for (let i = 0; i < count; i++) { let s = 0; for (let k = 1; k <= p; k++) { s += knots[i + k]; } out[i] = s / p; }
    return out;
}

// The NURBS Book A2.1: span index with knots[span] <= u < knots[span + 1] (the last span is closed at the end).
export function FindSpan (knots, u, p = Degree)
{
    const n = knots.length - p - 2;
    if (u >= knots[n + 1]) { return n; }
    if (u <= knots[p]) { return p; }
    let low = p, high = n + 1, mid = (low + high) >> 1;
    while (u < knots[mid] || u >= knots[mid + 1]) { if (u < knots[mid]) { high = mid; } else { low = mid; } mid = (low + high) >> 1; }
    return mid;
}

// The NURBS Book A2.2: the p + 1 non-zero basis functions at u, written into out (length p + 1).
export function BasisFuns (knots, span, u, p = Degree, out = new Float64Array (p + 1))
{
    const left = new Float64Array (p + 1), right = new Float64Array (p + 1); out[0] = 1;
    for (let j = 1; j <= p; j++) {
        left[j] = u - knots[span + 1 - j]; right[j] = knots[span + j] - u; let saved = 0;
        for (let r = 0; r < j; r++) { const t = out[r] / (right[r + 1] + left[j - r]); out[r] = saved + right[r + 1] * t; saved = left[j - r] * t; }
        out[j] = saved;
    }
    return out;
}

// Point on a curve: points is a flat [x, y, z, …] array of control points.
export function CurvePoint (curve, u)
{
    const p = curve.degree, span = FindSpan (curve.knots, u, p), N = BasisFuns (curve.knots, span, u, p), out = [0, 0, 0];
    for (let r = 0; r <= p; r++) { const k = (span - p + r) * 3; out[0] += N[r] * curve.points[k]; out[1] += N[r] * curve.points[k + 1]; out[2] += N[r] * curve.points[k + 2]; }
    return out;
}

// Point on a tensor-product surface: points[(v * countU + u) * 3 + axis].
export function SurfacePoint (surface, u, v)
{
    const { degreeU : p, degreeV : q, knotsU, knotsV, countU, points } = surface;
    const su = FindSpan (knotsU, u, p), sv = FindSpan (knotsV, v, q), Nu = BasisFuns (knotsU, su, u, p), Nv = BasisFuns (knotsV, sv, v, q), out = [0, 0, 0];
    for (let b = 0; b <= q; b++) {
        for (let a = 0; a <= p; a++) { const w = Nu[a] * Nv[b], k = ((sv - q + b) * countU + su - p + a) * 3; out[0] += w * points[k]; out[1] += w * points[k + 1]; out[2] += w * points[k + 2]; }
    }
    return out;
}

// Basis values of every sample parameter along one axis, plus the factorized normal matrix for least squares.
export function AxisBasis (knots, samples, p = Degree)
{
    const count = knots.length - p - 1, spans = new Int32Array (samples.length), values = new Float64Array (samples.length * (p + 1)), N = new Float64Array (p + 1);
    samples.forEach ((u, k) => { const s = FindSpan (knots, u, p); spans[k] = s; BasisFuns (knots, s, u, p, N); values.set (N, k * (p + 1)); });
    // Banded normal matrix A = BᵀB (half bandwidth p), stored as band[i * (p + 1) + d] = A[i][i + d].
    const w = p + 1, band = new Float64Array (count * w);
    for (let k = 0; k < samples.length; k++) {
        const s = spans[k] - p;
        for (let a = 0; a <= p; a++) { for (let b = a; b <= p; b++) { band[(s + a) * w + (b - a)] += values[k * w + a] * values[k * w + b]; } }
    }
    // A light second-difference (stiffness) penalty keeps the system solvable when refinement leaves a span with no
    // sample between knots, without visibly smoothing spans that hold data.
    let largest = 0; for (let i = 0; i < count; i++) { largest = Math.max (largest, band[i * w]); }
    const lambda = largest * 1e-9;
    for (let i = 0; i + 2 < count; i++) {
        const c = [1, -2, 1];
        for (let a = 0; a < 3; a++) { for (let b = a; b < 3; b++) { if (b - a <= p) { band[(i + a) * w + (b - a)] += lambda * c[a] * c[b]; } } }
    }
    for (let i = 0; i < count; i++) { band[i * w] += largest * 1e-12; }
    return { knots, count, degree : p, spans, values, factor : BandCholesky (band, count, p) };
}

// In-place banded Cholesky A = RᵀR (R upper, same band layout).
function BandCholesky (band, count, p)
{
    const w = p + 1, R = band;
    for (let i = 0; i < count; i++) {
        let d = R[i * w]; for (let k = Math.max (0, i - p); k < i; k++) { const r = R[k * w + (i - k)]; d -= r * r; }
        if (!(d > 0)) { throw new Error ('B-spline fit is singular: a knot span has no samples.'); }
        const rii = Math.sqrt (d); R[i * w] = rii;
        for (let j = i + 1; j <= Math.min (count - 1, i + p); j++) {
            let s = R[i * w + (j - i)]; for (let k = Math.max (0, j - p); k < i; k++) { s -= R[k * w + (i - k)] * R[k * w + (j - k)]; }
            R[i * w + (j - i)] = s / rii;
        }
    }
    return R;
}

function BandSolve (R, count, p, rhs)
{
    const w = p + 1;
    for (let i = 0; i < count; i++) { let s = rhs[i]; for (let k = Math.max (0, i - p); k < i; k++) { s -= R[k * w + (i - k)] * rhs[k]; } rhs[i] = s / R[i * w]; }
    for (let i = count - 1; i >= 0; i--) { let s = rhs[i]; for (let j = i + 1; j <= Math.min (count - 1, i + p); j++) { s -= R[i * w + (j - i)] * rhs[j]; } rhs[i] = s / R[i * w]; }
    return rhs;
}

// Least-squares tensor-product fit of grid values (row-major, index j * nx + i) on separable bases: C = (BxᵀBx)⁻¹ Bxᵀ Z
// Bz (BzᵀBz)⁻¹, solved one axis at a time. Returns heights as control values, index b * mx + a.
export function FitGrid (values, bx, bz)
{
    const nx = bx.spans.length, nz = bz.spans.length, mx = bx.count, mz = bz.count, p = bx.degree, q = bz.degree;
    const T = new Float64Array (nz * mx), rhs = new Float64Array (Math.max (mx, mz));
    for (let j = 0; j < nz; j++) {
        rhs.fill (0, 0, mx);
        for (let i = 0; i < nx; i++) { const s = bx.spans[i] - p, z = values[j * nx + i]; for (let r = 0; r <= p; r++) { rhs[s + r] += bx.values[i * (p + 1) + r] * z; } }
        BandSolve (bx.factor, mx, p, rhs); T.set (rhs.subarray (0, mx), j * mx);
    }
    const C = new Float64Array (mz * mx), column = new Float64Array (mz);
    for (let a = 0; a < mx; a++) {
        column.fill (0);
        for (let j = 0; j < nz; j++) { const s = bz.spans[j] - q, t = T[j * mx + a]; for (let r = 0; r <= q; r++) { column[s + r] += bz.values[j * (q + 1) + r] * t; } }
        BandSolve (bz.factor, mz, q, column); for (let b = 0; b < mz; b++) { C[b * mx + a] = column[b]; }
    }
    return C;
}

// Evaluate control heights C (mz × mx) at every sample node of the two axes (index j * nx + i).
export function EvalGrid (C, bx, bz, out = new Float32Array (bx.spans.length * bz.spans.length))
{
    const nx = bx.spans.length, nz = bz.spans.length, mx = bx.count, p = bx.degree, q = bz.degree, row = new Float64Array (mx);
    for (let j = 0; j < nz; j++) {
        row.fill (0); const s = bz.spans[j] - q;
        for (let r = 0; r <= q; r++) { const w = bz.values[j * (q + 1) + r], base = (s + r) * mx; for (let a = 0; a < mx; a++) { row[a] += w * C[base + a]; } }
        for (let i = 0; i < nx; i++) { const t = bx.spans[i] - p; let v = 0; for (let r = 0; r <= p; r++) { v += bx.values[i * (p + 1) + r] * row[t + r]; } out[j * nx + i] = v; }
    }
    return out;
}

// Distinct knot spans [start, end] of a clamped knot vector.
export function KnotSpans (knots, p = Degree)
{
    const spans = []; for (let i = p; i < knots.length - p - 1; i++) { if (knots[i + 1] > knots[i]) { spans.push ([knots[i], knots[i + 1]]); } } return spans;
}

// Least-squares fit of several value columns along one axis: values[k * columns + c] at the axis samples (AxisBasis).
// Returns control values, index b * columns + c.
export function FitAxis (values, columns, basis)
{
    const p = basis.degree, count = basis.count, out = new Float64Array (count * columns), rhs = new Float64Array (count);
    for (let c = 0; c < columns; c++) {
        rhs.fill (0);
        for (let k = 0; k < basis.spans.length; k++) { const s = basis.spans[k] - p, v = values[k * columns + c]; for (let r = 0; r <= p; r++) { rhs[s + r] += basis.values[k * (p + 1) + r] * v; } }
        BandSolve (basis.factor, count, p, rhs); for (let b = 0; b < count; b++) { out[b * columns + c] = rhs[b]; }
    }
    return out;
}

// Boehm knot insertion (The NURBS Book A5.1, one knot): points is a flat array of control points of dimension dim.
// The curve is unchanged; returns the new knots and points.
export function InsertKnot (knots, points, dim, u, p = Degree)
{
    let k = p; while (k + 1 < knots.length - p - 1 && knots[k + 1] <= u) { k++; }
    const count = points.length / dim, outKnots = new Float64Array (knots.length + 1), out = new Float64Array ((count + 1) * dim);
    outKnots.set (knots.subarray (0, k + 1)); outKnots[k + 1] = u; outKnots.set (knots.subarray (k + 1), k + 2);
    for (let i = 0; i <= count; i++) {
        let a; if (i <= k - p) { a = 1; } else if (i >= k + 1) { a = 0; } else { const d = knots[i + p] - knots[i]; a = d > 0 ? (u - knots[i]) / d : 0; }
        for (let c = 0; c < dim; c++) {
            const here = i < count ? points[i * dim + c] : 0, before = i > 0 ? points[(i - 1) * dim + c] : 0;
            out[i * dim + c] = i <= k - p ? here : i >= k + 1 ? before : a * here + (1 - a) * before;
        }
    }
    return { knots : outKnots, points : out };
}

// A uniform periodic cubic with m controls over [0, 1) (control i + m = control i), rewritten as the same curve in clamped
// form: m + 3 controls, knots 0 ×4, 1/m … (m − 1)/m, 1 ×4. The first and last controls are both the curve point at 0 (the
// seam), so a closed wall's boundary curves are plain control rows. ring: flat [x, z, …] of m controls (dim per point).
export function ClampUniformPeriodic (ring, m, dim = 2)
{
    let knots = Float64Array.from ({ length : m + 2 * Degree + 1 }, (_, i) => (i - Degree) / m);
    let points = new Float64Array ((m + Degree) * dim); for (let i = 0; i < m + Degree; i++) { for (let c = 0; c < dim; c++) { points[i * dim + c] = ring[(i % m) * dim + c]; } }
    for (const u of [0, 0, 1, 1]) { ({ knots, points } = InsertKnot (knots, points, dim, u)); }
    // Knot 0 now has multiplicity 3 at indices 3..5 and knot 1 at m + 5..m + 7: keep controls 2..m + 4.
    const clamped = new Float64Array (m + 3 + 4); clamped.set (knots.subarray (3, m + 8), 1); clamped[0] = 0; clamped[clamped.length - 1] = 1;
    return { knots : clamped, points : points.slice (2 * dim, (m + 5) * dim) };
}
