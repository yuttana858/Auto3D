import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AnimationPlayer } from '../source/website/sessionanimation.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { TimelineClipSample, ValidateTimelineClips } from '../source/website/timelineclips.js';

describe ('Embedded clips on the shared timeline', () => {
    const action = { id : 'a', objectId : 'box', clip : 0, time : 2, duration : 2, speed : 1, loop : false, baseClip : 0, baseTime : .5 };
    it ('samples baseline, motion and held end deterministically', () => { const clips = [{ duration : 2 }]; assert.deepEqual (TimelineClipSample ([action], 'box', 1, clips), { clip : 0, time : .5, loop : null }); assert.equal (TimelineClipSample ([action], 'box', 3, clips).time, 1); assert.equal (TimelineClipSample ([action], 'box', 9, clips).time, 2); assert.equal (TimelineClipSample ([{ ...action, loop : true, duration : 5 }], 'box', 5, clips).time, 1); });
    it ('rejects overlaps, inconsistent baselines and invalid durations', () => { assert.throws (() => ValidateTimelineClips ([action, { ...action, id : 'b', time : 3 }])); assert.throws (() => ValidateTimelineClips ([action, { ...action, id : 'b', time : 4, baseTime : 1 }])); assert.throws (() => ValidateTimelineClips ([{ ...action, speed : 0 }])); });
    it ('restores the current player baseline when undo follows a scene rebuild', () => {
        const object = { id : 'box', visible : true, threeObject : { visible : true }, playback : { loop : false } };
        const createPlayer = () => { const root = new THREE.Group (), node = new THREE.Object3D (); node.name = 'part'; root.add (node); const clip = new THREE.AnimationClip ('move', 2, [new THREE.VectorKeyframeTrack ('part.position', [0, 2], [0, 0, 0, 4, 0, 0])]); const player = new AnimationPlayer (object, root, [clip], () => {}); object.player = player; return { node, player }; };
        const first = createPlayer (); first.player.Seek (.5);
        const editor = { document : { objects : [object] }, website : { auth : { user : { id : 'a' } }, accountReady : true, viewer : { navigation : {}, UpdateGroundGrid : () => {}, Render : () => {} } }, history : { Push : entry => { editor.undo = entry; } }, MarkDirty : () => {}, AnimationUI : () => {}, UpdateSelectionBox : () => {}, SyncInputs : () => {} };
        const timeline = new SessionTimeline (editor); timeline.AddEmbeddedClip ({ objectId : object.id, clip : 0, time : 2, duration : 2 }); timeline.Seek (3, false);
        first.player.Dispose (); const current = createPlayer (); timeline.ApplyEmbeddedClips (); assert.equal (current.node.position.x, 2);
        editor.undo.undo (); assert.equal (current.node.position.x, 1); assert.equal (current.player.state.time, .5); editor.undo.redo (); assert.equal (current.node.position.x, 2); current.player.Dispose ();
    });
    it ('seeks the actual embedded animation and restores its baseline through undo', () => {
        const root = new THREE.Group (), node = new THREE.Object3D (); node.name = 'part'; root.add (node); const clip = new THREE.AnimationClip ('move', 2, [new THREE.VectorKeyframeTrack ('part.position', [0, 2], [0, 0, 0, 4, 0, 0])]);
        const object = { id : 'box', visible : true, threeObject : { visible : true }, playback : { loop : false } }; let renders = 0; const player = new AnimationPlayer (object, root, [clip], () => renders++); object.player = player; player.Seek (.5);
        const viewer = { navigation : {}, UpdateGroundGrid : () => {}, Render : () => {} }, editor = { document : { objects : [object] }, website : { auth : { user : { id : 'a' } }, accountReady : true, viewer }, readOnly : false, busy : false, history : { Push : entry => { editor.undo = entry; } }, MarkDirty : () => {}, AnimationUI : () => {}, UpdateSelectionBox : () => {}, SyncInputs : () => {} };
        const timeline = new SessionTimeline (editor); timeline.AddEmbeddedClip ({ objectId : 'box', clip : 0, time : 2, duration : 2 }); const beforeRender = renders; timeline.Seek (1, false); assert.equal (node.position.x, 1); timeline.Seek (3, false); assert.equal (node.position.x, 2); timeline.Seek (4, false); assert.equal (node.position.x, 4); assert.equal (renders, beforeRender); editor.undo.undo (); assert.equal (timeline.embeddedClips.length, 0); assert.equal (node.position.x, 1); editor.undo.redo (); timeline.Seek (3, false); assert.equal (node.position.x, 2); const id = timeline.embeddedClips[0].id; timeline.DeleteEmbeddedClip (id); assert.equal (timeline.embeddedClips.length, 0); assert.equal (node.position.x, 1); editor.undo.undo (); timeline.Seek (3, false); assert.equal (node.position.x, 2); player.Dispose ();
    });
});
