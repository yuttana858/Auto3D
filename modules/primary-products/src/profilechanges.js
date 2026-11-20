import { BottleShape, DimensionChanges, UpdateProductDraft } from './state.js';
import { BottleBaseLimit, GlassThicknessPresets } from './bottleconstruction.js';
import { WallLimit } from './details.js';

// Product-space edits shared by the visual editor and the host command adapter.
export function ProfileChanges (draft, changes)
{
    const dimensions = ['widthMm', 'lengthMm', 'heightMm'], shapeKeys = ['neckDiameterMm', 'shoulderHeightMm', 'neckHeightMm', 'capHeightMm'];
    const detailKeys = ['wallMm', 'baseMm', 'glassPreset', 'capWallMm', 'capMaterial', 'capColor', 'closure'];
    const allowed = [...dimensions, ...shapeKeys, 'cornerRadiusMm', 'crossSection', ...detailKeys, 'optics', 'contents', 'material', 'color', 'roughness'];
    if (!changes || typeof changes !== 'object' || Array.isArray (changes) || !Object.keys (changes).length || Object.keys (changes).some (key => !allowed.includes (key))) { throw new Error ('Choose a profile dimension to edit.'); }
    if (Object.entries (changes).some (([key, value]) => [...dimensions, ...shapeKeys, 'cornerRadiusMm', 'wallMm', 'baseMm', 'capWallMm', 'roughness'].includes (key) && !Number.isFinite (value))) { throw new Error ('Enter a finite dimension.'); }
    if (draft.family !== 'bottle' && Object.keys (changes).some (key => [...shapeKeys, 'cornerRadiusMm', 'crossSection'].includes (key))) { throw new Error ('Bottle shape controls apply only to bottles.'); }
    const size = Object.fromEntries (Object.entries (changes).filter (([key]) => dimensions.includes (key)));
    const sizingDraft = changes.crossSection === undefined ? draft : { ...draft, bottleSection : changes.crossSection === 'round' ? undefined : { shape : changes.crossSection, depthMm : changes.lengthMm ?? draft.bottleSection?.depthMm ?? draft.diameterMm * .6 } };
    const patch = Object.keys (size).length ? DimensionChanges (sizingDraft, size) : {};
    if (draft.family === 'bottle') {
        patch.bottleShape = { ...BottleShape (draft), ...Object.fromEntries (Object.entries (changes).filter (([key]) => shapeKeys.includes (key))) };
        if (changes.crossSection !== undefined) {
            if (!['round', 'oval', 'rectangle'].includes (changes.crossSection)) { throw new Error ('Choose a round, oval or rounded-rectangle cross-section.'); }
            patch.bottleSection = changes.crossSection === 'round' ? null : { shape : changes.crossSection, depthMm : changes.lengthMm ?? draft.bottleSection?.depthMm ?? draft.diameterMm * .6, ...(changes.crossSection === 'rectangle' && draft.bottleSection?.cornerRadiusMm !== undefined ? { cornerRadiusMm : draft.bottleSection.cornerRadiusMm } : {}) };
        }
        if (changes.cornerRadiusMm !== undefined) {
            const section = patch.bottleSection === undefined ? draft.bottleSection : patch.bottleSection;
            if (section?.shape !== 'rectangle') { throw new Error ('Corner radius applies to rounded rectangles.'); }
            patch.bottleSection = { ...section, cornerRadiusMm : changes.cornerRadiusMm };
        }
    }
    for (const key of ['material', 'color', 'roughness', 'optics', 'contents']) { if (changes[key] !== undefined) { patch[key] = changes[key]; } }
    const detailChanges = Object.fromEntries (Object.entries (changes).filter (([key]) => detailKeys.includes (key)));
    if (Object.keys (detailChanges).length) {
        if (draft.family !== 'bottle' && Object.keys (detailChanges).some (key => key !== 'wallMm')) { throw new Error ('Cap and glass construction controls apply only to bottles.'); }
        patch.details = { ...(draft.details || {}), ...detailChanges };
        if (changes.glassPreset !== undefined && changes.glassPreset !== 'custom') {
            const preset = GlassThicknessPresets[changes.glassPreset]; if (!preset) { throw new Error ('Choose a glass thickness preset.'); }
            const sized = { ...draft, ...patch }; patch.details.wallMm = Math.min (preset.wallMm, WallLimit (sized)); patch.details.baseMm = Math.min (preset.baseMm, BottleBaseLimit (sized));
        } else if (draft.family === 'bottle' && (changes.wallMm !== undefined || changes.baseMm !== undefined)) { patch.details.glassPreset = 'custom'; }
        if (draft.family === 'bottle' && changes.wallMm !== undefined && changes.baseMm === undefined && patch.details.baseMm !== undefined) { patch.details.baseMm = Math.max (patch.details.baseMm, patch.details.wallMm); }
    }
    return UpdateProductDraft (draft, patch);
}

