import assert from 'node:assert/strict';
import { Navigation } from '../source/engine/viewer/navigation.js';
import { Camera } from '../source/engine/viewer/camera.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
describe ('Superseded camera transitions', () => {
    it ('Does not let an old fit tween overwrite a presentation camera or a newer fit', () => {
        const request = global.requestAnimationFrame; const frames = []; global.requestAnimationFrame = callback => { frames.push (callback); return frames.length; };
        try {
            const camera = x => new Camera (new Coord3D (x, 10, 10), new Coord3D (0, 0, 0), new Coord3D (0, 1, 0), 45);
            const nav = Object.create (Navigation.prototype); nav.camera = camera (10); nav.Update = () => {};
            nav.MoveCamera (camera (20), 5); const presentation = camera (100); nav.SetCamera (presentation); frames.shift () (); assert.equal (nav.camera.eye.x, 100);
            nav.MoveCamera (camera (200), 3); nav.MoveCamera (camera (300), 3); while (frames.length) { frames.shift () (); } assert.equal (nav.camera.eye.x, 300);
            nav.MoveCamera (camera (400), 3); nav.StopCameraMovement (); while (frames.length) { frames.shift () (); } assert.equal (nav.camera.eye.x, 300);
        } finally { global.requestAnimationFrame = request; }
    });
});
