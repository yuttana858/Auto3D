import assert from 'node:assert/strict';
import { FefcoProfile, DefaultEngineering, EngineeringMeasurements, ValidatePackaging, EditEngineering, DrivePathDimension, ScoreForTarget, CreateFefcoFoldRig, FefcoFoldPose, CreaseVisualMeshes } from '../src/index.js';
import { Vector3, Matrix4 } from 'three';
describe ('Authoritative CAD measurements and visual creases', () => {
    const profile = () => { const p = FefcoProfile ({ thickness : 4 }); return { ...p, engineering : DefaultEngineering (p, '0201') }; };
    it ('Uses CAD distances and scoped FEFCO 101 corrections, with independent tolerance propagation', () => {
        const p = profile (); const m = p.engineering.materials[0]; Object.assign (m, { caliperToleranceMm : 0.2, scoreToleranceMm : 1.5, processToleranceMm : 0.25, outsideFactors : [1, 1, 2] }); p.engineering.dimensions.forEach (d => { d.basis = 'inside'; });
        const r = EngineeringMeasurements (p); assert.deepEqual (r.dimensions.map (d => d.valueMm), [396, 296, 242]); assert.deepEqual (r.dimensions.map (d => d.toleranceMm), [1.95, 1.95, 2.15]); assert.equal (r.source, 'canonical-cad');
        p.engineering.dimensions[0].basis = 'outside'; p.engineering.dimensions[0].toleranceMm = 0.5; const d = EngineeringMeasurements (p).dimensions[0]; assert.equal (d.valueMm, 404); assert.equal (d.minimumMm, 403.05); assert.equal (d.maximumMm, 404.95);
    });
    it ('Preserves validated material records, targets and precision; rejects dangling and impossible records', () => {
        const p = profile (); p.engineering.dimensions[0].targetMm = 400.123456789; p.engineering.dimensions[0].mode = 'parametric'; assert.deepEqual (ValidatePackaging (JSON.parse (JSON.stringify (p))), p);
        for (const mutate of [p => { p.engineering.dimensions[0].end = 999; }, p => { p.engineering.materials[0].outsideLinerMm = 4; }, p => { p.thickness = 5; }, p => { p.engineering.materials.push (p.engineering.materials[0]); }]) { const invalid = structuredClone (p); mutate (invalid); assert.throws (() => ValidatePackaging (invalid)); }
    });
    it ('Separates Auto, one-time Manual and material-linked Parametric driving', () => {
        const p = profile (); const edit = EditEngineering (p, { dimension : { id : 'length', basis : 'inside', mode : 'parametric', targetMm : 400.123456789 } }, '0201'); const next = { ...p, engineering : edit.engineering }; assert.equal (ScoreForTarget (edit.driving[0], edit.material), 404.123456789);
        const material = EditEngineering (next, { material : { caliperMm : 5 } }, '0201'); assert.equal (ScoreForTarget (material.driving[0], material.material), 405.123456789);
        next.engineering.dimensions[0].mode = 'manual'; assert.equal (EditEngineering (next, { material : { caliperMm : 5 } }).driving.length, 0);
        assert.throws (() => EditEngineering (p, { material : { unknown : true } })); assert.throws (() => EditEngineering (p, { duplicateMaterialId : 'board-custom' }));
    });
    it ('Drives a custom endpoint and coincident vertices without consulting any display mesh', () => {
        const p = { version : 1, name : 'Custom', grade : 'Custom', thickness : 3, paths : [{ id : 'cut', type : 'cut', closed : true, points : [[0, 0], [100, 0], [100, 50], [0, 50]] }, { id : 'score', type : 'score', closed : false, points : [[100, 0], [100, 50]] }] }; p.engineering = DefaultEngineering (p);
        const edit = EditEngineering (p, { dimension : { id : 'cut:0', mode : 'manual', targetMm : 120.125 } }); const result = DrivePathDimension (p, edit.driving[0], edit.material); assert.deepEqual (result.paths[0].points[1], [120.125, 0]); assert.deepEqual (result.paths[1].points[0], [120.125, 0]); assert.deepEqual (p.paths[0].points[1], [100, 0]);
    });
    it ('Anchors curved crease skins on both panel faces with bounded insets, without changing CAD or collision solids', () => {
        for (const code of ['0200', '0201', '0202', '0203']) { const rig = CreateFefcoFoldRig ({ code }); const saved = JSON.stringify ([rig.profile, rig.panels]);
            for (const progress of [0, 0.3, 0.55, 0.72, 0.9, 1]) { const pose = FefcoFoldPose (rig, progress); const meshes = CreaseVisualMeshes (rig, pose); assert.equal (meshes.length, code === '0200' ? 8 : 12); assert.ok (meshes.every (m => m.visualOnly && m.vertices.flat ().every (Number.isFinite)));
                const crease = meshes[0]; for (const [offset, index] of [[0, 0], [crease.segments * 4, 1]]) { for (let end = 0; end < 2; end++) { for (let side = 0; side < 2; side++) {
                    const matrix = new Matrix4 ().fromArray (pose.matrices[rig.panels.findIndex (p => p.kind === 'wall' && p.index === index)]);
                    const expected = new Vector3 (rig.edges[1], side * rig.parameters.thickness, end ? -rig.parameters.height : 0).applyMatrix4 (matrix);
                    const difference = new Vector3 (...crease.vertices[offset + end * 2 + side]).sub (expected); const normal = new Vector3 (0, 1, 0).transformDirection (matrix);
                    assert.ok (Math.abs (difference.dot (normal)) < 1e-8); assert.ok (difference.length () <= rig.parameters.thickness + 1e-8);
                } } }
                assert.ok (meshes.every (m => m.normals.flat ().every (Number.isFinite) && m.triangles.some (t => t.material === 1)));

            } assert.equal (JSON.stringify ([rig.profile, rig.panels]), saved);
        }
    });
});
