import { ValidateFefco } from './fefco.js';

export const AutoPackClearanceMm = 0.0254;
// Bounds are canonical mm, Y up. The final product stays centered on X/Z with
// its lower face at Y=0. The host translates this frame to the world AABB.
export function CreateAutoPackPlan (input)
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (key => !['size', 'thickness', 'clearanceMm'].includes (key))) { throw new Error ('Invalid Auto Pack dimensions.'); }
    const { size, thickness = 3, clearanceMm = AutoPackClearanceMm } = input;
    if (!Array.isArray (size) || size.length !== 3 || !size.every (value => Number.isFinite (value) && value > 0)) { throw new Error ('Select a three-dimensional product with finite, positive bounds.'); }
    if (!Number.isFinite (clearanceMm) || clearanceMm < AutoPackClearanceMm || clearanceMm > 50) { throw new Error ('Auto Pack clearance must be 0.0254–50 mm per face.'); }
    const [x, y, z] = size, swapped = x > z;
    // The original RSC has an INSIDE glue tab. Reserve its one-caliper intrusion
    // rather than allowing it to intersect a tightly fitted product.
    const parameters = ValidateFefco ({ code : '0201', length : Math.max (x, z) + 2 * clearanceMm + thickness, width : Math.min (x, z) + 2 * clearanceMm, height : y + 2 * clearanceMm, thickness, closure : 'closed' });
    const productMm = { width : x, length : z, height : y };
    const usableInsideMm = { width : x + 2 * clearanceMm, length : z + 2 * clearanceMm, height : y + 2 * clearanceMm };
    const insideMm = { ...usableInsideMm, [swapped ? 'width' : 'length'] : (swapped ? x : z) + 2 * clearanceMm + thickness };
    return { version : 1, units : 'mm', size : [...size], thickness, clearanceMm, swapped, productMm, insideMm, usableInsideMm, glueTabAllowanceMm : thickness, parameters };
}
