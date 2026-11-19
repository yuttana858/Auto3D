import { ValidatePackaging, PackagingContours } from './profile.js';
import { RoundedRectangle, ReliefHoleOutline } from './cadshapes.js';
import { DefaultEngineering } from './engineering.js';

// Can collar: a paperboard carrier that holds a group of cans by their top rims (the double seam).
// Each can passes through a round hole whose edge is split into tabs by relief slits; the tab tips
// reach inside the rim and tuck under it, and the slits let the tabs flex over the rim as the
// collar is pressed on. The outline is a rounded rectangle around the holes. Pure: no host imports.
//
// World convention (Auto3D board pieces): profile X = world X, profile Y = world −Z, caliper up (+Y).

export const CollarBoards = Object.freeze ([
    { id : 'sbs-24pt', name : 'SBS paperboard · 24 pt', caliperMm : 0.61 },
    { id : 'cuk-24pt', name : 'CUK paperboard · 24 pt', caliperMm : 0.61 },
    { id : 'cuk-28pt', name : 'CUK paperboard · 28 pt', caliperMm : 0.71 },
    { id : 'kraft-32pt', name : 'Kraft board · 32 pt', caliperMm : 0.81 },
    { id : 'molded-fiber', name : 'Molded fiber · 1.2 mm', caliperMm : 1.2 }
]);
export const DefaultCollarOptions = Object.freeze ({ boardId : 'cuk-24pt', tuckMm : 1.5, reliefMm : 3, marginMm : 5, cornerRadiusMm : null, tabs : 0, notchWidthMm : 1.2, webMm : 1.5 });
export const MaxCollarCans = 24;
export const CollarNeckClearanceMm = 0.0254;
const PointBudget = 1950;

const range = (value, name, min, max) => { if (typeof value !== 'number' || !Number.isFinite (value) || value < min || value > max) { throw new Error (name + ' must be ' + min + '–' + max + ' mm.'); } return value; };

// Finds a can's top rim (double seam) from points on its surface, in world millimetres with +Y up.
// The rim is the widest ring in the top of the can; its underside is the lowest height that still
// reaches the rim radius. A rim needs a narrower neck under it (an undercut) for tabs to tuck under.
export function SenseCanRim (positions, { center = null } = {})
{
    if (!(positions instanceof Float32Array || positions instanceof Float64Array || Array.isArray (positions)) || positions.length < 9 || positions.length % 3) { throw new Error ('A can needs surface points to sense its rim.'); }
    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];
        if (!Number.isFinite (x) || !Number.isFinite (y) || !Number.isFinite (z)) { throw new Error ('Can surface points must be finite.'); }
        if (y < minY) { minY = y; } if (y > maxY) { maxY = y; } if (x < minX) { minX = x; } if (x > maxX) { maxX = x; } if (z < minZ) { minZ = z; } if (z > maxZ) { maxZ = z; }
    }
    const height = maxY - minY, width = maxX - minX, depth = maxZ - minZ;
    if (!(height > 0 && width > 0 && depth > 0)) { throw new Error ('The can has no size.'); }
    if (Math.abs (width - depth) > 0.04 * Math.max (width, depth)) { throw new Error ('Select upright round cans: this one is not round from above.'); }
    const axis = center || [(minX + maxX) / 2, (minZ + maxZ) / 2];
    // The rim: widest point in the top 6 % of the can (at least the top 4 mm).
    const band = Math.max (4, height * 0.06); let rim = 0;
    const radius = i => Math.hypot (positions[i] - axis[0], positions[i + 2] - axis[1]);
    for (let i = 0; i < positions.length; i += 3) { if (positions[i + 1] >= maxY - band) { rim = Math.max (rim, radius (i)); } }
    // Underside of the rim: the lowest point of the top band still at the rim radius.
    const tolerance = Math.max (0.25, rim * 0.008); let rimBottom = maxY;
    for (let i = 0; i < positions.length; i += 3) { const y = positions[i + 1]; if (y >= maxY - band && y < rimBottom && radius (i) >= rim - tolerance) { rimBottom = y; } }
    const rimHeight = maxY - rimBottom;
    // Neck: the widest surface just under the rim (at least down to the next ring of points). Tabs can only
    // tuck under a rim that is wider than the neck below it.
    let next = -Infinity;
    for (let i = 1; i < positions.length; i += 3) { const y = positions[i]; if (y < rimBottom - 1e-6 && y > next) { next = y; } }
    const low = Math.min (rimBottom - Math.max (3, height * 0.03), next); let neck = 0;
    for (let i = 0; i < positions.length; i += 3) { const y = positions[i + 1]; if (y < rimBottom - 1e-6 && y >= low) { neck = Math.max (neck, radius (i)); } }
    if (!Number.isFinite (next) || neck >= rim - tolerance) { throw new Error ('No rim to tuck under: the top of this model is not wider than the neck below it. Choose cans with a seamed top rim.'); }
    return { center : axis, bottomMm : minY, topMm : maxY, heightMm : height, diameterMm : Math.max (width, depth), rimRadiusMm : rim, rimBottomMm : rimBottom, rimHeightMm : rimHeight, neckRadiusMm : neck, undercutMm : rim - neck };
}

