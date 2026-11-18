import { PulpTypes } from './state.js';
import { SenseBounds, SheetRect, BottomHeightfield } from './surface.js';
import { FormTop, SheetSurfaces, PocketMetrics, ShellVolume, FootprintIslands } from './tray.js';
import { DetailGrid, OffsetDown } from './field.js';
import { ShellMesh } from './mesh.js';
import { AdaptiveShellMesh } from './rtin.js';
import { PlanFeatures } from './rules.js';
import { ApplyRibs, ApplyLugs } from './features.js';
import { ClamshellShells, ToLocal, ComponentToWorld } from './orient.js';
import { NurbsShell } from './nurbs/shell.js';
import { LoftPocketWalls } from './nurbs/loft.js';

const kb = 'MP knowledge base · mp-des-dfm-rules-by-process-type';
const r1 = v => Math.round (v * 10) / 10;

// Design-for-manufacture review of a planned tray. Rules and their basis come from the MP knowledge base; values marked
// there as typical industry values are advisory, so every finding is a warning or note, never a hard block.
export function PulpChecks (draft, bounds, rect, metrics = null)
{
    const type = PulpTypes[draft.pulpType], out = [], add = (id, severity, message, basis = kb) => out.push ({ id, severity, message, basis });
    const depth = metrics?.formDepthMm ?? draft.formDepthMm;
    if (draft.thicknessMm < type.rangeMm[0] || draft.thicknessMm > type.rangeMm[1]) { add ('MP-T1', 'warning', `${draft.thicknessMm} mm is outside the ${type.rangeMm[0]}–${type.rangeMm[1]} mm range reported for ${type.short}.`); }
    if (draft.draftDeg === 0) { add ('MP-D0', 'warning', 'No draft: a straight-pull pulp tool needs draft to release the part.'); }
    else if (draft.draftDeg < type.minDraftDeg) { add ('MP-D1', 'warning', `Draft ${draft.draftDeg}° is below the ${type.minDraftDeg}° minimum suggested for ${type.short}.`); }
    if (draft.draftDeg > 7) { add ('MP-D2', 'note', 'Draft above 7° exceeds common published guidance (1–7°); pockets will open wide.'); }
    if (depth > 90) { add ('MP-H1', 'warning', 'Form depth above 90 mm exceeds a published single-cavity depth limit.'); }
    const narrow = metrics?.narrowestProductMm ?? Math.min (bounds.size[0], bounds.size[2]);
    if (depth > narrow) { add ('MP-H2', 'warning', `Form depth ${r1 (depth)} mm exceeds the narrowest product footprint (${r1 (narrow)} mm); height-to-width above about 1:1 is hard to form.`); }
    if (depth > bounds.size[1]) { add ('MP-H3', 'note', `Form depth is taller than the products (${r1 (bounds.size[1])} mm); the tray rim will stand above them.`); }
    const run = draft.draftDeg > 0 ? depth * Math.tan (draft.draftDeg * Math.PI / 180) : 0, needed = run + draft.thicknessMm + draft.clearanceMm;
    const margin = Math.min (draft.extraLengthMm, draft.extraWidthMm) / 2;
    if (margin < needed) { add ('MP-M1', 'warning', `Add material: ${r1 (margin)} mm per side is less than the ${r1 (needed)} mm the drafted outer wall needs to reach full depth. Increase additional length/width to at least ${r1 (needed * 2)} mm.`); }
    if (draft.clearanceMm === 0) { add ('MP-C1', 'note', 'Zero clearance: products may bind in their pockets after drying shrinkage.'); }
    if (metrics) {
        if (metrics.minRibMm !== null && metrics.minRibMm < 8) { add ('MP-R1', 'warning', `Pockets are ${r1 (metrics.minRibMm)} mm apart at the plateau; keep cavities at least 8 mm apart.`); }
        if (metrics.productIslands > metrics.pocketCount) { add ('MP-R2', 'warning', `${metrics.productIslands} separate product footprints share ${metrics.pocketCount || 'no'} enclosed pocket${metrics.pocketCount === 1 ? '' : 's'}: products are too close for a full-depth rib between them. Spread them apart or reduce depth, draft or clearance.`); }
        if (metrics.achievedDepthMm < depth - 0.01) { add ('MP-H4', 'note', `Achieved depth is ${r1 (metrics.achievedDepthMm)} mm; the sheet or draft limits the requested ${r1 (depth)} mm.`); }
    }
    return out;
}

