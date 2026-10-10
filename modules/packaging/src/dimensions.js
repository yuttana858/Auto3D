import { ValidateFefco, FlapDepth } from './fefco.js';

export function ValidateTolerance (value)
{
    if (!Number.isFinite (value) || value < 0 || value > 50) { throw new Error ('Dimensional tolerance must be 0–50 mm.'); } return value;
}
export function FefcoDimensionAllowances (input)
{
    const p = ValidateFefco (input); const innerLayers = FlapDepth (p) * 2 > p.length ? 2 : 1; const outerLayers = p.code === '0202' || p.code === '0203' ? 2 : 1;
    const layers = innerLayers + outerLayers;
    return { length : 2 * p.thickness, width : 2 * p.thickness, height : (p.code === '0200' ? layers : 2 * layers) * p.thickness, baseLayers : layers, topLayers : p.code === '0200' ? 0 : layers };
}
export function FefcoDimensions (input, tolerance = 0)
{
    const p = ValidateFefco (input); ValidateTolerance (tolerance); const allowance = FefcoDimensionAllowances (p); const inside = {}; const outside = {}; const nominalInside = {}; const nominalOutside = {};
    for (const key of ['length', 'width', 'height']) { nominalInside[key] = p[key]; nominalOutside[key] = p[key] + allowance[key]; inside[key] = p[key] - tolerance; outside[key] = nominalOutside[key] + tolerance; }
    return { units : 'mm', inside, outside, nominalInside, nominalOutside, thickness : p.thickness, tolerance, allowance };
}
export function ResolveFefcoDimensions (input, dimensions, basis = 'inside', tolerance = 0)
{
    if (!['inside', 'outside'].includes (basis) || !dimensions || Object.keys (dimensions).some (key => !['length', 'width', 'height'].includes (key)) || ['length', 'width', 'height'].some (key => !Number.isFinite (dimensions[key]))) { throw new Error ('Enter inside or outside L, W and H dimensions.'); }
    ValidateTolerance (tolerance); const p = ValidateFefco (input);
    if (basis === 'inside') { return ValidateFefco ({ ...p, ...Object.fromEntries (['length', 'width', 'height'].map (key => [key, dimensions[key] + tolerance])) }); }
    const result = { ...p, length : dimensions.length - 2 * p.thickness - tolerance, width : dimensions.width - 2 * p.thickness - tolerance };
    // Resolve L/W before the flap stack: an overlap can change the layer count.
    const allowance = FefcoDimensionAllowances ({ ...result, height : Math.max (result.height, 8 * p.thickness) }); result.height = dimensions.height - allowance.height - tolerance; return ValidateFefco (result);
}
