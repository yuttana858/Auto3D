import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Direction } from '../geometry/geometry.js';
import { MaterialReflectionStrength } from './materialreflection.js';

function MeshMaterials (root, callback)
{
    root?.traverse ((object) => {
        if (!object.isMesh || !object.material || object.userData?.auto3dSceneEffect) { return; }
        for (const material of Array.isArray (object.material) ? object.material : [object.material]) {
            callback (material, object);
        }
    });
}

export class SceneEffects
{
    constructor (viewer)
    {
        this.viewer = viewer;
        this.settings = {
            environmentIntensity : 1,
            modelReflections : false,
            modelReflectionIntensity : 0.55,
            floorReflection : false,
            floorReflectionIntensity : 0.35,
            shadows : false,
            shadowIntensity : 0.28
        };
        this.reflectionState = new Map ();
        this.cubeTarget = null;
        this.cubeCamera = null;
        this.floorReflector = null;
        this.shadowFloor = null;
        this.viewer.renderer.shadowMap.enabled = false;
        // Use ordinary depth sampling instead of hardware comparison samplers.
        // This is the portable path on browsers/drivers with PCF draw failures.
        this.viewer.renderer.shadowMap.type = THREE.BasicShadowMap;
        this.ConfigureShadowLight ();
    }

    ConfigureShadowLight ()
    {
        const light = this.viewer.shadingModel.directionalLight;
        light.castShadow = false;
        light.shadow.mapSize.set (2048, 2048);
        light.shadow.bias = -0.0002;
        light.shadow.normalBias = 0.02;
        light.shadow.camera.near = 0.01;
        light.shadow.camera.far = 100000;
    }

    Capture ()
    {
        return { ...this.settings };
    }

    Restore (data)
    {
        if (!data || typeof data !== 'object') { return; }
        for (const key of Object.keys (this.settings)) {
            if (typeof this.settings[key] === 'boolean' && typeof data[key] === 'boolean') { this.settings[key] = data[key]; }
            if (typeof this.settings[key] === 'number' && Number.isFinite (data[key])) { this.settings[key] = Math.max (0, Math.min (3, data[key])); }
        }
        this.settings.shadowIntensity = Math.min (1, this.settings.shadowIntensity);
        if (Object.keys (data).every ((key) => key === 'shadows' || key === 'shadowIntensity')) {
            this.UpdateShadows ();
            this.viewer.Render ();
            this.onDiagnostics?.(this.InspectShadows ());
            return;
        }
        this.Update ();
    }

    Set (key, value)
    {
        if (!(key in this.settings)) { return; }
        if (key === 'shadowIntensity') {
            if (!Number.isFinite (Number (value))) { return; }
            this.settings.shadowIntensity = Math.max (0, Math.min (1, Number (value)));
            this.UpdateShadowFloor ();
            this.viewer.Render ();
            this.onDiagnostics?.(this.InspectShadows ());
            return;
        }
        this.settings[key] = typeof this.settings[key] === 'boolean' ? Boolean (value) : Math.max (0, Math.min (3, Number (value)));
        if (key === 'shadows') { this.UpdateShadows (); this.viewer.Render (); this.onDiagnostics?.(this.InspectShadows ()); return; }
        this.Update ();
    }

    UpdateShadows ()
    {
        const shading = this.viewer.shadingModel;
        shading.directionalLight.castShadow = this.settings.shadows;
        if (shading.hdriEnvironment !== null) {
            shading.directionalLight.intensity = this.settings.shadows ? 0.22 * Math.PI : 0;
        }
        this.viewer.renderer.shadowMap.enabled = this.settings.shadows;
        this.viewer.renderer.shadowMap.needsUpdate = true;
        this.UpdateShadowFloor ();
    }

    InspectShadows ()
    {
        const root = this.viewer.mainModel?.mainModel?.GetRootObject?.();
        const counts = { meshes : 0, visibleMeshes : 0, hiddenMeshes : 0, casters : 0, receivers : 0 };
        root?.traverse ((mesh) => {
            if (!mesh.isMesh) { return; }
            counts.meshes++;
            let visible = true; for (let parent = mesh; parent; parent = parent.parent) { visible = visible && parent.visible; }
            counts[visible ? 'visibleMeshes' : 'hiddenMeshes']++;
            if (mesh.castShadow) { counts.casters++; } if (mesh.receiveShadow) { counts.receivers++; }
        });
        const renderer = this.viewer.renderer;
        const shaderErrors = (renderer.info?.programs || []).filter ((program) => program.diagnostics?.runnable === false).map ((program) => ({ name : program.name, log : program.diagnostics.programLog, vertex : program.diagnostics.vertexShader?.log, fragment : program.diagnostics.fragmentShader?.log }));
        return { enabled : this.settings.shadows, intensity : this.settings.shadowIntensity, mapType : renderer.shadowMap.type, mapEnabled : renderer.shadowMap.enabled, contextLost : renderer.getContext?.().isContextLost () ?? false, rootVisible : root?.visible ?? null, ...counts, floor : this.shadowFloor ? { visible : this.shadowFloor.visible, depthWrite : this.shadowFloor.material.depthWrite, depthTest : this.shadowFloor.material.depthTest, transparent : this.shadowFloor.material.transparent, renderOrder : this.shadowFloor.renderOrder, opacity : this.shadowFloor.material.opacity } : null, shaderErrors };
    }

