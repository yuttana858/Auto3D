// Optional versioned presentation detail; legacy definitions keep their original envelope.
export function DefaultProductDetails (d, category)
{
    return { wallMm : d.family === 'pouch' ? .1 : d.family === 'can' ? .25 : d.family === 'clamshell' ? .6 : d.material === 'glass' ? 1.5 : .8, textureStrength : .5, textureScaleMm : 12,
        ...(d.family === 'bottle' ? { shoulder : 'rounded', closure : 'ribbed' } : {}),
        ...(d.family === 'can' ? { canStyle : category === 'beverages' || d.material === 'aluminum' ? 'beverage' : d.heightMm < 50 ? 'tin' : 'food' } : {}),
        ...(d.family === 'clamshell' ? { shellStyle : category === 'clamshell-retail' ? 'retail' : 'food' } : {}) };
}
export function WallLimit (d)
{
    const width = d.widthMm || d.diameterMm, depth = d.depthMm || d.bottleSection?.depthMm || width;
    return Math.min (d.family === 'pouch' ? depth * .008 : Math.min (width, depth, d.heightMm) * .04, d.family === 'bottle' ? (d.bottleShape?.neckDiameterMm || Math.min (width, depth) * .42) * .08 : 10);
}
export function ValidateProductDetails (d, input, explicit = true)
{
    if (input === null) { return null; }
    const defaults = DefaultProductDetails (d);
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (k => !Object.hasOwn (defaults, k))) { throw new Error ('Invalid product detail settings.'); }
    const next = { ...defaults, ...input }, limit = WallLimit (d);
    if (!explicit || input.wallMm === undefined) { next.wallMm = Math.min (next.wallMm, limit); }
    if (!Number.isFinite (next.wallMm) || next.wallMm < .001 || next.wallMm > limit || !Number.isFinite (next.textureStrength) || next.textureStrength < 0 || next.textureStrength > 1 || !Number.isFinite (next.textureScaleMm) || next.textureScaleMm < 1 || next.textureScaleMm > 100) { throw new Error ('Wall thickness must fit the product; texture strength is 0–1 and scale is 1–100 mm.'); }
    for (const [key, values] of [['shoulder', ['rounded', 'sloped']], ['closure', ['ribbed', 'smooth', 'fliptop']], ['canStyle', ['beverage', 'food', 'tin']], ['shellStyle', ['retail', 'food']]]) { if (next[key] !== undefined && !values.includes (next[key])) { throw new Error ('Invalid ' + key + ' detail.'); } }
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
