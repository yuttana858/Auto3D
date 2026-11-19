// Raised pocket floors (a can's domed or recessed base): one smooth closed band from the pocket wall's foot to a small
// flat cap, fitted to the review surface along rays towards the pocket's seed.
//
//   wall foot ──(tangent to the wall)── groove, dome flank … ──(level)── cap ring ── flat cap (plane)
//
// The band shares the wall's U knots and its first control row is the wall's foot row, so the edge is exact. Its second
// row continues the wall's height derivative (one constant scale: tangent to the wall along the whole edge). Its last
// two rows are level at the cap height, so it meets the flat cap tangentially. The rows in between are least-squares
// fits of the review profile on each control column's ray. The cap is as wide as the review stays within half the
// tolerance of level around the seed.
import { Degree, ClampedKnots, Greville, FindSpan, BasisFuns, SurfacePoint, CurvePoint, ClampUniformPeriodic } from './bspline.js';
import { PeriodicPoint } from './periodic.js';

// Bilinear review height at (x, z), clamped to the grid.
export function ReviewHeight (grid, H)
{
    return (x, z) => {
        const fx = Math.min (grid.nx - 1.000001, Math.max (0, (x - grid.x0) / grid.dx)), fz = Math.min (grid.nz - 1.000001, Math.max (0, (z - grid.z0) / grid.dz));
        const i = Math.floor (fx), j = Math.floor (fz), a = fx - i, b = fz - j, at = (ii, jj) => H[jj * grid.nx + ii];
        return (1 - a) * (1 - b) * at (i, j) + a * (1 - b) * at (i + 1, j) + (1 - a) * b * at (i, j + 1) + a * b * at (i + 1, j + 1);
    };
}

// Radius around the seed within which the review stays within `flat` of its height at the seed.
function CapRadius (height, seed, maxRadius, flat)
{
    const centre = height (seed[0], seed[1]); let radius = 0;
    for (let rho = 0.25; rho <= maxRadius; rho += 0.25) {
        let level = true; for (let k = 0; k < 48 && level; k++) { const g = 2 * Math.PI * k / 48; if (Math.abs (height (seed[0] + rho * Math.cos (g), seed[1] + rho * Math.sin (g)) - centre) > flat) { level = false; } }
        if (!level) { break; } radius = rho;
    }
    let sum = 0, n = 0;
    for (let rho = 0; rho <= radius; rho += 0.25) { for (let k = 0; k < 24; k++) { const g = 2 * Math.PI * k / 24; sum += height (seed[0] + rho * Math.cos (g), seed[1] + rho * Math.sin (g)); n++; } }
    return { radius, y : n ? sum / n : centre };
}

// Solve the small symmetric system A x = b (dense Cholesky; A is positive definite).
function SolveSPD (A, b, n)
{
    const L = new Float64Array (n * n);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let s = A[i * n + j]; for (let k = 0; k < j; k++) { s -= L[i * n + k] * L[j * n + k]; }
            if (i === j) { if (!(s > 0)) { throw new Error ('Raised floor fit is singular.'); } L[i * n + i] = Math.sqrt (s); } else { L[i * n + j] = s / L[j * n + j]; }
        }
    }
    const y = new Float64Array (n); for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) { s -= L[i * n + k] * y[k]; } y[i] = s / L[i * n + i]; }
    const x = new Float64Array (n); for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) { s -= L[k * n + i] * x[k]; } x[i] = s / L[i * n + i]; }
    return x;
}

