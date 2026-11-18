import { CadExact, CadError } from './cadconversioncontract.js';

// Geometry-free inventory. No source names, colors, image data, paths or logs.
export function CadAppearanceReport (value, sourceOnly = false)
{
    CadExact (value, ['schemaVersion', 'sourceFormat', 'colors', 'transparency', 'materials', 'imageTextures', 'stl', 'validation']);
    if (value.schemaVersion !== 1 || !['step', 'parasolid'].includes (value.sourceFormat) || value.stl !== 'geometry_only' || value.validation !== (sourceOnly ? 'not_run' : 'passed')) { throw CadError ('invalid_request'); }
    for (const key of ['colors', 'transparency', 'materials']) {
        const item = CadExact (value[key], ['detected', 'glb', 'step']);
        if (!Number.isSafeInteger (item.detected) || item.detected < 0 || item.detected > 8192) { throw CadError ('invalid_request'); }
        for (const format of ['glb', 'step']) {
            const partial = key === 'materials' && format === 'glb' && item[format] === 'partial' && item.detected > 0;
            if (sourceOnly ? item[format] !== 'not_run' : !partial && (!['preserved', 'not_present', 'not_supported'].includes (item[format]) || item[format] === 'preserved' && item.detected === 0 || item[format] === 'not_present' && item.detected !== 0)) { throw CadError ('invalid_request'); }
        }
    }
    if (value.transparency.detected > value.colors.detected) { throw CadError ('invalid_request'); }
    CadExact (value.imageTextures, ['detected', 'status']);
    if (value.imageTextures.detected !== null || value.imageTextures.status !== 'not_exposed_by_reader') { throw CadError ('invalid_request'); }
    return JSON.parse (JSON.stringify (value));
}

export function CadAppearanceLines (value, sourceOnly = false)
{
    const report = CadAppearanceReport (value, sourceOnly);
    const labels = { colors : 'Source colors', transparency : 'Transparent styles', materials : 'Render materials' };
    const status = { preserved : 'preserved', partial : 'base color, metallic and roughness retained; other render properties unsupported', not_present : 'none detected', not_supported : 'not supported', not_run : 'not exported' };
    return [
        ...Object.entries (labels).map (([key, label]) => label + ': ' + report[key].detected + ' · GLB ' + status[report[key].glb] + ' · STEP ' + status[report[key].step] + '.'),
        'Image textures: this CAD reader does not expose bitmap images and their UV mapping. A textured GLB from the source application retains those assets.',
        'STL contains geometry only; use GLB to retain supported appearance.'
    ];
}
