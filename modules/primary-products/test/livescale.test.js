import assert from 'node:assert/strict';
import { LiveProductScale } from '../src/livescale.js';
import { ScaleProductChanges } from '../src/details.js';
import { DefaultProductDraft, UpdateProductDraft } from '../src/state.js';

function Scale ()
{
    let draft = DefaultProductDraft (), target = 'a', units = 'metric', editContext = 1, release, fail = false;
    const applied = [], gate = new Promise (resolve => { release = resolve; });
    const host = { inspect : () => ({ ...draft, liveObjectId : target, editContext }), units : () => units };
    const scale = new LiveProductScale (host, async args => {
        if (!applied.length) { await gate; }
        if (args.objectId !== target) { return false; }
        if (fail) { fail = false; throw new Error ('This scale would make the bottle too small.'); }
        applied.push (args); draft = UpdateProductDraft (draft, ScaleProductChanges (draft, args.factor, { live : true })); scale.Refresh (); return {};
    });
    scale.Refresh ();
    return { scale, applied, release, draft : () => draft, target : id => { target = id; scale.Refresh (); }, session : () => { editContext++; scale.Refresh (); }, units : value => { units = value; scale.Refresh (); }, replace : changes => { draft = UpdateProductDraft (draft, changes); return scale.Refresh (); }, fail : value => { fail = value; } };
}

describe ('Live product percentage scale', function () {
    it ('scales to the entered percentage without compounding successive values', async function () {
        const e = Scale (), start = e.draft ().heightMm; e.release ();
        assert.equal (await e.scale.Commit (125, true), true); assert.equal (await e.scale.Commit (130, true), true);
        assert.equal (e.draft ().heightMm, start * 1.3); assert.deepEqual (e.applied.map (a => a.factor), [1.25, 1.04]);
        assert.equal (e.scale.percent, 130); assert.equal (e.scale.Refresh (), false);
        await e.scale.Commit (130, true); assert.equal (e.applied.length, 2);
    });
    it ('coalesces newer percentages while a rebuild is pending and keeps artwork preferences', async function () {
        const e = Scale (), start = e.draft ().heightMm, first = e.scale.Commit (125, true); await Promise.resolve ();
        const second = e.scale.Commit (130, true), last = e.scale.Commit (150, false); e.release ();
        assert.deepEqual (await Promise.all ([first, second, last]), [true, true, true]);
        assert.equal (e.draft ().heightMm, start * 1.5); assert.deepEqual (e.applied.map (a => [a.factor, a.scaleArtwork]), [[1.25, true], [1.2, false]]);
    });
    it ('resets the reference size after Undo or manual geometry edits', async function () {
        const e = Scale (), start = e.draft ().heightMm; e.release (); await e.scale.Commit (125, true);
        assert.equal (e.replace ({ heightMm : start }), true); assert.equal (e.scale.percent, 100);
        await e.scale.Commit (125, true); assert.equal (e.draft ().heightMm, start * 1.25);
        assert.equal (e.replace ({ color : '#123456' }), false); assert.equal (e.scale.percent, 125);
    });
    it ('does not send queued or in-flight edits to a newly selected object', async function () {
        const e = Scale (), first = e.scale.Commit (125, true); await Promise.resolve ();
        const next = e.scale.Commit (150, true); e.target ('b'); e.release ();
        assert.deepEqual (await Promise.all ([first, next]), [false, false]); assert.equal (e.applied.length, 0); assert.equal (e.scale.percent, 100);
        await e.scale.Commit (120, true); assert.equal (e.applied[0].objectId, 'b');
    });
    it ('drops queued edits when units change and on disposal', async function () {
        const e = Scale (), queued = e.scale.Commit (125, true); e.units ('standard'); e.release (); assert.equal (await queued, false); assert.equal (e.applied.length, 0);
        const disposed = e.scale.Commit (125, true); e.scale.Dispose (); assert.equal (await disposed, false); assert.equal (e.applied.length, 0);
    });
    it ('does not restart a queued edit in a new session with the same object ID', async function () {
        const e = Scale (), queued = e.scale.Commit (125, true); e.session (); e.release ();
        assert.equal (await queued, false); assert.equal (e.applied.length, 0); assert.equal (e.scale.percent, 100);
        await e.scale.Commit (125, true); assert.equal (e.applied.length, 1);
    });
    it ('keeps the previous percentage after a rejected edit and permits correction', async function () {
        const e = Scale (); e.release (); await e.scale.Commit (125, true); e.fail (true);
        await assert.rejects (e.scale.Commit (150, true), /bottle too small/); assert.equal (e.scale.percent, 125);
        e.fail (false); await e.scale.Commit (130, true); assert.equal (e.applied[1].factor, 1.04);
        await assert.rejects (e.scale.Commit (0, true), /10% to 1000%/); await assert.rejects (e.scale.Commit (1001, true), /10% to 1000%/);
    });
    it ('propagates errors while allowing coalesced corrections against the last accepted size', async function () {
        const e = Scale (), start = e.draft ().heightMm; e.fail (true);
        const first = assert.rejects (e.scale.Commit (125, true), /bottle too small/); await Promise.resolve ();
        const second = e.scale.Commit (130, true), last = e.scale.Commit (150, true); e.release ();
        await first; assert.deepEqual (await Promise.all ([second, last]), [true, true]);
        assert.equal (e.draft ().heightMm, start * 1.5); assert.equal (e.applied[0].factor, 1.5); assert.equal (e.scale.percent, 150);
    });
    it ('allows the full live range without widening public relative-scale limits', function () {
        const draft = DefaultProductDraft ();
        assert.equal (ScaleProductChanges (draft, .01, { live : true }).heightMm, draft.heightMm * .01);
        assert.equal (ScaleProductChanges (draft, 100, { live : true }).heightMm, draft.heightMm * 100);
        assert.throws (() => ScaleProductChanges (draft, .01), /0.1–10/); assert.throws (() => ScaleProductChanges (draft, 100), /0.1–10/);
        for (const factor of [0, -.1, .009, 101, NaN, Infinity]) { assert.throws (() => ScaleProductChanges (draft, factor, { live : true }), /10% to 1000%/); }
    });
});
