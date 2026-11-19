import { ValidatePackaging, PackagingContours } from './profile.js';
import { RoundedRectangle, ReliefHoleOutline } from './cadshapes.js';
import { DefaultEngineering } from './engineering.js';

// Can collar: a paperboard carrier that holds a group of cans by their top rims (the double seam).
// Each can passes through a round hole whose edge is split into tabs by relief slits; the tab tips
// reach inside the rim and tuck under it, and the slits let the tabs flex over the rim as the
// collar is pressed on. The outline is a rounded rectangle around the holes. Pure: no host imports.
//
// World convention (Auto3D board pieces): profile X = world X, profile Y = world −Z, caliper up (+Y).

// Collar boards. Paperboard collars print on a white top (coated) face; molded fiber stays natural.
export const CollarBoards = Object.freeze ([
    { id : 'sbs-24pt', name : 'SBS paperboard · 24 pt', caliperMm : 0.61, ground : 'white' },
    { id : 'cuk-24pt', name : 'CUK white top · 24 pt', caliperMm : 0.61, ground : 'white' },
    { id : 'cuk-28pt', name : 'CUK white top · 28 pt', caliperMm : 0.71, ground : 'white' },
    { id : 'kraft-32pt', name : 'Kraft white top · 32 pt', caliperMm : 0.81, ground : 'white' },
    { id : 'molded-fiber', name : 'Molded fiber · 1.2 mm', caliperMm : 1.2, ground : 'natural' }
]);
// Universal collar designs: for a can size every collar uses the same hole (tab count, tab width and
// height, tip and crease diameters), so one CAD hole design serves every pack layout of that can.
// 12 oz: 211 body (Ø 66 mm) with a 202 end (seam Ø about 57.9 mm). The crease ring (the tab hinge, where the
// relief slits end) is Ø 58.1 mm, just outside the seam, so the opening hugs the can. The 16 tabs (tips
// Ø 52.8 mm, about 2.1 mm long and 9.4 mm wide) fold up along the crease into the recess under the seam and
// hook under its lip, locking each can. V slits are 1 mm wide at the tip; touching cans keep a 7.9 mm web.
export const CollarStandards = Object.freeze ([
    Object.freeze ({ id : '12oz-202', name : '12 oz can · 211 body, 202 end', canDiameterMm : 66, rimDiameterMm : [56.9, 58.05], tipDiameterMm : 53.6, reliefDiameterMm : 58.1, tabs : 16, notchWidthMm : 1, tipPoints : 3, pitchMm : 66 })
]);
export function CollarStandard (id)
{
    const standard = CollarStandards.find (s => s.id === id); if (!standard) { throw new Error ('Choose a collar standard: ' + CollarStandards.map (s => s.id).join (', ') + '.'); }
    const tipWidthMm = Math.PI * standard.tipDiameterMm / standard.tabs - standard.notchWidthMm;
    // Tab length from the crease chord to the tip, along the tab centre line.
    const tabHeightMm = standard.reliefDiameterMm / 2 * Math.cos (Math.PI / standard.tabs) - standard.tipDiameterMm / 2;
    return { ...standard, creaseDiameterMm : standard.reliefDiameterMm, tabHeightMm, tabWidthMm : tipWidthMm };
}
// The standard's hole as a CAD cut outline centred on center (profile mm): the same points every collar uses.
export function StandardReliefHole (id, center)
{
    const s = CollarStandard (id);
    return ReliefHoleOutline ({ center, holeRadius : s.tipDiameterMm / 2, reliefRadius : s.reliefDiameterMm / 2, tabs : s.tabs, notchWidthMm : s.notchWidthMm, tipPoints : s.tipPoints, rotation : Math.PI / s.tabs });
}
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
export function CreateCanCollarPlan ({ cans, rimRadiusMm, neckRadiusMm = null, thickness, tuckMm = null, reliefMm = DefaultCollarOptions.reliefMm, marginMm = DefaultCollarOptions.marginMm, cornerRadiusMm = null, tabs = 0, notchWidthMm = DefaultCollarOptions.notchWidthMm, webMm = DefaultCollarOptions.webMm, name = 'Can collar', grade = 'Custom', standard = null, print = null, tabFold = null } = {})
{
    if (!Array.isArray (cans) || cans.length < 1 || cans.length > MaxCollarCans) { throw new Error ('A can collar holds 1–' + MaxCollarCans + ' cans.'); }
    cans.forEach ((can, i) => { if (!Array.isArray (can) || can.length !== 2 || !can.every (Number.isFinite)) { throw new Error ('Can ' + (i + 1) + ' needs an [x, z] centre in mm.'); } });
    const rim = range (rimRadiusMm, 'Rim radius', 2, 200), t = range (thickness, 'Collar caliper', 0.1, 5);
    const automaticTuck = tuckMm === null; tuckMm ??= DefaultCollarOptions.tuckMm; const requestedTuckMm = tuckMm;
    range (tuckMm, 'Tuck', 0.3, Math.min (10, rim * 0.4)); range (reliefMm, 'Relief beyond the rim', 0.5, 20); range (marginMm, 'Edge margin', 1, 50); range (notchWidthMm, 'Relief slit width', 0.3, 5); range (webMm, 'Board web between holes', 0.5, 20);
    if (neckRadiusMm !== null) { range (neckRadiusMm, 'Neck radius', 0.001, rim); }
    let holeRadius = rim - tuckMm;
    // A universal design fixes the hole: tabs, slit width, tip and relief diameters do not follow options.
    const design = standard === null ? null : CollarStandard (standard);
    if (design) {
        const [low, high] = design.rimDiameterMm;
        if (2 * rim < low || 2 * rim > high) { throw new Error ('These cans do not fit the ' + design.name + ' collar: rim Ø ' + (2 * rim).toFixed (1) + ' mm (the design needs ' + low + '–' + high + ' mm). Choose Custom fit.'); }
        holeRadius = design.tipDiameterMm / 2; tuckMm = rim - holeRadius; tabs = design.tabs; notchWidthMm = design.notchWidthMm;
    }
    // Reliefs reach past the rim, but always leave a web of board between neighbouring holes.
    let nearest = Infinity;
    for (let i = 0; i < cans.length; i++) { for (let j = i + 1; j < cans.length; j++) { nearest = Math.min (nearest, Math.hypot (cans[i][0] - cans[j][0], cans[i][1] - cans[j][1])); } }
    if (nearest < 2 * rim + webMm) { throw new Error ('The cans are too close: their rims need ' + (2 * rim + webMm).toFixed (1) + ' mm between centres (now ' + nearest.toFixed (1) + ' mm).'); }
    const reliefRadius = design ? design.reliefDiameterMm / 2 : Math.min (rim + reliefMm, (nearest - webMm) / 2);
    if (design && nearest < 2 * reliefRadius + webMm - 1e-9) { throw new Error ('Space the cans at least ' + (2 * reliefRadius + webMm).toFixed (1) + ' mm apart (centre to centre) for the ' + design.name + ' collar.'); }
    if (design && reliefRadius < rim + 0.02) { throw new Error ('These rims are wider than the ' + design.name + ' crease ring (Ø ' + design.reliefDiameterMm + ' mm). Choose Custom fit.'); }
    if (!design && reliefRadius < rim + 0.3) { throw new Error ('There is no room for relief slits between these cans. Space them further apart.'); }
    const tabCount = tabs || Math.max (8, Math.min (24, Math.round (2 * Math.PI * holeRadius / 11)));
    if (!Number.isInteger (tabCount) || tabCount < 4 || tabCount > 48) { throw new Error ('Use 4–48 tabs around each can (0 chooses automatically).'); }
    // Outline: a rounded rectangle margin beyond every relief ring. By default its corners follow the corner cans.
    const xs = cans.map (c => c[0]), ys = cans.map (c => -c[1]), reach = reliefRadius + marginMm;
    const min = [Math.min (...xs) - reach, Math.min (...ys) - reach], max = [Math.max (...xs) + reach, Math.max (...ys) + reach];
    const corner = cornerRadiusMm === null ? reach : range (cornerRadiusMm, 'Corner radius', 0, 500);
    const radius = Math.min (corner, (max[0] - min[0]) / 2, (max[1] - min[1]) / 2);
    const outline = RoundedRectangle (min, max, radius, { maxChordMm : 2.5 });
    // Spend the 2000-point design budget evenly across the holes: fewer points along each tab tip for big packs.
    const perHole = (PointBudget - outline.length) / cans.length, tipPoints = design ? design.tipPoints : Math.max (0, Math.min (3, Math.floor (perHole / tabCount) - 4));
    if (design && tabCount * (4 + tipPoints) > perHole) { throw new Error ('The ' + design.name + ' collar holds up to ' + Math.floor ((PointBudget - outline.length) / (tabCount * (4 + tipPoints))) + ' cans.'); }
    if (tabCount * 4 > perHole) { throw new Error ('Too many tabs for ' + cans.length + ' cans. Use fewer tabs.'); }
    if (neckRadiusMm !== null && automaticTuck && !design) {
        // Tab tips are straight chords. Their inscribed radius, not just their vertex radius, must clear the neck.
        holeRadius = Math.max (holeRadius, (neckRadiusMm + CollarNeckClearanceMm) / Math.cos (Math.PI / tabCount / (tipPoints + 1)));
        tuckMm = rim - holeRadius;
        if (tuckMm < 0.3) { throw new Error ('The can neck leaves too little room for a flat collar with this board and tab count. Choose a thinner board or more tabs.'); }
    }
    const shift = p => [p[0] - min[0], p[1] - min[1]];
    const holes = cans.map ((can, i) => ({ id : 'can-' + (i + 1), type : 'cut', closed : true, points : ReliefHoleOutline ({ center : [can[0], -can[1]], holeRadius, reliefRadius, tabs : tabCount, notchWidthMm, tipPoints, rotation : Math.PI / tabCount }).map (shift) }));
    const innerRadius = HoleInnerRadius (holes[0].points, shift ([cans[0][0], -cans[0][1]]));
    // Folded tabs are checked against the can by SolveTabFold; a flat collar must clear the neck itself.
    if (!tabFold && neckRadiusMm !== null && innerRadius < neckRadiusMm + CollarNeckClearanceMm - 1e-7) { throw new Error (design ? 'The ' + design.name + ' tabs would cut into this can neck. Choose Custom fit.' : 'This tuck intersects the can neck through the collar thickness. Reduce tuck or leave it blank for automatic fit.'); }
    // Crease ring per hole: straight hinge lines between the slit ends, where the tabs fold up.
    const perTabPoints = 3 + tipPoints, creases = holes.map ((hole, i) => ({ id : 'crease-' + (i + 1), type : 'score', closed : true, process : { kind : 'crease' }, points : hole.points.filter ((_, k) => k % perTabPoints === 1) }));
    const paths = [{ id : 'outline', type : 'cut', closed : true, points : outline.map (shift) }, ...holes, ...creases];
    if (paths.reduce ((sum, path) => sum + path.points.length, 0) > 2000) { throw new Error ('Too many cans for one collar dieline (2000 points). Use fewer cans.'); }
    PackagingContours ({ version : 1, name, grade, thickness : t, paths }); // Throws if any hole crosses the outline or another hole.
    // Measurement layer: overall length and width across the outline, and the first hole's tab tip and relief
    // diameters (opposite points), instead of the default per-segment dimensions along the corner arcs.
    const far = (points, axis, sign) => points.reduce ((best, p, i) => (sign * (p[axis] - points[best][axis]) > 1e-9 || (Math.abs (p[axis] - points[best][axis]) <= 1e-9 && Math.abs (p[1 - axis] - (axis ? lengthMid : widthMid)) < Math.abs (points[best][1 - axis] - (axis ? lengthMid : widthMid)))) ? i : best, 0);
    const lengthMid = (max[0] - min[0]) / 2, widthMid = (max[1] - min[1]) / 2, edge = paths[0].points, perTab = 3 + tipPoints;
    const references = [
        { id : 'collar-length', pathId : 'outline', start : far (edge, 0, -1), end : far (edge, 0, 1), axis : 0 },
        { id : 'collar-width', pathId : 'outline', start : far (edge, 1, -1), end : far (edge, 1, 1), axis : 1 },
        ...(tabCount % 2 ? [] : [{ id : 'tab-tip-diameter', pathId : 'can-1', start : 0, end : perTab * tabCount / 2, axis : 0 }, { id : 'relief-diameter', pathId : 'can-1', start : 1, end : 1 + perTab * tabCount / 2, axis : 0 }, { id : 'crease-diameter', pathId : 'crease-1', start : 0, end : tabCount / 2, axis : 0 }])
    ];
    const engineering = DefaultEngineering ({ version : 1, name, grade, thickness : t, paths : [] });
    engineering.materials[0] = { ...engineering.materials[0], name : grade === 'Custom' ? engineering.materials[0].name : grade };
    engineering.dimensions = references.map (ref => ({ ...ref, mode : 'auto', basis : 'score', targetMm : null, toleranceMm : null }));
    const profile = ValidatePackaging ({ version : 1, name, grade, thickness : t, paths, engineering, ...(print ? { print } : {}), ...(tabFold ? { tabFold } : {}) });
    const lengthMm = max[0] - min[0], widthMm = max[1] - min[1];
    return { version : 1, units : 'mm', kind : 'can-collar', standard : design ? { id : design.id, name : design.name, tipDiameterMm : design.tipDiameterMm, reliefDiameterMm : design.reliefDiameterMm, tabs : design.tabs, tabHeightMm : design.tabHeightMm, tabWidthMm : design.tabWidthMm, notchWidthMm : design.notchWidthMm } : null, cans : cans.length, thicknessMm : t, rimRadiusMm : rim, holeRadiusMm : holeRadius, reliefRadiusMm : reliefRadius, tuckMm, requestedTuckMm, automaticTuck, neckRadiusMm, neckClearanceMm : neckRadiusMm === null ? null : innerRadius - neckRadiusMm, tabs : tabCount, notchWidthMm, cornerRadiusMm : radius, marginMm, webMm : Math.min (...cans.flatMap ((a, i) => cans.slice (i + 1).map (b => Math.hypot (a[0] - b[0], a[1] - b[1]) - 2 * reliefRadius)), Infinity), sizeMm : { length : lengthMm, width : widthMm }, worldMinMm : [min[0], -max[1]], points : profile.paths.reduce ((sum, p) => sum + p.points.length, 0), profile };
}

