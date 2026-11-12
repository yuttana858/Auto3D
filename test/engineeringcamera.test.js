import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollectEngineeringFitPoints, FitEngineeringCamera, CreateEngineeringCamera } from '../source/website/engineeringcamera.js';
import { CreateEngineeringPack, PoseEngineeringPack } from '../source/website/engineeringpack.js';
import { CreatePresentationPulpSide } from '../source/website/engineeringpulp.js';
import { EngineeringEntranceState, EngineeringHeading } from '../source/website/engineeringentrance.js';

const camera = aspect => { const value = new THREE.PerspectiveCamera (34, aspect, 0.1, 200); value.zoom = 1.2; return value; };
const clean = root => root.traverse (item => { item.geometry?.dispose (); item.material?.dispose (); });
const fit = (root, view, target = new THREE.Vector3 ()) => {
    const result = FitEngineeringCamera (view, CollectEngineeringFitPoints (root), target);
    assert.ok (result.extent.every (value => value <= result.fill + 1e-6));
    const focus = target.clone ().project (view); assert.ok (Math.abs (focus.x) < 1e-8 && Math.abs (focus.y) < 1e-8, 'keep the product on the center line');
    return result;
};

describe ('Engineering presentation camera and card entrance', function () {
    it ('ignores future hidden and transparent geometry, then fits it when it appears', function () {
        const root = new THREE.Group (), view = camera (2.7);
        const model = new THREE.Mesh (new THREE.BoxGeometry (2, 2, 2), new THREE.MeshBasicMaterial ()); root.add (model);
        const initial = fit (root, view).distance;
        const future = new THREE.Mesh (new THREE.BoxGeometry (30, 20, 30), new THREE.MeshBasicMaterial ()); future.position.x = 10; future.visible = false; root.add (future);
        assert.equal (fit (root, view).distance, initial);
        future.visible = true; future.material.opacity = 0; assert.equal (fit (root, view).distance, initial);
        future.material.opacity = 1; assert.ok (fit (root, view).distance > initial * 5); clean (root);
    });
    it ('uses the drawn line range and current morph, not their eventual bounds', function () {
        const root = new THREE.Group (), view = camera (1.3);
        const lines = new THREE.BufferGeometry (); lines.setAttribute ('position', new THREE.Float32BufferAttribute ([-1, 0, 0, 1, 0, 0, 50, 30, 0, 90, 70, 0], 3)); lines.setDrawRange (0, 2);
        root.add (new THREE.LineSegments (lines, new THREE.LineBasicMaterial ()));
        const partial = fit (root, view).distance; lines.setDrawRange (0, 4); assert.ok (fit (root, view).distance > partial * 10); clean (root);
        const pulp = new THREE.Mesh (CreatePresentationPulpSide (1), new THREE.MeshBasicMaterial ());
        const formed = fit (pulp, view).distance; pulp.morphTargetInfluences[0] = 1;
        const unfolded = fit (pulp, view).distance; assert.ok (Math.abs (unfolded - formed) > 0.5, 'fit the actual forming sheet'); clean (pulp);
    });
    it ('keeps the product centered and all current folding geometry inside portrait and wide windows', function () {
        const material = new THREE.MeshBasicMaterial ();
        const mesh = (parent, geometry, surface, position) => { const item = new THREE.Mesh (geometry, surface); item.position.fromArray (position); parent.add (item); return item; };
        const block = (parent, size, surface, position) => mesh (parent, new THREE.BoxGeometry (...size), surface, position);
        const pack = CreateEngineeringPack ({ block, mesh, surface : material, edge : material });
        for (const aspect of [0.7, 1.3, 2.7]) {
            const view = camera (aspect), distances = [];
            for (let t = 7.2; t <= 16.5; t += 0.2) { PoseEngineeringPack (pack, t); distances.push (fit (pack.group, view, new THREE.Vector3 (0, 0.15, 0.25)).distance); }
            assert.ok (Math.max (...distances) > Math.min (...distances) * 1.6, 'zoom must follow the current folds');
        }
        clean (pack.group);
    });
    it ('flashes the frame before quick heading typing and parallel sign-in arrival', function () {
        const start = EngineeringEntranceState (0); assert.equal (start.text, ''); assert.equal (start.frame, 0); assert.equal (start.login, 0);
        const typing = EngineeringEntranceState (0.7); assert.ok (typing.text.length > 0 && typing.text.length < EngineeringHeading.length); assert.ok (typing.login > 0 && typing.login < 1); assert.equal (typing.visual, 1);
        const landed = EngineeringEntranceState (1); assert.equal (landed.login, 1); assert.ok (landed.loginFlash > 0.9);
        const end = EngineeringEntranceState (1.4); assert.equal (end.complete, true); assert.equal (end.text, EngineeringHeading); assert.equal (end.flash, 0); assert.equal (end.loginFlash, 0);
    });
    it ('frames the actual formed surfaces more closely and centers their visible silhouette', function () {
        const root = new THREE.Group (), view = camera (2.7), anchor = new THREE.Vector3 (0, 0.15, 0.25);
        for (const side of [-1, 1]) { root.add (new THREE.Mesh (CreatePresentationPulpSide (side), new THREE.MeshBasicMaterial ())); }
        root.add (new THREE.Mesh (new THREE.BoxGeometry (2.2, 1.65, 1.65), new THREE.MeshBasicMaterial ()));
        const oldCorners = []; root.updateMatrixWorld (true);
        root.traverse (item => {
            if (!item.isMesh) { return; }
            const box = new THREE.Box3 ().setFromBufferAttribute (item.geometry.getAttribute ('position'));
            for (const x of [box.min.x, box.max.x]) { for (const y of [box.min.y, box.max.y]) { for (const z of [box.min.z, box.max.z]) { oldCorners.push (x, y, z); } } }
        });
        const previous = FitEngineeringCamera (view, oldCorners, anchor, 0.88);
        const points = CollectEngineeringFitPoints (root), current = CreateEngineeringCamera (view).update (points, anchor);
        assert.ok (current.distance < previous.distance * 0.9, 'remove empty bounding-box space to bring the pack closer');
        const screen = new THREE.Box3 ();
        for (let i = 0; i < points.length; i += 3) { screen.expandByPoint (new THREE.Vector3 (points[i], points[i + 1], points[i + 2]).project (view)); }
        const center = screen.getCenter (new THREE.Vector3 ());
        assert.ok (Math.abs (center.x) < 0.002 && Math.abs (center.y) < 0.002, 'visible assembly belongs in the middle of the window');
        assert.ok (Math.abs (screen.max.y - screen.min.y - 1.88) < 0.01, 'use 94% of the available height');
        clean (root);
    });
    it ('eases inward without overshoot, freezes on pause, and converges equally at different frame rates', function () {
        const root = new THREE.Mesh (new THREE.BoxGeometry (2, 2, 2), new THREE.MeshBasicMaterial ()), anchor = new THREE.Vector3 ();
        const initial = CollectEngineeringFitPoints (root); root.scale.setScalar (3); const expanded = CollectEngineeringFitPoints (root);
        const results = [];
        for (const fps of [30, 60, 120]) {
            const motion = CreateEngineeringCamera (camera (2.7));
            const start = motion.update (expanded, anchor);
            assert.deepEqual (motion.update (initial, anchor, 0).target, start.target, 'a paused camera does not re-aim');
            assert.equal (motion.update (initial, anchor, 0).distance, start.distance, 'a paused camera does not drift');
            let previous = start.distance, frame;
            for (let i = 0; i < fps; i++) {
                frame = motion.update (initial, anchor, 1 / fps);
                assert.ok (frame.distance <= previous && frame.distance >= frame.desiredDistance - 1e-8);
                if (i === 0) { assert.ok (frame.distance > frame.desiredDistance * 2, 'closing geometry does not snap the zoom'); }
                previous = frame.distance;
            }
            results.push (frame.distance);
            assert.ok (Math.abs (frame.distance - frame.desiredDistance) < 0.003);
            motion.reset (); assert.equal (motion.update (expanded, anchor).distance, start.distance);
        }
        assert.ok (Math.max (...results) - Math.min (...results) < 1e-8); clean (root);
    });
    it ('keeps a growing and folding assembly centered and in frame throughout continuous zoom', function () {
        const material = new THREE.MeshBasicMaterial ();
        const mesh = (parent, geometry, surface, position) => { const item = new THREE.Mesh (geometry, surface); item.position.fromArray (position); parent.add (item); return item; };
        const block = (parent, size, surface, position) => mesh (parent, new THREE.BoxGeometry (...size), surface, position);
        const pack = CreateEngineeringPack ({ block, mesh, surface : material, edge : material });
        for (const aspect of [0.7, 1.3, 2.7]) {
            const motion = CreateEngineeringCamera (camera (aspect)), anchor = new THREE.Vector3 (0, 0.15, 0.25); let previous;
            for (let i = 0; i <= 600; i++) {
                const time = 7.2 + i / 60, reveal = Math.min (1, i / 66), scale = 0.2 + 0.8 * reveal * reveal * (3 - 2 * reveal);
                pack.group.scale.set (scale, 1, scale); PoseEngineeringPack (pack, time);
                const frame = motion.update (CollectEngineeringFitPoints (pack.group), anchor, 1 / 60);
                assert.ok (frame.extent.every (value => value <= 0.941), 'zoom lag must not crop a growing blank or folding flap');
                assert.ok (frame.screenCenter.every (value => Math.abs (value) < 0.002), 'the actual silhouette stays in the middle throughout zoom');
                if (previous) { assert.ok (Math.abs (frame.distance - previous) / previous < 0.06, 'continuous geometry must produce continuous zoom'); }
                previous = frame.distance;
            }
        }
        clean (pack.group);
    });
});
