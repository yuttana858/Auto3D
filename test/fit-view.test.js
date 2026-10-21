import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VisibleSceneBounds, FitVisibleCamera } from '../source/engine/viewer/fitview.js';
import { Camera } from '../source/engine/viewer/camera.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
describe ('Fit all visible geometry', () => {
    it ('uses world transforms without mesh metadata and excludes hidden parents/materials', () => {
        const root = new THREE.Group (); const box = new THREE.Mesh (new THREE.BoxGeometry (2, 2, 2)); box.position.x = 10; root.add (box);
        const hidden = new THREE.Group (); hidden.visible = false; const distant = box.clone (); distant.position.x = 1000; hidden.add (distant); root.add (hidden);
        assert.deepEqual (VisibleSceneBounds (root).min.toArray (), [9, -1, -1]);
        assert.deepEqual (VisibleSceneBounds (root).max.toArray (), [11, 1, 1]);
        box.visible = false; assert.equal (VisibleSceneBounds (root), null);
    });
    it ('targets 120 percent magnification when the safety bound permits', () => {
        const camera = new Camera (new Coord3D (0, 0, 10), new Coord3D (0, 0, 0), new Coord3D (0, 1, 0), 45);
        const bounds = new THREE.Box3 (new THREE.Vector3 (-1, -1, -1), new THREE.Vector3 (1, 1, 1));
        const fit = FitVisibleCamera (camera, bounds, 1);
        assert.ok (Math.abs (fit.eye.z - Math.sqrt (3) / Math.sin (Math.PI / 8) / 1.2) < 1e-10);
    });
    it ('fits every corner for landscape/portrait perspective and orthographic views', () => {
        const camera = new Camera (new Coord3D (10, 8, 12), new Coord3D (0, 0, 0), new Coord3D (0, 1, 0), 45);
        const bounds = new THREE.Box3 (new THREE.Vector3 (-10, -2, -3), new THREE.Vector3 (10, 2, 3));
        for (const aspect of [0.45, 1, 2]) { for (const perspective of [true, false]) {
            const fit = FitVisibleCamera (camera, bounds, aspect, perspective);
            const distance = new THREE.Vector3 (fit.eye.x, fit.eye.y, fit.eye.z).distanceTo (new THREE.Vector3 (fit.center.x, fit.center.y, fit.center.z));
            const c = perspective ? new THREE.PerspectiveCamera (45, aspect, 0.001, 10000) : new THREE.OrthographicCamera (-distance * Math.tan (Math.PI / 8) * aspect, distance * Math.tan (Math.PI / 8) * aspect, distance * Math.tan (Math.PI / 8), -distance * Math.tan (Math.PI / 8), 0.001, 10000);
            c.position.set (fit.eye.x, fit.eye.y, fit.eye.z); c.up.set (fit.up.x, fit.up.y, fit.up.z); c.lookAt (fit.center.x, fit.center.y, fit.center.z); c.updateMatrixWorld (true);
            for (const x of [-10, 10]) { for (const y of [-2, 2]) { for (const z of [-3, 3]) { const p = new THREE.Vector3 (x, y, z).project (c); assert.ok (Math.abs (p.x) <= 1 && Math.abs (p.y) <= 1); } } }
        } }
        assert.equal (FitVisibleCamera (camera, bounds, 0), null);
    });
});
