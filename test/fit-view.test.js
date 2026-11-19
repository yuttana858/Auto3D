import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VisibleSceneBounds, FitVisibleCamera } from '../source/engine/viewer/fitview.js';
import { Camera, ProjectionMode } from '../source/engine/viewer/camera.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { Viewer } from '../source/engine/viewer/viewer.js';
import { Navigation } from '../source/engine/viewer/navigation.js';
import { SessionEditor } from '../source/website/sessioneditor.js';
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
    it ('focuses visible products using the current full, split or mobile viewport and preserves the viewing direction', () => {
        const root = new THREE.Group (); root.position.set (100, 120, -60);
        root.add (new THREE.Mesh (new THREE.BoxGeometry (180, 240, 65)));
        const hidden = new THREE.Mesh (new THREE.BoxGeometry (10000, 10000, 10000)); hidden.visible = false; root.add (hidden);
        const selected = { id : 'product', visible : true, threeObject : root };
        const initial = new Camera (new Coord3D (380, 200, 500), new Coord3D (40, 70, -30), new Coord3D (0, 1, 0), 45);
        const back = new THREE.Vector3 ().subVectors (initial.eye, initial.center).normalize ();
        for (const projectionMode of [ProjectionMode.Perspective, ProjectionMode.Orthographic]) {
            const distances = [];
            for (const [width, height] of [[1200, 800], [540, 800], [390, 300]]) {
                const navigation = Object.assign (Object.create (Navigation.prototype), { camera : initial.Clone (), Update () {} });
                let clippingSphere;
                const viewer = Object.assign (Object.create (Viewer.prototype), { navigation, canvas : { width, height }, projectionMode, settings : { animationSteps : 0 }, AdjustClippingPlanesToSphere : sphere => { clippingSphere = sphere; } });
                const editor = { selected, SelectedObjects : () => [selected], SelectedViewBounds : SessionEditor.prototype.SelectedViewBounds, website : { viewer } };
                assert.equal (SessionEditor.prototype.Focus.call (editor).focused, true);
                const fit = viewer.GetCamera (), bounds = VisibleSceneBounds (root);
                const distance = new THREE.Vector3 ().subVectors (fit.eye, fit.center).length (); distances.push (distance);
                assert.deepEqual ([fit.center.x, fit.center.y, fit.center.z], [100, 120, -60]);
                assert.ok (new THREE.Vector3 ().subVectors (fit.eye, fit.center).normalize ().distanceTo (back) < 1e-10);
                assert.ok (clippingSphere.radius < 160, 'hidden geometry must not set the fit or clipping scale');
                const extent = distance * Math.tan (Math.PI / 8), aspect = width / height;
                const camera = projectionMode === ProjectionMode.Perspective ? new THREE.PerspectiveCamera (45, aspect, 0.01, 10000) : new THREE.OrthographicCamera (-extent * aspect, extent * aspect, extent, -extent, 0.01, 10000);
                camera.position.copy (fit.eye); camera.up.copy (fit.up); camera.lookAt (fit.center.x, fit.center.y, fit.center.z); camera.updateMatrixWorld (true);
                for (const x of [bounds.min.x, bounds.max.x]) { for (const y of [bounds.min.y, bounds.max.y]) { for (const z of [bounds.min.z, bounds.max.z]) {
                    const point = new THREE.Vector3 (x, y, z).project (camera);
                    assert.ok (Math.abs (point.x) < 1 && Math.abs (point.y) < 1, 'product must remain inside the actual viewport');
                } } }
            }
            assert.ok (distances[1] > distances[0], 'the split viewport needs its own fit distance');
        }
    });
});
