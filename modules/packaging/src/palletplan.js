// Auto Pallet: column-stacked pallet loading for identical boxes.
// Pure and host-neutral: millimetres in, a layer pattern and placements out.
//
// Rules
// - Boxes stay upright (box height stays vertical); each may turn 90° in plan.
// - Column stacking: every layer uses the same pattern, so boxes sit directly
//   on the box below (best for compression strength).
// - No overhang: the load stays inside the pallet deck.
// - Layers = floor((max overall height − pallet height) / box height).
//
// Layer pattern: guillotine dynamic programming over "raster points" (every
// length reachable as i·a + j·b). Each sub-rectangle is either filled with a
// single-orientation grid, or cut once into two smaller rectangles that are
// solved the same way. This finds the best pattern that can be built from
// straight cuts, including mixed-orientation (two-, three- or more-block) layers.

const Epsilon = 1e-6;
export const InchMm = 25.4;
export const PalletPresets = Object.freeze ({
    'gma-40x48' : Object.freeze ({ id : 'gma-40x48', name : '40 × 48 in pallet', widthMm : 40 * InchMm, lengthMm : 48 * InchMm, heightMm : 5 * InchMm })
});
export const PalletColors = Object.freeze ({
    blue : Object.freeze ({ id : 'blue', name : 'Blue', color : [28, 76, 150] }),
    brown : Object.freeze ({ id : 'brown', name : 'Brown', color : [146, 102, 60] }),
    black : Object.freeze ({ id : 'black', name : 'Black', color : [32, 33, 36] })
});
export const DefaultPalletMaxHeightMm = 55 * InchMm;
const MaxRasterPoints = 400;
const MaxBoxesPerLayer = 2000;

function Positive (value, name)
{
    if (typeof value !== 'number' || !Number.isFinite (value) || value <= 0) { throw new Error (name + ' must be a positive number of millimetres.'); }
    return value;
}

// All lengths ≤ limit reachable as i·a + j·b, sorted, de-duplicated.
export function RasterPoints (limit, a, b)
{
    const points = new Set ();
    for (let i = 0; i * a <= limit + Epsilon; i++) {
        for (let j = 0; i * a + j * b <= limit + Epsilon; j++) {
            points.add (Math.round ((i * a + j * b) * 1e6) / 1e6);
            if (points.size > MaxRasterPoints * 4) { break; }
        }
    }
    return [...points].sort ((x, y) => x - y);
}

function Floor (value, size) { return Math.floor ((value + Epsilon) / size); }

// Best single-orientation grid in a w × l rectangle for an a × b footprint.
function Grid (w, l, a, b)
{
    const normal = Floor (w, a) * Floor (l, b), turned = Floor (w, b) * Floor (l, a);
    return turned > normal ? { count : turned, rotated : true } : { count : normal, rotated : false };
}

// Solve one layer. Returns { count, rects } with rects { x, z, width, length, rotated } from the
// rectangle's own corner. width is along X (pallet width), length along Z (pallet length).
export function BestLayerPattern (widthMm, lengthMm, boxWidthMm, boxLengthMm)
{
    const W = Positive (widthMm, 'Pallet width'), L = Positive (lengthMm, 'Pallet length');
    const a = Positive (boxWidthMm, 'Box width'), b = Positive (boxLengthMm, 'Box length');
    if (Math.min (a, b) > Math.max (W, L) + Epsilon || (Grid (W, L, a, b).count === 0)) { return { count : 0, rects : [], exhaustive : true }; }
    const xs = RasterPoints (W, a, b), zs = RasterPoints (L, a, b);
    const exhaustive = xs.length <= MaxRasterPoints && zs.length <= MaxRasterPoints;
    const grid = (w, l) => Grid (w, l, a, b);
    if (!exhaustive) { return { ...Reconstruct ({ type : 'grid', ...grid (W, L), w : W, l : L }, a, b), exhaustive : false }; }
    // Largest raster point ≤ value (patterns never need the waste between raster points).
    const floorIndex = (points, value) => { let lo = 0, hi = points.length - 1, best = 0; while (lo <= hi) { const mid = (lo + hi) >> 1; if (points[mid] <= value + Epsilon) { best = mid; lo = mid + 1; } else { hi = mid - 1; } } return best; };
    const nx = xs.length, nz = zs.length, best = new Int32Array (nx * nz), choice = new Array (nx * nz);
    for (let i = 0; i < nx; i++) {
        for (let k = 0; k < nz; k++) {
            const w = xs[i], l = zs[k], at = i * nz + k, g = grid (w, l);
            let value = g.count, pick = { type : 'grid', rotated : g.rotated, w, l };
            // Cut across X: left part xs[c], right part is the remaining width rounded down to a raster point.
            for (let c = 1; c < nx && xs[c] <= w / 2 + Epsilon; c++) {
                const rest = floorIndex (xs, w - xs[c]), v = best[c * nz + k] + best[rest * nz + k];
                if (v > value) { value = v; pick = { type : 'x', first : [c, k], second : [rest, k], offset : xs[c], w, l }; }
            }
            for (let c = 1; c < nz && zs[c] <= l / 2 + Epsilon; c++) {
                const rest = floorIndex (zs, l - zs[c]), v = best[i * nz + c] + best[i * nz + rest];
                if (v > value) { value = v; pick = { type : 'z', first : [i, c], second : [i, rest], offset : zs[c], w, l }; }
            }
            best[at] = value; choice[at] = pick;
            if (value > MaxBoxesPerLayer) { throw new Error ('More than ' + MaxBoxesPerLayer + ' boxes fit on one layer. Use a larger box.'); }
        }
    }
    const rects = [];
    const build = (i, k, ox, oz) => {
        const pick = choice[i * nz + k];
        if (pick.type === 'grid') { rects.push (...Reconstruct ({ ...pick, count : best[i * nz + k] }, a, b, ox, oz).rects); return; }
        build (...pick.first, ox, oz);
        if (pick.type === 'x') { build (...pick.second, ox + pick.offset, oz); } else { build (...pick.second, ox, oz + pick.offset); }
    };
    build (nx - 1, nz - 1, 0, 0);
    return { count : rects.length, rects, exhaustive : true };
}

