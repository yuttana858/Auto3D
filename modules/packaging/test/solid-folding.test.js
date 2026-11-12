import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CreateFefcoFoldRig, CreateFefcoBox, FefcoFoldFrame, FefcoFoldPose, FefcoFoldContacts, InspectFefcoFold, PanelSolid, SolidIntersections, FefcoCatalog } from '../src/index.js';

const matrix = (x = 0, y = 0, z = 0) => new THREE.Matrix4 ().makeTranslation (x, y, z).toArray ();
const prism = (name, x0, x1, y0, y1, thickness, transform = matrix ()) => ({ name, solid : PanelSolid ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], thickness), matrix : transform });

describe ('Finite-caliper FEFCO surfaces', () => {
    it ('Distinguishes touching, intersecting and contained solids instead of only crossing triangles', () => {
        const board = prism ('board', 0, 100, 0, 100, 3);
        assert.equal (SolidIntersections ([board, prism ('touching', 0, 100, 0, 100, 3, matrix (0, 3))]).clear, true);
        const overlapping = SolidIntersections ([board, prism ('overlap', 0, 100, 0, 100, 3, matrix (0, 2.5))]); assert.equal (overlapping.clear, false); assert.ok (Math.abs (overlapping.intersections[0].penetration - 0.5) < 1e-9);
        assert.equal (SolidIntersections ([board, prism ('contained', 20, 80, 20, 80, 1, matrix (0, 1))]).clear, false);
        assert.equal (SolidIntersections ([board, prism ('separated', 0, 100, 0, 100, 3, matrix (0, 3.001))]).clear, true);
        assert.throws (() => SolidIntersections ([board], 1), /tolerance/);
    });
    it ('Rejects rotated solids that cross even with separate centers and detects the trapezoidal glue tab', () => {
        const a = prism ('horizontal', -50, 50, -50, 50, 3);
        const b = prism ('vertical', -50, 50, -50, 50, 3, new THREE.Matrix4 ().makeRotationZ (Math.PI / 2).toArray ()); assert.equal (SolidIntersections ([a, b]).clear, false);
        const tab = { name : 'tab', solid : PanelSolid ([[-35, 6], [0, 0], [0, 250], [-35, 244]], 3), matrix : matrix () };
        assert.equal (SolidIntersections ([tab, prism ('inside tab', -15, -10, 100, 110, 1, matrix (0, 1))]).clear, false);
        assert.equal (SolidIntersections ([tab, prism ('outside bevel', -35, -34, 0, 1, 3)]).clear, true);
    });
    it ('Audits every available catalog style over the complete route, including caliper and overlap limits', async function () {
        this.timeout (60000); // CPU-bound full-route audit: about 9 s locally, over 15 s on shared hosted runners.
        const variants = [{}, { length : 120, width : 120, height : 120, thickness : 15, overlap : 119 }, { length : 10000, width : 10000, height : 20, thickness : 0.5, overlap : 9999 }, { length : 900.125, width : 300.375, height : 200.5, thickness : 0.625 }, { length : 601, width : 300, height : 200, thickness : 3 }, { length : 599, width : 300, height : 200, thickness : 3 }];
        for (const style of FefcoCatalog ().styles) {
            assert.equal (style.folding.cadMapped, true); assert.equal (style.folding.solidCaliper, true);
            for (const variant of variants) {
                const rig = CreateFefcoFoldRig ({ code : style.code, ...variant }); const report = await InspectFefcoFold (rig); assert.equal (report.clear, true, JSON.stringify ({ style, variant, report })); assert.equal (report.samples, 3601);
                // Additional reverse-route frames away from the audit sample grid.
                for (let i = 97; i >= 0; i--) { assert.equal (FefcoFoldPose (rig, i / 97).contacts.clear, true); }
            }
        }
    });
    it ('Keeps exact mesh coordinates within their collision prisms on fractional-mm, long blanks', () => {
        const rig = CreateFefcoFoldRig ({ length : 9999.123456, width : 7890.654321, height : 321.987654, thickness : 0.654321 });
        rig.meshes.forEach ((mesh, i) => { for (const p of mesh.vertices) { assert.ok (rig.panels[i].solid.vertices.some (q => p.every ((v, a) => v === q[a]))); } });
    });
    it ('Generates the exact CAD-rig endpoint for closed, open and HSC boxes without changing panel volume', () => {
        for (const code of ['0200', '0201', '0202', '0203']) { for (const closure of ['open', 'closed']) {
            const input = { code, closure }; const rig = CreateFefcoFoldRig (input); const endpoint = FefcoFoldFrame (rig, code === '0200' || closure === 'closed' ? 1 : 0.72); const box = CreateFefcoBox (input);
            assert.deepEqual (box.meshes, endpoint.meshes); assert.deepEqual (box.profile.paths, rig.profile.paths);
            if (code === '0200') { assert.equal (box.panels.some (p => p.kind === 'top'), false); }
        } }
    });
    it ('Reports the offending pair and blocks a pose if a panel solid is moved into another', async () => {
        const rig = CreateFefcoFoldRig ({}); const wall = rig.panels.find (p => p.kind === 'wall'); const base = rig.panels.find (p => p.kind === 'base'); base.solid = wall.solid;
        const pose = { matrices : rig.panels.map (() => matrix ()) }; const contacts = FefcoFoldContacts (rig, pose); assert.equal (contacts.clear, false); assert.ok (contacts.intersections.some (c => c.panels.includes (base.name) && c.panels.includes (wall.name)));
        const audit = await InspectFefcoFold (rig); assert.equal (audit.clear, false); assert.equal (audit.progress, 0); assert.equal (audit.samples, 1); assert.throws (() => FefcoFoldPose (rig, 0), /Fold blocked/);
    });
});
