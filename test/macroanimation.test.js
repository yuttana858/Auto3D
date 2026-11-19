import assert from 'node:assert/strict';
import { CommandRegistry } from '../source/website/commandregistry.js';
import { RecordMacroAnimation } from '../source/website/macroanimation.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { TimelineFoldSample } from '../source/website/timelineactions.js';
import { TimelineClipSample } from '../source/website/timelineclips.js';
import { SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { BoxGeometry, Mesh, MeshBasicMaterial } from 'three';

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
    it ('records a named shared-library macro with its saved timing metadata', async () => {
        const { editor, object } = fixture (); editor.website.sessionEditor = editor; const names = [];
        const macro = { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { objectId : object.id, position : [4, 0, 0] }, animation : { duration : 0.5, pauseAfter : 1 } }] };
        editor.website.macroLibrary = { Find : async name => { names.push (name); return { name, macro, location : 'shared' }; } };
        const registry = CreateAgentCommands (editor.website); registry.commands.get ('object.transform').handler = ({ position }) => { object.position = position; return { id : object.id }; };
        const result = await registry.Execute ('animation.macro.record', { name : 'Shared timed move' });
        assert.equal (result.ok, true, JSON.stringify (result)); assert.equal (result.result.recorded, true); assert.equal (result.result.duration, 1.5); assert.deepEqual (names, ['Shared timed move']); assert.deepEqual (object.keyframes.map (key => key.time), [0, 0.5, 1.5]);
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
    it ('records array copy visibility and drop motion at the correct sequence position', async () => {
        const { editor, registry, object } = fixture (); object.threeObject = new Mesh (new BoxGeometry (2, 2, 2), new MeshBasicMaterial ()); editor.selected = object;
        const schema = { type : 'object', properties : { width : { type : 'number' }, length : { type : 'number' }, height : { type : 'number' }, animate : { type : 'boolean' } }, required : ['width', 'length', 'height'], additionalProperties : false };
        registry.Register ({ id : 'object.array', inputSchema : schema, mutates : true }, ({ animate }) => { assert.equal (animate, false); const copy = { id : 'copy', position : [2, 0, 0], rotation : [0, 0, 0], scale : [1, 1, 1], keyframes : [], visible : true }; editor.document.objects.push (copy); return { objectIds : ['copy'] }; });
        const macro = { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { x : 1 } }, { id : 'copies', command : 'object.array', arguments : { width : 2, length : 1, height : 1 }, animation : { duration : 4 } }] };
        const result = await RecordMacroAnimation (editor, registry, macro); assert.equal (result.recorded, true); assert.equal (result.duration, 6); assert.deepEqual (result.completed[1].objectIds, ['copy']); const copy = editor.document.objects[1];
        assert.deepEqual (copy.visibilityKeys.map (key => key.visible), [false, true]); assert.ok (copy.visibilityKeys[1].time > 2 && copy.visibilityKeys[1].time < 6); assert.equal (copy.keyframes[0].position[1], 2.5); assert.equal (copy.keyframes.at (-1).time, 6);
        assert.ok (editor.timeline.ObjectStateAt (copy, 2.4).position[1] < 2.5);
    });
    it ('rejects oversized recorded arrays before creating any copies', async () => {
        const { editor, registry, object } = fixture (); object.threeObject = new Mesh (new BoxGeometry (1, 1, 1), new MeshBasicMaterial ()); editor.selected = object;
        registry.Register ({ id : 'object.array', inputSchema : { type : 'object', properties : { width : { type : 'number' }, length : { type : 'number' }, height : { type : 'number' } }, required : ['width', 'length', 'height'], additionalProperties : false }, mutates : true }, () => { throw new Error ('Must not create'); });
        const result = await RecordMacroAnimation (editor, registry, { version : 1, steps : [{ id : 'copies', command : 'object.array', arguments : { width : 10, length : 10, height : 2 } }] }); assert.equal (result.recorded, false); assert.match (result.error.message, /100 total/); assert.equal (editor.document.objects.length, 1);
    });
    it ('keeps a non-animated array hidden until its step ends and rejects a hidden source', async () => {
        const { editor, registry, object } = fixture (); object.threeObject = new Mesh (new BoxGeometry (1, 1, 1), new MeshBasicMaterial ()); editor.selected = object;
        const schema = { type : 'object', properties : { width : { type : 'number' }, length : { type : 'number' }, height : { type : 'number' }, animate : { type : 'boolean' } }, required : ['width', 'length', 'height'], additionalProperties : false };
        registry.Register ({ id : 'object.array', inputSchema : schema, mutates : true }, () => { const copy = { id : 'copy', position : [1, 0, 0], rotation : [0, 0, 0], scale : [1, 1, 1], keyframes : [], visible : true }; editor.document.objects.push (copy); return { objectIds : ['copy'] }; });
        const macro = { version : 1, steps : [{ id : 'copy', command : 'object.array', arguments : { width : 2, length : 1, height : 1, animate : false } }] };
        object.visible = false; const failed = await RecordMacroAnimation (editor, registry, macro); assert.equal (failed.recorded, false); assert.match (failed.error.message, /visible/); assert.equal (editor.document.objects.length, 1);
        object.visible = true; const result = await RecordMacroAnimation (editor, registry, macro); assert.equal (result.recorded, true); assert.deepEqual (editor.document.objects[1].visibilityKeys.map (key => [key.time, key.visible]), [[0, false], [2, true]]);
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
    it ('makes a recording one Undo step that reverses the keyframes and the macro changes', async () => {
        const { editor, registry, object } = fixture (); editor.history = new SceneHistory ();
        registry.commands.get ('object.transform').handler = ({ x }) => { const before = object.position; object.position = [x, 0, 0]; const after = object.position; editor.history.Push ({ undo : () => { object.position = before; }, redo : () => { object.position = after; } }); return { id : object.id }; };
        const result = await RecordMacroAnimation (editor, registry, { version : 1, steps : [{ id : 'a', command : 'object.transform', arguments : { x : 4 } }, { id : 'b', command : 'object.transform', arguments : { x : 6 } }] }, 1);
        editor.timeline.Seek = () => {}; // Viewer posing is covered by the browser test; this checks the history entry.
        assert.equal (result.recorded, true); assert.equal (editor.history.undo.length, 1); assert.equal (editor.history.undo[0].macroRecording, true);
        await editor.history.Undo (); assert.deepEqual (object.position, [0, 0, 0]); assert.equal (object.keyframes.length, 0); assert.equal (editor.timeline.cameraKeyframes.length, 0);
        await editor.history.Redo (); assert.deepEqual (object.position, [6, 0, 0]); assert.deepEqual (object.keyframes.map (k => k.time), [0, 1, 2]);
    });
    it ('keeps timed visibility and holds together with scene changes in one Undo entry', async () => {
        const { editor, registry, object } = fixture (); editor.history = new SceneHistory (); object.visible = true;
        registry.commands.get ('object.transform').handler = ({ x }) => { const before = [...object.position], after = [x, 0, 0]; object.position = after; editor.history.Push ({ undo : () => { object.position = before; }, redo : () => { object.position = after; } }); return { id : object.id }; };
        registry.commands.get ('object.visibility').handler = ({ visible }) => { const before = object.visible; object.visible = visible; editor.history.Push ({ undo : () => { object.visible = before; }, redo : () => { object.visible = visible; } }); return { id : object.id }; };
        const macro = { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { x : 4 }, animation : { duration : 1, pauseAfter : 2 } }, { id : 'hide', command : 'object.visibility', arguments : { visible : false }, animation : { duration : 0.5, pauseAfter : 0.5 } }] };
        const result = await RecordMacroAnimation (editor, registry, macro);
        assert.equal (result.recorded, true); assert.equal (result.duration, 4); assert.equal (editor.history.undo.length, 1);
        assert.deepEqual (object.keyframes.map (key => key.time), [0, 1, 3, 3.5, 4]);
        assert.deepEqual (object.visibilityKeys.map (key => [key.time, key.visible]), [[0, true], [3.5, false]]);
        editor.timeline.Seek = () => {};
        await editor.history.Undo (); assert.deepEqual (object.position, [0, 0, 0]); assert.equal (object.visible, true); assert.deepEqual (object.visibilityKeys, []); assert.deepEqual (object.keyframes, []);
        await editor.history.Redo (); assert.deepEqual (object.position, [4, 0, 0]); assert.equal (object.visible, false);
        assert.deepEqual (object.keyframes.map (key => key.time), [0, 1, 3, 3.5, 4]); assert.deepEqual (object.visibilityKeys.map (key => [key.time, key.visible]), [[0, true], [3.5, false]]);
    });
});
