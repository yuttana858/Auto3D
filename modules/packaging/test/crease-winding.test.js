import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { CreateFefcoFoldRig, FefcoFoldPose } from '../src/folding.js';
describe ('Closed RSC crease lighting orientation', () => {
    it ('keeps top, base, wall and glue-tab triangle winding aligned with outward normals throughout folding', () => {
        const rig = CreateFefcoFoldRig ({ code : '0201', length : 100, width : 80, height : 60, thickness : 3, closure : 'closed' });
        for (const progress of [0, .1, .23, .72, 1]) {
            for (const mesh of FefcoFoldPose (rig, progress).visualMeshes) {
                for (const t of mesh.triangles) {
                    const [a, b, c] = t.vertices.map (id => new Vector3 (...mesh.vertices[id]));
                    const n = t.normals.reduce ((sum, id) => sum.add (new Vector3 (...mesh.normals[id])), new Vector3 ());
                    assert.ok (b.sub (a).cross (c.sub (a)).dot (n) >= -1e-8, mesh.name + ' winding at ' + progress);
                }
            }
        }
    });
});
