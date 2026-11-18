import { EaseSpan, DefaultMotionEasing, MotionEasings } from './easing.js';

// Auto Pack assembly sequence, in the order real cartons are packed:
//  1. lift   – products rise above the flat blank (and spread into their partition cells)
//  2. erect  – the carton folds its walls and closes its bottom; top flaps stand upright (lid open 90°)
//  3. bottom pad, 4. side pads, 5. partition layers – each lowers into the open carton
//  6. products drop in one at a time, back to front, faster as the count grows
//  7. top pad lowers on top, 8. close – the lid folds shut
// Everything is planned in world millimetres. Offsets are added to an object's final placement, so a
// sampled offset of [0, 0, 0] means "in place". The host plays the plan; nothing here touches a scene.

export const PackErectProgress = 0.76; // Auto Pack fold pose with walls and bottom closed and top flaps upright.
const Weights = { lift : 0.8, erect : 2.2, bottom : 0.6, sides : 0.7, partitions : 1.1, products : 3.2, top : 0.6, close : 1.0 };
const Labels = { lift : 'lifting products above the carton', erect : 'erecting the carton, lid open', bottom : 'dropping in the bottom pad', sides : 'lowering the side pads', partitions : 'lowering partitions', products : 'dropping in products', top : 'placing the top pad', close : 'closing the lid' };

const Box = (item, name) => {
    const ok = item && typeof item.id === 'string' && item.id && [item.min, item.max].every (v => Array.isArray (v) && v.length === 3 && v.every (Number.isFinite)) && item.max.every ((v, i) => v >= item.min[i]);
    if (!ok) { throw new Error ('Invalid ' + name + ' bounds for the pack sequence.'); }
    return item;
};
const Overlap = (a, b, gap = 1e-6) => a.min[0] < b.max[0] - gap && b.min[0] < a.max[0] - gap && a.min[2] < b.max[2] - gap && b.min[2] < a.max[2] - gap;

// Products drop one at a time. With few products each gets an even, comfortable slot; as the count grows the
// first few stay readable and the rest speed up, so large packs still finish inside the products stage.
export function ProductDropSlots (count)
{
    if (!Number.isInteger (count) || count < 0 || count > 1000) { throw new Error ('Product count must be 0–1000.'); }
    if (!count) { return []; }
    const acceleration = count <= 6 ? 0 : count <= 12 ? 0.08 : 0.45;
    const weights = Array.from ({ length : count }, (_, i) => 1 / (1 + acceleration * i)), total = weights.reduce ((a, b) => a + b, 0);
    // Each drop overlaps the next a little (×1.6), then the whole set is scaled to end exactly at 1.
    let at = 0; const slots = [];
    for (const weight of weights) { const span = weight / total; slots.push ({ start : at, end : at + span * (count > 1 ? 1.6 : 1) }); at += span; }
    const scale = 1 / slots.at (-1).end; return slots.map (slot => ({ start : slot.start * scale, end : slot.end * scale }));
}

