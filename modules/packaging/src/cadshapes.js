// CAD shape tools for packaging profiles: rounded corners (fillets), circles and relief holes.
// All coordinates are canonical profile millimetres (X, Y). Pure: no host or THREE imports.

const TAU = Math.PI * 2;
const finite = (value, name) => { if (typeof value !== 'number' || !Number.isFinite (value)) { throw new Error (name + ' must be a finite number.'); } return value; };
const positive = (value, name) => { if (finite (value, name) <= 0) { throw new Error (name + ' must be greater than zero.'); } return value; };
const point2 = (value, name) => { if (!Array.isArray (value) || value.length !== 2) { throw new Error (name + ' must be an [x, y] point.'); } value.forEach (v => finite (v, name)); return value; };
// Arc segments for a turn of `sweep` radians at radius r: about one point per 2 mm, at least 2 and at most 32 per quarter turn.
function ArcSegments (radius, sweep, maxChordMm = 2)
{
    const quarter = Math.abs (sweep) / (Math.PI / 2);
    return Math.max (2, Math.min (Math.ceil (32 * quarter), Math.ceil (Math.abs (sweep) * radius / maxChordMm)));
}

// Rounds the corners of a closed outline with tangent arcs. Works for convex and concave corners.
// The radius is reduced at a corner whose neighbouring edges are too short to hold it (half of each edge).
// corners: optional vertex indices to round (default every corner sharper than 170°).
export function FilletPolygon (points, radius, { corners = null, maxChordMm = 2 } = {})
{
    if (!Array.isArray (points) || points.length < 3) { throw new Error ('Round corners needs a closed outline with at least three points.'); }
    points.forEach ((p, i) => point2 (p, 'Point ' + (i + 1)));
    positive (radius, 'Corner radius');
    const chosen = corners === null ? null : new Set (corners);
    if (chosen && [...chosen].some (i => !Number.isInteger (i) || i < 0 || i >= points.length)) { throw new Error ('Corner indices must be points of the outline.'); }
    const result = []; let rounded = 0;
    points.forEach ((b, i) => {
        const a = points[(i + points.length - 1) % points.length], c = points[(i + 1) % points.length];
        const la = Math.hypot (a[0] - b[0], a[1] - b[1]), lc = Math.hypot (c[0] - b[0], c[1] - b[1]);
        if ((chosen && !chosen.has (i)) || la < 1e-9 || lc < 1e-9) { result.push ([...b]); return; }
        const u = [(a[0] - b[0]) / la, (a[1] - b[1]) / la], v = [(c[0] - b[0]) / lc, (c[1] - b[1]) / lc];
        const theta = Math.acos (Math.max (-1, Math.min (1, u[0] * v[0] + u[1] * v[1]))); // interior angle between the edges
        if (theta > Math.PI * 170 / 180 || theta < 1e-6) { result.push ([...b]); return; }
        let tangent = radius / Math.tan (theta / 2); const limit = Math.min (la, lc) / 2;
        if (tangent > limit) { tangent = limit; }
        const r = tangent * Math.tan (theta / 2);
        const bisector = [u[0] + v[0], u[1] + v[1]], length = Math.hypot (...bisector);
        const center = [b[0] + bisector[0] / length * r / Math.sin (theta / 2), b[1] + bisector[1] / length * r / Math.sin (theta / 2)];
        const p1 = [b[0] + u[0] * tangent, b[1] + u[1] * tangent], p2 = [b[0] + v[0] * tangent, b[1] + v[1] * tangent];
        const a1 = Math.atan2 (p1[1] - center[1], p1[0] - center[0]); let sweep = Math.atan2 (p2[1] - center[1], p2[0] - center[0]) - a1;
        while (sweep > Math.PI) { sweep -= TAU; } while (sweep < -Math.PI) { sweep += TAU; }
        const steps = ArcSegments (r, sweep, maxChordMm);
        for (let s = 0; s <= steps; s++) { const angle = a1 + sweep * s / steps; result.push ([center[0] + r * Math.cos (angle), center[1] + r * Math.sin (angle)]); }
        rounded++;
    });
    // Neighbouring arcs that meet at a shared tangent point would duplicate it.
    const unique = result.filter ((p, i) => { const q = result[(i + result.length - 1) % result.length]; return Math.hypot (p[0] - q[0], p[1] - q[1]) > 1e-6; });
    return { points : unique, rounded };
}

export function RoundedRectangle (min, max, radius, options = {})
{
    point2 (min, 'Rectangle corner'); point2 (max, 'Rectangle corner');
    if (!(max[0] > min[0] && max[1] > min[1])) { throw new Error ('The rectangle needs a positive width and height.'); }
    const corners = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
    return radius > 0 ? FilletPolygon (corners, radius, options).points : corners;
}

export function CircleOutline (center, radius, { segments = null, maxChordMm = 2 } = {})
{
    point2 (center, 'Circle centre'); positive (radius, 'Circle radius');
    const count = segments ?? Math.max (24, Math.min (180, Math.ceil (TAU * radius / maxChordMm)));
    if (!Number.isInteger (count) || count < 8 || count > 720) { throw new Error ('A circle needs 8–720 segments.'); }
    return Array.from ({ length : count }, (_, i) => [center[0] + radius * Math.cos (TAU * i / count), center[1] + radius * Math.sin (TAU * i / count)]);
}

// A round hole whose edge is split into flexible tabs by radial relief slits. holeRadius is the tab tip
// radius (the hole the product passes through once the tabs flex); each relief is a V slit from the hole
// edge out to reliefRadius, notchWidthMm wide at the hole edge, so the tabs bend at reliefRadius.
export function ReliefHoleOutline ({ center, holeRadius, reliefRadius, tabs = 16, notchWidthMm = 1.2, tipPoints = 3, rotation = 0 } = {})
{
    point2 (center, 'Hole centre'); positive (holeRadius, 'Hole radius'); positive (reliefRadius, 'Relief radius'); positive (notchWidthMm, 'Relief slit width'); finite (rotation, 'Rotation');
    if (reliefRadius <= holeRadius + 0.2) { throw new Error ('The relief slits must reach at least 0.2 mm beyond the hole edge.'); }
    if (!Number.isInteger (tabs) || tabs < 4 || tabs > 48) { throw new Error ('Use 4–48 tabs around a hole.'); }
    if (!Number.isInteger (tipPoints) || tipPoints < 0 || tipPoints > 16) { throw new Error ('Tab tips take 0–16 extra points.'); }
    const step = TAU / tabs, half = notchWidthMm / 2 / holeRadius;
    if (half * 2 >= step * 0.6) { throw new Error ('The relief slits are too wide for this many tabs.'); }
    const at = (angle, r) => [center[0] + r * Math.cos (angle), center[1] + r * Math.sin (angle)], points = [];
    for (let k = 0; k < tabs; k++) {
        const notch = rotation + k * step;
        points.push (at (notch - half, holeRadius), at (notch, reliefRadius), at (notch + half, holeRadius));
        for (let j = 1; j <= tipPoints; j++) { points.push (at (notch + half + (step - 2 * half) * j / (tipPoints + 1), holeRadius)); }
    }
    return points;
}
