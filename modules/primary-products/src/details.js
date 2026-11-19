import { BottleBaseLimit, BottleCapWallLimit, BottleGlassWallLimit, CapMaterials, GlassThicknessPresets } from './bottleconstruction.js';
// Optional versioned presentation detail; legacy definitions keep their original envelope.
export function DefaultProductDetails (d, category)
{
    return { wallMm : d.family === 'pouch' ? .1 : d.family === 'can' ? .25 : d.family === 'clamshell' ? .6 : /glass/i.test (d.material) ? 2 : .8, textureStrength : .5, textureScaleMm : 12,
        ...(d.family === 'bottle' ? { shoulder : 'rounded', closure : 'ribbed' } : {}),
        ...(d.family === 'can' ? { canStyle : category === 'beverages' || d.material === 'aluminum' ? 'beverage' : d.heightMm < 50 ? 'tin' : 'food' } : {}),
        ...(d.family === 'clamshell' ? { shellStyle : category === 'clamshell-retail' ? 'retail' : 'food' } : {}) };
}
export function WallLimit (d)
{
    const width = d.widthMm || d.diameterMm, depth = d.depthMm || d.bottleSection?.depthMm || width;
    if (d.family === 'bottle' && /glass/i.test (d.material)) {
        return BottleGlassWallLimit (d);
    }
    return Math.min (d.family === 'pouch' ? depth * .008 : Math.min (width, depth, d.heightMm) * .04, d.family === 'bottle' ? (d.bottleShape?.neckDiameterMm || Math.min (width, depth) * .42) * .08 : 10);
}
export function ValidateProductDetails (d, input, explicit = true)
{
    if (input === null) { return null; }
    const defaults = DefaultProductDetails (d);
    const bottleFields = d.family === 'bottle' ? ['glassPreset', 'baseMm', 'capWallMm', 'capMaterial', 'capColor'] : [];
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (k => !Object.hasOwn (defaults, k) && !bottleFields.includes (k))) { throw new Error ('Invalid product detail settings.'); }
    const next = { ...defaults, ...input }, limit = WallLimit (d);
    if (Object.hasOwn (GlassThicknessPresets, input.glassPreset) && input.wallMm === undefined && input.baseMm === undefined) { next.wallMm = Math.min (GlassThicknessPresets[input.glassPreset].wallMm, limit); next.baseMm = Math.min (GlassThicknessPresets[input.glassPreset].baseMm, BottleBaseLimit (d)); }
    if (!explicit || input.wallMm === undefined) { next.wallMm = Math.min (next.wallMm, limit); }
    if (!Number.isFinite (next.wallMm) || next.wallMm < .001 || next.wallMm > limit || !Number.isFinite (next.textureStrength) || next.textureStrength < 0 || next.textureStrength > 1 || !Number.isFinite (next.textureScaleMm) || next.textureScaleMm < 1 || next.textureScaleMm > 100) { throw new Error ('Wall thickness must fit the product; texture strength is 0–1 and scale is 1–100 mm.'); }
    for (const [key, values] of [['shoulder', ['rounded', 'sloped']], ['closure', ['ribbed', 'smooth', 'fliptop']], ['canStyle', ['beverage', 'food', 'tin']], ['shellStyle', ['retail', 'food']]]) { if (next[key] !== undefined && !values.includes (next[key])) { throw new Error ('Invalid ' + key + ' detail.'); } }
    if (next.glassPreset !== undefined && !['custom', ...Object.keys (GlassThicknessPresets)].includes (next.glassPreset)) { throw new Error ('Choose a glass thickness preset.'); }
    for (const [key, limit] of [['baseMm', BottleBaseLimit (d)], ['capWallMm', BottleCapWallLimit (d)]]) {
        if (next[key] === undefined) { continue; }
        if (!explicit && Number.isFinite (next[key])) { next[key] = Math.min (next[key], limit); }
        if (!Number.isFinite (next[key]) || next[key] < .01 || next[key] > limit) { throw new Error ('The ' + (key === 'baseMm' ? 'base' : 'cap wall') + ' thickness must fit the bottle.'); }
    }
    if (next.baseMm !== undefined && next.baseMm < next.wallMm) { throw new Error ('The bottle base must be at least as thick as the wall.'); }
    if (next.capMaterial !== undefined && !Object.hasOwn (CapMaterials, next.capMaterial)) { throw new Error ('Choose a cap material.'); }
    if (next.capColor !== undefined) { if (typeof next.capColor !== 'string' || !/^#[a-fA-F0-9]{6}$/.test (next.capColor)) { throw new Error ('Enter a six-digit cap color.'); } next.capColor = next.capColor.toLowerCase (); }
    if (Object.hasOwn (GlassThicknessPresets, next.glassPreset)) { const preset = GlassThicknessPresets[next.glassPreset]; if (next.wallMm !== preset.wallMm || next.baseMm !== preset.baseMm) { next.glassPreset = 'custom'; } }
    return next;
}
export function ScaleProductChanges (d, factor)
{
    if (!Number.isFinite (factor) || factor < .1 || factor > 10) { throw new Error ('Scale must be 0.1–10 times the current size.'); }
    const changes = { heightMm : d.heightMm * factor };
    for (const key of ['widthMm', 'depthMm', 'diameterMm']) { if (d[key] !== undefined) { changes[key] = d[key] * factor; } }
    if (d.bottleShape) { changes.bottleShape = Object.fromEntries (Object.entries (d.bottleShape).map (([k, n]) => [k, n * factor])); }
    if (d.bottleSection) { changes.bottleSection = { ...d.bottleSection, depthMm : d.bottleSection.depthMm * factor, ...(d.bottleSection.cornerRadiusMm ? { cornerRadiusMm : d.bottleSection.cornerRadiusMm * factor } : {}) }; }
    if (d.pouchShape) { changes.pouchShape = { ...d.pouchShape, ...(d.pouchShape.gussetMm ? { gussetMm : d.pouchShape.gussetMm * factor } : {}), ...(d.pouchShape.spout ? { spout : { ...d.pouchShape.spout, diameterMm : d.pouchShape.spout.diameterMm * factor } } : {}) }; }
    return changes;
}
