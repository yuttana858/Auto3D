import * as assert from 'assert';
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { HDRILighting, ProjectHDRI } from '../../source/engine/viewer/hdrilighting.js';
import { ShadingModel } from '../../source/engine/viewer/shadingmodel.js';
import { ShadingType } from '../../source/engine/threejs/threeutils.js';
import { GetMaterialEntries, EnumerateUVTriangles } from '../../source/website/materialpanel.js';

export default function suite ()
{
    describe ('Workspace lighting and materials', () => {
        function MakeViewer ()
        {
            const scene = new THREE.Scene ();
            return { scene, shadingModel : new ShadingModel (scene), Render : () => {} };
        }

        it ('Integrates a uniform HDR environment independently of its rotation', () => {
            const data = new Float32Array (128 * 64 * 4).fill (1);
            const image = { data, width : 128, height : 64 };
            const first = ProjectHDRI (image, new THREE.Euler ());
            const rotated = ProjectHDRI (image, new THREE.Euler (0.5, 1.3, 0));
            const expected = Math.sqrt (4 * Math.PI);
            assert.ok (Math.abs (first.coefficients[0].x - expected) < 0.001);
            assert.ok (first.coefficients[0].distanceTo (rotated.coefficients[0]) < 0.001);
            for (let i = 1; i < 9; i++) {
                assert.ok (first.coefficients[i].length () < 0.07);
            }
        });

        it ('Rotates directional colored radiance with the environment', () => {
            const image = { data : new Float32Array (128 * 64 * 4), width : 128, height : 64 };
            for (let y = 0; y < 64; y++) {
                for (let x = 0; x < 64; x++) { image.data[(y * 128 + x) * 4] = 1; }
            }
            const first = ProjectHDRI (image, new THREE.Euler ());
            const rotated = ProjectHDRI (image, new THREE.Euler (0, Math.PI, 0));
            assert.ok (Math.abs (first.coefficients[2].x) > 1);
            assert.ok (Math.abs (first.coefficients[2].x + rotated.coefficients[2].x) < 0.001);
        });

        it ('Uses diffuse probes for Phong and IBL for physical surfaces, then restores default lighting', () => {
            const viewer = MakeViewer ();
            const lighting = new HDRILighting (viewer);
            lighting.texture = new THREE.DataTexture (new Float32Array (8 * 8 * 4).fill (1), 8, 8, THREE.RGBAFormat, THREE.FloatType);
            lighting.target = { texture : new THREE.Texture (), dispose : () => {} };
            lighting.enabled = true;
            const gradient = new THREE.Texture ();
            viewer.shadingModel.backgroundTexture = gradient;
            lighting.Adjust (0.4, 90, 30);
            assert.equal (viewer.scene.background, gradient);
            assert.equal (viewer.shadingModel.directionalLight.intensity, 0);
            assert.equal (lighting.probe.intensity, 0.4);
            viewer.shadingModel.SetShadingType (ShadingType.Physical);
            assert.equal (lighting.probe.visible, false);
            assert.equal (viewer.scene.environment, lighting.target.texture);
            assert.equal (viewer.scene.environmentIntensity, 0.4);
            lighting.SetDefault ();
            assert.equal (lighting.probe.intensity, 0);
            assert.equal (viewer.scene.environmentIntensity, 1);
            assert.equal (viewer.scene.environmentRotation.y, 0);
            assert.equal (viewer.shadingModel.directionalLight.intensity, Math.PI);
            assert.equal (viewer.scene.background, gradient);
        });

        it ('Discards stale HDR downloads after another choice or a return to default', async () => {
            const original = RGBELoader.prototype.loadAsync;
            const pending = [];
            RGBELoader.prototype.loadAsync = () => new Promise ((resolve) => pending.push (resolve));
            try {
                const lighting = new HDRILighting (MakeViewer ());
                const first = lighting.Load ('first.hdr');
                const second = lighting.Load ('second.hdr');
                const old = new THREE.Texture ();
                let disposed = false;
                old.addEventListener ('dispose', () => { disposed = true; });
                pending[0] (old);
                assert.equal (await first, false);
                assert.ok (disposed);
                lighting.SetDefault ();
                pending[1] (new THREE.Texture ());
                assert.equal (await second, false);
                assert.equal (lighting.texture, null);
                assert.equal (lighting.enabled, false);
            } finally {
                RGBELoader.prototype.loadAsync = original;
            }
        });

        it ('Reads original materials through selection highlighting and limits them to the selected part', () => {
            const original = new THREE.MeshPhongMaterial ({ color : 0xff0000 });
            const highlight = new THREE.MeshPhongMaterial ({ color : 0x00ffff });
            const second = new THREE.MeshPhongMaterial ();
            const id = (value) => ({ value, IsEqual : (rhs) => rhs.value === value });
            const meshes = [
                { material : [highlight], userData : { threeMaterials : [original], originalMaterials : [2], originalMeshInstance : { id : id (1) } } },
                { material : [second], userData : { threeMaterials : null, originalMaterials : [3], originalMeshInstance : { id : id (2) } } }
            ];
            const viewer = { mainModel : { EnumerateMeshes : (callback) => meshes.forEach (callback) } };
            const model = { GetMaterial : (index) => ({ name : 'Material ' + index }) };
            const selected = GetMaterialEntries (viewer, model, id (1));
            assert.equal (selected.length, 1);
            assert.equal (selected[0].material, original);
            assert.equal (selected[0].original.name, 'Material 2');
            assert.equal (GetMaterialEntries (viewer, model, null).length, 2);
        });

        it ('Draws only the selected material UV triangles for indexed and non-indexed geometry', () => {
            const geometry = new THREE.BufferGeometry ();
            geometry.setAttribute ('uv', new THREE.Float32BufferAttribute ([0, 0, 1, 0, 0, 1, 2, 2, 3, 2, 2, 3], 2));
            geometry.addGroup (0, 3, 0);
            geometry.addGroup (3, 3, 1);
            const points = [];
            assert.equal (EnumerateUVTriangles ({ geometry }, 1, (triangle) => points.push (triangle)), 1);
            assert.deepEqual (points[0], [[2, 2], [3, 2], [2, 3]]);
            geometry.setIndex ([3, 4, 5, 0, 1, 2]);
            const indexed = [];
            EnumerateUVTriangles ({ geometry }, 1, (triangle) => indexed.push (triangle));
            assert.deepEqual (indexed[0], [[0, 0], [1, 0], [0, 1]]);
            geometry.deleteAttribute ('uv');
            assert.equal (EnumerateUVTriangles ({ geometry }, 1, () => {}), 0);
        });
    });
}