// Display mesh density is capped at 1025 nodes per side (~0.3 mm on a 300 mm tray): finer computation (ultra) keeps its
// accuracy in the formed shape, but meshing every 0.15 mm node would add millions of triangles that the viewer has to
// build on the main thread, with no visible gain. Every other node of a 2^k + 1 grid is again a 2^(k-1) + 1 grid.
export const MaxDisplaySide = 1025;
function DisplaySurfaces (grid, surfaces)
{
    if (grid.n <= MaxDisplaySide) { return { grid, surfaces }; }
    const stride = (grid.n - 1) / (MaxDisplaySide - 1), n = MaxDisplaySide, top = new Float32Array (n * n), bottom = new Float32Array (n * n);
    for (let j = 0; j < n; j++) { for (let i = 0; i < n; i++) { const k = j * stride * grid.n + i * stride; top[j * n + i] = surfaces.top[k]; bottom[j * n + i] = surfaces.bottom[k]; } }
    return { grid : { ...grid, nx : n, nz : n, n, dx : grid.dx * stride, dz : grid.dz * stride }, surfaces : { top, bottom } };
}

function Origin (rect) { return [(rect.x0 + rect.x1) / 2, rect.baseY, (rect.z0 + rect.z1) / 2]; }

// One shell formed in its own frame (+Y = pull direction): sense → form → rules → ribs → offset → lugs → adaptive mesh.
export function FormShell (triangles, draft, options = {})
{
    const detail = options.detail || draft.detail || 'standard', bounds = SenseBounds (triangles), rect = SheetRect (bounds, draft), origin = Origin (rect);
    const depth = options.depthMm ?? draft.formDepthMm, grid = DetailGrid (rect, draft, detail), progress = options.onProgress || (() => {});
    progress ('sensing', 0.1); const field = BottomHeightfield (triangles, grid, rect.baseY);
    progress ('forming', 0.3); const { top, slope } = FormTop (field, grid, draft, depth);
    let achieved = 0; for (const v of top) { if (v > achieved) { achieved = v; } }
    progress ('features', 0.55); const pockets = PocketMetrics (top, grid, achieved), islands = FootprintIslands (field, grid);
    const features = PlanFeatures ({ draft, depthMm : achieved, slope : Number.isFinite (slope) ? slope : 1e6, rect, pockets : pockets.pockets, skirtRunMm : Number.isFinite (slope) ? achieved / slope : 0, clamshell : options.clamshell || 'none' });
    if (features.ribs.length) { ApplyRibs (top, grid, features.ribs, achieved, Number.isFinite (slope) ? slope : 1e6); }
    progress ('thickness', 0.7); const bottom = OffsetDown (top, grid, draft.thicknessMm);
    if (features.lugs.length && Number.isFinite (slope)) { features.lugs = ApplyLugs (top, grid, features.lugs, achieved, slope); }
    progress ('meshing', 0.85); const surfaces = { top, bottom }, display = DisplaySurfaces (grid, surfaces), component = AdaptiveShellMesh (display.grid, display.surfaces, origin, options.id || 'pulp-tray', grid.toleranceMm, Math.max (0.5, draft.thicknessMm / 2));
    // NURBS output (STEP and future solid modeling) from the same surfaces the review mesh shows, in world mm.
    const nurbs = NurbsShell (grid, surfaces, { baseY : rect.baseY, direction : options.direction || '+y', id : options.shellName || 'Tray' });
    // Phase 2 check (on request): smooth lofted walls built from this shell's review field, reported without geometry.
    const loft = options.loftCheck ? LoftSummary (LoftPocketWalls (grid, top, { depthMm : achieved, wallToleranceMm : 0.25 * PulpTypes[draft.pulpType].toleranceMm, skirtWall : draft.skirtWall === true }), options.shellName || 'Tray') : null;
    const volume = ShellVolume (surfaces, grid);
    const metrics = { lengthMm : r1 (rect.lengthMm), widthMm : r1 (rect.widthMm), thicknessMm : draft.thicknessMm, formDepthMm : r1 (depth), achievedDepthMm : r1 (achieved), overallHeightMm : r1 (achieved + draft.thicknessMm), footprintLengthMm : r1 (bounds.size[0]), footprintWidthMm : r1 (bounds.size[2]), productHeightMm : r1 (bounds.size[1]), pocketCount : pockets.pocketCount, productIslands : islands.count, narrowestProductMm : islands.narrowestMm === null ? null : r1 (islands.narrowestMm), minRibMm : pockets.minRibMm === null ? null : r1 (pockets.minRibMm), detail, cellMm : Math.round (grid.cell * 1000) / 1000, gridNodes : grid.nx * grid.nz, triangles : component.triangleCount, fullGridTriangles : component.gridTriangles, volumeCm3 : r1 (volume / 1000), estimatedMassG : r1 (volume / 1000 * PulpTypes[draft.pulpType].densityGcm3), ribCount : features.ribs.length, lugCount : features.lugs.length, nestingPitchMm : features.nesting?.pitchMm ?? null, nestingRatio : features.nesting?.ratio ?? null };
    const checks = [...PulpChecks (draft, bounds, rect, metrics), ...features.warnings.map (w => ({ id : w.id, severity : w.severity || 'warning', message : w.message, basis : 'MP knowledge base · mp-des-structural-features' }))];
    progress ('done', 1);
    return { bounds, rect, origin, grid, metrics, checks, nurbs, loft, features : { ribs : features.ribs, lugs : features.lugs, rib : features.rib, nesting : features.nesting, hinge : features.hinge, trace : features.trace }, component, ...(options.keepSurfaces ? { surfaces, field } : {}) };
}

