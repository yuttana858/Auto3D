import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CreateAutoPackPlan, CreateAutoPackRig, AutoPackFoldPose, AutoPackFrame, InspectAutoPackFold, AutoPackFoldContacts } from '../src/index.js';

const near = (a, b) => assert.ok (Math.abs (a - b) < 1e-8, `${a} != ${b}`);
const bounds = (rig, pose, kind, index) => {
    const i = rig.panels.findIndex (p => p.kind === kind && p.index === index);
    return new THREE.Box3 ().setFromPoints (rig.panels[i].solid.vertices.map (p => new THREE.Vector3 (...p).applyMatrix4 (new THREE.Matrix4 ().fromArray (pose.matrices[i]))));
};
describe ('Auto Pack plan on the engineering system', () => {
    const material = { caliperMm : 3, insideFactors : [1, 1, 2], calibrated : false };
    it ('drives inside targets through the board allowance factors like Generate with the inside basis', () => {
        const plan = CreateAutoPackPlan ({ size : [50, 80, 30], clearanceMm : .0254, material });
        assert.equal (plan.basis, 'engineering-inside'); assert.equal (plan.parameters.thickness, 3);
        // RSC length is the longer horizontal side (X = 50 here) and reserves one caliper for the inside glue tab.
        near (plan.insideTargetsMm.length, 50 + .0508 + 3); near (plan.insideTargetsMm.width, 30 + .0508); near (plan.insideTargetsMm.height, 80 + .0508);
        near (plan.parameters.length, plan.insideTargetsMm.length + 3); near (plan.parameters.width, plan.insideTargetsMm.width + 3); near (plan.parameters.height, plan.insideTargetsMm.height + 6);
        assert.deepEqual (plan.allowanceMm, { length : 3, width : 3, height : 6 });
    });
    it ('keeps the original score fit for cartons saved without a board record', () => {
        const plan = CreateAutoPackPlan ({ size : [50, 80, 30], thickness : 3, clearanceMm : .0254 });
        assert.equal (plan.basis, 'legacy-score'); near (plan.parameters.length, 50 + .0508 + 3); near (plan.parameters.height, 80 + .0508);
    });
    it ('refuses an uncalibrated board with no inside allowance, like the dimension tools', () => {
        assert.throws (() => CreateAutoPackPlan ({ size : [50, 80, 30], material : { caliperMm : 3, insideFactors : [0, 0, 0], calibrated : false } }), /allowance factor/);
        near (CreateAutoPackPlan ({ size : [50, 80, 30], material : { caliperMm : 3, insideFactors : [0, 0, 0], calibrated : true } }).parameters.height, 80 + .0508);
    });
    it ('clears the product through the whole anchored fold with engineering spans', async () => {
        const report = await InspectAutoPackFold (CreateAutoPackRig ({ size : [50, 80, 30], clearanceMm : .0254, material }));
        assert.equal (report.clear, true, JSON.stringify (report.intersections?.[0]));
    });
});

