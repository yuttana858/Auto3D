import assert from 'node:assert/strict';
import { ProgressRecord } from '../source/website/progresspopup.js';

describe ('Progress record', () => {
    it ('reports the weighted share of completed work and each finished step time', () => {
        const record = new ProgressRecord ('Can collar', [{ id : 'a', label : 'A', weight : 10 }, { id : 'b', label : 'B', weight : 30 }, { id : 'c', label : 'C', weight : 60 }]);
        const seen = []; record.listeners.add (r => seen.push (r.percent));
        assert.equal (record.percent, 0);
        record.Step ('a', { fraction : .5 }); assert.equal (record.percent, 5);
        record.Step ('b', { detail : '1 / 3', fraction : 1 / 3 }); assert.equal (record.percent, 20); assert.equal (record.Inspect ().steps[0].state, 'done'); assert.ok (record.Inspect ().steps[0].ms >= 0);
        record.Step ('c'); assert.equal (record.percent, 40);
        record.Done ('ok'); assert.equal (record.percent, 100); assert.equal (record.Inspect ().state, 'done'); assert.ok (record.Inspect ().steps.every (s => s.state === 'done' && s.ms !== null));
        assert.deepEqual (seen, [5, 20, 40, 100]);
    });
    it ('marks the active step failed and keeps the percentage reached', () => {
        const record = new ProgressRecord ('X', [{ id : 'a', label : 'A', weight : 1 }, { id : 'b', label : 'B', weight : 1 }]);
        record.Step ('b', { fraction : .5 }); record.Fail ('broke');
        const state = record.Inspect (); assert.equal (state.state, 'failed'); assert.equal (state.percent, 75); assert.equal (state.steps[1].state, 'failed'); assert.equal (state.message, 'broke');
        assert.throws (() => record.Step ('zzz'), /Unknown progress step/);
        assert.throws (() => new ProgressRecord ('Y', []), /labelled, weighted steps/);
    });
});
