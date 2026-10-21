// Appearance parameters only. These values never enter manufacturing geometry.
export const SurfaceReliefDefaults = Object.freeze ({ grain : 0.35, flute : 0.25, cycles : 10, direction : 'vertical', impression : 'off', impressionStrength : 0.6, polarity : 'light', strength : 0.3, maskScale : 1, maskU : 0.5, maskV : 0.5 });
export function ValidateSurfaceRelief (input = {})
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (key => !Object.hasOwn (SurfaceReliefDefaults, key))) { throw new Error ('Invalid surface relief settings.'); }
    const value = { ...SurfaceReliefDefaults, ...input };
    for (const key of ['grain', 'flute', 'impressionStrength', 'maskU', 'maskV']) { if (!Number.isFinite (value[key]) || value[key] < 0 || value[key] > 1) { throw new Error (key + ' must be between 0 and 1.'); } }
    if (!Number.isFinite (value.maskScale) || value.maskScale < 0.1 || value.maskScale > 1) { throw new Error ('Mask size must be between 0.1 and 1 of the UV tile.'); }
    if (!Number.isInteger (value.cycles) || value.cycles < 1 || value.cycles > 64 || !Number.isFinite (value.strength) || value.strength < 0 || value.strength > 2 || !['vertical', 'horizontal'].includes (value.direction) || !['off', 'emboss', 'deboss'].includes (value.impression) || !['light', 'dark'].includes (value.polarity)) { throw new Error ('Invalid relief direction, spacing, impression or strength.'); }
    return value;
}

export const SpotVarnishDefaults = Object.freeze ({ enabled : true, gloss : 0.9, reflectivity : 1, polarity : 'light', maskScale : 1, maskU : 0.5, maskV : 0.5 });
export function ValidateSpotVarnish (input = {})
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (key => !Object.hasOwn (SpotVarnishDefaults, key))) { throw new Error ('Invalid spot varnish settings.'); }
    const value = { ...SpotVarnishDefaults, ...input };
    ValidateSurfaceRelief ({ polarity : value.polarity, maskScale : value.maskScale, maskU : value.maskU, maskV : value.maskV });
    if (typeof value.enabled !== 'boolean' || !Number.isFinite (value.gloss) || value.gloss < 0 || value.gloss > 1 || !Number.isFinite (value.reflectivity) || value.reflectivity < 0 || value.reflectivity > 1) { throw new Error ('Varnish gloss and reflectivity must be between 0 and 1.'); }
    return value;
}
