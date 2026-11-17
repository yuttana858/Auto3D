import { PartitionStrips, PartitionSlotClearanceMm } from './accessories.js';

// Nested partitions between packed products. Pure: canonical mm in a carton frame where
// axis 0 = carton length, axis 1 = height (up), axis 2 = carton width.
//
// 1. Read the layout: products are grouped into columns (along the length), rows (across the
//    width) and layers (by height) by overlapping extents, so any product arrangement on a grid,
//    including uneven spacing or mixed sizes per column, is understood.
// 2. Make room: every gap between neighbouring columns/rows must hold one partition board plus
//    a clearance on both faces. Short gaps are opened by moving whole columns/rows apart; the
//    layout stays centred, and the total growth is reported so the carton ID accounts for it.
// 3. Nest: one interlocking set per layer. A strip runs down the middle of every gap, spans the
//    whole product envelope, and is as tall as the layer. Length strips are slotted from the top,
//    width strips from the bottom, so they lock at half height and pivot flat at the slots.

export const PartitionProductClearanceMm = 0.5;
const Epsilon = 1e-6;

function Box (input, index)
{
    const min = input?.min, max = input?.max;
    if (!Array.isArray (min) || !Array.isArray (max) || min.length !== 3 || max.length !== 3 || [...min, ...max].some (v => !Number.isFinite (v)) || max.some ((v, i) => v - min[i] <= 0)) { throw new Error ('Each product needs finite, positive bounds.'); }
    return { id : input.id ?? index, min : [...min], max : [...max] };
}

// Group intervals along one axis: products whose extents overlap belong to the same cluster.
export function ClusterAxis (boxes, axis)
{
    const sorted = [...boxes].sort ((a, b) => a.min[axis] - b.min[axis]), clusters = [];
    for (const box of sorted) {
        const last = clusters.at (-1);
        if (last && box.min[axis] < last.max - Epsilon) { last.max = Math.max (last.max, box.max[axis]); last.ids.push (box.id); }
        else { clusters.push ({ min : box.min[axis], max : box.max[axis], ids : [box.id] }); }
    }
    return clusters;
}

export function AnalyzeProductLayout ({ boxes })
{
    if (!Array.isArray (boxes) || !boxes.length || boxes.length > 500) { throw new Error ('Analyze 1–500 products.'); }
    const items = boxes.map (Box);
    const columns = ClusterAxis (items, 0), layers = ClusterAxis (items, 1), rows = ClusterAxis (items, 2);
    const gaps = clusters => clusters.slice (1).map ((cluster, i) => cluster.min - clusters[i].max);
    const envelope = { min : [0, 1, 2].map (a => Math.min (...items.map (b => b.min[a]))), max : [0, 1, 2].map (a => Math.max (...items.map (b => b.max[a]))) };
    return { products : items.length, columns, rows, layers, gaps : { length : gaps (columns), width : gaps (rows) }, envelope, cells : columns.length * rows.length * layers.length };
}

// Moves that open every short gap to `required`, keeping the layout centred on its envelope.
function Spread (clusters, required)
{
    let total = 0; const offsets = clusters.map ((cluster, i) => { if (i > 0) { total += Math.max (0, required - (cluster.min - clusters[i - 1].max)); } return total; });
    return { offsets : offsets.map (offset => offset - total / 2), growth : total };
}

export function CreateNestedPartitionPlan ({ boxes, thickness, productClearanceMm = PartitionProductClearanceMm, slotClearanceMm = PartitionSlotClearanceMm, name = 'Partition' } = {})
{
    const layout = AnalyzeProductLayout ({ boxes }), t = thickness;
    if (!Number.isFinite (t) || t <= 0) { throw new Error ('Board caliper must be a positive number of millimetres.'); }
    if (!Number.isFinite (productClearanceMm) || productClearanceMm < 0 || productClearanceMm > 20) { throw new Error ('Product clearance must be 0–20 mm.'); }
    if (layout.columns.length < 2 && layout.rows.length < 2) { throw new Error ('Partitions need at least two products side by side along the length or across the width.'); }
    const required = t + 2 * productClearanceMm;
    const length = Spread (layout.columns, required), width = Spread (layout.rows, required);
    // Per-product moves (carton frame, mm) and the spaced boxes.
    const columnOf = new Map (), rowOf = new Map ();
    layout.columns.forEach ((c, i) => c.ids.forEach (id => columnOf.set (id, i))); layout.rows.forEach ((r, i) => r.ids.forEach (id => rowOf.set (id, i)));
    const items = boxes.map (Box), moves = items.map (box => ({ id : box.id, offset : [length.offsets[columnOf.get (box.id)], 0, width.offsets[rowOf.get (box.id)]] }));
    const spaced = items.map ((box, i) => ({ id : box.id, min : box.min.map ((v, a) => v + moves[i].offset[a]), max : box.max.map ((v, a) => v + moves[i].offset[a]) }));
    const after = AnalyzeProductLayout ({ boxes : spaced }), env = after.envelope;
    const span = { length : env.max[0] - env.min[0], width : env.max[2] - env.min[2] };
    const centres = (clusters, axis) => clusters.slice (1).map ((cluster, i) => (clusters[i].max + cluster.min) / 2 - env.min[axis]);
    const lengthCuts = centres (after.columns, 0), widthCuts = centres (after.rows, 2);
    // One interlocking set per layer; strips reach the envelope ends (the carton adds its own clearance).
    const layers = after.layers.map ((layer, i) => ({ index : i, baseMm : layer.min, heightMm : layer.max - layer.min, set : PartitionStrips ({ spanMm : span, heightMm : layer.max - layer.min, lengthCuts, widthCuts, thickness : t, clearanceMm : 0, slotClearanceMm, name : name + (after.layers.length > 1 ? ' · layer ' + (i + 1) : '') }) }));
    return {
        version : 1, units : 'mm', kind : 'nested partitions', thicknessMm : t, productClearanceMm, requiredGapMm : required,
        layout : { products : layout.products, columns : layout.columns.length, rows : layout.rows.length, layers : layout.layers.length, cells : layout.cells, gapsBeforeMm : layout.gaps },
        moves : moves.filter (move => move.offset.some (v => Math.abs (v) > Epsilon)), growthMm : { length : length.growth, width : width.growth, height : 0 },
        envelope : env, lengthCuts, widthCuts, layers, strips : layers.reduce ((sum, layer) => sum + layer.set.strips.length, 0)
    };
}
