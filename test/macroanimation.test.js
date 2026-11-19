import assert from 'node:assert/strict';
import { CommandRegistry } from '../source/website/commandregistry.js';
import { RecordMacroAnimation } from '../source/website/macroanimation.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { TimelineFoldSample } from '../source/website/timelineactions.js';
import { TimelineClipSample } from '../source/website/timelineclips.js';

describe ('Macro animation recording', () => {
    function fixture () {
        const object = { id : 'box', name : 'Box', position : [0, 0, 0], rotation : [0, 0, 0], scale : [1, 1, 1], keyframes : [] };
        const camera = { eye : { x : 0, y : 0, z : 5 }, center : { x : 0, y : 0, z : 0 }, up : { x : 0, y : 1, z : 0 }, fov : 45 };
        const editor = { document : { objects : [object] }, website : { auth : { user : { id : 'user' } }, accountReady : true, viewer : { GetCamera : () => camera } }, readOnly : false, busy : false, history : { Push : item => { editor.undo = item; } }, MarkDirty : () => {}, AnimationUI : () => {} };
        editor.timeline = new SessionTimeline (editor); const registry = new CommandRegistry (editor);
        const schema = properties => ({ type : 'object', properties, required : [], additionalProperties : false });
        registry.Register ({ id : 'object.transform', inputSchema : schema ({ x : { type : 'number' } }), mutates : true }, ({ x }) => { object.position = [x, 0, 0]; return { id : object.id }; });
        registry.Register ({ id : 'camera.fov', inputSchema : schema ({ fov : { type : 'number' } }), mutates : true }, ({ fov }) => { camera.fov = fov; return {}; });
        registry.Register ({ id : 'object.visibility', inputSchema : schema ({ visible : { type : 'boolean' } }), mutates : true }, ({ visible }) => { object.visible = visible; return {}; });
        registry.Register ({ id : 'object.delete', inputSchema : schema ({}), mutates : true }, () => { throw new Error ('Must not run'); });
        return { editor, registry, object, camera };
    }
    it ('records sequential object and camera states as interpolated keyframes', async () => {
        const { editor, registry, object } = fixture (); const result = await RecordMacroAnimation (editor, registry, { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { x : 4 } }, { id : 'camera', command : 'camera.fov', arguments : { fov : 60 } }] }, 2);
        assert.equal (result.recorded, true, JSON.stringify (result)); assert.equal (result.duration, 4); assert.deepEqual (object.keyframes.map (k => k.time), [0, 2, 4]); assert.equal (editor.timeline.ObjectStateAt (object, 1).position[0], 2); assert.deepEqual (editor.timeline.cameraKeyframes.map (k => k.fov), [45, 45, 60]); assert.equal (editor.timeline.rangeEnd, 4); assert.ok (editor.undo);
    });
    it ('records visibility changes as discrete keys with transform and camera states', async () => {
        const { editor, registry, object } = fixture (); object.visible = true; const result = await RecordMacroAnimation (editor, registry, { version : 1, steps : [{ id : 'hide', command : 'object.visibility', arguments : { visible : false } }, { id : 'show', command : 'object.visibility', arguments : { visible : true } }] }, 2); assert.equal (result.recorded, true); assert.deepEqual (object.visibilityKeys.map (key => [key.time, key.visible]), [[0, true], [2, false], [4, true]]);
    });
    it ('records per-step durations and holds without changing the app lighting', async () => {
        const { editor, registry, object } = fixture (); const lighting = { ambient : 0.4, environment : 'studio' }; editor.website.lightingPanel = { Capture : () => structuredClone (lighting) };
        const macro = { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { x : 4 }, animation : { duration : 1, pauseAfter : 2 } }, { id : 'camera', command : 'camera.fov', arguments : { fov : 60 }, animation : { duration : 3 } }] };
        const result = await RecordMacroAnimation (editor, registry, macro); assert.equal (result.duration, 6); assert.deepEqual (object.keyframes.map (key => key.time), [0, 1, 3, 6]); assert.equal (editor.timeline.ObjectStateAt (object, 2).position[0], 4); assert.deepEqual (editor.website.lightingPanel.Capture (), lighting); assert.equal (result.completed[1].start, 3);
    });
    it ('validates timing before executing the macro', async () => {
        const { editor, registry, object } = fixture (); const macro = { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { x : 4 }, animation : { duration : -1 } }] };
        await assert.rejects (RecordMacroAnimation (editor, registry, macro), /duration/); assert.equal (object.position[0], 0);
        macro.steps[0].animation = { overlap : 1 }; await assert.rejects (RecordMacroAnimation (editor, registry, macro), /timing supports/); assert.equal (object.position[0], 0);
    });
    it ('records fold and embedded clip steps at their sequence positions with undo and redo', async () => {
        const { editor, registry, object } = fixture (); object.userData = { _auto3dFefco : '{}' }; editor.selected = object;
        let prepared = 0; editor.packaging = { presentation : { Prepare : async () => { prepared++; } } };
        const choices = []; object.player = { state : { playing : false, clip : 0, time : 0.25 }, clips : [{ duration : 5 }], Choose : (...args) => choices.push (args) };
        editor.timeline.Seek = time => { editor.timeline.time = time; };
        const schema = properties => ({ type : 'object', properties, required : [], additionalProperties : false });
        registry.Register ({ id : 'packaging.fefco.animate', inputSchema : schema ({ objectId : { type : 'string' }, duration : { type : 'number' } }), mutates : true }, () => { throw new Error ('Must schedule, not start playback'); });
        registry.Register ({ id : 'animation.clip.add', inputSchema : schema ({ objectId : { type : 'string' }, clip : { type : 'number' }, duration : { type : 'number' }, speed : { type : 'number' } }), mutates : true }, () => { throw new Error ('Must not use separate history'); });
        const macro = { version : 1, steps : [{ id : 'fold', command : 'packaging.fefco.animate', arguments : { objectId : 'box', duration : 4 }, animation : { pauseAfter : 1 } }, { id : 'clip', command : 'animation.clip.add', arguments : { objectId : 'box', clip : 0, duration : 3, speed : 2 } }] };
        const result = await RecordMacroAnimation (editor, registry, macro); assert.equal (result.recorded, true); assert.equal (result.duration, 8); assert.equal (prepared, 1);
        assert.equal (editor.timeline.actions[0].time, 0); assert.equal (editor.timeline.actions[0].duration, 4); assert.equal (editor.timeline.embeddedClips[0].time, 5); assert.equal (editor.timeline.embeddedClips[0].duration, 3);
        assert.ok (TimelineFoldSample (editor.timeline.actions, 'box', 2).pose < 1); assert.equal (TimelineClipSample (editor.timeline.embeddedClips, 'box', 6, object.player.clips).time, 2);
        editor.undo.undo (); assert.equal (editor.timeline.actions.length, 0); assert.equal (editor.timeline.embeddedClips.length, 0); assert.deepEqual (choices[0], [0, 0.25, false]); editor.undo.redo (); assert.equal (editor.timeline.actions.length, 1); assert.equal (editor.timeline.embeddedClips.length, 1);
    });
    it ('rejects explicit procedural start times and cleans a partial procedural recording after failure', async () => {
        const { editor, registry, object } = fixture (); object.userData = { _auto3dFefco : '{}' }; editor.selected = object; editor.packaging = { presentation : { Prepare : async () => {} } };
        const schema = { type : 'object', properties : { time : { type : 'number' }, duration : { type : 'number' } }, required : [], additionalProperties : false };
        registry.Register ({ id : 'animation.action.add', inputSchema : schema, mutates : true }, () => { throw new Error ('Must not execute'); });
        const macro = { version : 1, steps : [{ id : 'fold', command : 'animation.action.add', arguments : { time : 4 } }] }; await assert.rejects (RecordMacroAnimation (editor, registry, macro), /remove the time/);
        macro.steps[0].arguments = { duration : 2 }; macro.steps.push ({ id : 'bad', command : 'camera.fov', arguments : { fov : 45 } }); registry.commands.get ('camera.fov').handler = () => { throw new Error ('Camera failed'); };
        const result = await RecordMacroAnimation (editor, registry, macro); assert.equal (result.recorded, false); assert.equal (editor.timeline.actions.length, 0); assert.equal (object.keyframes.length, 0);
    });
    it ('rejects unsupported operations before executing any step', async () => {
        const { editor, registry, object } = fixture (); await assert.rejects (RecordMacroAnimation (editor, registry, { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { x : 4 } }, { id : 'remove', command : 'object.delete', arguments : {} }] }), /Cannot record/); assert.equal (object.position[0], 0); assert.equal (object.keyframes.length, 0);
    });
    it ('rejects an active embedded clip before running a macro', async () => {
        const { editor, registry, object } = fixture (); object.player = { state : { playing : true } }; await assert.rejects (RecordMacroAnimation (editor, registry, { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { x : 4 } }] }), /Pause embedded animation/); assert.equal (object.position[0], 0);
    });
    it ('does not overwrite an authored timeline and removes partial recording after a step fails', async () => {
        const { editor, registry, object } = fixture (); const macro = { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { x : 4 } }, { id : 'bad', command : 'camera.fov', arguments : { fov : 45 } }] }; object.keyframes.push ({ time : 0 }); await assert.rejects (RecordMacroAnimation (editor, registry, macro), /empty/); object.keyframes = [];
        registry.commands.get ('camera.fov').handler = () => { throw new Error ('Camera failed'); }; const result = await RecordMacroAnimation (editor, registry, macro); assert.equal (result.recorded, false); assert.equal (result.failedStep, 'bad'); assert.equal (object.position[0], 4); assert.equal (object.keyframes.length, 0); assert.equal (editor.timeline.cameraKeyframes.length, 0);
    });
});
