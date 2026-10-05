import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Direction } from '../geometry/geometry.js';

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
        this.viewer.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
        this.Update ();
    }

    Set (key, value)
    {
        if (!(key in this.settings)) { return; }
        this.settings[key] = typeof this.settings[key] === 'boolean' ? Boolean (value) : Math.max (0, Math.min (3, Number (value)));
        this.Update ();
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
        shading.directionalLight.castShadow = this.settings.shadows;
        // HDRI normally disables direct lights. A subtle directional component
        // is retained only while shadows are enabled so cast shadows have a
        // physical light source without overpowering the environment.
        if (this.settings.shadows && shading.hdriEnvironment !== null) {
            shading.directionalLight.intensity = 0.22 * Math.PI;
        }
        this.viewer.renderer.shadowMap.enabled = this.settings.shadows;
        this.UpdateDynamicReflection ();
        this.UpdateFloorReflection ();
        this.UpdateShadowFloor ();
        this.viewer.Render ();
    }

    SceneBounds ()
    {
        const box = new THREE.Box3 ();
        const root = this.viewer.mainModel?.mainModel?.GetRootObject?.();
        if (root) { box.setFromObject (root, true); }
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
        this.cubeCamera.visible = false;
        this.floorReflector && (this.floorReflector.visible = false);
        this.shadowFloor && (this.shadowFloor.visible = false);
        this.cubeCamera.position.copy (bounds.getCenter (new THREE.Vector3 ()));
        this.cubeCamera.update (this.viewer.renderer, this.viewer.scene);
        this.cubeCamera.visible = true;
        if (this.floorReflector) { this.floorReflector.visible = this.settings.floorReflection; }
        if (this.shadowFloor) { this.shadowFloor.visible = this.settings.shadows; }
        const root = this.viewer.mainModel?.mainModel?.GetRootObject?.();
        MeshMaterials (root, (material) => {
            if (!('envMap' in material)) { return; }
            if (!this.reflectionState.has (material)) {
                this.reflectionState.set (material, { envMap : material.envMap || null, envMapIntensity : material.envMapIntensity });
            }
            material.envMap = this.cubeTarget.texture;
            if ('envMapIntensity' in material) { material.envMapIntensity = this.settings.modelReflectionIntensity; }
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
            if (this.shadowFloor) { this.viewer.scene.remove (this.shadowFloor); this.shadowFloor.geometry.dispose (); this.shadowFloor.material.dispose (); this.shadowFloor = null; }
            return;
        }
        const bounds = this.SceneBounds ();
        if (!bounds) { return; }
        this.UpdateShadowCamera (bounds);
        if (!this.shadowFloor) {
            this.shadowFloor = new THREE.Mesh (new THREE.PlaneGeometry (1, 1), new THREE.ShadowMaterial ({ opacity : this.settings.shadowIntensity }));
            this.shadowFloor.userData.auto3dSceneEffect = true;
            this.shadowFloor.receiveShadow = true;
            this.shadowFloor.renderOrder = -9;
            this.viewer.scene.add (this.shadowFloor);
        }
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