// Conservative radial envelope of triangle surfaces through the actual board slab.
// Clipping at both slab planes includes sloped neck faces even when no mesh vertex lies in the slab.
export function CanRadiusInSlab (positions, center, bottom, top)
{
    if (!positions.length || positions.length % 9 || !Array.isArray (center) || center.length !== 2 || !center.every (Number.isFinite) || !Number.isFinite (bottom) || !Number.isFinite (top) || bottom >= top) { throw new Error ('Invalid can collar slab.'); }
    let radius = 0;
    const include = (x, z) => { radius = Math.max (radius, Math.hypot (x - center[0], z - center[1])); };
    for (let i = 0; i < positions.length; i += 9) {
        for (let j = 0; j < 3; j++) {
            const a = i + j * 3, b = i + ((j + 1) % 3) * 3, y = positions[a + 1], nextY = positions[b + 1];
            if (y >= bottom && y <= top) { include (positions[a], positions[a + 2]); }
            for (const plane of [bottom, top]) {
                if ((y < plane && nextY > plane) || (y > plane && nextY < plane)) { const f = (plane - y) / (nextY - y); include (positions[a] + (positions[b] - positions[a]) * f, positions[a + 2] + (positions[b + 2] - positions[a + 2]) * f); }
            }
        }
    }
    if (!Number.isFinite (radius) || radius <= 0) { throw new Error ('No can surface was found through the collar thickness.'); }
    return radius;
}

