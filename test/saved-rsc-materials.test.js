import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ApplyPackagingPresentation } from '../source/website/packagingadapter.js';
function fixture () {
    const root = new THREE.Group (); const surfaces = ['liner', 'edge', 'inner', 'closed'].map (role => ({ boardSurfaceRole : role }));
    const gpu = surfaces.map ((_, i) => new THREE.MeshStandardMaterial ({ name : 'surface-' + i }));
    const wall = new THREE.Mesh (new THREE.BoxGeometry (), gpu.slice (0, 3)); wall.name = 'Wall'; wall.userData.originalMaterials = [0, 1, 2]; root.add (wall);
    const joint = new THREE.Mesh (new THREE.BoxGeometry (), [gpu[1], gpu[2], gpu[3]]); joint.name = 'Visual crease · wall-1'; joint.userData.originalMaterials = [1, 2, 3]; root.add (joint);
    const mesh = { name : joint.name, visualOnly : true, vertices : [[0, 0, 0], [1, 0, 0], [0, 1, 0]], normals : [[0, 0, 1]], uvs : [[0, 0], [1, 0], [0, 1]], triangles : [0, 1, 2].map (material => ({ vertices : [0, 1, 2], normals : [0, 0, 0], uvs : [0, 1, 2], material })) };
    return { root, joint, gpu, surfaces, data : { materials : surfaces.map (s => ({ role : s.boardSurfaceRole })), visualMeshes : [mesh] } };
}
describe ('Saved RSC joint material compatibility', () => {
    it ('uses the adjoining outer liner when the older joint has no outer-liner slot', () => {
        const f = fixture (); ApplyPackagingPresentation (f.root, f.data, 1, f.surfaces);
        const group = f.joint.geometry.groups[0]; assert.equal (f.joint.material[group.materialIndex], f.gpu[0]);
        assert.notEqual (f.joint.material[group.materialIndex], f.gpu[1]);
        assert.deepEqual (f.joint.userData.originalMaterials.slice (0, 3), [1, 2, 3]);
    });
    it ('keeps the current three-slot joint layout unchanged', () => {
        const f = fixture (); f.joint.userData.originalMaterials = [0, 1, 2]; f.joint.material = f.gpu.slice (0, 3);
        ApplyPackagingPresentation (f.root, f.data, 1, f.surfaces);
        assert.deepEqual (f.joint.userData.originalMaterials, [0, 1, 2]);
        assert.equal (f.joint.material.length, 3); assert.equal (f.joint.material[f.joint.geometry.groups[0].materialIndex], f.gpu[0]);
    });
    it ('does not grow slots on repeated updates and keeps bindings on the cached path', () => {
        const f = fixture (), cache = new WeakMap (); ApplyPackagingPresentation (f.root, f.data, 1, f.surfaces, false, cache); const geometry = f.joint.geometry, count = f.joint.material.length;
        ApplyPackagingPresentation (f.root, f.data, 1, f.surfaces, false, cache);
        assert.equal (f.joint.material.length, count); assert.equal (f.joint.geometry, geometry);
        assert.equal (f.joint.material[f.joint.geometry.groups[0].materialIndex], f.gpu[0]);
    });
});
