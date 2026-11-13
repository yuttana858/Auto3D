import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CreateEngineeringPack, PoseEngineeringPack } from '../source/website/engineeringpack.js';
import { CreateEngineeringPrintGeometry } from '../source/website/engineeringartwork.js';
import { EngineeringFinishState as finish } from '../source/website/engineeringfinish.js';
import { EngineeringReviewStart, EngineeringSequenceState as sequence } from '../source/website/engineeringsequence.js';

describe ('Engineering print and material study', function () {
    it ('prints kraft, wipes in white, turns right, then reveals materials on the shared clock', function () {
        assert.equal (finish (-1).ink, 0); assert.equal (finish (-1).callouts, 0);
        assert.equal (finish (1.5).ink, 1); assert.equal (finish (1.5).white, 0);
        const wipe = finish (3); assert.ok (wipe.white > 0 && wipe.white < 1); assert.equal (wipe.turn, 0);
        assert.equal (finish (4.3).white, 1); assert.equal (finish (4.3).turn, 0);
        const turning = finish (5.5); assert.ok (turning.turn > 0 && turning.turn < 1); assert.equal (turning.callouts, 0);
        const end = finish (9); assert.equal (end.turn, 1); assert.equal (end.callouts, 1); assert.equal (end.cutaway, 1); assert.equal (end.promptOpacity, 0);
        for (const t of [0, 1.5, 3, 5.5, 9]) { assert.deepEqual (sequence (EngineeringReviewStart + t).finish, finish (t)); }
        assert.deepEqual (sequence (0).finish, finish (-EngineeringReviewStart));
    });
    it ('maps print to six exterior faces without filling hand holes or duplicating interior faces', function () {
        const material = new THREE.MeshBasicMaterial ({ side : THREE.DoubleSide });
        const mesh = (parent, geometry, surface, position) => { const item = new THREE.Mesh (geometry, surface); item.position.fromArray (position); parent.add (item); return item; };
        const block = (parent, size, surface, position) => mesh (parent, new THREE.BoxGeometry (...size), surface, position);
        const pack = CreateEngineeringPack ({ block, mesh, surface : material, edge : material });
        PoseEngineeringPack (pack, 16.4); pack.group.rotation.y = 0.2; pack.group.updateMatrixWorld (true);
        const inverse = pack.group.matrixWorld.clone ().invert (), printed = [];
        assert.equal (pack.printPanels.length, 6);
        for (const panel of pack.printPanels) {
            const geometry = CreateEngineeringPrintGeometry (panel, inverse), uv = geometry.getAttribute ('uv');
            assert.ok (uv.count > 0); assert.ok ([...uv.array].every (v => v >= -0.02 && v <= 1.02));
            const layer = new THREE.Mesh (geometry, material); panel.mesh.add (layer); printed.push (layer);
            const normals = geometry.getAttribute ('normal');
            for (let i = 0; i < normals.count; i++) { assert.equal (normals.getY (i), -1); }
        }
        pack.group.updateMatrixWorld (true);
        for (const hand of pack.handHoles) {
            const center = hand.group.localToWorld (hand.center.clone ());
            const outward = new THREE.Vector3 (hand.side, 0, 0).transformDirection (pack.group.matrixWorld);
            const ray = new THREE.Raycaster (center.clone ().addScaledVector (outward, 5), outward.clone ().negate ());
            assert.equal (ray.intersectObjects (printed).length, 0, 'artwork must not bridge the hand hole');
            ray.ray.origin.y += 0.35;
            assert.ok (ray.intersectObjects (printed).length > 0, 'print covers the exterior board beside the opening');
        }
        pack.group.traverse (item => item.geometry?.dispose ()); material.dispose ();
    });
});
