import { CreateAgentCommands } from '../source/website/agentcommands.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SceneEffects } from '../source/engine/viewer/sceneeffects.js';
import { FloorShadow, FloorShadowDirection, FloorShadowProjection } from '../source/engine/viewer/floorshadow.js';
import { Direction } from '../source/engine/geometry/geometry.js';
function fixture () {
    const scene = new THREE.Scene (); const root = new THREE.Group (); const material = new THREE.MeshPhysicalMaterial ({ color : '#b89261', envMapIntensity : 1.4 }); const environment = new THREE.Texture (); material.envMap = environment; material.envMapRotation.set (0, 0.7, 0); root.add (new THREE.Mesh (new THREE.BoxGeometry (10, 10, 10), material)); scene.add (root);
    const light = new THREE.DirectionalLight (); scene.add (light); const overlay = new THREE.Box3Helper (new THREE.Box3 (), 0xffffff); scene.add (overlay);
    const viewer = { scene, renderer : { shadowMap : { enabled : false, autoUpdate : true } }, shadingModel : { directionalLight : light, hdriEnvironment : environment, UpdateShading : () => {} }, mainModel : { mainModel : { GetRootObject : () => root } }, upVector : { direction : Direction.Y, isFlipped : false }, canvas : { width : 800, height : 600 }, Render : () => {} };
    const effects = new SceneEffects (viewer); effects.cubeCamera = new THREE.CubeCamera (0.01, 1000, new THREE.WebGLCubeRenderTarget (1)); effects.cubeCamera.update = () => {}; effects.cubeTarget = { texture : new THREE.Texture (), dispose : () => {} };
    return { viewer, effects, root, material, environment, overlay };
}
describe ('Scene effects render state', () => {
    it ('Exposes read-only visibility/shader diagnostics through commands and macros', async () => {
        const { effects, root, viewer } = fixture (); root.visible = false;
        viewer.renderer.info = { programs : [{ name : 'failed shader', diagnostics : { runnable : false, programLog : 'link failed', vertexShader : { log : '' }, fragmentShader : { log : 'bad sampler' } } }] };
        const registry = CreateAgentCommands ({ sessionEditor : { readOnly : true }, sceneEffects : effects });
        const result = await registry.Execute ('lighting.shadow.inspect'); assert.equal (result.ok, true); assert.equal (result.result.hiddenMeshes, 1); assert.equal (result.result.shaderErrors[0].fragment, 'bad sampler');
        assert.equal ((await registry.Execute ('lighting.shadow.inspect', { token : 'unexpected' })).ok, false);
        const macro = await registry.RunMacro ({ version : 1, steps : [{ id : 'diagnosis', command : 'lighting.shadow.inspect', arguments : {} }] }); assert.equal (macro.ok, true); assert.equal (macro.completed[0].result.rootVisible, false); effects.Dispose ();
    });
    it ('Isolates shadow controls from reflection refresh and preserves mesh visibility/materials', () => {
        const { effects, root, material, viewer } = fixture ();
        effects.UpdateDynamicReflection = () => { throw new Error ('unrelated reflection capture'); };
        root.add (new THREE.Mesh (root.children[0].geometry, material)); root.children[1].visible = false;
        const shader = material.onBeforeCompile; const envMap = material.envMap;
        effects.Set ('shadows', true); effects.Set ('shadowIntensity', 0.8); effects.Restore ({ shadows : true, shadowIntensity : 0.8 });
        assert.equal (root.visible, true); assert.equal (root.children[0].visible, true); assert.equal (root.children[1].visible, false);
        assert.equal (material.onBeforeCompile, shader); assert.equal (material.envMap, envMap);
        assert.equal (viewer.renderer.shadowMap.type, THREE.BasicShadowMap);
        const diagnosis = effects.InspectShadows (); assert.equal (diagnosis.visibleMeshes, 1); assert.equal (diagnosis.hiddenMeshes, 1); assert.equal (diagnosis.floor.depthWrite, false);
        effects.Set ('shadowIntensity', 3); assert.equal (effects.shadowFloor.material.opacity, 1);
        effects.Set ('shadowIntensity', NaN); assert.equal (effects.shadowFloor.material.opacity, 1);
        effects.Set ('shadows', false); assert.equal (effects.shadowFloor, null); assert.equal (root.children[1].visible, false); effects.Dispose ();
    });
    it ('Keeps HDRI diffuse intensity and rotation while adding model reflection; restores original shader', () => {
        const { effects, material, environment } = fixture (); const original = material.onBeforeCompile; const key = material.customProgramCacheKey; effects.settings.modelReflections = true; effects.UpdateDynamicReflection ();
        assert.equal (material.envMap, environment); assert.equal (material.envMapIntensity, 1.4); assert.equal (material.envMapRotation.y, 0.7); assert.notEqual (material.onBeforeCompile, original);
        const shader = { uniforms : {}, fragmentShader : '#include <lights_fragment_maps>' }; material.onBeforeCompile (shader); assert.match (shader.fragmentShader, /radiance \+=/); assert.match (shader.fragmentShader, /#include <lights_fragment_maps>/);
        effects.RestoreMaterialReflections (); assert.equal (material.onBeforeCompile, original); assert.equal (material.customProgramCacheKey, key); effects.Dispose ();
    });
    it ('Installs the reflection shader once on materials shared by array instances', () => {
        const { effects, root, material } = fixture (); root.add (new THREE.Mesh (root.children[0].geometry, material)); effects.settings.modelReflections = true; effects.UpdateDynamicReflection (); assert.equal (effects.reflectionState.size, 1);
        const shader = { uniforms : {}, fragmentShader : '#include <lights_fragment_maps>' }; material.onBeforeCompile (shader); assert.equal ((shader.fragmentShader.match (/uniform samplerCube auto3dModelReflection;/g) || []).length, 1); effects.Dispose ();
    });
    it ('Restores hidden helpers and shadow update state if a cubemap capture fails', () => {
        const { effects, viewer, overlay, root } = fixture (); effects.settings.modelReflections = true; effects.cubeCamera.update = () => { assert.equal (overlay.visible, false); assert.equal (root.visible, true); assert.equal (viewer.renderer.shadowMap.autoUpdate, false); throw new Error ('capture failed'); };
        assert.throws (() => effects.UpdateDynamicReflection (), /capture failed/); assert.equal (overlay.visible, true); assert.equal (root.visible, true); assert.equal (viewer.renderer.shadowMap.autoUpdate, true); effects.Dispose ();
    });
    it ('Prevents transparent shadow/reflection floors from writing depth over the model', () => {
        const { effects, root } = fixture (); effects.Set ('shadows', true); effects.Set ('floorReflection', true); assert.equal (effects.shadowFloor.material.depthWrite, false); assert.equal (effects.floorReflector.material.depthWrite, false); assert.equal (root.visible, true); effects.Set ('shadows', false); assert.equal (effects.shadowFloor, null); effects.Dispose ();
    });
    it ('Blends floor shadows before model rendering without changing model alpha', () => {
        const { effects, root, material } = fixture ();
        material.transparent = true; material.opacity = 0.6; material.depthWrite = false;
        effects.Set ('shadows', true); effects.Set ('shadowIntensity', 1);
        const floor = effects.shadowFloor;
        assert.equal (floor.material.transparent, true);
        assert.equal (floor.material.blending, THREE.CustomBlending);
        assert.equal (floor.material.blendSrc, THREE.SrcAlphaFactor);
        assert.equal (floor.material.blendDst, THREE.OneMinusSrcAlphaFactor);
        assert.equal (floor.material.depthWrite, false); assert.equal (floor.material.depthTest, true);
        assert.ok (floor.renderOrder < root.children[0].renderOrder);
        assert.equal (material.transparent, true); assert.equal (material.opacity, 0.6); assert.equal (material.depthWrite, false);
        effects.Dispose ();
    });
    it ('Keeps floor projection finite for translated scenes without changing model lighting', () => {
        const { effects, viewer, root } = fixture (); root.position.set (10000, 5000, -2000); const light = viewer.shadingModel.directionalLight; const target = light.target.position.clone (); const intensity = light.intensity;
        effects.Set ('shadows', true); assert.equal (viewer.renderer.shadowMap.enabled, false); assert.equal (light.castShadow, false); assert.equal (light.intensity, intensity); assert.deepEqual (light.target.position.toArray (), target.toArray ());
        const normal = new THREE.Vector3 (0, 1, 0); const direction = FloorShadowDirection (viewer.upVector, viewer.scene.environmentRotation); const projection = FloorShadowProjection (normal, effects.shadowFloor.position, direction);
        const projected = new THREE.Vector3 (10000, 5010, -2000).applyMatrix4 (projection); assert.ok (Math.abs (projected.y - 4995) < 1e-8); assert.ok (projected.toArray ().every (Number.isFinite)); effects.Dispose ();
    });
    it ('Applies ambient fill to all material types and restores its intensity/color with lighting settings', () => {
        const { effects, viewer } = fixture (); effects.Set ('ambientIntensity', 0.5); effects.Set ('ambientColor', '#88aaff');
        assert.equal (effects.ambientFill.intensity, 0.5 * Math.PI); assert.equal (effects.ambientFill.color.getHexString (), '88aaff');
        const saved = effects.Capture (); effects.Set ('ambientIntensity', 0); effects.Restore (saved);
        assert.equal (effects.ambientFill.intensity, 0.5 * Math.PI); effects.Set ('ambientColor', 'invalid'); assert.equal (effects.settings.ambientColor, '#88aaff');
        const fill = effects.ambientFill; effects.Dispose (); assert.equal (viewer.scene.children.includes (fill), false);
    });
    it ('Locks floor projection to global light rotation for every up axis, including flipped floors', () => {
        for (const direction of [Direction.X, Direction.Y, Direction.Z]) { for (const isFlipped of [false, true]) {
            const up = { direction, isFlipped }; const rotation = new THREE.Euler (); const before = FloorShadowDirection (up, rotation); const axis = direction === Direction.X ? 0 : direction === Direction.Y ? 1 : 2;
            const normal = new THREE.Vector3 ().setComponent (axis, isFlipped ? -1 : 1); const point = new THREE.Vector3 (2, 3, 4); const projection = FloorShadowProjection (normal, point, before);
            const projected = point.clone ().addScaledVector (normal, 10).applyMatrix4 (projection); assert.ok (Math.abs (normal.dot (projected.clone ().sub (point))) < 1e-8);
            rotation.set (axis === 0 ? Math.PI / 2 : 0, axis === 1 ? Math.PI / 2 : 0, axis === 2 ? Math.PI / 2 : 0); assert.ok (before.distanceTo (FloorShadowDirection (up, rotation)) > 0.1);
        } }
        assert.equal (FloorShadowDirection ({ direction : Direction.Y, isFlipped : false }, new THREE.Euler (Math.PI, 0, 0)), null);
    });
    it ('Uses independent caster copies and releases them without disposing shared geometry or textures', () => {
        const { effects, viewer, root, material } = fixture (); const original = root.children[0]; original.castShadow = true; original.receiveShadow = true;
        const hidden = original.clone (); hidden.visible = false; root.add (hidden); const skipped = original.clone (); skipped.castShadow = false; root.add (skipped);
        const node = {}; node.parent = node; original.userData = { engineNode : node };
        const shadow = new FloorShadow (viewer); shadow.SyncCasters (); assert.equal (shadow.proxies.size, 1); const proxy = shadow.proxies.get (original); assert.equal (proxy.geometry, original.geometry); assert.notEqual (proxy.material, material); assert.equal (proxy.castShadow, false); assert.equal (material.opacity, 1); assert.equal (material.transparent, false);
        let disposed = false; original.geometry.addEventListener ('dispose', () => { disposed = true; }); root.remove (original); shadow.SyncCasters (); assert.equal (shadow.proxies.size, 0); assert.equal (shadow.materials.size, 0); shadow.Dispose (); assert.equal (disposed, false); effects.Dispose ();
    });
    it ('Retains instanced, morph and skeletal render data without serializing imported metadata', () => {
        const { effects, viewer, root, material } = fixture (); root.clear (); const geometry = new THREE.BoxGeometry (1, 1, 1);
        const instances = new THREE.InstancedMesh (geometry, material, 2); instances.castShadow = true; instances.setMatrixAt (1, new THREE.Matrix4 ().makeTranslation (3, 0, 0)); root.add (instances);
        const skin = new THREE.SkinnedMesh (geometry, material); skin.castShadow = true; const bone = new THREE.Bone (); skin.add (bone); skin.bind (new THREE.Skeleton ([bone])); skin.morphTargetInfluences = [0.4]; root.add (skin);
        const shadow = new FloorShadow (viewer); shadow.SyncCasters (); const instanceCopy = shadow.proxies.get (instances); const skinCopy = shadow.proxies.get (skin);
        assert.equal (instanceCopy.instanceMatrix, instances.instanceMatrix); assert.equal (instanceCopy.count, 2); assert.equal (skinCopy.skeleton, skin.skeleton); assert.equal (skinCopy.morphTargetInfluences, skin.morphTargetInfluences); assert.deepEqual (skinCopy.bindMatrixInverse.elements, skin.bindMatrixInverse.elements);
        shadow.Dispose (); effects.Dispose ();
    });
    it ('Releases ambient material references when imports rebuild the viewer root', () => {
        const { effects, root, material } = fixture (); const original = material.onBeforeCompile; effects.Set ('ambientIntensity', 1);
        root.clear (); const replacement = new THREE.MeshPhysicalMaterial (); root.add (new THREE.Mesh (new THREE.BoxGeometry (1, 1, 1), replacement)); effects.UpdateAmbient ();
        assert.equal (effects.ambientMaterials.size, 1); assert.equal (effects.ambientMaterials.has (replacement), true); assert.equal (material.onBeforeCompile, original); effects.Dispose ();
    });
    it ('Adds metallic fill once to shared PBR materials and composes with reflection shaders', () => {
        const { effects, root, material } = fixture (); const original = material.onBeforeCompile; root.add (new THREE.Mesh (root.children[0].geometry, material));
        effects.Set ('ambientIntensity', 2); effects.Set ('ambientColor', '#6688ff'); assert.equal (effects.ambientMaterials.size, 1);
        const hook = material.onBeforeCompile; effects.Set ('ambientIntensity', 3); assert.equal (material.onBeforeCompile, hook);
        effects.settings.modelReflections = true; effects.UpdateDynamicReflection (); const shader = { uniforms : {}, fragmentShader : '#include <lights_fragment_maps>' }; material.onBeforeCompile (shader);
        assert.equal ((shader.fragmentShader.match (/uniform vec3 auto3dAmbientFillColor;/g) || []).length, 1); assert.match (shader.fragmentShader, /auto3dModelReflection/); assert.equal (shader.uniforms.auto3dAmbientFillIntensity.value, 3);
        effects.Set ('ambientIntensity', 0); assert.equal (shader.uniforms.auto3dAmbientFillIntensity.value, 0); effects.Dispose (); assert.equal (material.onBeforeCompile, original);
    });
    it ('Uses additive Phong reflection and restores baseline combine and reflectivity', () => {
        const { effects, root } = fixture (); root.children[0].material = new THREE.MeshPhongMaterial (); const material = root.children[0].material; const combine = material.combine; const reflectivity = material.reflectivity;
        effects.settings.modelReflections = true; effects.UpdateDynamicReflection (); assert.equal (material.combine, THREE.AddOperation); effects.RestoreMaterialReflections (); assert.equal (material.combine, combine); assert.equal (material.reflectivity, reflectivity); effects.Dispose ();
    });
});
