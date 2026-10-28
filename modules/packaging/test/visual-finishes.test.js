import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { GenerateSpotVarnish } from '../src/surfacerelief.js';
import { CreaseArc, CreaseVisualMeshes } from '../src/creasevisuals.js';
import { ExposedEdgeUV, VisualBoardSpecification } from '../src/flutemapping.js';
import { CreateFefcoFoldRig, FefcoFoldPose } from '../src/folding.js';
import { FefcoProfile } from '../src/fefco.js';
import { DefaultEngineering } from '../src/engineering.js';
import { FoldScorePairs, ScoreBandTrim, ScoreInward } from '../src/scorebands.js';
describe ('Masked varnish and curved board presentation', () => {
    it ('Keeps the unmasked finish and only changes covered gloss/reflectivity', () => {
        const mask = { width : 2, height : 1, pixels : new Uint8Array ([255, 255, 255, 255, 255, 255, 255, 0]) };
        const base = { width : 1, height : 1, pixels : new Uint8Array ([180, 190, 200, 255]) };
        const maps = GenerateSpotVarnish ({ gloss : 1, reflectivity : .5 }, mask, base, base, 32);
        assert.deepEqual ([...maps.roughness.slice (0, 3)], [0, 0, 0]); assert.deepEqual ([...maps.reflectivity.slice (0, 3)], [128, 128, 128]);
        assert.deepEqual ([...maps.roughness.slice (31 * 3, 32 * 3)], [180, 190, 200]); assert.deepEqual ([...maps.reflectivity.slice (31 * 3, 32 * 3)], [180, 190, 200]);
        assert.deepEqual ([...GenerateSpotVarnish ({ enabled : false }, mask, base, base, 32).roughness.slice (0, 3)], [180, 190, 200]);
        assert.throws (() => GenerateSpotVarnish ({ gloss : -1 }, mask));
    });
    it ('Evaluates a true circular arc with smooth radial normals and exact anchors', () => {
        const a = new Vector3 (1, 0, 0), b = new Vector3 (0, 1, 0), axis = new Vector3 (0, 0, 1);
        for (let i = 0; i <= 16; i++) { const frame = CreaseArc (a, b, a, b, axis, i / 16); assert.ok (Math.abs (frame.point.length () - 1) < 1e-10); assert.ok (Math.abs (frame.normal.dot (frame.point) - 1) < 1e-10); }
        assert.deepEqual (CreaseArc (a, b, a, b, axis, 0).point, a); assert.ok (CreaseArc (a, b, a, b, axis, 1).point.distanceTo (b) < 1e-10);
    });
    it ('Derives distinct inner/outer radii from caliper and material orientation without mutating CAD', () => {
        const profile = FefcoProfile ({ thickness : 4 }); profile.engineering = DefaultEngineering (profile, '0201');
        const rig = CreateFefcoFoldRig ({ thickness : 4 }, profile); const cad = JSON.stringify ([rig.profile, rig.panels]);
        const mesh = CreaseVisualMeshes (rig, FefcoFoldPose (rig, .72))[0];
        assert.ok (mesh.insideRadiusMm > 0); assert.ok (mesh.outsideRadiusMm > mesh.insideRadiusMm); assert.ok (mesh.foldAngleRadians > 1);
        const changed = structuredClone (profile); changed.engineering.materials[0].flutePitchMm = 3; changed.engineering.materials[0].fluteDirectionDegrees = 0;
        const other = CreateFefcoFoldRig ({ thickness : 4 }, changed); const otherMesh = CreaseVisualMeshes (other, FefcoFoldPose (other, .72))[0];
        assert.notEqual (otherMesh.insideRadiusMm, mesh.insideRadiusMm); assert.equal (JSON.stringify ([rig.profile, rig.panels]), cad);
    });
    it ('Keeps crease buffers material-sorted at every pose to avoid per-segment draw calls', () => {
        const rig = CreateFefcoFoldRig ({ length : 100, width : 80, height : 60 });
        for (const progress of [0, .23, .72, 1]) { for (const mesh of CreaseVisualMeshes (rig, FefcoFoldPose (rig, progress))) { const groups = mesh.triangles.reduce ((count, triangle, index, list) => count + (index === 0 || list[index - 1].material !== triangle.material ? 1 : 0), 0); assert.ok (groups <= 3); assert.ok (mesh.triangles.every ((triangle, index, list) => index === 0 || list[index - 1].material <= triangle.material)); } }
    });
    it ('Rounds the glue score against both panels while leaving collision poses and CAD intact', () => {
        for (const thickness of [1.5, 3, 7]) {
            const rig = CreateFefcoFoldRig ({ length : 140, width : 100, height : 80, thickness }); const canonical = JSON.stringify ([rig.profile, rig.meshes, rig.panels]);
            const pair = FoldScorePairs (rig).find (item => item.id === 'joint-score'); const trim = ScoreBandTrim (rig, pair);
            assert.ok (trim < ScoreBandTrim (rig, FoldScorePairs (rig).find (item => item.id === 'wall-1')));
            for (const progress of [0, .08, .12, .16, .72, 1]) {
                const pose = FefcoFoldPose (rig, progress), crease = pose.visualMeshes.find (item => item.name.endsWith ('joint-score'));
                const wall = new Matrix4 ().fromArray (pose.displayMatrices[pair.a]), tab = new Matrix4 ().fromArray (pose.displayMatrices[pair.b]);
                for (const side of [0, 1]) { const point = new Vector3 (pair.rail[0][0], side * thickness, pair.rail[0][1]); const a = point.clone ().addScaledVector (ScoreInward (rig, pair, pair.a), trim).applyMatrix4 (wall); const b = point.clone ().addScaledVector (ScoreInward (rig, pair, pair.b), trim).applyMatrix4 (tab); assert.ok (a.distanceTo (new Vector3 (...crease.vertices[side])) < 1e-7); assert.ok (b.distanceTo (new Vector3 (...crease.vertices[crease.segments * 4 + side])) < 1e-7); }
                if (progress === 1) { assert.ok (crease.insideRadiusMm > 0 && crease.insideRadiusMm < thickness / 2); assert.notDeepEqual (pose.displayMatrices[pair.b], pose.matrices[pair.b]); assert.equal (pose.contacts.clear, true); }
            }
            assert.equal (JSON.stringify ([rig.profile, rig.meshes, rig.panels]), canonical);
        }
    });
    it ('Keeps flute phase in sheet coordinates and makes parallel cuts show longitudinal channels', () => {
        const board = { pitchMm : 6, caliperMm : 3, directionDegrees : 90 };
        assert.ok (Math.abs (ExposedEdgeUV (10, 0, 1.5, board)[0] - ExposedEdgeUV (10, 100, 1.5, board)[0]) < 1e-10);
        assert.equal (ExposedEdgeUV (0, 0, 1.5, board)[1], .5);
        assert.ok (Math.abs (ExposedEdgeUV (24, 0, 0, board)[0] + 1) < 1e-10);
        const profile = FefcoProfile ({}); profile.engineering = DefaultEngineering (profile, '0201'); profile.engineering.materials[0].fluteDirectionDegrees = 30; profile.engineering.materials[0].flutePitchMm = 5;
        assert.deepEqual (VisualBoardSpecification (profile), { flute : 'Custom', pitchMm : 5, directionDegrees : 30, caliperMm : 3, outsideLinerMm : .24, insideLinerMm : .24, mediumPaperMm : .18 });
    });
});