export function CreatePackSequence ({ products = [], spreads = [], pads = [], partitions = [], packedTopMm, flapReachMm = 0, closeLid = true, easing = DefaultMotionEasing } = {})
{
    if (!Array.isArray (products) || !products.length) { throw new Error ('The pack sequence needs at least one product.'); }
    if (!Number.isFinite (packedTopMm) || !Number.isFinite (flapReachMm) || flapReachMm < 0) { throw new Error ('Invalid carton height for the pack sequence.'); }
    if (!MotionEasings.includes (easing)) { throw new Error ('Choose motion easing: ' + MotionEasings.join (', ') + '.'); }
    products.forEach (p => Box (p, 'product')); pads.forEach (p => Box (p, 'pad')); partitions.forEach (p => Box (p, 'partition'));
    if (pads.some (p => !['bottom', 'top', 'front', 'back'].includes (p.position))) { throw new Error ('Pad positions must be bottom, top, front or back.'); }
    const spreadById = new Map (spreads.map (s => { if (!Array.isArray (s.offset) || s.offset.length !== 3 || !s.offset.every (Number.isFinite)) { throw new Error ('Invalid partition spread.'); } return [s.id, s.offset]; }));

    // Everything enters from above the open carton: high enough to clear the upright top flaps.
    const lowest = Math.min (...products.map (p => p.min[1]), ...pads.map (p => p.min[1]), ...partitions.map (p => p.min[1]));
    const tallest = Math.max (...products.map (p => p.max[1] - p.min[1]), ...pads.map (p => p.max[1] - p.min[1]), ...partitions.map (p => p.max[1] - p.min[1]), 1);
    const margin = Math.max (10, tallest * 0.15), entry = packedTopMm + flapReachMm + margin;
    const lift = item => entry - item.min[1];

    // Products drop straight down into their cells: nothing already in the carton may sit in a product's column.
    const placed = [...pads.filter (p => p.position !== 'top'), ...partitions];
    for (const product of products) {
        const blocker = placed.find (piece => Overlap (piece, product) && piece.max[1] > product.min[1] + 1e-6);
        if (blocker) { throw new Error ('Pack sequence blocked: ' + blocker.id + ' is in the drop path of ' + product.id + '.'); }
    }

    // Stage weights for the stages this pack actually has; the timeline is their normalized sum.
    const has = { lift : true, erect : true, bottom : pads.some (p => p.position === 'bottom'), sides : pads.some (p => p.position === 'front' || p.position === 'back'), partitions : partitions.length > 0, products : true, top : pads.some (p => p.position === 'top'), close : closeLid };
    const order = ['lift', 'erect', 'bottom', 'sides', 'partitions', 'products', 'top', 'close'].filter (name => has[name]);
    const productWeight = Weights.products * Math.min (2, 0.6 + 0.4 * Math.sqrt (products.length));
    const total = order.reduce ((sum, name) => sum + (name === 'products' ? productWeight : Weights[name]), 0);
    let at = 0; const stages = order.map (name => { const span = (name === 'products' ? productWeight : Weights[name]) / total, stage = { name, label : Labels[name], start : at, end : at + span }; at += span; return stage; });
    stages.at (-1).end = 1;
    const stage = name => stages.find (s => s.name === name);

    const tracks = [];
    // Products: rise (and spread) together, hover, then drop one at a time, back (−Z) to front, lowest layer first.
    const liftStage = stage ('lift'), dropStage = stage ('products');
    const dropOrder = [...products].sort ((a, b) => a.min[1] - b.min[1] || a.min[2] - b.min[2] || a.min[0] - b.min[0]);
    ProductDropSlots (dropOrder.length).forEach ((slot, index) => {
        const product = dropOrder[index], spread = spreadById.get (product.id) || [0, 0, 0];
        const span = dropStage.end - dropStage.start, drop = { start : dropStage.start + slot.start * span, end : dropStage.start + slot.end * span };
        tracks.push ({ id : product.id, kind : 'product', order : index, rise : { start : liftStage.start, end : liftStage.end, from : spread.map (v => -v) }, height : lift (product), drop });
    });
    // Pads and partitions appear above the carton at the start of their move and lower into place.
    const lowerInto = (items, name, kind) => {
        const s = stage (name); if (!s) { return; }
        const groups = kind === 'partition' ? [...new Set (items.map (p => p.layer ?? 1))].sort ((a, b) => a - b) : [null];
        groups.forEach ((group, g) => {
            const span = (s.end - s.start) / groups.length, start = s.start + g * span;
            for (const item of items.filter (p => group === null || (p.layer ?? 1) === group)) { tracks.push ({ id : item.id, kind, appear : start, height : lift (item), drop : { start, end : start + span } }); }
        });
    };
    lowerInto (pads.filter (p => p.position === 'bottom'), 'bottom', 'pad');
    lowerInto (pads.filter (p => p.position === 'front' || p.position === 'back'), 'sides', 'pad');
    lowerInto (partitions, 'partitions', 'partition');
    lowerInto (pads.filter (p => p.position === 'top'), 'top', 'pad');

    const erect = stage ('erect'), close = stage ('close');
    return { version : 1, easing, entryMm : entry, stages, tracks, fold : { erect : { start : erect.start, end : erect.end, to : PackErectProgress }, close : close ? { start : close.start, end : close.end } : null } };
}

// Pose of everything at timeline progress t (0–1): carton fold progress, current stage, and per-object offset/visibility.
export function SamplePackSequence (sequence, t)
{
    if (!sequence?.tracks || !Number.isFinite (t)) { throw new Error ('Choose a pack sequence and progress.'); }
    const p = Math.max (0, Math.min (1, t)), easing = sequence.easing, { erect, close } = sequence.fold;
    const fold = p < erect.end ? erect.to * EaseSpan (p, erect.start, erect.end, easing) : close ? erect.to + (1 - erect.to) * EaseSpan (p, close.start, close.end, easing) : erect.to;
    const current = sequence.stages.find (s => p < s.end) || sequence.stages.at (-1);
    const objects = sequence.tracks.map (track => {
        const fall = 1 - EaseSpan (p, track.drop.start, track.drop.end, easing);
        if (track.kind === 'product') {
            const rise = EaseSpan (p, track.rise.start, track.rise.end, easing);
            const offset = track.rise.from.map (v => v * (1 - rise) + 0); offset[1] += track.height * rise * fall;
            return { id : track.id, kind : track.kind, visible : true, offset, settled : p >= track.drop.end };
        }
        return { id : track.id, kind : track.kind, visible : p >= track.appear, offset : [0, track.height * fall, 0], settled : p >= track.drop.end };
    });
    return { progress : p, fold, stage : current.name, label : current.label, objects };
}
