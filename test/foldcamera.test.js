import assert from 'node:assert/strict';
import { Camera } from '../source/engine/viewer/camera.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { FoldCameraFrame, FoldMotionProgress, CameraBottomInset } from '../source/website/foldcamera.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
describe ('Smooth folding camera', () => {
    const camera = () => new Camera (new Coord3D (100, 60, 100), new Coord3D (5, 0, 0), new Coord3D (0, 1, 0), 45);
    it ('Starts exactly at the current camera and holds geometry while easing in/out', () => {
        const original = camera (); const sphere = { center : { x : 30, y : 40, z : 10 }, radius : 20 };
        assert.deepEqual (FoldCameraFrame (original, sphere, 100, 0), original);
        assert.equal (FoldMotionProgress (.1), 0); assert.equal (FoldMotionProgress (.9), 1); assert.equal (FoldMotionProgress (.3, false), .3);
        const before = FoldCameraFrame (original, sphere, 100, .15 - 1e-7); const after = FoldCameraFrame (original, sphere, 100, .15 + 1e-7);
        assert.ok (Math.hypot (before.eye.x - after.eye.x, before.eye.y - after.eye.y, before.eye.z - after.eye.z) < 1e-3);
        const endpoint = FoldCameraFrame (original, sphere, 100, 1); assert.deepEqual ([endpoint.center.x, endpoint.center.y, endpoint.center.z], [30, 40, 10]);
        assert.ok (Math.hypot (endpoint.eye.x - 30, endpoint.eye.y - 40, endpoint.eye.z - 10) < Math.hypot (after.eye.x - 30, after.eye.y - 40, after.eye.z - 10));
    });
    it ('Frames portrait views farther away and preserves a finite useful flat-board angle', () => {
        const original = camera (); const sphere = { center : { x : 0, y : 0, z : 0 }, radius : 100 };
        const wide = FoldCameraFrame (original, sphere, 100, 1, 2); const narrow = FoldCameraFrame (original, sphere, 100, 1, .5);
        assert.ok (Math.hypot (narrow.eye.x, narrow.eye.y, narrow.eye.z) > Math.hypot (wide.eye.x, wide.eye.y, wide.eye.z));
        assert.ok (narrow.eye.y > 0); assert.deepEqual (original, camera ());
    });
    it ('Reserves camera space above an overlapping command bar without changing initial framing', () => {
        const original = camera (); const sphere = { center : { x : 0, y : 0, z : 0 }, radius : 100 };
        const viewer = { renderer : { domElement : { getBoundingClientRect : () => ({ top : 100, bottom : 900, height : 800 }) } } };
        const inset = CameraBottomInset (viewer, { parentElement : { getBoundingClientRect : () => ({ top : 800, bottom : 890 }) } });
        assert.ok (inset > .1 && inset < .2);
        assert.deepEqual (FoldCameraFrame (original, sphere, 100, 0, 1, inset), original);
        const normal = FoldCameraFrame (original, sphere, 100, 1); const framed = FoldCameraFrame (original, sphere, 100, 1, 1, inset);
        assert.ok (framed.center.y < 0); assert.ok (Math.hypot (...['x', 'y', 'z'].map (axis => framed.eye[axis] - framed.center[axis])) > Math.hypot (...['x', 'y', 'z'].map (axis => normal.eye[axis] - normal.center[axis])));
        assert.equal (CameraBottomInset (viewer, null), 0);
    });
    it ('Persists the Advance Animation override and retains backward compatibility', () => {
        const timeline = new SessionTimeline ({ document : { objects : [] } }); timeline.Load ({ foldAutoFit : false }); assert.equal (timeline.Serialize ().foldAutoFit, false);
        timeline.Load ({}); assert.equal (timeline.foldAutoFit, true);
    });
    it ('Shares the camera override command with history, camera-keyframe precedence and edit guards', async () => {
        const website = { auth : { user : { id : 'test' } }, accountReady : true }; const editor = { website, history : new SceneHistory (), timeline : { foldAutoFit : true, cameraKeyframes : [] } }; website.sessionEditor = editor;
        editor.packaging = new PackagingWorkspace (editor); const registry = CreateAgentCommands (website);
        assert.equal ((await registry.Execute ('packaging.fefco.camera', { autoFit : false })).ok, true); assert.equal (editor.timeline.foldAutoFit, false);
        await editor.history.Undo (); assert.equal (editor.timeline.foldAutoFit, true); await editor.history.Redo (); assert.equal (editor.timeline.foldAutoFit, false);
        editor.timeline.cameraKeyframes.push ({}); assert.equal ((await registry.Execute ('packaging.fefco.camera', { autoFit : true })).result.cameraKeyframesOverride, true);
        editor.readOnly = true; assert.equal ((await registry.Execute ('packaging.fefco.camera', { autoFit : false })).ok, false);
    });
});
