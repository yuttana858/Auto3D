import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CreateAutoPackPlan, CreateAutoPackRig, AutoPackFoldPose, AutoPackFrame, InspectAutoPackFold, AutoPackFoldContacts, DisplayClearance, FefcoFoldPose, AutoPackStyles, FefcoStyles, CreateFefcoFoldRig } from '../src/index.js';

const near = (a, b) => assert.ok (Math.abs (a - b) < 1e-8, `${a} != ${b}`);
const bounds = (rig, pose, kind, index) => {
    const i = rig.panels.findIndex (p => p.kind === kind && p.index === index);
    return new THREE.Box3 ().setFromPoints (rig.panels[i].solid.vertices.map (p => new THREE.Vector3 (...p).applyMatrix4 (new THREE.Matrix4 ().fromArray (pose.matrices[i]))));
};
describe ('Auto Pack presentation matches generated RSC boxes', function () {
    // DisplayClearance samples the fold route and the Open top route (242 display poses) per carton.
    this.timeout (60000);
    const material = { caliperMm : 3, insideFactors : [1, 1, 2], calibrated : false };
    it ('uses the standard trimmed panels and crease bends on engineering cartons', () => {
        const rig = CreateAutoPackRig ({ size : [50, 80, 30], clearanceMm : .0254, material });
        assert.equal (rig.autoPackPresentation, 'standard'); assert.notEqual (rig.presentationMeshes, rig.meshes); assert.ok (rig.visualMeshes.length > 0);
        for (const progress of [.5, 1]) {
            const frame = AutoPackFrame (rig, progress);
            // Same crease bends as the standard fold route at the closed pose: one per score the panels share.
            assert.equal (frame.visualMeshes.length, FefcoFoldPose (rig, 1).visualMeshes.length);
        }
        assert.equal (DisplayClearance (rig).clear, true);
    });
    it ('turns panel bow off in the saved appearance when bow would bulge into a tight product', () => {
        const rig = CreateAutoPackRig ({ size : [300, 150, 200], clearanceMm : .0254, material });
        assert.equal (rig.autoPackPresentation, 'standard without panel bow'); assert.equal (rig.profile.appearance.panelBow, 0); assert.ok (rig.visualMeshes.length > 0);
        // Rebuilding from the saved profile (replay) gives the same presentation directly.
        assert.equal (CreateAutoPackRig ({ size : [300, 150, 200], clearanceMm : .0254, material }, rig.profile).autoPackPresentation, 'standard');
    });
    it ('keeps exact panels for cartons fitted before the engineering basis', () => {
        const rig = CreateAutoPackRig ({ size : [50, 80, 30], thickness : 3, clearanceMm : .0254 });
        assert.equal (rig.autoPackPresentation, 'exact panels'); assert.equal (rig.presentationMeshes, rig.meshes); assert.deepEqual (AutoPackFrame (rig, 1).visualMeshes, []);
    });
});

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
    it ('presents the Packaging generator carton (board appearance and rounded crease joins) while auditing exact panels', () => {
        const rig = CreateAutoPackRig ({ size : [80, 150, 100], clearanceMm : .0254, material : { caliperMm : 3, insideFactors : [1, 1, 2], calibrated : false } }), generator = CreateFefcoFoldRig (rig.parameters, rig.profile);
        assert.notEqual (rig.autoPackPresentation, 'exact panels');
        // Cheap structural fingerprint (vertex count and coordinate sum) instead of deep-comparing large arrays.
        const print = meshes => meshes.map (m => m.vertices.length + ':' + m.vertices.flat ().reduce ((s, v) => s + v, 0).toFixed (6)).join ('|');
        assert.equal (print (rig.presentationMeshes), print (generator.presentationMeshes), 'same presentation meshes as Generate');
        assert.notEqual (print (rig.presentationMeshes), print (rig.meshes), 'not the raw audited prisms');
        for (const p of [0, .1, .3, .5, .7, .9, 1]) {
            const frame = AutoPackFrame (rig, p); assert.ok (frame.visualMeshes.length > 0, 'crease joins at ' + p);
            assert.ok (frame.meshes.every (m => m.vertices.flat ().every (Number.isFinite)) && frame.visualMeshes.every (m => m.vertices.flat ().every (Number.isFinite)));
        }
        const pose = AutoPackFoldPose (rig, 1); pose.matrices = pose.matrices.map (m => new THREE.Matrix4 ().makeTranslation (0, 1, 0).multiply (new THREE.Matrix4 ().fromArray (m)).toArray ());
        assert.equal (AutoPackFoldContacts (rig, pose).clear, false);
    });
    it ('fits every Packaging generator style around the product with a clear product audit', async function () {
        this.timeout (120000);
        assert.deepEqual (AutoPackStyles ().map (s => s.code), FefcoStyles.map (s => s.code));
        for (const { code } of AutoPackStyles ()) {
            const plan = CreateAutoPackPlan ({ size : [140, 90, 100], thickness : 3, code }), rig = CreateAutoPackRig ({ size : [140, 90, 100], clearanceMm : .0254, material : { caliperMm : 3, insideFactors : [1, 1, 2], calibrated : false }, code });
            assert.notEqual (rig.autoPackPresentation, 'exact panels', code + ' uses the generator presentation'); assert.equal (rig.autoPackDisplayCheck.clear, true);
            assert.equal (plan.parameters.code, code); assert.equal (rig.parameters.code, code);
            assert.equal (plan.flapStack.top, code === '0200' ? 0 : plan.flapStack.base);
            const report = await InspectAutoPackFold (rig); assert.equal (report.clear, true, code + ' ' + JSON.stringify (report).slice (0, 300)); assert.equal (report.code, code);
            const frame = AutoPackFrame (rig, 1); assert.equal (frame.parameters.code, code); assert.ok (frame.visualMeshes.length > 0);
        }
        assert.throws (() => CreateAutoPackPlan ({ size : [140, 90, 100], thickness : 3, code : '0999' }), /catalog/);
        const rsc = CreateAutoPackPlan ({ size : [140, 90, 100], thickness : 3 }), hsc = CreateAutoPackPlan ({ size : [140, 90, 100], thickness : 3, code : '0200' });
        assert.ok (Math.abs (rsc.parameters.height - hsc.parameters.height - 2 * 3) < 1e-9, 'an HSC reserves no top flap stack');
    });
    it ('opens the top flaps 120 degrees on a clear route, and folds and unfolds an open-top carton', async function () {
        this.timeout (240000);
        const normal = (matrix) => new THREE.Vector3 (0, 0, 1).applyMatrix3 (new THREE.Matrix3 ().setFromMatrix4 (new THREE.Matrix4 ().fromArray (matrix))).normalize ();
        for (const code of ['0201', '0202', '0203']) {
            const rig = CreateAutoPackRig ({ size : [140, 90, 100], thickness : 3, code }), tops = rig.panels.map ((p, i) => [p, i]).filter (([p]) => p.kind === 'top');
            assert.equal (tops.length, 4);
            const top = await InspectAutoPackFold (rig, null, 'top'); assert.equal (top.clear, true, code + ' top route ' + JSON.stringify (top).slice (0, 300));
            const closed = AutoPackFoldPose (rig, 1, 0), open = AutoPackFoldPose (rig, 1, 1); assert.equal (open.stage, 'open top'); assert.equal (closed.stage, 'packed');
            const walls = new THREE.Box3 (); rig.panels.forEach ((p, i) => { if (p.kind === 'wall') { walls.union (bounds (rig, closed, 'wall', p.index)); } });
            for (const [panel, i] of tops) {
                near (normal (closed.matrices[i]).angleTo (normal (open.matrices[i])) * 180 / Math.PI, 120);
                const flap = bounds (rig, open, 'top', panel.index);
                assert.ok (flap.max.y > walls.max.y + 10, code + ' ' + panel.name + ' stands above the walls');
                assert.ok (flap.min.x < walls.min.x - 1 || flap.max.x > walls.max.x + 1 || flap.min.z < walls.min.z - 1 || flap.max.z > walls.max.z + 1, code + ' ' + panel.name + ' leans outward');
            }
            const frame = AutoPackFrame (rig, 1, 1); assert.equal (frame.parameters.closure, 'open'); assert.equal (AutoPackFrame (rig, 1, 0).parameters.closure, 'closed');
            // A saved open-top carton unfolds and folds along the open route: clear, open at 1 and flat at 0.
            rig.autoPackOpenTop = true;
            const route = await InspectAutoPackFold (rig); assert.equal (route.clear, true, code + ' open route ' + JSON.stringify (route).slice (0, 300));
            assert.deepEqual (AutoPackFoldPose (rig, 1).matrices, open.matrices);
            rig.autoPackOpenTop = false; const flat = AutoPackFoldPose (rig, 0).matrices; rig.autoPackOpenTop = true; assert.deepEqual (AutoPackFoldPose (rig, 0).matrices, flat);
        }
        const hsc = CreateAutoPackRig ({ size : [140, 90, 100], thickness : 3, code : '0200' }); assert.equal (AutoPackFoldPose (hsc, 1, 1).stage, 'packed');
        assert.throws (() => AutoPackFoldPose (hsc, 1, 2), /Open top/);
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