    ApplyObjectSettings (objects)
    {
        for (const object of objects) {
            if (!object.threeObject) { continue; }
            object.threeObject.traverse ((item) => {
                if (!item.isMesh) { return; }
                item.castShadow = object.castShadow !== false;
                item.receiveShadow = object.receiveShadow !== false;
            });
        }
        this.UpdateShadowFloor ();
    }

    Update ()
    {
        const scene = this.viewer.scene;
        const shading = this.viewer.shadingModel;
        scene.userData.auto3dEnvironmentIntensity = this.settings.environmentIntensity;
        scene.environmentIntensity = this.settings.environmentIntensity;
        shading.UpdateShading ();
        this.UpdateShadows ();
        this.UpdateDynamicReflection ();
        this.UpdateFloorReflection ();
        this.UpdateShadowFloor ();
        this.viewer.Render ();
    }

    SceneBounds ()
    {
        const box = new THREE.Box3 ();
        const root = this.viewer.mainModel?.mainModel?.GetRootObject?.();
        if (root) { box.setFromObject (root, false); }
        return box.isEmpty () ? null : box;
    }

    EnsureCubeCamera ()
    {
        if (this.cubeCamera) { return; }
        this.cubeTarget = new THREE.WebGLCubeRenderTarget (256, {
            generateMipmaps : true,
            minFilter : THREE.LinearMipmapLinearFilter,
            type : THREE.HalfFloatType
        });
        this.cubeTarget.texture.mapping = THREE.CubeReflectionMapping;
        this.cubeCamera = new THREE.CubeCamera (0.01, 100000, this.cubeTarget);
        this.cubeCamera.userData.auto3dSceneEffect = true;
        this.viewer.scene.add (this.cubeCamera);
    }

    RestoreMaterialReflections ()
    {
        for (const [material, state] of this.reflectionState) {
            material.envMap = state.envMap;
            if (state.onBeforeCompile) { material.onBeforeCompile = state.onBeforeCompile; material.customProgramCacheKey = state.customProgramCacheKey; }
            if (state.combine !== undefined) { material.combine = state.combine; material.reflectivity = state.reflectivity; }
            if (state.envMapRotation) { material.envMapRotation.copy (state.envMapRotation); }
            if (Number.isFinite (state.envMapIntensity)) { material.envMapIntensity = state.envMapIntensity; }
            material.needsUpdate = true;
        }
        this.reflectionState.clear ();
    }

    SuspendDynamicReflection ()
    {
        if (!this.settings.modelReflections) { return; }
        this.RestoreMaterialReflections ();
        if (this.cubeCamera) { this.cubeCamera.visible = false; }
    }

