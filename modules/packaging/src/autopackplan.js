import { ValidateFefco, FlapDepth } from './fefco.js';
import { FefcoStyles } from './catalog.js';
import { EngineeringAxes, ScoreForTarget } from './engineering.js';

export const AutoPackClearanceMm = 0.0254;
const Keys = ['size', 'thickness', 'clearanceMm', 'material', 'code'];
// Flap stack per style, as the generator folds it (inner flaps, plus one outer layer, or two when outer flaps overlap).
function FlapStack (data)
{
    const inner = FlapDepth (data) * 2 > data.length ? 2 : 1, layers = inner + (data.code === '0202' || data.code === '0203' ? 2 : 1);
    return { base : layers, top : data.code === '0200' ? 0 : layers };
}
// Every style the Packaging generator lists can be fitted: the plan, fold rig and product-clearance audit are generic.
export const AutoPackStyles = () => FefcoStyles.map (style => ({ code : style.code, acronym : style.acronym, name : style.name }));

// Bounds are canonical mm, Y up. The final product stays centered on X/Z with
// its lower face at Y=0. The host translates this frame to the world AABB.
//
// With a board material (the generation board record and its allowance factors),
// Auto Pack drives the RSC exactly like Generate with the inside basis: the
// required INSIDE dimensions (product + clearance, plus the glue-tab reserve)
// become score spans through ScoreForTarget, so the carton's engineering
// measurements, CAD dimensions and board record agree with the fit.
// Without a material (cartons saved before 0.80.0) the original score-equals-
// inside fit is reproduced so saved cartons still replay.
export function CreateAutoPackPlan (input)
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (key => !Keys.includes (key))) { throw new Error ('Invalid Auto Pack dimensions.'); }
    const { size, clearanceMm = AutoPackClearanceMm, material = null, code = '0201' } = input;
    if (!FefcoStyles.some (style => style.code === code)) { throw new Error ('Choose a box style from the Packaging generator catalog.'); }
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
    // Board allowance factors are calibrated on the RSC stack (two flap layers at the base and two at the top); other styles
    // reserve their own stack relative to it (an HSC has no top flaps, overlap styles add layers). The width and overlap
    // that set the stack are known before scoring, so the stack is resolved from the target width.
    const widthTarget = Math.min (x, z) + 2 * clearanceMm, overlap = Math.min (25, widthTarget / 4);
    const stack = FlapStack ({ code, length : Math.max (x, z) + 2 * clearanceMm + thickness, width : widthTarget, overlap });
    const targets = { length : Math.max (x, z) + 2 * clearanceMm + thickness, width : widthTarget, height : y + 2 * clearanceMm + (stack.base + stack.top - 4) * thickness };
    let score;
    if (material) {
        score = Object.fromEntries (EngineeringAxes.map ((id, axis) => [id, ScoreForTarget ({ axis, basis : 'inside', targetMm : targets[id] }, material)]));
    } else { score = targets; }
    const parameters = ValidateFefco ({ code, ...score, thickness, closure : code === '0200' ? 'open' : 'closed', ...(code === '0202' ? { overlap : Math.min (25, score.width / 4) } : {}) });
    const allowanceMm = material ? Object.fromEntries (EngineeringAxes.map ((id, axis) => [id, material.insideFactors[axis] * thickness])) : { length : 0, width : 0, height : 0 };
    return { version : 1, units : 'mm', code, flapStack : FlapStack (parameters), basis : material ? 'engineering-inside' : 'legacy-score', size : [...size], thickness, clearanceMm, swapped, productMm, insideMm, usableInsideMm, insideTargetsMm : targets, allowanceMm, glueTabAllowanceMm : thickness, parameters };
}
