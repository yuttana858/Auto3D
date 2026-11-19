import assert from 'node:assert/strict';
import { CommandRegistry } from '../source/website/commandregistry.js';
import { RecordMacroAnimation } from '../source/website/macroanimation.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { SceneHistory } from '../source/website/scenedocument.js';

describe ('Macro animation recording', () => {
    function fixture () {
        const object = { id : 'box', name : 'Box', position : [0, 0, 0], rotation : [0, 0, 0], scale : [1, 1, 1], keyframes : [] };
        const camera = { eye : { x : 0, y : 0, z : 5 }, center : { x : 0, y : 0, z : 0 }, up : { x : 0, y : 1, z : 0 }, fov : 45 };
        const editor = { document : { objects : [object] }, website : { auth : { user : { id : 'user' } }, accountReady : true, viewer : { GetCamera : () => camera } }, readOnly : false, busy : false, history : { Push : item => { editor.undo = item; } }, MarkDirty : () => {}, AnimationUI : () => {} };
        editor.timeline = new SessionTimeline (editor); const registry = new CommandRegistry (editor);
        const schema = properties => ({ type : 'object', properties, required : [], additionalProperties : false });
        registry.Register ({ id : 'object.transform', inputSchema : schema ({ x : { type : 'number' } }), mutates : true }, ({ x }) => { object.position = [x, 0, 0]; return { id : object.id }; });
        registry.Register ({ id : 'camera.fov', inputSchema : schema ({ fov : { type : 'number' } }), mutates : true }, ({ fov }) => { camera.fov = fov; return {}; });
        registry.Register ({ id : 'object.delete', inputSchema : schema ({}), mutates : true }, () => { throw new Error ('Must not run'); });
        return { editor, registry, object, camera };
    }
    it ('records sequential object and camera states as interpolated keyframes', async () => {
        const { editor, registry, object } = fixture (); const result = await RecordMacroAnimation (editor, registry, { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { x : 4 } }, { id : 'camera', command : 'camera.fov', arguments : { fov : 60 } }] }, 2);
        assert.equal (result.recorded, true, JSON.stringify (result)); assert.equal (result.duration, 4); assert.deepEqual (object.keyframes.map (k => k.time), [0, 2, 4]); assert.equal (editor.timeline.ObjectStateAt (object, 1).position[0], 2); assert.deepEqual (editor.timeline.cameraKeyframes.map (k => k.fov), [45, 45, 60]); assert.equal (editor.timeline.rangeEnd, 4); assert.ok (editor.undo);
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
});