// Living hinge bead: a solid half-cylinder of radius ~ wall thickness along the longer flange edge (KB: hinge axis in the
// parting plane), centred on the parting plane, in the first shell's local frame (positions relative to its origin).
function HingeComponent (shell, draft)
{
    const rect = shell.rect, r = Math.max (1, draft.thicknessMm), y = shell.metrics.achievedDepthMm + rect.baseY, segments = 12, origin = shell.origin;
    // Edge frame: start point P, along-edge direction A (length L) and outward direction O.
    const alongX = rect.lengthMm >= rect.widthMm, L = alongX ? rect.lengthMm : rect.widthMm;
    const P = alongX ? [rect.x0, rect.z0] : [rect.x0, rect.z0], A = alongX ? [1, 0] : [0, 1], O = alongX ? [0, -1] : [-1, 0];
    const at = (a, o) => [P[0] + A[0] * a + O[0] * o, P[1] + A[1] * a + O[1] * o];
    const positions = [], normals = [], uvs = [], indices = [];
    const add = (a, o, yy, n) => { const [x, z] = at (a, o); positions.push (x - origin[0], yy - origin[1], z - origin[2]); normals.push (O[0] * n[0] + A[0] * n[2], n[1], O[1] * n[0] + A[1] * n[2]); uvs.push (0, 0); return positions.length / 3 - 1; };
    // n = [outward, up, along] components.
    const ring = a => { const ids = []; for (let s = 0; s <= segments; s++) { const g = -Math.PI / 2 + Math.PI * s / segments; ids.push (add (a, r * Math.cos (g), y + r * Math.sin (g), [Math.cos (g), Math.sin (g), 0])); } return ids; };
    const first = ring (0), last = ring (L);
    for (let s = 0; s < segments; s++) { indices.push (first[s], first[s + 1], last[s + 1], first[s], last[s + 1], last[s]); }
    for (const [a, along, flip] of [[0, -1, false], [L, 1, true]]) {
        const rim = []; for (let s = 0; s <= segments; s++) { const g = -Math.PI / 2 + Math.PI * s / segments; rim.push (add (a, r * Math.cos (g), y + r * Math.sin (g), [0, 0, along])); }
        for (let s = 1; s < segments; s++) { if (flip) { indices.push (rim[0], rim[s], rim[s + 1]); } else { indices.push (rim[0], rim[s + 1], rim[s]); } }
    }
    const t0 = add (0, 0, y + r, [-1, 0, 0]), b0 = add (0, 0, y - r, [-1, 0, 0]), t1 = add (L, 0, y + r, [-1, 0, 0]), b1 = add (L, 0, y - r, [-1, 0, 0]);
    indices.push (t0, b1, t1, t0, b0, b1);
    // The frame (A, up, O) is right-handed for an X-min edge and left-handed for a Z-min edge; wind outward in both.
    const handed = A[1] * O[0] - A[0] * O[1];
    if (handed < 0) { for (let i = 0; i < indices.length; i += 3) { const s = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = s; } }
    const p = Float32Array.from (positions);
    return { id : 'pulp-hinge', materialRole : 'pulp', positions : p, normals : Float32Array.from (normals), uvs : Float32Array.from (uvs), indices : Uint16Array.from (indices), triangleCount : indices.length / 3, edge : alongX ? 'length' : 'width' };
}

