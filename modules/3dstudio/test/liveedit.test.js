import assert from 'node:assert/strict';
import { MergeStudioPatch, StudioEditQueue } from '../src/liveedit.js';

function Deferred () { let resolve, reject; const promise = new Promise ((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const Turn = () => new Promise (resolve => setImmediate (resolve));

describe ('3Dstudio live input queue', () => {
    it ('preserves independent dimension, material and transform edits in a coalesced burst', async () => {
        const first = Deferred (), second = Deferred (), calls = [];
        const queue = new StudioEditQueue (() => 'owner/document/object/node', args => { calls.push (args); return calls.length === 1 ? first.promise : second.promise; });
        const a = queue.Push ('solid-1', 'primitive-1', { parameters : { heightMm : 80 } });
        const b = queue.Push ('solid-1', 'primitive-1', { parameters : { widthMm : 70 }, material : { color : '#123456' }, transform : { position : [5, 0, 0] } });
        const c = queue.Push ('solid-1', 'primitive-1', { parameters : { widthMm : 90 }, material : { roughness : .2 }, transform : { rotation : [0, 30, 0] } });
        assert.equal (calls.length, 1, 'the worker receives only one edit at a time');
        assert.deepEqual (queue.Patch (), { parameters : { heightMm : 80, widthMm : 90 }, material : { color : '#123456', roughness : .2 }, transform : { position : [5, 0, 0], rotation : [0, 30, 0] } });
        first.resolve ({ message : 'First committed' }); await Turn (); assert.equal (calls.length, 2);
        assert.deepEqual (calls[1], { objectId : 'solid-1', nodeId : 'primitive-1', parameters : { widthMm : 90 }, material : { color : '#123456', roughness : .2 }, transform : { position : [5, 0, 0], rotation : [0, 30, 0] } });
        second.resolve (true); assert.deepEqual (await Promise.all ([a, b, c]), [{ message : 'First committed' }, true, true]); assert.equal (queue.active, null); assert.deepEqual (queue.Patch (), {});
    });
    it ('drops queued work when the owner, document, selection or editing step changes', async () => {
        let context = 'owner-A/session-1/solid-1/node-1'; const held = Deferred (), calls = [];
        const queue = new StudioEditQueue (() => context, args => { calls.push (args); return held.promise; });
        const active = queue.Push ('solid-1', 'node-1', { parameters : { heightMm : 80 } });
        const pending = queue.Push ('solid-1', 'node-1', { parameters : { widthMm : 90 } });
        context = 'owner-B/session-2/solid-1/node-1'; assert.deepEqual (queue.Patch (), {}, 'matching object IDs alone cannot carry edits into another session');
        held.resolve (true); assert.deepEqual (await Promise.all ([active, pending]), [false, false]); assert.equal (calls.length, 1);
    });
    it ('pins a new pending edit to its own object and node after context changes', async () => {
        let context = 'first'; const held = Deferred (), calls = [];
        const queue = new StudioEditQueue (() => context, args => { calls.push (args); return calls.length === 1 ? held.promise : true; });
        const old = queue.Push ('solid-1', 'primitive-1', { parameters : { heightMm : 80 } });
        const stale = queue.Push ('solid-1', 'primitive-1', { material : { opacity : .5 } });
        context = 'second'; const next = queue.Push ('solid-2', 'primitive-4', { parameters : { diameterMm : 40 } });
        assert.equal (await stale, false); held.resolve (true); assert.deepEqual (await Promise.all ([old, next]), [false, true]);
        assert.deepEqual (calls[1], { objectId : 'solid-2', nodeId : 'primitive-4', parameters : { diameterMm : 40 } });
    });
    it ('allows a queued correction to succeed after an invalid shape rejects', async () => {
        const held = Deferred (); let count = 0;
        const queue = new StudioEditQueue (() => 'same', () => ++count === 1 ? held.promise : true);
        const invalid = queue.Push ('solid-1', 'primitive-1', { parameters : { innerDiameterMm : 900 } });
        const rejected = assert.rejects (invalid, /inner diameter/);
        const corrected = queue.Push ('solid-1', 'primitive-1', { parameters : { innerDiameterMm : 30 } });
        held.reject (new Error ('Invalid inner diameter')); await rejected; assert.equal (await corrected, true); assert.equal (count, 2);
    });
    it ('cancels queued edits and does not accept late results after disposal', async () => {
        const held = Deferred (); let calls = 0;
        const queue = new StudioEditQueue (() => 'same', () => { calls++; return held.promise; });
        const active = queue.Push ('solid-1', 'primitive-1', { parameters : { heightMm : 80 } });
        const pending = queue.Push ('solid-1', 'primitive-1', { parameters : { heightMm : 90 } });
        queue.Dispose (); held.resolve (true);
        assert.deepEqual (await Promise.all ([active, pending]), [false, false]); assert.equal (calls, 1); assert.equal (await queue.Push ('solid-1', 'primitive-1', {}), false);
    });
    it ('merges patches without changing the original state', () => {
        const before = { parameters : { widthMm : 40, heightMm : 60 }, material : { color : '#ffffff' }, enabled : true }, copy = JSON.parse (JSON.stringify (before));
        const merged = MergeStudioPatch (before, { parameters : { heightMm : 80 }, material : { opacity : .5 }, enabled : false });
        assert.deepEqual (merged, { parameters : { widthMm : 40, heightMm : 80 }, material : { color : '#ffffff', opacity : .5 }, enabled : false }); assert.deepEqual (before, copy);
    });
});
