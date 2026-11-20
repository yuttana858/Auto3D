import assert from 'node:assert/strict';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { ValidateVisibilityKeys, VisibilityAt } from '../source/website/visibilitytrack.js';

describe ('Animation visibility tracks', () => {
    it ('keeps saved visibility separate and evaluates boundaries deterministically', () => {
        const object = { visible : true, threeObject : { visible : true }, visibilityKeys : ValidateVisibilityKeys ([{ id : 'a', time : 0, visible : false }, { id : 'b', time : 2, visible : true }, { id : 'c', time : 4, visible : false }]) };
        assert.equal (VisibilityAt (object, 1.99), false); assert.equal (VisibilityAt (object, 2), true); assert.equal (VisibilityAt (object, 4), false); assert.equal (object.visible, true);
        const timeline = new SessionTimeline ({ document : { objects : [object] } }); timeline.time = 2; timeline.ApplyVisibility (); assert.equal (object.threeObject.visible, true); timeline.time = 4; timeline.ApplyVisibility (); assert.equal (object.threeObject.visible, false); assert.equal (object.visible, true);
    });
    it ('rejects malformed and duplicate-time tracks', () => { assert.throws (() => ValidateVisibilityKeys ([{ id : 'a', time : 0, visible : true }, { id : 'b', time : 0, visible : false }])); assert.throws (() => ValidateVisibilityKeys ([{ id : 'a', time : 1, visible : 'true' }])); });
    it ('creates and undoes a lifetime without deleting the object', () => {
        const object = { id : 'box', visible : true, threeObject : { visible : true } }, editor = { document : { objects : [object] }, website : { auth : { user : { id : 'a' } }, accountReady : true }, readOnly : false, busy : false, history : { Push : entry => { editor.undo = entry; } }, MarkDirty : () => {}, AnimationUI : () => {} };
        const timeline = new SessionTimeline (editor); timeline.Seek = time => { timeline.time = time; timeline.ApplyVisibility (); }; const result = timeline.SetLifetime (object, 2, 4); assert.equal (editor.document.objects.length, 1); assert.deepEqual (result.visibilityKeys.map (k => [k.time, k.visible]), [[0, false], [2, true], [4, false]]); timeline.Seek (1); assert.equal (object.threeObject.visible, false); timeline.Seek (3); assert.equal (object.threeObject.visible, true); editor.undo.undo (); assert.equal (object.visibilityKeys.length, 0); assert.equal (object.threeObject.visible, true); editor.undo.redo (); assert.equal (object.visibilityKeys.length, 3);
    });
});
