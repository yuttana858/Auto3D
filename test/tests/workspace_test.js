import * as assert from 'assert';
import * as THREE from 'three';
import fs from 'node:fs';
import { HDRILighting, ProjectHDRI } from '../../source/engine/viewer/hdrilighting.js';
import { ShadingModel } from '../../source/engine/viewer/shadingmodel.js';
import { ShadingType } from '../../source/engine/threejs/threeutils.js';
import { MaterialPanel, GetMaterialEntries, EnumerateUVTriangles } from '../../source/website/materialpanel.js';
import { GetWorldAxisDirections } from '../../source/website/axisindicator.js';
import { GetBackgroundPreset } from '../../source/engine/viewer/background.js';
import { GetBoxUVTriangle, GenerateMissingBoxUVs } from '../../source/website/materialuv.js';
import { Mesh } from '../../source/engine/model/mesh.js';
import { Triangle } from '../../source/engine/model/triangle.js';
import { Coord3D } from '../../source/engine/geometry/coord3d.js';
import { Viewer } from '../../source/engine/viewer/viewer.js';
import { Direction } from '../../source/engine/geometry/geometry.js';
import { Navigation } from '../../source/engine/viewer/navigation.js';
import { SceneEffects } from '../../source/engine/viewer/sceneeffects.js';
import { MaterialReflectionStrength, SetMaterialReflectionStrength } from '../../source/engine/viewer/materialreflection.js';
import { MergeEnvironmentCatalog } from '../../source/website/lightingpanel.js';

