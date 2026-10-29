import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ViewModes } from '../source/website/viewmodes.js';

describe ('Model view modes', () => {
    it ('Changes display styles reversibly without altering model materials', () => {
        const material = new THREE.MeshStandardMaterial ({ color : 0xaabbcc }); const root = new THREE.Group (); const mesh = new THREE.Mesh (new THREE.BoxGeometry (), material); root.add (mesh);
        let renders = 0; const website = { viewer : { mainModel : { mainModel : { GetRootObject : () => root } }, Render : () => { renders++; } }, sessionEditor : {} }; const modes = new ViewModes (website);
        for (const [name, expected] of [['wireframe', 'MeshBasicMaterial'], ['cel', 'MeshToonMaterial'], ['xray', 'MeshBasicMaterial']]) { modes.Set (name); assert.equal (mesh.material.type, expected); assert.notEqual (mesh.material, material); assert.equal (material.color.getHex (), 0xaabbcc); if (name === 'wireframe') { assert.equal (mesh.material.wireframe, true); } if (name === 'xray') { assert.equal (mesh.material.transparent, true); assert.equal (mesh.material.depthWrite, false); } }
        modes.Set ('default'); assert.equal (mesh.material, material); assert.equal (renders, 4); assert.throws (() => modes.Set ('invalid'));
    });
    it ('Restores source materials for newly attached preview meshes', () => {
        const material = new THREE.MeshStandardMaterial (), root = new THREE.Group (), mesh = new THREE.Mesh (new THREE.BoxGeometry (), material); root.add (mesh);
        const modes = new ViewModes ({ viewer : { mainModel : { mainModel : { GetRootObject : () => root } }, Render () {} }, sessionEditor : {} }); modes.Set ('cel');
        const preview = new THREE.Mesh (new THREE.BoxGeometry (), mesh.material); root.add (preview); modes.Refresh (); modes.Set ('default'); assert.equal (mesh.material, material); assert.equal (preview.material, material);
    });
});
