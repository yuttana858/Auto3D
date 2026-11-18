import assert from 'node:assert/strict';
import { CreatePackSequence, SamplePackSequence, ProductDropSlots, PackErectProgress } from '../src/packsequence.js';

const box = (id, min, max, extra = {}) => ({ id, min, max, ...extra });
// Two products side by side with a partition between them, pads under, beside and over them, in a carton 100 mm tall.
const products = [box ('front-right', [55, 3, 10], [100, 95, 60]), box ('back-left', [0, 3, -60], [45, 95, -10])];
const pads = [box ('bottom', [0, 0, -63], [100, 3, 63], { position : 'bottom' }), box ('top', [0, 95, -63], [100, 98, 63], { position : 'top' }), box ('front', [0, 3, 60], [100, 95, 63], { position : 'front' }), box ('back', [0, 3, -63], [100, 95, -60], { position : 'back' })];
const partitions = [box ('strip-1', [48, 3, -60], [51, 95, 60], { layer : 1 })];
const input = { products, pads, partitions, spreads : [{ id : 'front-right', offset : [5, 0, 0] }], packedTopMm : 100, flapReachMm : 60 };

describe ('Auto Pack assembly sequence', () => {
    it ('orders the stages like a real pack and fills the timeline', () => {
        const sequence = CreatePackSequence (input);
        assert.deepEqual (sequence.stages.map (s => s.name), ['lift', 'erect', 'bottom', 'sides', 'partitions', 'products', 'top', 'close']);
        assert.equal (sequence.stages[0].start, 0); assert.equal (sequence.stages.at (-1).end, 1);
        sequence.stages.forEach ((s, i) => { assert.ok (s.end > s.start); if (i) { assert.ok (Math.abs (s.start - sequence.stages[i - 1].end) < 1e-12); } });
        // Only the stages a pack has: no pads or partitions and an open lid leaves lift, erect, products.
        assert.deepEqual (CreatePackSequence ({ products, packedTopMm : 100, closeLid : false }).stages.map (s => s.name), ['lift', 'erect', 'products']);
        // Entry clears the carton top plus the upright flaps.
        assert.ok (sequence.entryMm > 100 + 60);
    });
    it ('starts with products in place, hovers them while the carton erects with its lid open, and ends with everything in place and the lid closed', () => {
        const sequence = CreatePackSequence (input), at = (t) => SamplePackSequence (sequence, t), stage = name => sequence.stages.find (s => s.name === name);
        const start = at (0); assert.equal (start.fold, 0);
        const moved = start.objects.find (o => o.id === 'front-right'); assert.deepEqual (moved.offset, [-5, 0, 0]); /* before the partition spread */
        assert.ok (start.objects.filter (o => o.kind !== 'product').every (o => !o.visible));
        const erected = at (stage ('erect').end); assert.ok (Math.abs (erected.fold - PackErectProgress) < 1e-12);
        for (const product of erected.objects.filter (o => o.kind === 'product')) { assert.ok (product.offset[1] > 100 + 60 - 95, 'hovering above the open lid'); assert.deepEqual ([product.offset[0], product.offset[2]], [0, 0]); }
        assert.equal (at (stage ('products').start).fold, PackErectProgress, 'lid stays open while packing');
        const end = at (1); assert.equal (end.fold, 1); assert.ok (end.objects.every (o => o.visible && o.settled && o.offset.every (v => Math.abs (v) < 1e-9)));
        assert.equal (CreatePackSequence ({ ...input, closeLid : false }).stages.at (-1).name, 'top'); assert.equal (SamplePackSequence (CreatePackSequence ({ ...input, closeLid : false }), 1).fold, PackErectProgress);
    });
    it ('lowers pads and partitions in order and drops products one at a time from the back', () => {
        const sequence = CreatePackSequence (input), track = id => sequence.tracks.find (t => t.id === id);
        assert.ok (track ('bottom').drop.end <= track ('front').drop.start + 1e-12 && track ('front').drop.end <= track ('strip-1').drop.start + 1e-12);
        assert.ok (track ('strip-1').drop.end <= track ('back-left').drop.start + 1e-12 && track ('front-right').drop.end <= track ('top').drop.start + 1e-12);
        assert.ok (track ('back-left').drop.start < track ('front-right').drop.start, 'back product first');
        // Everything moves only downward once it appears, never sideways, so it cannot swing through a wall.
        for (const id of ['bottom', 'front', 'strip-1', 'top']) { let previous = Infinity; for (let t = track (id).appear; t <= 1; t += 0.005) { const o = SamplePackSequence (sequence, t).objects.find (x => x.id === id); assert.ok (o.offset[1] <= previous + 1e-9 && o.offset[0] === 0 && o.offset[2] === 0); previous = o.offset[1]; } }
    });
    it ('speeds up drops for large product counts while keeping one at a time', () => {
        assert.deepEqual (ProductDropSlots (0), []); const one = ProductDropSlots (1); assert.deepEqual (one, [{ start : 0, end : 1 }]);
        const few = ProductDropSlots (4), many = ProductDropSlots (60);
        const width = slots => slots.map (s => s.end - s.start);
        assert.ok (Math.abs (width (few)[0] - width (few)[3]) < 1e-12, 'even slots for a few products');
        assert.ok (width (many)[0] > 4 * width (many)[59], 'later drops are faster');
        for (const slots of [few, many]) { slots.forEach ((s, i) => { assert.ok (s.end <= 1 + 1e-12); if (i) { assert.ok (s.start > slots[i - 1].start, 'each starts after the previous'); } }); }
        assert.throws (() => ProductDropSlots (1001));
    });
    it ('refuses a layout where a pad or partition is in a product drop path, and invalid input', () => {
        assert.throws (() => CreatePackSequence ({ ...input, partitions : [box ('bad', [60, 3, 20], [63, 95, 40])] }), /drop path of front-right/);
        assert.throws (() => CreatePackSequence ({ ...input, products : [] }), /at least one product/);
        assert.throws (() => CreatePackSequence ({ ...input, packedTopMm : Number.NaN }));
        assert.throws (() => CreatePackSequence ({ ...input, pads : [box ('side', [0, 0, 0], [1, 1, 1], { position : 'left' })] }), /Pad positions/);
        assert.throws (() => CreatePackSequence ({ ...input, easing : 'bounce' }));
        assert.throws (() => SamplePackSequence (null, 0.5));
    });
});