export default function suite ()
{
    describe ('Workspace lighting and materials', () => {
        it ('Opens the context menu on a short right click and suppresses it after a right-drag orbit', () => {
            const event = { clientX : 125, clientY : 240, preventDefault : () => {} };
            let called = null; let canceled = 0;
            const shortClick = {
                enabled : true,
                suppressContextMenu : false,
                Context : (x, y) => { called = [x, y]; },
                clickDetector : { Cancel : () => { canceled++; } }
            };
            Navigation.prototype.OnContextMenu.call (shortClick, event);
            assert.deepEqual (called, [125, 240]);
            assert.equal (canceled, 1);

            called = null;
            const orbitRelease = {
                enabled : true,
                suppressContextMenu : true,
                Context : (x, y) => { called = [x, y]; },
                clickDetector : { Cancel : () => { canceled++; } }
            };
            Navigation.prototype.OnContextMenu.call (orbitRelease, event);
            assert.equal (called, null);
            assert.equal (orbitRelease.suppressContextMenu, false);
            assert.equal (canceled, 2);
        });

        it ('Applies HDRI directly to Phong materials and restores their previous environment', () => {
            const viewer = MakeViewer ();
            const material = new THREE.MeshPhongMaterial ();
            const originalMap = new THREE.Texture ();
            material.envMap = originalMap;
            material.envMapIntensity = 0.35;
            const mesh = new THREE.Mesh (new THREE.BoxGeometry (1, 1, 1), material);
            viewer.scene.add (mesh);
            const lighting = new HDRILighting (viewer);
            lighting.texture = new THREE.DataTexture (new Float32Array (8 * 8 * 4).fill (1), 8, 8, THREE.RGBAFormat, THREE.FloatType);
            lighting.target = { texture : new THREE.Texture (), dispose : () => {} };
            lighting.enabled = true;
            lighting.Adjust (0.8, 30, 10);
            assert.equal (material.envMap, lighting.texture);
            assert.equal (material.envMapIntensity, 0.8 * MaterialReflectionStrength (material));
            lighting.SetDefault ();
            assert.equal (material.envMap, originalMap);
            assert.equal (material.envMapIntensity, 0.35);
        });

        it ('Decodes an actual bundled HDR preview through the cached in-memory loader path', async () => {
            const bytes = fs.readFileSync (new URL ('../../website/assets/hdri/studio_small_09.hdr', import.meta.url));
            const originalFetch = global.fetch;
            try {
                global.fetch = async () => new Response (bytes, { status : 200, headers : { 'Content-Type' : 'application/octet-stream' } });
                const lighting = new HDRILighting (MakeViewer ());
                const texture = await lighting.Decode ('https://auto3d.example/studio_small_09.hdr');
                assert.ok (texture.isDataTexture);
                assert.ok (texture.image.width > 0);
                assert.ok (texture.image.height > 0);
                texture.dispose ();
            } finally { global.fetch = originalFetch; }
        });

        it ('Keeps packaged HDRI previews authoritative when remote catalog metadata changes or disappears', () => {
            const defaults = [{
                id : 'studio_small_09',
                name : 'Softbox studio',
                previewUrl : 'assets/hdri/studio_small_09.hdr',
                thumbnailUrl : 'assets/hdri/studio_small_09.png',
                renderUrl : null,
                sourceUrl : 'https://polyhaven.com/a/studio_small_09',
                license : 'CC0-1.0'
            }];
            const merged = MergeEnvironmentCatalog (defaults, [{
                id : 'studio_small_09',
                name : 'Studio Small',
                previewUrl : 'https://cdn.example/preview.hdr',
                thumbnailUrl : 'https://cdn.example/thumb.png',
                renderUrl : 'https://cdn.example/render.hdr'
            }]);
            assert.equal (merged[0].previewUrl, 'assets/hdri/studio_small_09.hdr');
            assert.equal (merged[0].thumbnailUrl, 'assets/hdri/studio_small_09.png');
            assert.equal (merged[0].cdnPreviewUrl, 'https://cdn.example/preview.hdr');
            assert.equal (merged[0].renderUrl, 'https://cdn.example/render.hdr');
            const offline = MergeEnvironmentCatalog (defaults, []);
            assert.equal (offline[0].previewUrl, defaults[0].previewUrl);
            assert.equal (offline[0].thumbnailUrl, defaults[0].thumbnailUrl);
        });

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
        it ('Keeps the default dome centered on the camera while its horizon remains world-up locked', () => {
            const viewer = new Viewer (); viewer.scene = new THREE.Scene (); viewer.Render = () => {};
            viewer.camera = new THREE.PerspectiveCamera (45, 1, 0.1, 500);
            viewer.camera.position.set (10, 20, 30);
            viewer.camera.rotation.set (0.6, 1.2, 0.4);
            viewer.upVector = { direction : Direction.Y, isFlipped : false };
            const palette = GetBackgroundPreset ('outdoor', false).colors;
            viewer.SetDefaultDome (true, palette);
            assert.ok (viewer.defaultDome);
            assert.equal (viewer.defaultDome.name, 'Auto3DDefaultDome');
            assert.deepEqual (viewer.defaultDome.position.toArray (), [10, 20, 30]);
            assert.ok (viewer.defaultDome.quaternion.equals (new THREE.Quaternion ()));
            assert.deepEqual (viewer.defaultDome.material.uniforms.upAxis.value.toArray (), [0, 1, 0]);
            viewer.camera.position.set (-8, 5, 12);
            viewer.camera.rotation.set (-0.4, 0.2, -1.1);
            viewer.UpdateDefaultDomeCamera ();
            assert.deepEqual (viewer.defaultDome.position.toArray (), [-8, 5, 12]);
            assert.ok (viewer.defaultDome.quaternion.equals (new THREE.Quaternion ()));
            viewer.upVector.direction = Direction.Z; viewer.UpdateDefaultDomeUpVector ();
            assert.deepEqual (viewer.defaultDome.material.uniforms.upAxis.value.toArray (), [0, 0, 1]);
            viewer.upVector.isFlipped = true; viewer.UpdateDefaultDomeUpVector ();
            assert.deepEqual (viewer.defaultDome.material.uniforms.upAxis.value.toArray (), [0, 0, -1]);
            viewer.SetDefaultDome (false);
            assert.equal (viewer.defaultDome, null);
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
            const lighting = new HDRILighting (MakeViewer ());
            const pending = [];
            lighting.Prepare = () => new Promise ((resolve) => pending.push (resolve));
            const prepared = () => {
                const texture = new THREE.Texture (); let textureDisposed = false;
                texture.addEventListener ('dispose', () => { textureDisposed = true; });
                let targetDisposed = false;
                return {
                    texture,
                    target : { texture : new THREE.Texture (), dispose : () => { targetDisposed = true; } },
                    disposed : () => textureDisposed && targetDisposed
                };
            };

            const first = lighting.Load ('first.hdr');
            const second = lighting.Load ('second.hdr');
            const old = prepared (); pending[0] (old);
            assert.equal (await first, false);
            assert.ok (old.disposed ());

            lighting.SetDefault ();
            const newer = prepared (); pending[1] (newer);
            assert.equal (await second, false);
            assert.ok (newer.disposed ());
            assert.equal (lighting.texture, null);
            assert.equal (lighting.enabled, false);
        });

        it ('Multiplies realtime reflection by the material Reflective property without replacing texture maps', () => {
            const scene = new THREE.Scene ();
            const root = new THREE.Group ();
            const material = new THREE.MeshPhysicalMaterial ({ roughness : 0.35, metalness : 0.7 });
            const roughnessMap = new THREE.Texture (); const metalnessMap = new THREE.Texture (); const normalMap = new THREE.Texture ();
            material.roughnessMap = roughnessMap; material.metalnessMap = metalnessMap; material.normalMap = normalMap;
            SetMaterialReflectionStrength (material, 0.4);
            const mesh = new THREE.Mesh (new THREE.BoxGeometry (1, 1, 1), material); root.add (mesh); scene.add (root);
            const light = new THREE.DirectionalLight (); scene.add (light);
            const viewer = {
                scene,
                renderer : { shadowMap : { enabled : false, type : null }, render : () => {} },
                shadingModel : { directionalLight : light, hdriEnvironment : null, UpdateShading : () => {} },
                mainModel : { mainModel : { GetRootObject : () => root } },
                upVector : { direction : Direction.Y, isFlipped : false },
                canvas : { width : 800, height : 600 },
                Render : () => {}
            };
            const effects = new SceneEffects (viewer);
            effects.settings.modelReflections = true;
            effects.settings.modelReflectionIntensity = 0.5;
            effects.cubeTarget = { texture : new THREE.Texture (), dispose : () => {} };
            effects.cubeCamera = new THREE.Object3D (); effects.cubeCamera.update = () => {};
            effects.UpdateDynamicReflection ();
            assert.equal (material.envMapIntensity, 0.2);
            assert.equal (material.roughnessMap, roughnessMap);
            assert.equal (material.metalnessMap, metalnessMap);
            assert.equal (material.normalMap, normalMap);
            SetMaterialReflectionStrength (material, 0.8);
            effects.SyncMaterialProperties ();
            assert.equal (material.envMapIntensity, 0.4);
            effects.RestoreMaterialReflections ();
            effects.Dispose ();
        });

        it ('Applies the material Reflective multiplier to Phong HDRI response', () => {
            const viewer = MakeViewer ();
            const material = new THREE.MeshPhongMaterial ({ specular : 0xffffff });
            SetMaterialReflectionStrength (material, 0.25);
            viewer.scene.add (new THREE.Mesh (new THREE.BoxGeometry (1, 1, 1), material));
            const lighting = new HDRILighting (viewer);
            lighting.texture = new THREE.DataTexture (new Float32Array (8 * 8 * 4).fill (1), 8, 8, THREE.RGBAFormat, THREE.FloatType);
            lighting.target = { texture : new THREE.Texture (), dispose : () => {} };
            lighting.enabled = true;
            lighting.Adjust (0.8, 0, 0);
            assert.equal (MaterialReflectionStrength (material), 0.25);
            assert.equal (material.envMapIntensity, 0.2);
            lighting.SetDefault ();
        });

        it ('Flashes the affected material white when a material or texture is selected, then restores it', async () => {
            const material = new THREE.MeshPhysicalMaterial ();
            material.emissive.set (0x112233); material.emissiveIntensity = 0.18;
            const panel = Object.create (MaterialPanel.prototype);
            panel.emphasisState = new Map (); panel.flashTimers = new Map ();
            panel.website = { viewer : { Render : () => {} } };
            const entry = { material };
            panel.Flash (entry);
            assert.equal (material.emissive.getHex (), 0xffffff);
            assert.equal (material.emissiveIntensity, 1);
            await new Promise ((resolve) => setTimeout (resolve, 220));
            assert.equal (material.emissive.getHex (), 0x112233);
            assert.equal (material.emissiveIntensity, 0.18);
        });

        it ('Keeps per-model shadow flags stable while the global shadow renderer toggles', () => {
            const scene = new THREE.Scene ();
            const light = new THREE.DirectionalLight ();
            scene.add (light);
            const root = new THREE.Group ();
            const mesh = new THREE.Mesh (new THREE.BoxGeometry (1, 1, 1), new THREE.MeshStandardMaterial ());
            root.add (mesh); scene.add (root);
            const viewer = {
                scene,
                renderer : { shadowMap : { enabled : false, type : null } },
                shadingModel : {
                    directionalLight : light,
                    hdriEnvironment : null,
                    UpdateShading : () => { light.intensity = Math.PI; }
                },
                mainModel : { mainModel : { GetRootObject : () => root } },
                upVector : { direction : Direction.Y, isFlipped : false },
                canvas : { width : 800, height : 600 },
                Render : () => {}
            };
            const effects = new SceneEffects (viewer);
            const object = { castShadow : true, receiveShadow : false, threeObject : root };
            effects.ApplyObjectSettings ([object]);
            assert.equal (mesh.castShadow, true);
            assert.equal (mesh.receiveShadow, false);
            effects.Set ('shadows', true);
            assert.equal (viewer.renderer.shadowMap.enabled, true);
            assert.equal (light.castShadow, true);
            effects.Set ('environmentIntensity', 0.65);
            assert.equal (scene.userData.auto3dEnvironmentIntensity, 0.65);
            effects.Set ('shadows', false);
            assert.equal (mesh.castShadow, true);
            assert.equal (mesh.receiveShadow, false);
            effects.Dispose ();
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
