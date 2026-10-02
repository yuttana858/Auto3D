import * as assert from 'assert';
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { HDRILighting, ProjectHDRI } from '../../source/engine/viewer/hdrilighting.js';
import { ShadingModel } from '../../source/engine/viewer/shadingmodel.js';
import { ShadingType } from '../../source/engine/threejs/threeutils.js';
import { GetMaterialEntries, EnumerateUVTriangles } from '../../source/website/materialpanel.js';
import { GetWorldAxisDirections } from '../../source/website/axisindicator.js';
import { GetBackgroundPreset } from '../../source/engine/viewer/background.js';
import { GetBoxUVTriangle, GenerateMissingBoxUVs } from '../../source/website/materialuv.js';
import { Mesh } from '../../source/engine/model/mesh.js';
import { Triangle } from '../../source/engine/model/triangle.js';
import { Coord3D } from '../../source/engine/geometry/coord3d.js';

export default function suite ()
{
    describe ('Workspace lighting and materials', () => {
        it ('Hides HDRI imagery without changing radiance, intensity or rotation and restores the gradient', () => {
            const viewer = MakeViewer ();
            const lighting = new HDRILighting (viewer);
            lighting.texture = new THREE.DataTexture (new Float32Array (8 * 8 * 4).fill (1), 8, 8, THREE.RGBAFormat, THREE.FloatType);
            lighting.target = { texture : new THREE.Texture () };
            lighting.enabled = true;
            const gradient = new THREE.Texture ();
            viewer.shadingModel.backgroundTexture = gradient;
            lighting.Adjust (0.7, 40, -20);
            lighting.SetBackgroundVisible (true);
            assert.equal (viewer.scene.background, lighting.texture);
            assert.equal (viewer.scene.backgroundIntensity, 0.7);
            assert.equal (viewer.scene.backgroundRotation.y, viewer.scene.environmentRotation.y);
            const coefficients = lighting.probe.sh.clone ();
            lighting.SetBackgroundVisible (false);
            assert.equal (viewer.scene.background, gradient);
            assert.equal (viewer.scene.backgroundIntensity, 1);
            assert.equal (viewer.scene.environment, lighting.target.texture);
            assert.equal (viewer.scene.environmentIntensity, 0.7);
            assert.equal (lighting.probe.intensity, 0.7);
            assert.ok (lighting.probe.sh.equals (coefficients));
            lighting.SetBackgroundVisible (true);
            lighting.SetDefault ();
            assert.equal (viewer.scene.background, gradient);
        });

        it ('Generates box UVs consistently for export and display while preserving authored UVs', () => {
            const original = new Mesh ();
            [[0, 0, 0], [2, 0, 0], [0, 0, 4]].forEach ((point) => original.AddVertex (new Coord3D (...point)));
            original.AddTriangle (new Triangle (0, 1, 2));
            const geometry = new THREE.BufferGeometry ();
            geometry.setAttribute ('position', new THREE.Float32BufferAttribute ([0, 0, 0, 2, 0, 0, 0, 0, 4], 3));
            const mesh = { geometry, userData : { originalMeshInstance : { GetMesh : () => original } } };
            const viewer = { mainModel : { EnumerateMeshes : (callback) => callback (mesh) } };
            const entry = { meshes : [{ mesh }] };
            GenerateMissingBoxUVs (viewer, entry);
            assert.equal (original.TextureUVCount (), 3);
            const expected = [[0, 0], [1, 0], [0, 1]];
            assert.deepEqual (GetBoxUVTriangle ([[0, 0, 0], [2, 0, 0], [0, 0, 4]], { min : [0, 0, 0], max : [2, 0, 4] }), expected);
            for (let i = 0; i < 3; i++) {
                assert.deepEqual ([original.GetTextureUV (i).x, original.GetTextureUV (i).y], expected[i]);
                assert.deepEqual ([geometry.getAttribute ('uv').getX (i), geometry.getAttribute ('uv').getY (i)], expected[i]);
            }
            GenerateMissingBoxUVs (viewer, entry);
            assert.equal (original.TextureUVCount (), 3);
        });
        it ('Follows the theme for Standard while preserving explicitly selected background colors', () => {
            assert.deepEqual (GetBackgroundPreset ('standard', true).colors, GetBackgroundPreset ('dark', false).colors);
            assert.deepEqual (GetBackgroundPreset ('standard', false).colors, GetBackgroundPreset ('light', true).colors);
            for (const preset of ['dark', 'light', 'sunset', 'outdoor']) {
                assert.deepEqual (GetBackgroundPreset (preset, true), GetBackgroundPreset (preset, false));
            }
        });

        it ('Projects world axes through inverse camera orientation, including roll', () => {
            const quaternion = new THREE.Quaternion ().setFromAxisAngle (new THREE.Vector3 (0, 0, 1), Math.PI / 2);
            const axes = GetWorldAxisDirections (quaternion);
            assert.ok (axes[0].vector.distanceTo (new THREE.Vector3 (0, -1, 0)) < 1e-10);
            assert.ok (axes[1].vector.distanceTo (new THREE.Vector3 (1, 0, 0)) < 1e-10);
            assert.ok (axes[2].vector.distanceTo (new THREE.Vector3 (0, 0, 1)) < 1e-10);
        });

        it ('Keeps the world indicator independent of camera translation and projection', () => {
            const perspective = new THREE.PerspectiveCamera ();
            perspective.position.set (3, 4, 5);
            perspective.lookAt (0, 0, 0);
            const orthographic = new THREE.OrthographicCamera ();
            orthographic.position.set (30, 40, 50);
            orthographic.lookAt (0, 0, 0);
            const first = GetWorldAxisDirections (perspective.quaternion);
            const second = GetWorldAxisDirections (orthographic.quaternion);
            first.forEach ((axis, index) => assert.ok (axis.vector.distanceTo (second[index].vector) < 1e-10));
            assert.ok (Math.abs (first[0].vector.dot (first[1].vector)) < 1e-10);
        });

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