// Formed tray, or a clamshell of two shells meeting at a parting plane. All components come back in world mm relative to
// the plan origin (centre of the base sheet on the lowest product point).
export function PlanTray (triangles, draft, options = {})
{
    const mode = draft.clamshell || 'none', directions = ClamshellShells[mode], world = SenseBounds (triangles);
    const worldRect = SheetRect (world, draft), origin = Origin (worldRect);
    if (mode === 'none') {
        const shell = FormShell (triangles, draft, options);
        return { apiVersion : 1, units : 'mm', kind : 'tray', clamshell : 'none', draft : { ...draft }, bounds : shell.bounds, rect : shell.rect, origin : shell.origin, metrics : shell.metrics, checks : shell.checks, features : shell.features, components : [shell.component], nurbs : PlanNurbs ([shell.nurbs]), ...(shell.loft ? { loft : [shell.loft] } : {}) };
    }
    const axis = { 'top-bottom' : 1, 'side-x' : 0, 'side-z' : 2 }[mode], parting = world.min[axis] + world.size[axis] * draft.partingFraction;
    const shells = [], components = [];
    directions.forEach ((direction, index) => {
        const local = ToLocal (triangles, direction), localBounds = SenseBounds (local), depth = index === 0 ? parting - world.min[axis] : world.max[axis] - parting;
        const report = (phase, value) => options.onProgress?.(phase, (index + value) / directions.length);
        const shell = FormShell (local, draft, { ...options, depthMm : Math.max (1, depth), clamshell : mode, id : index === 0 ? 'pulp-shell-a' : 'pulp-shell-b', onProgress : report, direction, shellName : index === 0 ? 'Shell A' : 'Shell B' });
        shells.push ({ direction, shell, localBounds });
        components.push (ComponentToWorld (shell.component, direction, shell.origin, origin));
        if (index === 0 && shell.features.hinge) { components.push (ComponentToWorld (HingeComponent (shell, draft), direction, shell.origin, origin)); }
    });
    const metrics = { ...shells[0].shell.metrics, shells : shells.map (({ direction, shell }) => ({ direction, ...shell.metrics })), partingMm : r1 (parting - world.min[axis]), hinge : Boolean (shells[0].shell.features.hinge), triangles : components.reduce ((sum, c) => sum + c.triangleCount, 0), volumeCm3 : r1 (shells.reduce ((s, x) => s + x.shell.metrics.volumeCm3, 0)), estimatedMassG : r1 (shells.reduce ((s, x) => s + x.shell.metrics.estimatedMassG, 0)), pocketCount : shells.reduce ((s, x) => s + x.shell.metrics.pocketCount, 0) };
    const checks = shells.flatMap (({ direction, shell }) => shell.checks.map (c => ({ ...c, message : `Shell ${direction}: ${c.message}` })));
    checks.push ({ id : 'MP-CL1', severity : 'note', message : 'Clamshell flanges meet at the parting plane; a friction fit typically needs 0.2–0.5 mm interference (typical industry value), set in tooling.', basis : 'MP knowledge base · mp-des-structural-features (snap, lock and click features)' });
    return { apiVersion : 1, units : 'mm', kind : 'tray', clamshell : mode, draft : { ...draft }, bounds : world, rect : worldRect, origin, metrics, checks, features : { shells : shells.map (({ direction, shell }) => ({ direction, ...shell.features })), trace : shells[0].shell.features.trace }, components, nurbs : PlanNurbs (shells.map (({ shell }) => shell.nurbs)), ...(options.loftCheck ? { loft : shells.map (({ shell }) => shell.loft) } : {}) };
}

