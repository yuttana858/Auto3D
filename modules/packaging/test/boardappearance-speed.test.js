import assert from 'node:assert/strict';
import { BoardAppearanceMesh } from '../src/boardappearance.js';
import { BoardAppearanceMesh as Reference } from './reference/boardappearance-reference.js';
import { CreateBoard } from '../src/geometry.js';
import { CreateCanCollarPlan } from '../src/cancollar.js';
import { FefcoProfile, DefaultFefco } from '../src/fefco.js';
import { PackagingContours } from '../src/profile.js';

const flat = profile => CreateBoard ({ ...profile, appearance : { enabled : false, panelBow : .18, foldSoftness : 1, cutCompression : .18, paperGrain : .35 } }, { textured : true }).meshes[0];
const boundaries = profile => PackagingContours (profile).flatMap (contour => [{ points : contour.outer.map (p => [p[0], 0, -p[1]]) }, ...contour.holes.map (hole => ({ points : hole.map (p => [p[0], 0, -p[1]]), hole : true }))]);

describe ('Board appearance edge grid', () => {
    it ('produces exactly the same presentation mesh as testing every edge', function () {
        this.timeout (60000);
        const profiles = [CreateCanCollarPlan ({ cans : [[0, 0]], rimRadiusMm : 28.95, thickness : 0.61, standard : '12oz-202' }).profile, FefcoProfile ({ ...DefaultFefco })];
        for (const profile of profiles) {
            const mesh = flat (profile), a = Reference (mesh, profile, boundaries (profile)), b = BoardAppearanceMesh (mesh, profile, boundaries (profile));
            assert.equal (b.vertices.length, a.vertices.length); assert.deepEqual (b.vertices, a.vertices); assert.deepEqual (b.normals, a.normals); assert.deepEqual (b.triangles, a.triangles);
        }
    });
    it ('builds a six-can collar board in seconds, not tens of seconds', function () {
        this.timeout (20000);
        const cans = []; for (let r = 0; r < 2; r++) { for (let c = 0; c < 3; c++) { cans.push ([c * 66, r * 66]); } }
        const profile = CreateCanCollarPlan ({ cans, rimRadiusMm : 28.95, thickness : 0.61, standard : '12oz-202', print : { version : 1, ground : 'white' } }).profile;
        const start = performance.now (); const data = CreateBoard (profile, { textured : true }); const ms = performance.now () - start;
        assert.ok (data.presentationMeshes[0].triangles.length > 1000); assert.ok (ms < 8000, 'built in ' + Math.round (ms) + ' ms');
    });
});
