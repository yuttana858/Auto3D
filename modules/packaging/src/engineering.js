// Authoritative dimensions are evaluated from canonical CAD points, never meshes.
export const EngineeringAxes = ['length', 'width', 'height'];
const numeric = (value, min, max, name) => { if (!Number.isFinite (value) || value < min || value > max) { throw new Error ('Invalid ' + name + '.'); } return value; };
const label = (value, name) => { if (typeof value !== 'string' || !value.trim () || value.length > 120) { throw new Error ('Invalid ' + name + '.'); } return value; };
export function DefaultBoardSpecification (thickness = 3, code = null)
{
    return { id : 'board-custom', name : 'Measured board · editable', flute : 'Custom', outsideLinerGrade : 'Not specified', insideLinerGrade : 'Not specified', mediumGrade : 'Not specified', outsideLinerGsm : 0, insideLinerGsm : 0, mediumGsm : 0, fluteDirectionDegrees : 90, scoreProcess : 'Not specified', conditioning : 'Not specified', caliperMm : thickness, caliperToleranceMm : 0, outsideLinerMm : thickness * 0.08, insideLinerMm : thickness * 0.08, mediumPaperMm : thickness * 0.06, flutePitchMm : 7.7, scoreWidthMm : thickness * 2, scoreToleranceMm : 0, processToleranceMm : 0, insideFactors : code === '0201' ? [1, 1, 2] : [0, 0, 0], outsideFactors : [0, 0, 0], provenance : code === '0201' ? 'FEFCO 101 reference: inside L/W=S-t, H=S-2t. Outside gains require converter data.' : 'Custom allowances: enter converter-calibrated factors.', calibrated : false };
}
export function ValidateBoardSpecification (input)
{
    if (!input || typeof input !== 'object' || Array.isArray (input)) { throw new Error ('Invalid board specification.'); }
    const result = {};
    for (const key of ['id', 'name', 'flute', 'provenance', 'outsideLinerGrade', 'insideLinerGrade', 'mediumGrade', 'scoreProcess', 'conditioning']) { result[key] = label (input[key], key); }
    for (const [key, min, max] of [['outsideLinerGsm', 0, 2000], ['insideLinerGsm', 0, 2000], ['mediumGsm', 0, 2000], ['fluteDirectionDegrees', -360, 360], ['caliperMm', 0.000001, 100], ['caliperToleranceMm', 0, 50], ['outsideLinerMm', 0.00000001, 100], ['insideLinerMm', 0.00000001, 100], ['mediumPaperMm', 0.00000001, 100], ['flutePitchMm', 0.1, 50], ['scoreWidthMm', 0.000001, 200], ['scoreToleranceMm', 0, 50], ['processToleranceMm', 0, 50]]) { result[key] = numeric (input[key], min, max, key); }
    if (result.caliperToleranceMm >= result.caliperMm || result.outsideLinerMm + result.insideLinerMm + result.mediumPaperMm >= result.caliperMm) { throw new Error ('Paper calipers must fit inside measured board caliper; its tolerance must be smaller than caliper.'); }
    for (const key of ['insideFactors', 'outsideFactors']) { if (!Array.isArray (input[key]) || input[key].length !== 3) { throw new Error ('Three allowance factors required.'); } result[key] = input[key].map (value => numeric (value, 0, 20, key)); }
    if (typeof input.calibrated !== 'boolean') { throw new Error ('Specify calibration status.'); } result.calibrated = input.calibrated; return result;
}
export function DefaultEngineering (profile, code = null)
{
    const generated = ['base-0', 'base-1', 'wall-0'].every (id => profile.paths.some (path => path.id === id));
    const references = generated ? EngineeringAxes.map ((id, i) => ({ id, pathId : ['base-0', 'base-1', 'wall-0'][i], start : 0, end : 1, axis : i })) : profile.paths.flatMap (path => path.points.slice (0, path.closed ? path.points.length : -1).map ((p, i) => ({ id : path.id + ':' + i, pathId : path.id, start : i, end : (i + 1) % path.points.length, axis : 0 }))).slice (0, 24);
    return { version : 1, visible : true, activeMaterialId : 'board-custom', materials : [DefaultBoardSpecification (profile.thickness, code)], dimensions : references.map (ref => ({ ...ref, mode : 'auto', basis : 'score', targetMm : null, toleranceMm : null })) };
}
export function ValidateEngineering (input, paths)
{
    if (!input || input.version !== 1 || typeof input.visible !== 'boolean' || !Array.isArray (input.materials) || !input.materials.length || input.materials.length > 32 || !Array.isArray (input.dimensions) || input.dimensions.length > 100) { throw new Error ('Invalid measurement layer.'); }
    const materials = input.materials.map (ValidateBoardSpecification); if (new Set (materials.map (item => item.id)).size !== materials.length || !materials.some (item => item.id === input.activeMaterialId)) { throw new Error ('Choose a unique material record.'); }
    const ids = new Set ();
    const dimensions = input.dimensions.map (item => {
        const id = label (item.id, 'dimension ID'); const path = paths.find (p => p.id === item.pathId);
        if (ids.has (id) || !path || !Number.isInteger (item.start) || !Number.isInteger (item.end) || item.start < 0 || item.end < 0 || item.start >= path.points.length || item.end >= path.points.length || item.start === item.end || !['auto', 'manual', 'parametric'].includes (item.mode) || !['score', 'inside', 'outside'].includes (item.basis) || !Number.isInteger (item.axis) || item.axis < 0 || item.axis > 2) { throw new Error ('Invalid dimension reference or mode.'); }
        ids.add (id);
        return { id, pathId : path.id, start : item.start, end : item.end, axis : item.axis, mode : item.mode, basis : item.basis, targetMm : item.targetMm === null ? null : numeric (item.targetMm, 0.001, 100000, 'dimension target'), toleranceMm : item.toleranceMm === null ? null : numeric (item.toleranceMm, 0, 50, 'dimension tolerance') };
    });
    return { version : 1, visible : input.visible, activeMaterialId : input.activeMaterialId, materials, dimensions };
}
export function EngineeringMeasurements (profile)
{
    const state = ValidateEngineering (profile.engineering || DefaultEngineering (profile), profile.paths); const material = state.materials.find (m => m.id === state.activeMaterialId);
    const dimensions = state.dimensions.map (dimension => {
        const path = profile.paths.find (p => p.id === dimension.pathId); const a = path.points[dimension.start], b = path.points[dimension.end];
        const scoreMm = Math.hypot (b[0] - a[0], b[1] - a[1]); const loss = material.insideFactors[dimension.axis], gain = material.outsideFactors[dimension.axis];
        const factor = dimension.basis === 'inside' ? -loss : dimension.basis === 'outside' ? gain : 0;
        const valueMm = scoreMm + factor * material.caliperMm;
        const toleranceMm = (dimension.toleranceMm ?? material.scoreToleranceMm) + Math.abs (factor) * material.caliperToleranceMm + material.processToleranceMm;
        return { ...dimension, a : [...a], b : [...b], scoreMm, insideMm : scoreMm - loss * material.caliperMm, outsideMm : scoreMm + gain * material.caliperMm, valueMm, toleranceMm, minimumMm : valueMm - toleranceMm, maximumMm : valueMm + toleranceMm, insideLossMm : loss * material.caliperMm, outsideGainMm : gain * material.caliperMm, formula : dimension.basis === 'score' ? 'S' : dimension.basis === 'inside' ? 'S − ' + loss + ' × t' : 'S + ' + gain + ' × t', targetMet : dimension.targetMm === null || Math.abs (dimension.targetMm - valueMm) < 1e-7 };
    });
    return { units : 'mm', source : 'canonical-cad', material, state, dimensions, physicalQualification : material.calibrated ? 'user-calibrated; verify governing specification' : 'reference allowances; converter calibration required' };
}
export function ScoreForTarget (dimension, material)
{
    if (dimension.targetMm === null) { throw new Error ('Enter a dimension target.'); }
    if (dimension.basis !== 'score' && !material.calibrated && (dimension.basis === 'inside' ? material.insideFactors[dimension.axis] : material.outsideFactors[dimension.axis]) === 0) { throw new Error ('Enter a converter allowance factor before driving this inside/outside target, or confirm a calibrated zero allowance.'); }
    const correction = dimension.basis === 'inside' ? material.insideFactors[dimension.axis] * material.caliperMm : dimension.basis === 'outside' ? -material.outsideFactors[dimension.axis] * material.caliperMm : 0;
    return numeric (dimension.targetMm + correction, 0.001, 100000, 'resolved score distance');
}
// Caller regenerates generated FEFCO profiles atomically; generic paths drive
// one endpoint and all exactly coincident CAD vertices. No display mesh is read.
export function DrivePathDimension (profile, dimension, material)
{
    const result = structuredClone (profile); const path = result.paths.find (p => p.id === dimension.pathId); const a = path.points[dimension.start], b = [...path.points[dimension.end]]; const old = Math.hypot (b[0] - a[0], b[1] - a[1]);
    const length = ScoreForTarget (dimension, material); if (old < 1e-9) { throw new Error ('Cannot drive a zero-length dimension.'); }
    const next = [a[0] + (b[0] - a[0]) * length / old, a[1] + (b[1] - a[1]) * length / old];
    for (const p of result.paths) { p.points = p.points.map (point => Math.hypot (point[0] - b[0], point[1] - b[1]) < 1e-8 ? [...next] : point); }
    return result;
}

