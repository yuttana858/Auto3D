import { CreateAgentCommands } from '../source/website/agentcommands.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ShadingModel } from '../source/engine/viewer/shadingmodel.js';
import { SceneEffects } from '../source/engine/viewer/sceneeffects.js';
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
        assert.equal (floor.material.transparent, false);
        assert.equal (floor.material.blending, THREE.CustomBlending);
        assert.equal (floor.material.blendSrc, THREE.SrcAlphaFactor);
        assert.equal (floor.material.blendDst, THREE.OneMinusSrcAlphaFactor);
        assert.equal (floor.material.depthWrite, false); assert.equal (floor.material.depthTest, true);
        assert.ok (floor.renderOrder < root.children[0].renderOrder);
        assert.equal (material.transparent, true); assert.equal (material.opacity, 0.6); assert.equal (material.depthWrite, false);
        effects.Dispose ();
    });
    it ('Keeps the shadow light outside translated bounds and resets the standard light target on disable', () => {
        const { effects, viewer, root } = fixture (); root.position.set (10000, 5000, -2000); effects.Set ('shadows', true);
        const light = viewer.shadingModel.directionalLight; ShadingModel.prototype.UpdateByCamera.call (viewer.shadingModel, { eye : { x : 10100, y : 5100, z : -1900 }, center : { x : 10000, y : 5000, z : -2000 } });
        assert.deepEqual (light.target.position.toArray (), [10000, 5000, -2000]); assert.ok (Math.abs (light.position.distanceTo (light.target.position) - light.userData.auto3dShadowExtent * 3) < 0.0001); assert.ok (light.shadow.camera.near > 0);
        effects.Set ('shadows', false); assert.deepEqual (light.target.position.toArray (), [0, 0, 0]); effects.Dispose ();
    });
    it ('Uses additive Phong reflection and restores baseline combine and reflectivity', () => {
        const { effects, root } = fixture (); root.children[0].material = new THREE.MeshPhongMaterial (); const material = root.children[0].material; const combine = material.combine; const reflectivity = material.reflectivity;
        effects.settings.modelReflections = true; effects.UpdateDynamicReflection (); assert.equal (material.combine, THREE.AddOperation); effects.RestoreMaterialReflections (); assert.equal (material.combine, combine); assert.equal (material.reflectivity, reflectivity); effects.Dispose ();
    });
});
