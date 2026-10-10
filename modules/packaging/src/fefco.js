import { FefcoStyles } from './catalog.js';
import { ValidatePackaging } from './profile.js';

export const DefaultFefco = { code : '0201', length : 400, width : 300, height : 250, thickness : 3, overlap : 25, closure : 'open' };
export function FefcoPreset (input, code)
{
    const data = ValidateFefco (input); const changes = { code };
    if (code === '0202' && (data.overlap <= 0 || data.overlap >= data.width)) { changes.overlap = Math.min (25, data.width / 4); }
    return ValidateFefco ({ ...data, ...changes });
}
export function FefcoAnimationPlan (input, state = 'folded')
{
    const p = ValidateFefco (input);
    if (!['flat', 'folded'].includes (state)) { throw new Error ('Choose a flat dieline or an assembled box.'); }
    if (state === 'flat') { return { from : 0, to : 1, action : 'fold', targetState : 'folded', targetClosure : p.code === '0200' ? 'open' : 'closed', stages : ['flat', 'open box', p.code === '0200' ? 'open HSC' : 'closed box'] }; }
    if (p.code === '0200') { return { from : 1, to : 0, action : 'unfold', targetState : 'flat', targetClosure : 'open', stages : ['open HSC', 'flat'] }; }
    const opening = p.closure === 'closed';
    return { from : opening ? 1 : 0.72, to : opening ? 0.72 : 1, action : opening ? 'open' : 'close', targetState : 'folded', targetClosure : opening ? 'open' : 'closed', stages : opening ? ['closed box', 'open box'] : ['open box', 'closed box'] };
}
export function ValidateFefco (input)
{
    if (!input || typeof input !== 'object' || Array.isArray (input) || Object.keys (input).some (key => !Object.hasOwn (DefaultFefco, key))) { throw new Error ('Invalid FEFCO parameters.'); }
    const data = { ...DefaultFefco, ...input };
    if (!FefcoStyles.some (style => style.code === data.code) || !['open', 'closed'].includes (data.closure)) { throw new Error ('Choose a supported FEFCO style and open or closed flaps.'); }
    for (const key of ['length', 'width', 'height']) { if (!Number.isFinite (data[key]) || data[key] < 20 || data[key] > 10000) { throw new Error ('Internal dimensions must be between 20 and 10000 mm.'); } }
    if (data.length < data.width) { throw new Error ('Length must be at least the width for these slotted styles.'); }
    if (!Number.isFinite (data.thickness) || data.thickness < 0.5 || data.thickness > 15 || Math.min (data.width, data.height) < data.thickness * 8) { throw new Error ('Use a 0.5–15 mm caliper smaller than one eighth of width and height.'); }
    if (!Number.isFinite (data.overlap) || data.overlap < 0 || data.overlap > 10000 || data.code === '0202' && (data.overlap <= 0 || data.overlap >= data.width)) { throw new Error ('0202 overlap must be greater than zero and less than the width.'); }
    return data;
}
export function FlapDepth (data) { return data.code === '0203' ? data.width : (data.width + (data.code === '0202' ? data.overlap : 0)) / 2; }
export function FefcoProfile (input)
{
    const data = ValidateFefco (input); const { length, width, height, thickness } = data; const depth = FlapDepth (data); const joint = Math.min (35, width / 5); const slot = Math.max (2, thickness);
    const spans = [length, width, length, width]; const edges = [0]; spans.forEach (span => edges.push (edges.at (-1) + span)); const points = []; const paths = [];
    const push = (x, y) => { if (!points.length || points.at (-1)[0] !== x || points.at (-1)[1] !== y) { points.push ([x, y]); } };
    push (-joint, thickness * 2); push (0, 0);
    spans.forEach ((span, index) => { const a = edges[index] + (index ? slot / 2 : 0); const b = edges[index + 1] - (index < 3 ? slot / 2 : 0); push (a, 0); push (a, -depth); push (b, -depth); push (b, 0); });
    push (edges[4], height);
    if (data.code === '0200') { push (0, height); } else {
        for (let index = 3; index >= 0; index--) { const a = edges[index] + (index ? slot / 2 : 0); const b = edges[index + 1] - (index < 3 ? slot / 2 : 0); push (b, height); push (b, height + depth); push (a, height + depth); push (a, height); }
    }
    push (-joint, height - thickness * 2);
    paths.push ({ id : 'fefco-outline', type : 'cut', closed : true, points });
    const score = (id, a, b) => paths.push ({ id, type : 'score', closed : false, points : [a, b] });
    for (let index = 0; index < 4; index++) { score ('base-' + index, [edges[index], 0], [edges[index + 1], 0]); if (data.code !== '0200') { score ('top-' + index, [edges[index], height], [edges[index + 1], height]); } score ('wall-' + index, [edges[index], 0], [edges[index], height]); }
    return ValidatePackaging ({ version : 1, name : 'FEFCO ' + data.code + ' · ' + length + ' × ' + width + ' × ' + height, grade : 'Measured corrugated caliper', thickness, paths });
}