    UpdateDynamicReflection ()
    {
        if (!this.settings.modelReflections) {
            this.RestoreMaterialReflections ();
            if (this.cubeCamera) { this.cubeCamera.visible = false; }
            return;
        }
        const bounds = this.SceneBounds ();
        if (!bounds) { return; }
        // Restore the latest HDRI/baseline environment before capturing the
        // scene so changing HDRI while model reflections are enabled does not
        // leave stale reflection state behind.
        this.RestoreMaterialReflections ();
        this.EnsureCubeCamera ();
        const root = this.viewer.mainModel?.mainModel?.GetRootObject?.();
        const hidden = [this.floorReflector, this.shadowFloor, this.viewer.defaultDome, ...this.viewer.scene.children.filter ((item) => item !== root && !item.isLight && !item.isCamera && item !== this.cubeCamera)].filter (Boolean);
        const states = hidden.map ((item) => [item, item.visible]);
        const renderer = this.viewer.renderer; const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
        const size = bounds.getSize (new THREE.Vector3 ());
        // Capture outside closed geometry. A center capture sees the dark
        // backs of the receiving model instead of the surrounding scene.
        this.cubeCamera.position.copy (bounds.getCenter (new THREE.Vector3 ())).add (new THREE.Vector3 (size.x * 0.75, size.y * 0.75, size.z * 0.75));
        this.cubeCamera.near = Math.max (0.001, size.length () * 0.0001); this.cubeCamera.far = Math.max (1000, size.length () * 100);
        for (const camera of this.cubeCamera.children) { camera.near = this.cubeCamera.near; camera.far = this.cubeCamera.far; camera.updateProjectionMatrix (); }
        try {
            states.forEach (([item]) => { item.visible = false; }); renderer.shadowMap.autoUpdate = false;
            this.cubeCamera.update (renderer, this.viewer.scene);
        } finally {
            states.forEach (([item, visible]) => { item.visible = visible; }); renderer.shadowMap.autoUpdate = shadowAutoUpdate;
        }
        MeshMaterials (root, (material) => {
            if (!('envMap' in material) || this.reflectionState.has (material)) { return; }
            const strength = this.settings.modelReflectionIntensity * MaterialReflectionStrength (material);
            const state = { envMap : material.envMap || null, envMapIntensity : material.envMapIntensity, envMapRotation : material.envMapRotation?.clone (), onBeforeCompile : material.onBeforeCompile, customProgramCacheKey : material.customProgramCacheKey, combine : material.combine, reflectivity : material.reflectivity, strength : { value : strength } };
            this.reflectionState.set (material, state);
            if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) {
                // Add local specular radiance without replacing the HDRI
                // diffuse irradiance or its intensity/rotation.
                const texture = this.cubeTarget.texture;
                material.onBeforeCompile = (shader, activeRenderer) => {
                    state.onBeforeCompile.call (material, shader, activeRenderer);
                    shader.uniforms.auto3dModelReflection = { value : texture };
                    shader.uniforms.auto3dModelReflectionStrength = state.strength;
                    shader.fragmentShader = 'uniform samplerCube auto3dModelReflection;\nuniform float auto3dModelReflectionStrength;\n' + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace ('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#if defined(RE_IndirectSpecular)
    vec3 auto3dReflectVector = reflect(-geometryViewDir, geometryNormal);
    auto3dReflectVector = normalize(mix(auto3dReflectVector, geometryNormal, pow4(material.roughness)));
    auto3dReflectVector = transformDirectionByInverseViewMatrix(auto3dReflectVector, viewMatrix);
    radiance += textureLod(auto3dModelReflection, auto3dReflectVector, material.roughness * 8.0).rgb * auto3dModelReflectionStrength;
#endif`);
                };
                material.customProgramCacheKey = () => state.customProgramCacheKey.call (material) + ':auto3d-additive-reflection-v1';
            } else if (material.isMeshPhongMaterial) {
                material.envMap = this.cubeTarget.texture; material.combine = THREE.AddOperation;
                material.reflectivity = strength; material.envMapIntensity = strength; material.envMapRotation?.set (0, 0, 0);
            }
            material.needsUpdate = true;
        });
    }

    FloorTransform (object, bounds)
    {
        const up = this.viewer.upVector;
        const center = bounds.getCenter (new THREE.Vector3 ());
        const size = bounds.getSize (new THREE.Vector3 ());
        const extent = Math.max (size.x, size.y, size.z, 1);
        object.position.copy (center);
        if (up.direction === Direction.X) {
            object.rotation.set (0, Math.PI / 2, 0);
            object.position.x = up.isFlipped ? bounds.max.x : bounds.min.x;
        } else if (up.direction === Direction.Z) {
            object.rotation.set (0, 0, 0);
            object.position.z = up.isFlipped ? bounds.max.z : bounds.min.z;
        } else {
            object.rotation.set (-Math.PI / 2, 0, 0);
            object.position.y = up.isFlipped ? bounds.max.y : bounds.min.y;
        }
        object.scale.setScalar (extent * 4);
    }

    DisposeFloorReflection ()
    {
        if (!this.floorReflector) { return; }
        this.viewer.scene.remove (this.floorReflector);
        this.floorReflector.getRenderTarget?.().dispose ();
        this.floorReflector.geometry.dispose ();
        this.floorReflector.material?.dispose?. ();
        this.floorReflector = null;
    }

    SyncMaterialProperties ()
    {
        if (!this.settings.modelReflections) { return; }
        for (const [material, state] of this.reflectionState) {
            state.strength.value = this.settings.modelReflectionIntensity * MaterialReflectionStrength (material);
            if (material.isMeshPhongMaterial) { material.reflectivity = state.strength.value; material.envMapIntensity = state.strength.value; }
        }
        this.viewer.Render ();
    }

