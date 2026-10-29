import assert from 'node:assert/strict';
import { CapturePresentationBackground, RestorePresentationCamera } from '../source/website/sharedpresentation.js';
describe ('Shared presentation', () => {
    it ('resolves theme-relative backgrounds and copies custom colors', () => {
        const settings = { backgroundPreset : 'standard', backgroundColor : { r : 1, g : 2, b : 3, a : 255 } };
        const saved = CapturePresentationBackground (settings, false);
        assert.equal (saved.colors[0], '#ffffff'); settings.backgroundColor.r = 8; assert.equal (saved.color.r, 1);
        assert.equal (CapturePresentationBackground (settings, true).colors[0], '#111820');
    });
    function viewer () {
        const vector = () => ({ x : 0, y : 0, z : 0 });
        const camera = { eye : vector (), center : vector (), up : vector (), Clone () { return { eye : vector (), center : vector (), up : vector () }; } };
        return { camera, projection : 1, GetCamera () { return this.camera; }, SetCamera (c) { this.camera = c; }, GetProjectionMode () { return this.projection; }, SetProjectionMode (p) { this.projection = p; } };
    }
    it ('restores position, target, up, projection and FOV without auto fitting', () => {
        const v = viewer ();
        assert.equal (RestorePresentationCamera (v, { cameraState : { eye : [4, 5, 6], center : [1, 2, 3], up : [0, 1, 0], fov : 55, projectionMode : 2 } }), true);
        assert.deepEqual (v.camera.eye, { x : 4, y : 5, z : 6 }); assert.equal (v.camera.fov, 55); assert.equal (v.projection, 2);
    });
    it ('supports legacy cameras and rejects missing or degenerate cameras', () => {
        const v = viewer ();
        assert.equal (RestorePresentationCamera (v, {}), false);
        assert.equal (RestorePresentationCamera (v, { cameraState : { eye : [0, 0, 0], center : [0, 0, 0], up : [0, 1, 0] } }), false);
        assert.equal (RestorePresentationCamera (v, { camera : { eye : { x : 3, y : 4, z : 5 }, center : { x : 0, y : 0, z : 0 }, up : { x : 0, y : 1, z : 0 }, fov : 40 } }), true);
        assert.equal (v.camera.fov, 40);
    });
});