describe ('Auto Pack stationary-product RSC', () => {
    it ('fits axis-aligned OD with 0.001 inch per face and reserves the inside glue-tab intrusion', () => {
        for (const size of [[80, 150, 100], [100, 150, 80], [80, 80, 80]]) {
            const plan = CreateAutoPackPlan ({ size, thickness : 3 });
            assert.equal (plan.parameters.code, '0201'); near (plan.clearanceMm, .0254);
            for (const key of ['width', 'length', 'height']) { near (plan.usableInsideMm[key] - plan.productMm[key], .0508); }
            near (plan.parameters.length, Math.max (size[0], size[2]) + 3.0508);
            const rig = CreateAutoPackRig (plan), end = AutoPackFoldPose (rig, 1);
            const base = bounds (rig, end, 'base', 1), roof = bounds (rig, end, 'top', 1);
            near (base.max.y, -.0254); near (roof.min.y, size[1] + .0254);
            const wall = bounds (rig, end, 'wall', 0), tab = bounds (rig, end, 'joint', 0);
            if (plan.swapped) { near (wall.min.z, size[2] / 2 + .0254); near (tab.min.x, size[0] / 2 + .0254); }
            else { near (wall.max.x, -size[0] / 2 - .0254); near (tab.min.z, size[2] / 2 + .0254); }
        }
    });
    it ('keeps one inner base flap fixed beneath the product from a flat blank through closing and unfolding', () => {
        const rig = CreateAutoPackRig ({ size : [100, 150, 80], thickness : 3 }), anchor = bounds (rig, AutoPackFoldPose (rig, 0), 'base', 1);
        const flat = AutoPackFrame (rig, 0); near (Math.max (...flat.meshes.flatMap (m => m.vertices.map (p => p[1]))), -.0254);
        near (Math.min (...flat.meshes.flatMap (m => m.vertices.map (p => p[1]))), -3.0254);
        for (let i = 97; i >= 0; i--) {
            const pose = AutoPackFoldPose (rig, i / 97), box = bounds (rig, pose, 'base', 1);
            box.min.toArray ().forEach ((v, a) => near (v, anchor.min.toArray ()[a])); box.max.toArray ().forEach ((v, a) => near (v, anchor.max.toArray ()[a]));
            assert.equal (pose.contacts.clear, true);
        }
    });
    it ('audits the complete product and finite-board route at small, fractional, high-caliper and long dimensions', async function () {
        this.timeout (60000);
        for (const [size, thickness] of [[[20, 20, 20], .5], [[100.125, 200.75, 80.25], 3], [[120, 120, 120], 15], [[9000, 120, 140], 15]]) {
            const report = await InspectAutoPackFold (CreateAutoPackRig ({ size, thickness })); assert.equal (report.clear, true, JSON.stringify ({ size, report })); assert.equal (report.samples, 3601);
        }
    });
    it ('renders the same audited panel vertices without cosmetic bow intruding into the small clearance', () => {
        const rig = CreateAutoPackRig ({ size : [80, 150, 100], thickness : 3 });
        for (const p of [0, .1, .3, .5, .7, .9, 1]) {
            const frame = AutoPackFrame (rig, p); assert.deepEqual (frame.visualMeshes, []);
            frame.meshes.forEach ((mesh, i) => assert.deepEqual (frame.presentationMeshes[i].vertices, mesh.vertices));
            assert.ok (frame.meshes.every (m => m.vertices.flat ().every (Number.isFinite)));
        }
        const pose = AutoPackFoldPose (rig, 1); pose.matrices = pose.matrices.map (m => new THREE.Matrix4 ().makeTranslation (0, 1, 0).multiply (new THREE.Matrix4 ().fromArray (m)).toArray ());
        assert.equal (AutoPackFoldContacts (rig, pose).clear, false);
    });
    it ('rejects invalid sizes, unsupported tiny/high-caliper boxes and edited dielines before mutation', () => {
        for (const size of [[], [1, 2], [10, 0, 20], [NaN, 20, 20], [20, Infinity, 20]]) { assert.throws (() => CreateAutoPackPlan ({ size })); }
        for (const input of [{ size : [10, 10, 10] }, { size : [20, 20, 20], thickness : 15 }, { size : [20, 20, 20], clearanceMm : 0 }, { size : [20, 20, 20], unexpected : true }]) { assert.throws (() => CreateAutoPackPlan (input)); }
        const rig = CreateAutoPackRig ({ size : [80, 150, 100], thickness : 3 });
        assert.throws (() => AutoPackFoldPose (rig, -1)); assert.throws (() => AutoPackFoldPose (rig, NaN));
        const profile = structuredClone (rig.profile); profile.paths[0].points[0][0] -= 1;
        assert.throws (() => CreateAutoPackRig (rig.autoPack, profile), /original generated dieline/);
    });
});