// wallSurface: a closed pocket wall (clamped, y = v, foot at its lowest row). distance (x, y, z): 3D distance to the review
// surface. Returns { surface (rows from the cap ring to the wall foot), capY, capRadius, maxDistanceMm, withinTolerance }.
// periodic: the wall's periodic controls (LoftPocketWalls). The band is fitted on them, one column per periodic control,
// and every row is clamped exactly as the wall's rows were (ClampUniformPeriodic): the band is then as smooth across the
// seam as the wall. Fitting the clamped columns independently left it only position-continuous there, and the offset
// halves parted by 0.02 mm at the seam.
export function RaisedFloor (wallSurface, seed, grid, H, { toleranceMm, distance, periodic, maxRows = 32 })
{
    const height = ReviewHeight (grid, H), U = periodic.m, K = wallSurface.knotsV, scale = Degree / (K[Degree + 1] - K[Degree]);
    const ringAt = b => Array.from ({ length : U }, (_, i) => [periodic.controls[(b * U + i) * 2], periodic.heights[b], periodic.controls[(b * U + i) * 2 + 1]]);
    const feet = ringAt (0), next = ringAt (1), lift = feet.map ((p, a) => [0, 1, 2].map (c => scale * (next[a][c] - p[c])));
    // Rays start on the wall's foot curve (where each periodic control has its peak), not at the controls, which sit
    // outside the curve.
    const footXZ = feet.map (p => [p[0], p[2]]), origins = feet.map ((p, i) => { const [x, z] = PeriodicPoint (footXZ, i / U); return [x, p[1], z]; });
    const reach = Math.min (...origins.map (p => Math.hypot (seed[0] - p[0], seed[1] - p[2])));
    const cap = CapRadius (height, seed, 0.6 * reach, 0.5 * toleranceMm);
    if (cap.radius < 1) { return { withinTolerance : false, reason : 'no level area at the top of the raised floor for a cap', maxDistanceMm : Infinity }; }
    // Review profile on each column's ray: (point on the ray, height), with chord-length parameters.
    const profiles = origins.map (p => {
        const dx = seed[0] - p[0], dz = seed[1] - p[2], length = Math.hypot (dx, dz), g = [dx / length, dz / length], span = length - cap.radius, count = Math.max (40, Math.ceil (span / 0.25));
        const points = Array.from ({ length : count + 1 }, (_, j) => { const s = span * j / count, x = p[0] + s * g[0], z = p[2] + s * g[1]; return [x, j === 0 ? p[1] : j === count ? cap.y : height (x, z), z]; });
        const t = [0]; for (let j = 1; j < points.length; j++) { t.push (t[j - 1] + Math.hypot (points[j][0] - points[j - 1][0], points[j][1] - points[j - 1][1], points[j][2] - points[j - 1][2])); }
        return { g, span, points, t : t.map (v => v / t.at (-1)) };
    });
    // Rows 2 … N − 3 sit at their Greville fractions of each column's ray (rows correspond around the pocket, so the
    // surface does not twist between columns) and only their heights are fitted: the review is a height over the plan,
    // so along a ray it is a function of the radial distance. Row N − 2 sits at its Greville fraction too, level with
    // the cap ring.
    const build = (N, alpha) => {
        const knots = ClampedKnots (Array.from ({ length : N - Degree - 1 }, (_, i) => (i + 1) / (N - Degree)), 0, 1), xi = Greville (knots), points = new Float64Array (U * N * 3), N0 = new Float64Array (Degree + 1);
        let worst = 0;
        profiles.forEach ((profile, a) => {
            // A closed curve passes inside its controls (about 2% at 18 controls), so each row's controls sit outside the ray
            // by the same ratio as the wall's foot controls sit outside its foot curve: the surface then lies on the ray.
            const foot = feet[a], origin = origins[a], d = lift[a], g = profile.g, span = profile.span;
            const ratio = Math.hypot (foot[0] - seed[0], foot[2] - seed[1]) / Math.hypot (origin[0] - seed[0], origin[2] - seed[1]);
            const along = f => { const x = origin[0] + f * span * g[0], z = origin[2] + f * span * g[1]; return [seed[0] + (x - seed[0]) * ratio, seed[1] + (z - seed[1]) * ratio]; };
            const fraction = (x, z) => { const ex = seed[0] - cap.radius * g[0] * ratio, ez = seed[1] - cap.radius * g[1] * ratio, ox = foot[0], oz = foot[2], L2 = (ex - ox) ** 2 + (ez - oz) ** 2; return ((x - ox) * (ex - ox) + (z - oz) * (ez - oz)) / L2; };
            const rowsXYZ = Array.from ({ length : N }, (_, b) => { const [x, z] = along (xi[b]); return [x, NaN, z]; });
            rowsXYZ[0] = foot.slice (); rowsXYZ[1] = [0, 1, 2].map (c => foot[c] - alpha * d[c]);
            rowsXYZ[N - 2][1] = cap.y; rowsXYZ[N - 1] = [...along (1)].flatMap ((v, i) => i === 0 ? [v, cap.y] : [v]);
            // Radial position of the column curve at v (x, z are fixed by the rows): sample densely, then invert.
            const column = { degree : Degree, knots, points : Float64Array.from (rowsXYZ.flatMap (p => [p[0], 0, p[2]])) }, dense = 400, radial = [];
            for (let q = 0; q <= dense; q++) { const c = CurvePoint (column, q / dense); radial.push (fraction (c[0], c[2])); }
            const paramAt = f => { let q = 0; while (q < dense && radial[q + 1] < f) { q++; } const r0 = radial[q], r1 = radial[Math.min (dense, q + 1)]; return Math.min (1, (q + (r1 > r0 ? Math.max (0, Math.min (1, (f - r0) / (r1 - r0))) : 0)) / dense); };
            const freeRows = []; for (let b = 2; b <= N - 3; b++) { freeRows.push (b); }
            const free = freeRows.length, A = new Float64Array (free * free), B = new Float64Array (free);
            const samples = profile.points.map (p => { const f = ((p[0] - origin[0]) * g[0] + (p[2] - origin[2]) * g[1]) / span, t = paramAt (f), span0 = FindSpan (knots, t); BasisFuns (knots, span0, t, Degree, N0); return { span : span0, w : Float64Array.from (N0), y : p[1] }; });
            for (const { span : sp, w, y } of samples) {
                let residual = y; for (let r = 0; r <= Degree; r++) { const b = sp - Degree + r; if (b < 2 || b > N - 3) { residual -= w[r] * rowsXYZ[b][1]; } }
                for (let r = 0; r <= Degree; r++) { const i = sp - Degree + r - 2; if (i < 0 || i >= free) { continue; } B[i] += w[r] * residual; for (let q = 0; q <= Degree; q++) { const k = sp - Degree + q - 2; if (k >= 0 && k < free) { A[i * free + k] += w[r] * w[q]; } } }
            }
            // A light second-difference penalty keeps rows that no sample reaches well defined.
            for (let i = 0; i + 2 < free; i++) { const c = [1, -2, 1]; for (let x = 0; x < 3; x++) { for (let y = 0; y < 3; y++) { A[(i + x) * free + i + y] += 1e-6 * c[x] * c[y]; } } }
            for (let i = 0; i < free; i++) { A[i * free + i] += 1e-9; }
            const heights = free ? SolveSPD (A, B, free) : [];
            freeRows.forEach ((b, i) => { rowsXYZ[b][1] = heights[i]; });
            rowsXYZ.forEach ((p, b) => { const k = (b * U + a) * 3; points[k] = p[0]; points[k + 1] = p[1]; points[k + 2] = p[2]; });
            for (const { span : sp, w, y } of samples) { let v = 0; for (let r = 0; r <= Degree; r++) { v += w[r] * rowsXYZ[sp - Degree + r][1]; } worst = Math.max (worst, Math.abs (v - y)); }
        });
        // Clamp every periodic row as the wall's rows were; the foot row is then the wall's (copied, so the shared edge is
        // bitwise equal), the cap ring level at the cap height, and the seam columns equal.
        const W = wallSurface.countU, clamped = new Float64Array (W * N * 3);
        for (let b = 0; b < N; b++) {
            const row = ClampUniformPeriodic (points.subarray (b * U * 3, (b + 1) * U * 3), U, 3).points;
            for (let a = 0; a < W; a++) { for (let c = 0; c < 3; c++) { clamped[(b * W + a) * 3 + c] = b === 0 ? wallSurface.points[a * 3 + c] : a === W - 1 ? row[c] : row[a * 3 + c]; } if (b === N - 1) { clamped[(b * W + a) * 3 + 1] = cap.y; } }
        }
        return { surface : { degreeU : wallSurface.degreeU, degreeV : Degree, knotsU : wallSurface.knotsU, knotsV : knots, countU : W, countV : N, points : clamped, closedU : true }, fit : worst };
    };
    // The first row (v = 0: rows run foot → cap until they are reversed below) is the wall's foot edge, checked with the
    // wall: skipped.
    const measure = sf => {
        let max = 0;
        for (let q = 0; q < 2 * sf.countU; q++) { for (let r = 1; r <= 3 * sf.countV; r++) { const p = SurfacePoint (sf, sf.knotsU[0] + (sf.knotsU.at (-1) - sf.knotsU[0]) * q / (2 * sf.countU), r / (3 * sf.countV)); max = Math.max (max, distance (p[0], p[1], p[2])); } }
        return max;
    };
    const base = profiles.reduce ((s, p) => s + p.span, 0) / profiles.length;
    let best = null;
    for (let N = 6; N <= maxRows; N = Math.min (maxRows, Math.ceil (N * 1.4))) {
        let pick = null;
        for (const alpha of [0.002, 0.005, 0.02, 0.05]) { const b = build (N, alpha * base); if (!pick || b.fit < pick.fit) { pick = b; } }
        const max = measure (pick.surface);
        if (globalThis.process?.env?.FLOOR_DEBUG) { console.log ('floor N', N, 'fit', pick.fit.toFixed (3), 'max', max.toFixed (3)); }
        if (!best || max < best.maxDistanceMm) { best = { ...pick, maxDistanceMm : max }; }
        if (max <= toleranceMm || N === maxRows) { break; }
    }
    // Rows from the cap ring (v = 0) to the wall foot (v = 1), so the band stacks below the wall.
    const sf = best.surface, W = sf.countU, reversed = new Float64Array (sf.points.length);
    for (let b = 0; b < sf.countV; b++) { reversed.set (sf.points.subarray (b * W * 3, (b + 1) * W * 3), (sf.countV - 1 - b) * W * 3); }
    const knotsV = Float64Array.from (sf.knotsV, (_, i) => 1 - sf.knotsV[sf.knotsV.length - 1 - i]);
    return { surface : { ...sf, points : reversed, knotsV }, capY : cap.y, capRadius : cap.radius, rows : sf.countV, maxDistanceMm : best.maxDistanceMm, withinTolerance : best.maxDistanceMm <= toleranceMm };
}
