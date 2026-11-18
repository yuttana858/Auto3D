import assert from 'node:assert/strict';
import { DropIn, DropInPlan } from '../source/website/dropin.js';

const piece = (id, data, y = 0) => ({ id, data, visible : true, position : [1, y, 2], threeObject : { position : { x : 0, y : 0, z : 0, set (x, yy, z) { Object.assign (this, { x, y : yy, z }); } }, visible : true, updateMatrixWorld () {} } });

describe ('Accessory drop-in', () => {
    it ('lowers pieces in packing order with overlapping eased slots inside a short time', () => {
        const plan = DropInPlan ([{ data : { kind : 'pad', position : 'top' } }, { data : { kind : 'partition' } }, { data : { kind : 'pad', position : 'bottom' } }, { data : { kind : 'pad', position : 'front' } }].map ((item, i) => ({ ...item, object : i, minY : 0 })));
        assert.deepEqual (plan.slots.map (s => s.item.data.position || s.item.data.kind), ['bottom', 'front', 'partition', 'top']);
        assert.ok (plan.seconds <= 1.8); assert.equal (plan.slots[0].start, 0); assert.ok (Math.abs (plan.slots.at (-1).end - 1) < 1e-12);
        plan.slots.forEach ((s, i) => { if (i) { assert.ok (s.start > plan.slots[i - 1].start && s.start < plan.slots[i - 1].end, 'overlapping'); } });
        assert.ok (DropInPlan (Array.from ({ length : 40 }, (_, i) => ({ data : { kind : 'partition' }, object : i, minY : 0 }))).seconds <= 1.8 + 1e-9, 'many pieces still finish quickly');
        assert.deepEqual (DropInPlan ([]), { seconds : 0, slots : [] });
    });
    it ('draws pieces above their placement, moving only down, and ends exactly in place', async () => {
        const pieces = [piece ('a', { kind : 'pad', position : 'bottom' }), piece ('b', { kind : 'pad', position : 'top' }, 5)], editor = { website : {} };
        let time = 0; const frames = []; const clock = { now : () => time, request : callback => { frames.push (callback); } };
        const done = DropIn (editor, pieces, 1, { data : o => o.data, clock });
        assert.equal (typeof editor.motionOverride, 'function'); assert.ok (pieces[0].threeObject.position.y > 0); assert.equal (pieces[1].threeObject.visible, false);
        let previous = { a : Infinity, b : Infinity };
        while (frames.length) { time += 100; frames.shift () (); for (const p of pieces) { if (p.threeObject.visible) { assert.ok (p.threeObject.position.y <= previous[p.id] + 1e-9); previous[p.id] = p.threeObject.position.y; } } }
        assert.deepEqual (await done, { animated : true, seconds : DropInPlan ([{ data : pieces[0].data, object : 0, minY : 0 }, { data : pieces[1].data, object : 1, minY : 5 }]).seconds });
        for (const p of pieces) { assert.deepEqual ([p.threeObject.position.x, p.threeObject.position.y, p.threeObject.position.z], p.position); assert.equal (p.threeObject.visible, true); }
        assert.equal (editor.motionOverride, null);
    });
    it ('skips the animation without frames, meshes or when reduced motion is requested', async () => {
        assert.deepEqual (await DropIn ({ website : {} }, [{ position : [0, 0, 0] }], 1, { clock : { request : () => {} } }), { animated : false });
        const saved = globalThis.matchMedia; globalThis.matchMedia = () => ({ matches : true });
        try { assert.deepEqual (await DropIn ({ website : {} }, [piece ('a', {})], 1, { clock : { request : () => {}, now : () => 0 } }), { animated : false }); } finally { globalThis.matchMedia = saved; }
    });
});
