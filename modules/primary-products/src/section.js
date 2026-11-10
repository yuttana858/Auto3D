// Bottle body cross-sections in millimeters, in the X/Z plane. Outlines start on +X and run counter-clockwise towards +Z
// (the front), matching the revolved round profile, and are sampled uniformly by arc length so labels keep their
// physical size around oval and rounded-rectangle bodies.

export function BottleSectionOf (draft)
{
    const section = draft.bottleSection;
    if (!section) { return { shape : 'round', widthMm : draft.diameterMm, depthMm : draft.diameterMm, cornerRadiusMm : draft.diameterMm / 2 }; }
    return { shape : section.shape, widthMm : draft.diameterMm, depthMm : section.depthMm, cornerRadiusMm : section.shape === 'rectangle' ? section.cornerRadiusMm : 0 };
}

// Exact perimeter for round and rounded-rectangle sections; Ramanujan's approximation for ellipses (relative error < 1e-9
// for the supported aspect ratios).
export function SectionPerimeter (section)
{
    const a = section.widthMm / 2, b = section.depthMm / 2;
    if (section.shape === 'rectangle') { const r = section.cornerRadiusMm; return 4 * (a - r) + 4 * (b - r) + 2 * Math.PI * r; }
    if (section.shape === 'round') { return Math.PI * section.widthMm; }
    const h = ((a - b) / (a + b)) ** 2; return Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt (4 - 3 * h)));
}

function RectanglePoint (a, b, r, s)
{
    const segments = [
        { length : b - r, at : t => [a, t, 1, 0] },
        { length : Math.PI * r / 2, at : t => { const q = t / r; return [a - r + r * Math.cos (q), b - r + r * Math.sin (q), Math.cos (q), Math.sin (q)]; } },
        { length : 2 * (a - r), at : t => [a - r - t, b, 0, 1] },
        { length : Math.PI * r / 2, at : t => { const q = Math.PI / 2 + t / r; return [-a + r + r * Math.cos (q), b - r + r * Math.sin (q), Math.cos (q), Math.sin (q)]; } },
        { length : 2 * (b - r), at : t => [-a, b - r - t, -1, 0] },
        { length : Math.PI * r / 2, at : t => { const q = Math.PI + t / r; return [-a + r + r * Math.cos (q), -b + r + r * Math.sin (q), Math.cos (q), Math.sin (q)]; } },
        { length : 2 * (a - r), at : t => [-a + r + t, -b, 0, -1] },
        { length : Math.PI * r / 2, at : t => { const q = Math.PI * 1.5 + t / r; return [a - r + r * Math.cos (q), -b + r + r * Math.sin (q), Math.cos (q), Math.sin (q)]; } },
        { length : b - r, at : t => [a, -b + r + t, 1, 0] }
    ];
    for (const segment of segments) { if (s <= segment.length || segment === segments.at (-1)) { return segment.at (Math.min (s, segment.length)); } s -= segment.length; }
    return null;
}

// Returns `count` outline points { x, z, nx, nz } evenly spaced by arc length, plus the perimeter.
export function SectionOutline (section, count)
{
    const perimeter = SectionPerimeter (section), a = section.widthMm / 2, b = section.depthMm / 2, points = [];
    if (section.shape === 'rectangle') {
        for (let i = 0; i < count; i++) { const [x, z, nx, nz] = RectanglePoint (a, b, section.cornerRadiusMm, perimeter * i / count); points.push ({ x, z, nx, nz }); }
        return { points, perimeter };
    }
    // Ellipse (round is the a === b case): invert arc length numerically from a dense table.
    const dense = 4096, lengths = [0];
    const at = q => [a * Math.cos (q), b * Math.sin (q)];
    for (let i = 1; i <= dense; i++) { const p = at (2 * Math.PI * (i - 1) / dense), q = at (2 * Math.PI * i / dense); lengths.push (lengths[i - 1] + Math.hypot (q[0] - p[0], q[1] - p[1])); }
    const total = lengths[dense]; let j = 0;
    for (let i = 0; i < count; i++) {
        const target = total * i / count; while (j < dense && lengths[j + 1] < target) { j++; }
        const f = (target - lengths[j]) / Math.max (1e-12, lengths[j + 1] - lengths[j]), q = 2 * Math.PI * (j + f) / dense, [x, z] = at (q);
        const nx = b * Math.cos (q), nz = a * Math.sin (q), n = Math.hypot (nx, nz); points.push ({ x, z, nx : nx / n, nz : nz / n });
    }
    return { points, perimeter : total };
}

const outlineCache = { key : null, outline : null };
// Point and outward normal at arc length s (wrapping), measured from +X counter-clockwise.
export function SectionAt (section, s)
{
    if (section.shape === 'rectangle') { const perimeter = SectionPerimeter (section), wrapped = ((s % perimeter) + perimeter) % perimeter, [x, z, nx, nz] = RectanglePoint (section.widthMm / 2, section.depthMm / 2, section.cornerRadiusMm, wrapped); return { x, z, nx, nz }; }
    const key = section.widthMm + ':' + section.depthMm; if (outlineCache.key !== key) { outlineCache.key = key; outlineCache.outline = SectionOutline (section, 720); }
    const outline = outlineCache.outline, perimeter = outline.perimeter, wrapped = ((s % perimeter) + perimeter) % perimeter, step = perimeter / 720, index = Math.floor (wrapped / step), f = wrapped / step - index;
    const p = outline.points[index % 720], q = outline.points[(index + 1) % 720], nx = p.nx + (q.nx - p.nx) * f, nz = p.nz + (q.nz - p.nz) * f, n = Math.hypot (nx, nz);
    return { x : p.x + (q.x - p.x) * f, z : p.z + (q.z - p.z) * f, nx : nx / n, nz : nz / n };
}
