import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RevealArray } from '../source/website/arrayreveal.js';
import { Camera } from '../source/engine/viewer/camera.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
describe ('Array presentation integration review', () => {
    async function review (cancel = false) {
        const saved = { document : global.document, requestAnimationFrame : global.requestAnimationFrame, cancelAnimationFrame : global.cancelAnimationFrame, performance : global.performance };
        let time = 0, pending, current = new Camera (new Coord3D (20, 20, 20), new Coord3D (0, 0, 0), new Coord3D (0, 1, 0), 45); const cameras = [], listeners = new Map ();
        global.document = { createElement : () => ({ appendChild : () => {}, addEventListener : () => {}, remove : () => {} }) };
        global.performance = { now : () => time }; global.requestAnimationFrame = callback => { pending = callback; return 1; }; global.cancelAnimationFrame = () => { pending = null; };
        try {
            const object = x => { const mesh = new THREE.Mesh (new THREE.BoxGeometry (10, 10, 10)); mesh.position.x = x; mesh.updateMatrixWorld (true); return { threeObject : mesh, visible : true, position : [x, 0, 0] }; };
            const source = object (0), copies = [object (10), object (20)]; copies.forEach (copy => { copy.threeObject.visible = false; }); const canonical = JSON.stringify (copies.map (copy => copy.position));
            const viewer = { GetCamera : () => current, GetImageSize : () => ({ width : 1000, height : 700 }), SetCamera : camera => { current = camera; cameras.push (camera.Clone ()); }, Render : () => {}, renderer : { domElement : { addEventListener : (event, callback) => listeners.set (event, callback), removeEventListener : event => listeners.delete (event) } } };
            const editor = { website : { viewer }, Status : () => {}, timeline : { cameraKeyframes : [] } }; const operation = { duration : 4, cameraAutoFit : true, check : () => {} };
            const initial = current.Clone (); const completion = RevealArray (editor, source, copies, 15, operation);
            assert.deepEqual (current, initial, 'The first frame must preserve the current camera'); assert.equal (copies[0].threeObject.visible, false);
            time = 640; pending (); assert.equal (copies[0].threeObject.visible, true); assert.equal (copies[1].threeObject.visible, false); assert.ok (copies[0].threeObject.matrix.elements[13] > 0);
            assert.equal (JSON.stringify (copies.map (copy => copy.position)), canonical);
            if (cancel) {
                listeners.get ('wheel') (); const before = cameras.length; time = 1200; pending (); assert.equal (cameras.length, before); assert.equal (operation.cameraAutoFit, false);
                operation.player.Stop (); await assert.rejects (() => completion, /canceled/); assert.ok (copies.every (copy => !copy.threeObject.visible));
            } else {
                time = 4000; pending (); await completion; assert.equal (operation.placed, 3); assert.ok (copies.every (copy => copy.threeObject.visible)); assert.notDeepEqual (current.eye, initial.eye);
            }
            for (const copy of copies) { assert.equal (copy.threeObject.matrixAutoUpdate, true); assert.equal (copy.threeObject.matrix.elements[13], 0); }
            assert.equal (listeners.size, 0); assert.equal (JSON.stringify (copies.map (copy => copy.position)), canonical);
        } finally { Object.assign (global, saved); }
    }
    it ('Preserves the first camera frame, drops in order and restores exact final transforms', () => review ());
    it ('Honors manual camera takeover and restores transforms/listeners on cancellation', () => review (true));
});
