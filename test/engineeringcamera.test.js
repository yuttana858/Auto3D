import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CollectEngineeringFitPoints, FitEngineeringCamera } from '../source/website/engineeringcamera.js';
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
});
