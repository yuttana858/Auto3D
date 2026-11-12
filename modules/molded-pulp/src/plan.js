import { PulpTypes } from './state.js';
import { SenseBounds, SheetRect, FormGrid, BottomHeightfield } from './surface.js';
import { FormSurfaces, SheetSurfaces, PocketMetrics, ShellVolume, FootprintIslands } from './tray.js';
import { ShellMesh } from './mesh.js';

const kb = 'MP knowledge base · mp-des-dfm-rules-by-process-type';
const r1 = v => Math.round (v * 10) / 10;

// Design-for-manufacture review of a planned tray. Rules and their basis come from the MP knowledge base; values marked
// there as typical industry values are advisory, so every finding is a warning or note, never a hard block.
export function PulpChecks (draft, bounds, rect, metrics = null)
{
    const type = PulpTypes[draft.pulpType], out = [], add = (id, severity, message) => out.push ({ id, severity, message, basis : kb });
    if (draft.thicknessMm < type.rangeMm[0] || draft.thicknessMm > type.rangeMm[1]) { add ('MP-T1', 'warning', `${draft.thicknessMm} mm is outside the ${type.rangeMm[0]}–${type.rangeMm[1]} mm range reported for ${type.short}.`); }
    if (draft.draftDeg === 0) { add ('MP-D0', 'warning', 'No draft: a straight-pull pulp tool needs draft to release the part.'); }
    else if (draft.draftDeg < type.minDraftDeg) { add ('MP-D1', 'warning', `Draft ${draft.draftDeg}° is below the ${type.minDraftDeg}° minimum suggested for ${type.short}.`); }
    if (draft.draftDeg > 7) { add ('MP-D2', 'note', 'Draft above 7° exceeds common published guidance (1–7°); pockets will open wide.'); }
    if (draft.formDepthMm > 90) { add ('MP-H1', 'warning', 'Form depth above 90 mm exceeds a published single-cavity depth limit.'); }
    const narrow = metrics?.narrowestProductMm ?? Math.min (bounds.size[0], bounds.size[2]);
    if (draft.formDepthMm > narrow) { add ('MP-H2', 'warning', `Form depth ${r1 (draft.formDepthMm)} mm exceeds the narrowest product footprint (${r1 (narrow)} mm); height-to-width above about 1:1 is hard to form.`); }
    if (draft.formDepthMm > bounds.size[1]) { add ('MP-H3', 'note', `Form depth is taller than the products (${r1 (bounds.size[1])} mm); the tray rim will stand above them.`); }
    const run = draft.draftDeg > 0 ? draft.formDepthMm * Math.tan (draft.draftDeg * Math.PI / 180) : 0, needed = run + draft.thicknessMm + draft.clearanceMm;
    const margin = Math.min (draft.extraLengthMm, draft.extraWidthMm) / 2;
    if (margin < needed) { add ('MP-M1', 'warning', `Add material: ${r1 (margin)} mm per side is less than the ${r1 (needed)} mm the drafted outer wall needs to reach full depth. Increase additional length/width to at least ${r1 (needed * 2)} mm.`); }
    if (draft.clearanceMm === 0) { add ('MP-C1', 'note', 'Zero clearance: products may bind in their pockets after drying shrinkage.'); }
    if (metrics) {
        if (metrics.minRibMm !== null && metrics.minRibMm < 8) { add ('MP-R1', 'warning', `Pockets are ${r1 (metrics.minRibMm)} mm apart at the plateau; keep cavities at least 8 mm apart.`); }
        if (metrics.productIslands > metrics.pocketCount) { add ('MP-R2', 'warning', `${metrics.productIslands} separate product footprints share ${metrics.pocketCount || 'no'} enclosed pocket${metrics.pocketCount === 1 ? '' : 's'}: products are too close for a full-depth rib between them. Spread them apart or reduce depth, draft or clearance.`); }
        if (metrics.achievedDepthMm < draft.formDepthMm - 0.01) { add ('MP-H4', 'note', `Achieved depth is ${r1 (metrics.achievedDepthMm)} mm; the sheet or draft limits the requested ${r1 (draft.formDepthMm)} mm.`); }
    }
    return out;
}

function Sense (triangles) { return SenseBounds (triangles); }

// Flat sheet of pulp directly under the grouped products, sized to the exact footprint plus additional material.
export function PlanSheet (triangles, draft)
{
    const bounds = Sense (triangles), rect = SheetRect (bounds, draft), origin = [(rect.x0 + rect.x1) / 2, rect.baseY, (rect.z0 + rect.z1) / 2];
    const grid = { x0 : rect.x0, z0 : rect.z0, dx : rect.lengthMm, dz : rect.widthMm, nx : 2, nz : 2, cell : Math.max (rect.lengthMm, rect.widthMm) };
    const surfaces = SheetSurfaces (grid, draft), volume = rect.lengthMm * rect.widthMm * draft.thicknessMm;
    const metrics = { lengthMm : r1 (rect.lengthMm), widthMm : r1 (rect.widthMm), thicknessMm : draft.thicknessMm, footprintLengthMm : r1 (bounds.size[0]), footprintWidthMm : r1 (bounds.size[2]), productHeightMm : r1 (bounds.size[1]), volumeCm3 : r1 (volume / 1000), estimatedMassG : r1 (volume / 1000 * PulpTypes[draft.pulpType].densityGcm3) };
    return { apiVersion : 1, units : 'mm', kind : 'sheet', draft : { ...draft }, bounds, rect, origin, metrics, checks : PulpChecks (draft, bounds, rect), components : [ShellMesh (grid, surfaces, origin, 'pulp-sheet')] };
}

// Formed tray: sheet pulled up around the products to the form depth, with clearance, draft and true wall thickness.
export function PlanTray (triangles, draft)
{
    const bounds = Sense (triangles), rect = SheetRect (bounds, draft), origin = [(rect.x0 + rect.x1) / 2, rect.baseY, (rect.z0 + rect.z1) / 2];
    const grid = FormGrid (rect, draft), field = BottomHeightfield (triangles, grid, rect.baseY), surfaces = FormSurfaces (field, grid, draft);
    let achieved = 0; for (const v of surfaces.top) { if (v > achieved) { achieved = v; } }
    const pockets = PocketMetrics (surfaces.top, grid, achieved), islands = FootprintIslands (field, grid), volume = ShellVolume (surfaces, grid);
    const metrics = { lengthMm : r1 (rect.lengthMm), widthMm : r1 (rect.widthMm), thicknessMm : draft.thicknessMm, formDepthMm : draft.formDepthMm, achievedDepthMm : r1 (achieved), overallHeightMm : r1 (achieved + draft.thicknessMm), footprintLengthMm : r1 (bounds.size[0]), footprintWidthMm : r1 (bounds.size[2]), productHeightMm : r1 (bounds.size[1]), pocketCount : pockets.pocketCount, productIslands : islands.count, narrowestProductMm : islands.narrowestMm === null ? null : r1 (islands.narrowestMm), minRibMm : pockets.minRibMm === null ? null : r1 (pockets.minRibMm), cellMm : Math.round (grid.cell * 1000) / 1000, gridNodes : grid.nx * grid.nz, volumeCm3 : r1 (volume / 1000), estimatedMassG : r1 (volume / 1000 * PulpTypes[draft.pulpType].densityGcm3) };
    return { apiVersion : 1, units : 'mm', kind : 'tray', draft : { ...draft }, bounds, rect, origin, metrics, checks : PulpChecks (draft, bounds, rect, metrics), components : [ShellMesh (grid, surfaces, origin, 'pulp-tray')] };
}