// Small explicit edit protocol shared by hosts and strict agent commands.
export function EditEngineering (profile, changes, code = null)
{
    if (!changes || Object.keys (changes).some (key => !['visible', 'material', 'activateMaterialId', 'duplicateMaterialId', 'dimension'].includes (key))) { throw new Error ('Invalid measurement-layer edit.'); }
    const state = ValidateEngineering (profile.engineering || DefaultEngineering (profile, code), profile.paths);
    const active = state.materials.find (m => m.id === state.activeMaterialId);
    if (changes.visible !== undefined) { state.visible = changes.visible; }
    if (changes.duplicateMaterialId !== undefined) { label (changes.duplicateMaterialId, 'material ID'); if (state.materials.some (m => m.id === changes.duplicateMaterialId)) { throw new Error ('Material ID already exists.'); } state.materials.push ({ ...structuredClone (active), id : changes.duplicateMaterialId, name : active.name + ' copy' }); state.activeMaterialId = changes.duplicateMaterialId; }
    if (changes.activateMaterialId !== undefined) { state.activeMaterialId = changes.activateMaterialId; }
    let material = state.materials.find (m => m.id === state.activeMaterialId); if (!material) { throw new Error ('Unknown material record.'); }
    if (changes.material) { if (Object.keys (changes.material).some (key => !Object.hasOwn (material, key) || key === 'id')) { throw new Error ('Unknown material property.'); } material = ValidateBoardSpecification ({ ...material, ...changes.material }); state.materials[state.materials.findIndex (m => m.id === material.id)] = material; }
    if (changes.dimension) {
        const patch = changes.dimension;
        if (Object.keys (patch).some (key => !['id', 'mode', 'basis', 'targetMm', 'toleranceMm'].includes (key))) { throw new Error ('Unknown dimension property.'); }
        const dimension = state.dimensions.find (d => d.id === patch.id); if (!dimension) { throw new Error ('Unknown dimension.'); }
        Object.assign (dimension, patch);
        if (dimension.mode !== 'auto' && dimension.targetMm === null) { dimension.targetMm = EngineeringMeasurements ({ ...profile, engineering : state }).dimensions.find (d => d.id === patch.id).valueMm; }
        if (dimension.mode === 'auto') { dimension.targetMm = null; }
    }
    const engineering = ValidateEngineering (state, profile.paths);
    const driving = engineering.dimensions.filter (d => d.mode === 'parametric' || d.mode === 'manual' && changes.dimension?.id === d.id && changes.dimension.targetMm !== undefined);
    return { engineering, material, driving };
}