    UpdateFloorReflection ()
    {
        if (!this.settings.floorReflection) {
            this.DisposeFloorReflection ();
            return;
        }
        const bounds = this.SceneBounds ();
        if (!bounds) { return; }
        if (!this.floorReflector) {
            const geometry = new THREE.PlaneGeometry (1, 1);
            this.floorReflector = new Reflector (geometry, {
                textureWidth : Math.min (1024, Math.max (256, this.viewer.canvas.width)),
                textureHeight : Math.min (1024, Math.max (256, this.viewer.canvas.height)),
                clipBias : 0.002,
                color : 0xffffff,
                multisample : 0
            });
            this.floorReflector.userData.auto3dSceneEffect = true;
            this.floorReflector.renderOrder = -10;
            this.viewer.scene.add (this.floorReflector);
        }
        this.FloorTransform (this.floorReflector, bounds);
        this.floorReflector.material.depthWrite = false;
        this.floorReflector.material.transparent = this.settings.floorReflectionIntensity < 1;
        this.floorReflector.material.opacity = this.settings.floorReflectionIntensity;
        if (this.floorReflector.material.uniforms?.color) {
            this.floorReflector.material.uniforms.color.value.setScalar (Math.max (0.05, this.settings.floorReflectionIntensity));
        }
        this.floorReflector.visible = true;
    }

    UpdateShadowCamera (bounds)
    {
        const light = this.viewer.shadingModel.directionalLight;
        const size = bounds.getSize (new THREE.Vector3 ());
        const extent = Math.max (size.x, size.y, size.z, 1) * 1.5;
        light.userData.auto3dShadowExtent = extent;
        const up = this.viewer.upVector;
        const direction = [1, 1, 1];
        direction[up.direction === Direction.X ? 0 : up.direction === Direction.Z ? 2 : 1] = up.isFlipped ? -2 : 2;
        light.userData.auto3dShadowDirection = direction;
        light.shadow.camera.near = Math.max (0.000001, extent / 1000);
        light.shadow.normalBias = extent * 0.001;
        light.shadow.camera.left = -extent;
        light.shadow.camera.right = extent;
        light.shadow.camera.top = extent;
        light.shadow.camera.bottom = -extent;
        light.shadow.camera.far = extent * 10;
        light.shadow.camera.updateProjectionMatrix ();
        light.target.position.copy (bounds.getCenter (new THREE.Vector3 ()));
        if (!light.target.parent) { this.viewer.scene.add (light.target); }
    }

    UpdateShadowFloor ()
    {
        if (!this.settings.shadows) {
            delete this.viewer.shadingModel.directionalLight.userData.auto3dShadowExtent;
            this.viewer.shadingModel.directionalLight.target.position.set (0, 0, 0);
            if (this.shadowFloor) { this.viewer.scene.remove (this.shadowFloor); this.shadowFloor.geometry.dispose (); this.shadowFloor.material.dispose (); this.shadowFloor = null; }
            return;
        }
        const bounds = this.SceneBounds ();
        if (!bounds) { return; }
        this.UpdateShadowCamera (bounds);
        if (!this.shadowFloor) {
            // Blend onto the background before models, rather than compositing a
            // transparent floor over models in the later transparent render queue.
            // Custom blending retains shadow alpha while using the opaque queue.
            const material = new THREE.ShadowMaterial ({
                opacity : this.settings.shadowIntensity,
                transparent : false,
                blending : THREE.CustomBlending,
                blendEquation : THREE.AddEquation,
                blendSrc : THREE.SrcAlphaFactor,
                blendDst : THREE.OneMinusSrcAlphaFactor,
                blendSrcAlpha : THREE.OneFactor,
                blendDstAlpha : THREE.OneMinusSrcAlphaFactor,
                depthWrite : false,
                depthTest : true
            });
            this.shadowFloor = new THREE.Mesh (new THREE.PlaneGeometry (1, 1), material);
            this.shadowFloor.userData.auto3dSceneEffect = true;
            this.shadowFloor.receiveShadow = true;
            this.shadowFloor.material.depthWrite = false;
            this.shadowFloor.renderOrder = -9;
            this.viewer.scene.add (this.shadowFloor);
        }
        this.settings.shadowIntensity = Math.max (0, Math.min (1, this.settings.shadowIntensity));
        this.shadowFloor.material.opacity = this.settings.shadowIntensity;
        this.FloorTransform (this.shadowFloor, bounds);
        this.shadowFloor.visible = true;
    }

    Refresh ()
    {
        this.Update ();
    }

    Dispose ()
    {
        this.RestoreMaterialReflections ();
        this.DisposeFloorReflection ();
        if (this.shadowFloor) { this.viewer.scene.remove (this.shadowFloor); this.shadowFloor.geometry.dispose (); this.shadowFloor.material.dispose (); }
        if (this.cubeCamera) { this.viewer.scene.remove (this.cubeCamera); }
        this.cubeTarget?.dispose ();
    }
}
