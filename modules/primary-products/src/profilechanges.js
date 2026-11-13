import { BottleShape, DimensionChanges, UpdateProductDraft } from './state.js';

// Product-space edits shared by the visual editor and the host command adapter.
export function ProfileChanges (draft, changes)
{
    const dimensions = ['widthMm', 'lengthMm', 'heightMm'], shapeKeys = ['neckDiameterMm', 'shoulderHeightMm', 'neckHeightMm', 'capHeightMm'];
    const allowed = [...dimensions, ...shapeKeys, 'cornerRadiusMm', 'crossSection', 'wallMm', 'optics', 'contents', 'material', 'color', 'roughness'];
    if (!changes || typeof changes !== 'object' || Array.isArray (changes) || !Object.keys (changes).length || Object.keys (changes).some (key => !allowed.includes (key))) { throw new Error ('Choose a profile dimension to edit.'); }
    if (Object.entries (changes).some (([key, value]) => [...dimensions, ...shapeKeys, 'cornerRadiusMm', 'wallMm', 'roughness'].includes (key) && !Number.isFinite (value))) { throw new Error ('Enter a finite dimension.'); }
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
    if (changes.wallMm !== undefined) { patch.details = { ...(draft.details || {}), wallMm : changes.wallMm }; }
    return UpdateProductDraft (draft, patch);
}