// Flat sheet(s) under the grouped products (one per shell for a clamshell), sized to the exact footprint plus the
// additional material and placed on the products' extreme point along each pull direction.
export function PlanSheet (triangles, draft)
{
    const mode = draft.clamshell || 'none', bounds = SenseBounds (triangles), worldRect = SheetRect (bounds, draft), origin = Origin (worldRect), components = [], shells = [];
    ClamshellShells[mode].forEach ((direction, index) => {
        const local = ToLocal (triangles, direction), rect = SheetRect (SenseBounds (local), draft), localOrigin = Origin (rect);
        const grid = { x0 : rect.x0, z0 : rect.z0, dx : rect.lengthMm, dz : rect.widthMm, nx : 2, nz : 2, cell : Math.max (rect.lengthMm, rect.widthMm) };
        const surfaces = SheetSurfaces (grid, draft);
        components.push (ComponentToWorld (ShellMesh (grid, surfaces, localOrigin, index ? 'pulp-sheet-b' : 'pulp-sheet'), direction, localOrigin, origin));
        shells.push (NurbsShell (grid, surfaces, { baseY : rect.baseY, direction, id : index ? 'Sheet B' : 'Sheet' }));
    });
    const volume = worldRect.lengthMm * worldRect.widthMm * draft.thicknessMm * components.length;
    const metrics = { lengthMm : r1 (worldRect.lengthMm), widthMm : r1 (worldRect.widthMm), thicknessMm : draft.thicknessMm, sheets : components.length, footprintLengthMm : r1 (bounds.size[0]), footprintWidthMm : r1 (bounds.size[2]), productHeightMm : r1 (bounds.size[1]), volumeCm3 : r1 (volume / 1000), estimatedMassG : r1 (volume / 1000 * PulpTypes[draft.pulpType].densityGcm3) };
    return { apiVersion : 1, units : 'mm', kind : 'sheet', clamshell : mode, draft : { ...draft }, bounds, rect : worldRect, origin, metrics, checks : PulpChecks (draft, bounds, worldRect), components, nurbs : PlanNurbs (shells) };
}

// NURBS output of a plan: one closed B-rep shell per formed shell or sheet (the clamshell hinge bead is display only for
// now), in world millimetres (absolute, matching the sensed products).
function LoftSummary (result, shell)
{
    return { shell, ok : result.ok, reason : result.reason, controls : result.controls ?? 0, maxDistanceMm : result.maxDistanceMm ?? null, toleranceMm : result.wallToleranceMm ?? null, merges : result.merges?.length || 0, walls : result.walls.map (w => ({ id : w.id, kind : w.kind, outlineControls : w.outlineControls, heightControls : w.heightControls, maxDistanceMm : w.maxDistanceMm, withinTolerance : w.withinTolerance })) };
}
function PlanNurbs (shells) { return { apiVersion : 1, units : 'mm', representation : 'brep', degree : 1, shells }; }

export function PlanPulp (stage, triangles, draft, options = {}) { return stage === 'tray' ? PlanTray (triangles, draft, options) : PlanSheet (triangles, draft); }
