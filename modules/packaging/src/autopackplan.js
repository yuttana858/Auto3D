import { ValidateFefco } from './fefco.js';
import { EngineeringAxes, ScoreForTarget } from './engineering.js';

export const AutoPackClearanceMm = 0.0254;
const Keys = ['size', 'thickness', 'clearanceMm', 'material'];

// Bounds are canonical mm, Y up. The final product stays centered on X/Z with
// its lower face at Y=0. The host translates this frame to the world AABB.
//
// With a board material (the generation board record and its allowance factors),
// Auto Pack drives the RSC exactly like Generate with the inside basis: the
// required INSIDE dimensions (product + clearance, plus the glue-tab reserve)
// become score spans through ScoreForTarget, so the carton's engineering
// measurements, CAD dimensions and board record agree with the fit.
// Without a material (cartons saved before 0.79.0) the original score-equals-
// inside fit is reproduced so saved cartons still replay.
export function CreateAutoPackPlan (input)
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (key => !Keys.includes (key))) { throw new Error ('Invalid Auto Pack dimensions.'); }
    const { size, clearanceMm = AutoPackClearanceMm, material = null } = input;
    if (!Array.isArray (size) || size.length !== 3 || !size.every (value => Number.isFinite (value) && value > 0)) { throw new Error ('Select a three-dimensional product with finite, positive bounds.'); }
    if (!Number.isFinite (clearanceMm) || clearanceMm < AutoPackClearanceMm || clearanceMm > 50) { throw new Error ('Auto Pack clearance must be 0.0254–50 mm per face.'); }
    if (material !== null && (typeof material !== 'object' || !Number.isFinite (material.caliperMm) || !Array.isArray (material.insideFactors) || material.insideFactors.length !== 3)) { throw new Error ('Auto Pack needs a board record with caliper and inside allowance factors.'); }
    const thickness = material ? material.caliperMm : input.thickness ?? 3;
    const [x, y, z] = size, swapped = x > z;
    const productMm = { width : x, length : z, height : y };
    const usableInsideMm = { width : x + 2 * clearanceMm, length : z + 2 * clearanceMm, height : y + 2 * clearanceMm };
    const insideMm = { ...usableInsideMm, [swapped ? 'width' : 'length'] : (swapped ? x : z) + 2 * clearanceMm + thickness };
    // FEFCO RSC axes: length is the longer horizontal side. The original RSC has an
    // INSIDE glue tab, so the longer side reserves one caliper for its intrusion.
    const targets = { length : Math.max (x, z) + 2 * clearanceMm + thickness, width : Math.min (x, z) + 2 * clearanceMm, height : y + 2 * clearanceMm };
    let score;
    if (material) {
        score = Object.fromEntries (EngineeringAxes.map ((id, axis) => [id, ScoreForTarget ({ axis, basis : 'inside', targetMm : targets[id] }, material)]));
    } else { score = targets; }
    const parameters = ValidateFefco ({ code : '0201', ...score, thickness, closure : 'closed' });
    const allowanceMm = material ? Object.fromEntries (EngineeringAxes.map ((id, axis) => [id, material.insideFactors[axis] * thickness])) : { length : 0, width : 0, height : 0 };
    return { version : 1, units : 'mm', basis : material ? 'engineering-inside' : 'legacy-score', size : [...size], thickness, clearanceMm, swapped, productMm, insideMm, usableInsideMm, insideTargetsMm : targets, allowanceMm, glueTabAllowanceMm : thickness, parameters };
}