function HoleInnerRadius (points, center)
{
    return Math.min (...points.map ((p, i) => { const q = points[(i + 1) % points.length], dx = q[0] - p[0], dy = q[1] - p[1], f = Math.max (0, Math.min (1, ((center[0] - p[0]) * dx + (center[1] - p[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot (p[0] + f * dx - center[0], p[1] + f * dy - center[1]); }));
}

// Collar profile for cans at world centres (x, z mm), all with the same rim radius.
export function CreateCanCollarPlan ({ cans, rimRadiusMm, neckRadiusMm = null, thickness, tuckMm = null, reliefMm = DefaultCollarOptions.reliefMm, marginMm = DefaultCollarOptions.marginMm, cornerRadiusMm = null, tabs = 0, notchWidthMm = DefaultCollarOptions.notchWidthMm, webMm = DefaultCollarOptions.webMm, name = 'Can collar', grade = 'Custom' } = {})
{
    if (!Array.isArray (cans) || cans.length < 1 || cans.length > MaxCollarCans) { throw new Error ('A can collar holds 1–' + MaxCollarCans + ' cans.'); }
    cans.forEach ((can, i) => { if (!Array.isArray (can) || can.length !== 2 || !can.every (Number.isFinite)) { throw new Error ('Can ' + (i + 1) + ' needs an [x, z] centre in mm.'); } });
    const rim = range (rimRadiusMm, 'Rim radius', 2, 200), t = range (thickness, 'Collar caliper', 0.1, 5);
    const automaticTuck = tuckMm === null; tuckMm ??= DefaultCollarOptions.tuckMm; const requestedTuckMm = tuckMm;
    range (tuckMm, 'Tuck', 0.3, Math.min (10, rim * 0.4)); range (reliefMm, 'Relief beyond the rim', 0.5, 20); range (marginMm, 'Edge margin', 1, 50); range (notchWidthMm, 'Relief slit width', 0.3, 5); range (webMm, 'Board web between holes', 0.5, 20);
    if (neckRadiusMm !== null) { range (neckRadiusMm, 'Neck radius', 0.001, rim); }
    let holeRadius = rim - tuckMm;
    // Reliefs reach past the rim, but always leave a web of board between neighbouring holes.
    let nearest = Infinity;
    for (let i = 0; i < cans.length; i++) { for (let j = i + 1; j < cans.length; j++) { nearest = Math.min (nearest, Math.hypot (cans[i][0] - cans[j][0], cans[i][1] - cans[j][1])); } }
    if (nearest < 2 * rim + webMm) { throw new Error ('The cans are too close: their rims need ' + (2 * rim + webMm).toFixed (1) + ' mm between centres (now ' + nearest.toFixed (1) + ' mm).'); }
    const reliefRadius = Math.min (rim + reliefMm, (nearest - webMm) / 2);
    if (reliefRadius < rim + 0.3) { throw new Error ('There is no room for relief slits between these cans. Space them further apart.'); }
    const tabCount = tabs || Math.max (8, Math.min (24, Math.round (2 * Math.PI * holeRadius / 11)));
    if (!Number.isInteger (tabCount) || tabCount < 4 || tabCount > 48) { throw new Error ('Use 4–48 tabs around each can (0 chooses automatically).'); }
    // Outline: a rounded rectangle margin beyond every relief ring. By default its corners follow the corner cans.
    const xs = cans.map (c => c[0]), ys = cans.map (c => -c[1]), reach = reliefRadius + marginMm;
    const min = [Math.min (...xs) - reach, Math.min (...ys) - reach], max = [Math.max (...xs) + reach, Math.max (...ys) + reach];
    const corner = cornerRadiusMm === null ? reach : range (cornerRadiusMm, 'Corner radius', 0, 500);
    const radius = Math.min (corner, (max[0] - min[0]) / 2, (max[1] - min[1]) / 2);
    const outline = RoundedRectangle (min, max, radius, { maxChordMm : 2.5 });
    // Spend the 2000-point design budget evenly across the holes: fewer points along each tab tip for big packs.
    const perHole = (PointBudget - outline.length) / cans.length, tipPoints = Math.max (0, Math.min (3, Math.floor (perHole / tabCount) - 3));
    if (tabCount * 3 > perHole) { throw new Error ('Too many tabs for ' + cans.length + ' cans. Use fewer tabs.'); }
    if (neckRadiusMm !== null && automaticTuck) {
        // Tab tips are straight chords. Their inscribed radius, not just their vertex radius, must clear the neck.
        holeRadius = Math.max (holeRadius, (neckRadiusMm + CollarNeckClearanceMm) / Math.cos (Math.PI / tabCount / (tipPoints + 1)));
        tuckMm = rim - holeRadius;
        if (tuckMm < 0.3) { throw new Error ('The can neck leaves too little room for a flat collar with this board and tab count. Choose a thinner board or more tabs.'); }
    }
    const shift = p => [p[0] - min[0], p[1] - min[1]];
    const holes = cans.map ((can, i) => ({ id : 'can-' + (i + 1), type : 'cut', closed : true, points : ReliefHoleOutline ({ center : [can[0], -can[1]], holeRadius, reliefRadius, tabs : tabCount, notchWidthMm, tipPoints, rotation : Math.PI / tabCount }).map (shift) }));
    const innerRadius = HoleInnerRadius (holes[0].points, shift ([cans[0][0], -cans[0][1]]));
    if (neckRadiusMm !== null && innerRadius < neckRadiusMm + CollarNeckClearanceMm - 1e-7) { throw new Error ('This tuck intersects the can neck through the collar thickness. Reduce tuck or leave it blank for automatic fit.'); }
    const paths = [{ id : 'outline', type : 'cut', closed : true, points : outline.map (shift) }, ...holes];
    PackagingContours ({ version : 1, name, grade, thickness : t, paths }); // Throws if any hole crosses the outline or another hole.
    // Measurement layer: overall length and width across the outline, and the first hole's tab tip and relief
    // diameters (opposite points), instead of the default per-segment dimensions along the corner arcs.
    const far = (points, axis, sign) => points.reduce ((best, p, i) => (sign * (p[axis] - points[best][axis]) > 1e-9 || (Math.abs (p[axis] - points[best][axis]) <= 1e-9 && Math.abs (p[1 - axis] - (axis ? lengthMid : widthMid)) < Math.abs (points[best][1 - axis] - (axis ? lengthMid : widthMid)))) ? i : best, 0);
    const lengthMid = (max[0] - min[0]) / 2, widthMid = (max[1] - min[1]) / 2, edge = paths[0].points, perTab = 3 + tipPoints;
    const references = [
        { id : 'collar-length', pathId : 'outline', start : far (edge, 0, -1), end : far (edge, 0, 1), axis : 0 },
        { id : 'collar-width', pathId : 'outline', start : far (edge, 1, -1), end : far (edge, 1, 1), axis : 1 },
        ...(tabCount % 2 ? [] : [{ id : 'tab-tip-diameter', pathId : 'can-1', start : 0, end : perTab * tabCount / 2, axis : 0 }, { id : 'relief-diameter', pathId : 'can-1', start : 1, end : 1 + perTab * tabCount / 2, axis : 0 }])
    ];
    const engineering = DefaultEngineering ({ version : 1, name, grade, thickness : t, paths : [] });
    engineering.materials[0] = { ...engineering.materials[0], name : grade === 'Custom' ? engineering.materials[0].name : grade };
    engineering.dimensions = references.map (ref => ({ ...ref, mode : 'auto', basis : 'score', targetMm : null, toleranceMm : null }));
    const profile = ValidatePackaging ({ version : 1, name, grade, thickness : t, paths, engineering });
    const lengthMm = max[0] - min[0], widthMm = max[1] - min[1];
    return { version : 1, units : 'mm', kind : 'can-collar', cans : cans.length, thicknessMm : t, rimRadiusMm : rim, holeRadiusMm : holeRadius, reliefRadiusMm : reliefRadius, tuckMm, requestedTuckMm, automaticTuck, neckRadiusMm, neckClearanceMm : neckRadiusMm === null ? null : innerRadius - neckRadiusMm, tabs : tabCount, notchWidthMm, cornerRadiusMm : radius, marginMm, webMm : Math.min (...cans.flatMap ((a, i) => cans.slice (i + 1).map (b => Math.hypot (a[0] - b[0], a[1] - b[1]) - 2 * reliefRadius)), Infinity), sizeMm : { length : lengthMm, width : widthMm }, worldMinMm : [min[0], -max[1]], points : profile.paths.reduce ((sum, p) => sum + p.points.length, 0), profile };
}
