import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollectEngineeringFitPoints, FitEngineeringCamera, CreateEngineeringCamera } from '../source/website/engineeringcamera.js';
import { CreateEngineeringPack, PoseEngineeringPack } from '../source/website/engineeringpack.js';
import { CreatePresentationPulpSide } from '../source/website/engineeringpulp.js';
import { EngineeringEntranceState, EngineeringHeading } from '../source/website/engineeringentrance.js';

const camera = aspect => { const value = new THREE.PerspectiveCamera (34, aspect, 0.1, 200); value.zoom = 1.2; return value; };
const clean = root => root.traverse (item => { item.geometry?.dispose (); item.material?.dispose (); });
const mesh = (parent, geometry, material, position = [0, 0, 0]) => { const item = new THREE.Mesh (geometry, material); item.position.fromArray (position); parent.add (item); return item; };
const block = (parent, size, material, position) => mesh (parent, new THREE.BoxGeometry (...size), material, position);

describe ('Engineering presentation camera and card entrance', function () {
    it ('excludes hidden and transparent geometry from diagnostic bounds', function () {
        const root = new THREE.Group (), view = camera (2.7), target = new THREE.Vector3 ();
        block (root, [2, 2, 2], new THREE.MeshBasicMaterial (), [0, 0, 0]);
        const initial = CollectEngineeringFitPoints (root);
        const future = block (root, [30, 20, 30], new THREE.MeshBasicMaterial (), [10, 0, 0]); future.visible = false;
        assert.deepEqual (CollectEngineeringFitPoints (root), initial);
        future.visible = true; future.material.opacity = 0; assert.deepEqual (CollectEngineeringFitPoints (root), initial);
        future.material.opacity = 1;
        assert.ok (FitEngineeringCamera (view, CollectEngineeringFitPoints (root), target).distance > FitEngineeringCamera (view, initial, target).distance * 5); clean (root);
    });
    it ('measures the current drawn lines and sheet morph', function () {
        const root = new THREE.Group ();
        const lines = new THREE.BufferGeometry (); lines.setAttribute ('position', new THREE.Float32BufferAttribute ([-1, 0, 0, 1, 0, 0, 50, 30, 0, 90, 70, 0], 3)); lines.setDrawRange (0, 2);
        root.add (new THREE.LineSegments (lines, new THREE.LineBasicMaterial ()));
        assert.equal (CollectEngineeringFitPoints (root).length, 6); lines.setDrawRange (0, 4); assert.equal (CollectEngineeringFitPoints (root).length, 12); clean (root);
        const pulp = new THREE.Mesh (CreatePresentationPulpSide (1), new THREE.MeshBasicMaterial ());
        const formed = CollectEngineeringFitPoints (pulp); pulp.morphTargetInfluences[0] = 1;
        assert.notDeepEqual (CollectEngineeringFitPoints (pulp), formed); clean (pulp);
    });
    it ('frames the motor at full, half and 35% size on portrait and wide viewports', function () {
        const motor = new THREE.Group (), material = new THREE.MeshBasicMaterial ();
        block (motor, [2.2, 1.65, 1.65], material, [0, 0.28, 0]); block (motor, [0.46, 0.46, 0.8], material, [0, 0.28, 1.62]);
        const points = CollectEngineeringFitPoints (motor), view = camera (2.7), framing = CreateEngineeringCamera (view, points, new THREE.Vector3 (0, 0.15, 0.25));
        for (const aspect of [2.7, 0.7, 1.3, 2.7]) {
            view.aspect = aspect; framing.resize ();
            for (const [time, scale] of [[3.5, 1], [7.1, 0.5], [16.4, 0.35]]) {
                framing.update (time); const state = framing.inspect ();
                assert.equal (state.mode, 'staged-pullback'); assert.equal (state.viewScale, scale);
                const screen = new THREE.Box3 ();
                for (let i = 0; i < points.length; i += 3) { screen.expandByPoint (new THREE.Vector3 (points[i], points[i + 1], points[i + 2]).project (view)); }
                const center = screen.getCenter (new THREE.Vector3 ()), size = screen.getSize (new THREE.Vector3 ());
                assert.ok (Math.abs (center.x) < 0.002 && Math.abs (center.y) < 0.002);
                assert.ok (Math.abs (Math.max (size.x, size.y) - 1.88 * scale) < 0.002, 'actual projected size matches the requested shot');
                const before = view.matrixWorld.elements.slice ();
                framing.inspect (points.map (value => value * 5));
                assert.deepEqual (view.matrixWorld.elements, before, 'larger surroundings cannot change the staged camera');
                framing.resize (); assert.equal (framing.inspect ().distance, state.distance, 'resize preserves the active shot');
            }
        }
        for (const [start, end] of [[3.8, 5.2], [7.2, 8.6]]) {
            framing.update (start); let previous = framing.inspect ().distance;
            for (let t = start; t <= end; t += 1 / 60) {
                framing.update (t); const current = framing.inspect ().distance;
                assert.ok (current >= previous && current - previous < 0.2, 'pullback is continuous and monotonic'); previous = current;
            }
            framing.update (end); const held = view.matrixWorld.elements.slice ();
            framing.update (end); assert.deepEqual (view.matrixWorld.elements, held, 'pausing the timeline freezes the camera');
            framing.update (start); const first = framing.inspect ().distance; framing.update (start + 0.001);
            assert.ok (framing.inspect ().distance - first < 0.0001, 'ease into each pullback without a velocity jump');
        }
        clean (motor);
    });
    it ('pushes inward through the fold and fills the frame with the centered closed carton', function () {
        const root = new THREE.Group (), material = new THREE.MeshBasicMaterial ();
        const motor = block (root, [2.2, 1.65, 1.65], material, [0, 0.28, 0]);
        const motorPoints = CollectEngineeringFitPoints (motor);
        const pulp = [-1, 1].map (side => mesh (root, CreatePresentationPulpSide (side), material));
        const pack = CreateEngineeringPack ({ block, mesh, surface : material, edge : material }); root.add (pack.group);
        PoseEngineeringPack (pack, 16.4); const closedPoints = CollectEngineeringFitPoints (pack.group);
        for (const aspect of [0.7, 1.3, 2.7]) {
            const view = camera (aspect), framing = CreateEngineeringCamera (view, motorPoints, new THREE.Vector3 (0, 0.15, 0.25));
            framing.update (8.6, closedPoints); const wide = framing.inspect (); let previous = wide.distance;
            for (let t = 8.6; t <= 16.4; t += 0.1) {
                for (const item of pulp) { item.morphTargetInfluences[0] = 1 - THREE.MathUtils.clamp ((t - 4.4) / 2.5, 0, 1); }
                pack.group.visible = t > 7.2; PoseEngineeringPack (pack, t);
                framing.update (t, closedPoints); const matrix = view.matrixWorld.elements.slice (), projection = view.projectionMatrix.elements.slice ();
                const frame = framing.inspect (CollectEngineeringFitPoints (root));
                assert.ok (frame.distance <= previous + 1e-8 && previous - frame.distance < 0.4, 'zoom inward smoothly while panels fold'); previous = frame.distance;
                assert.deepEqual (view.matrixWorld.elements, matrix); assert.deepEqual (view.projectionMatrix.elements, projection);
            }
            framing.update (16.4, closedPoints); const boxed = framing.inspect (closedPoints), screen = new THREE.Box3 ();
            assert.equal (boxed.mode, 'fold-fit'); assert.equal (boxed.foldProgress, 1); assert.ok (boxed.distance < wide.distance * 0.85);
            for (let i = 0; i < closedPoints.length; i += 3) { screen.expandByPoint (new THREE.Vector3 (closedPoints[i], closedPoints[i + 1], closedPoints[i + 2]).project (view)); }
            const center = screen.getCenter (new THREE.Vector3 ()), size = screen.getSize (new THREE.Vector3 ());
            assert.ok (Math.abs (center.x) < 0.002 && Math.abs (center.y) < 0.002);
            assert.ok (Math.abs (Math.max (size.x, size.y) - 1.92) < 0.002, 'closed carton fills 96% of the limiting viewport dimension');
            const paused = view.matrixWorld.elements.slice (); framing.update (16.4, closedPoints); assert.deepEqual (view.matrixWorld.elements, paused);
            framing.resize (); assert.equal (framing.inspect ().distance, boxed.distance, 'resize preserves the closed-box fit');
            framing.update (0); assert.equal (framing.inspect ().viewScale, 1); assert.equal (framing.inspect ().foldProgress, 0);
            framing.update (16.4, closedPoints); assert.equal (framing.inspect ().distance, boxed.distance, 'direct stage jumps reproduce the finished view');
        }
        clean (root);
    });
    it ('flashes the frame before quick heading typing and parallel sign-in arrival', function () {
        const start = EngineeringEntranceState (0); assert.equal (start.text, ''); assert.equal (start.frame, 0); assert.equal (start.login, 0);
        const typing = EngineeringEntranceState (0.7); assert.ok (typing.text.length > 0 && typing.text.length < EngineeringHeading.length); assert.ok (typing.login > 0 && typing.login < 1); assert.equal (typing.visual, 1);
        const landed = EngineeringEntranceState (1); assert.equal (landed.login, 1); assert.ok (landed.loginFlash > 0.9);
        const end = EngineeringEntranceState (1.4); assert.equal (end.complete, true); assert.equal (end.text, EngineeringHeading); assert.equal (end.flash, 0); assert.equal (end.loginFlash, 0);
    });
});