function Reconstruct (pick, a, b, ox = 0, oz = 0)
{
    const width = pick.rotated ? b : a, length = pick.rotated ? a : b, rects = [];
    const columns = Floor (pick.w, width), rows = Floor (pick.l, length);
    for (let row = 0; row < rows; row++) { for (let column = 0; column < columns; column++) { rects.push ({ x : ox + column * width, z : oz + row * length, width, length, rotated : pick.rotated }); } }
    return { count : rects.length, rects };
}

// Full plan for a box on a pallet. Inputs are outside box dimensions in mm (W = X, L = Z, H = Y).
export function CreatePalletPlan ({ box, pallet = PalletPresets['gma-40x48'], maxHeightMm = DefaultPalletMaxHeightMm } = {})
{
    const bw = Positive (box?.width, 'Box width'), bl = Positive (box?.length, 'Box length'), bh = Positive (box?.height, 'Box height');
    const pw = Positive (pallet?.widthMm, 'Pallet width'), pl = Positive (pallet?.lengthMm, 'Pallet length'), ph = Positive (pallet?.heightMm, 'Pallet height');
    const limit = Positive (maxHeightMm, 'Maximum overall height');
    const loadLimit = limit - ph;
    if (loadLimit < bh - Epsilon) { throw new Error ('One box layer does not fit under the maximum overall height.'); }
    const layer = BestLayerPattern (pw, pl, bw, bl);
    if (!layer.count) { throw new Error ('The box footprint is larger than the pallet deck.'); }
    const layers = Floor (loadLimit, bh);
    // Centre the layer's bounding rectangle on the pallet; report coordinates from the pallet centre.
    const usedW = Math.max (...layer.rects.map (r => r.x + r.width)), usedL = Math.max (...layer.rects.map (r => r.z + r.length));
    const offsetX = (pw - usedW) / 2, offsetZ = (pl - usedL) / 2;
    const placements = layer.rects.map (r => ({ x : r.x + offsetX + r.width / 2 - pw / 2, z : r.z + offsetZ + r.length / 2 - pl / 2, rotated : r.rotated }));
    const rotatedCount = placements.filter (p => p.rotated).length;
    return {
        version : 1, units : 'mm', stacking : 'column',
        boxMm : { width : bw, length : bl, height : bh },
        palletMm : { width : pw, length : pl, height : ph, id : pallet.id || null, name : pallet.name || null },
        maxHeightMm : limit, perLayer : layer.count, layers, total : layer.count * layers,
        loadMm : { width : usedW, length : usedL, height : layers * bh },
        overallHeightMm : ph + layers * bh,
        footprintUse : (layer.count * bw * bl) / (pw * pl),
        pattern : rotatedCount === 0 || rotatedCount === placements.length ? 'single orientation' : 'mixed orientation',
        exhaustive : layer.exhaustive,
        placements
    };
}
