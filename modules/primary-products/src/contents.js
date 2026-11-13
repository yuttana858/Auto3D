// Static presentation properties. Viscosity is retained in mPa·s, not simulated.
export const ContentPresets = Object.freeze ({
    liquid : { name : 'Liquid · water', color : '#c9e9ef', opacity : .18, viscosity : 1, ior : 1.333, roughness : .06 },
    oil : { name : 'Oil', color : '#cfaa37', opacity : .48, viscosity : 80, ior : 1.47, roughness : .1 },
    syrup : { name : 'Syrup', color : '#8a431b', opacity : .8, viscosity : 3000, ior : 1.49, roughness : .12 },
    lotion : { name : 'Lotion', color : '#f2e9d9', opacity : 1, viscosity : 10000, ior : 1.45, roughness : .32 }
});
const color = value => typeof value === 'string' && /^#[a-fA-F0-9]{6}$/.test (value);
export function ValidateContents (input)
{
    if (input === null) { return null; }
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (k => !['type', 'fillPercent', 'color', 'opacity', 'viscosity'].includes (k)) || !Object.hasOwn (ContentPresets, input.type)) { throw new Error ('Choose liquid, oil, syrup or lotion.'); }
    const preset = ContentPresets[input.type], result = { fillPercent : 70, color : preset.color, opacity : preset.opacity, viscosity : preset.viscosity, ...input };
    if (!color (result.color) || !Number.isFinite (result.fillPercent) || result.fillPercent < 0 || result.fillPercent > 100 || !Number.isFinite (result.opacity) || result.opacity < 0 || result.opacity > 1 || !Number.isFinite (result.viscosity) || result.viscosity < .1 || result.viscosity > 1000000) { throw new Error ('Fill and opacity must be 0–100%; viscosity must be 0.1–1,000,000 mPa·s.'); }
    return { ...result, color : result.color.toLowerCase () };
}
export function ValidateOptics (input)
{
    if (input === null) { return null; }
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (k => !['color', 'opacity', 'ior', 'tintDistanceMm'].includes (k))) { throw new Error ('Invalid glass appearance settings.'); }
    const r = { color : '#ffffff', opacity : 0, ior : 1.5, tintDistanceMm : 25, ...input };
    if (!color (r.color) || !Number.isFinite (r.opacity) || r.opacity < 0 || r.opacity > 1 || !Number.isFinite (r.ior) || r.ior < 1 || r.ior > 2.5 || !Number.isFinite (r.tintDistanceMm) || r.tintDistanceMm < .1 || r.tintDistanceMm > 1000) { throw new Error ('Glass opacity must be 0–100%, IOR 1–2.5 and tint depth 0.1–1000 mm.'); }
    return { ...r, color : r.color.toLowerCase () };
}