// The cans' outline by height: the largest radius any can reaches in each thin horizontal slab (world mm),
// measured from triangle surfaces (CanRadiusInSlab), so sloped walls between mesh rings count.
export function CanRadialProfile (cans, low, high, step = 0.05)
{
    if (!Array.isArray (cans) || !cans.length || !(high > low) || !(step > 0)) { throw new Error ('A can outline needs cans and a height range.'); }
    const count = Math.ceil ((high - low) / step), radii = new Float64Array (count);
    for (let i = 0; i < count; i++) {
        const y0 = low + i * step, y1 = y0 + step;
        for (const can of cans) { try { radii[i] = Math.max (radii[i], CanRadiusInSlab (can.triangles, can.center, y0, y1)); } catch { /* No surface in this slab. */ } }
    }
    return { low, step, radii, radiusIn : (y0, y1) => { let r = 0; for (let i = Math.max (0, Math.floor ((y0 - low) / step)); i <= Math.min (count - 1, Math.floor ((y1 - low) / step)); i++) { r = Math.max (r, radii[i]); } return r; } };
}

// Where a collar with fold-up tabs sits on its cans, and how far the tabs fold. The sheet (inside edge at the
// crease chords) must clear the can through its thickness; each tab turns up about its crease, its inner
// (bottom) face clear of the can along its length, its tip under the rim and at least minLockMm inside the rim
// lip so it hooks under it, folded at least minAngleDeg so the tabs lock. Prefers the sheet closest to the rim,
// then the tightest tip. Null when none fits.
export function SolveTabFold ({ outline, rimRadiusMm, rimBottomMm, creaseRadiusMm, tabs, tipRadiusMm, thickness, notchWidthMm = 0, clearanceMm = CollarNeckClearanceMm, minLockMm = 0.5, depthMm = 10, minAngleDeg = 25 })
{
    const chord = creaseRadiusMm * Math.cos (Math.PI / tabs), length = chord - tipRadiusMm, t = thickness;
    if (!(length > 0)) { throw new Error ('The tab tips must lie inside the crease ring.'); }
    // A tab's corners (beside the slits) reach further from the crease than its centre: heights and clearances use them.
    const cornerAngle = Math.PI / tabs - notchWidthMm / 2 / tipRadiusMm, reach = Math.max (length, chord - tipRadiusMm * Math.cos (cornerAngle));
    const apexOffset = creaseRadiusMm * Math.sin (Math.PI / tabs), cornerOffset = tipRadiusMm * Math.sin (cornerAngle);
    for (let top = rimBottomMm - clearanceMm; top >= rimBottomMm - depthMm; top -= 0.05) {
        if (outline.radiusIn (top - t, top) > chord - clearanceMm) { continue; }
        let best = null;
        for (let degrees = minAngleDeg; degrees <= 89; degrees += 0.5) {
            const a = degrees * Math.PI / 180, cos = Math.cos (a), sin = Math.sin (a);
            if (top + reach * sin > rimBottomMm - clearanceMm) { break; }
            // The tab's inner (bottom) face along its centre line and along its slit edge (slit end to tip corner),
            // at its true distance from the can axis.
            let margin = Infinity;
            for (const [d0, w0, d1, w1] of [[0, 0, length, 0], [0, apexOffset, reach, cornerOffset]]) {
                for (let k = 0; k <= 8; k++) {
                    const d = d0 + (d1 - d0) * k / 8, w = w0 + (w1 - w0) * k / 8, inward = d * cos + t * sin, height = top + d * sin - t * cos, radius = Math.hypot (chord - inward, w);
                    margin = Math.min (margin, radius - outline.radiusIn (height - 0.05, height + 0.05) - clearanceMm);
                }
            }
            const tipRadius = chord - (length * cos + t * sin), lock = rimRadiusMm - tipRadius;
            if (margin < 0 || lock < minLockMm) { continue; }
            const tipHeight = top + length * sin - t * cos, tipGap = tipRadius - outline.radiusIn (tipHeight - 0.05, tipHeight + 0.05);
            if (!best || tipGap < best.tipGapMm) { best = { sheetTopMm : top, angleDeg : degrees, tipRadiusMm : tipRadius, tipTopMm : top + reach * sin, clearanceMm : margin + clearanceMm, tipGapMm : tipGap, lockMm : lock, tabLengthMm : length, tabCornerLengthMm : reach, creaseChordRadiusMm : chord }; }
        }
        if (best) { return best; }
    }
    return null;
}
