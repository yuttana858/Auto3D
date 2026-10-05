import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

// Integrate the radiance over the sphere. Rotating the sample directions moves
// the diffuse lighting as well as the reflections on physical materials.
export function ProjectHDRI (image, rotation)
{
    const sh = new THREE.SphericalHarmonics3 ();
    const basis = new Array (9);
    const direction = new THREE.Vector3 ();
    const color = new THREE.Vector3 ();
    let weightSum = 0;
    for (let y = 0; y < image.height; y += 4) {
        const theta = (y + 0.5) / image.height * Math.PI;
        const weight = Math.sin (theta);
        for (let x = 0; x < image.width; x += 4) {
            const phi = (x + 0.5) / image.width * Math.PI * 2;
            direction.set (-Math.cos (phi) * Math.sin (theta), Math.cos (theta), Math.sin (phi) * Math.sin (theta)).applyEuler (rotation);
            THREE.SphericalHarmonics3.getBasisAt (direction, basis);
            const index = (y * image.width + x) * 4;
            color.set (image.data[index], image.data[index + 1], image.data[index + 2]);
            for (let i = 0; i < 9; i++) {
                sh.coefficients[i].addScaledVector (color, basis[i] * weight);
            }
            weightSum += weight;
        }
    }
    for (const coefficient of sh.coefficients) {
        coefficient.multiplyScalar (4 * Math.PI / weightSum);
    }
    return sh;
}

export class HDRILighting
{
    constructor (viewer)
    {
        this.viewer = viewer;
        this.texture = null;
        this.target = null;
        this.enabled = false;
        this.request = 0;
        this.brightness = 1;
        this.showBackground = false;
        this.rotation = new THREE.Euler ();
        this.materialState = new Map ();
        this.probe = new THREE.LightProbe ();
        this.probe.intensity = 0;
        viewer.scene.add (this.probe);
        viewer.shadingModel.hdriProbe = this.probe;
    }

    async Decode (url)
    {
        const response = await fetch (url, { cache : 'force-cache' });
        if (!response.ok) { throw new Error ('HDRI request failed (' + response.status + ').'); }
        const buffer = await response.arrayBuffer ();
        if (buffer.byteLength < 128) { throw new Error ('HDRI response is empty or invalid.'); }
        return new RGBELoader ().setDataType (THREE.FloatType).createDataTexture (buffer);
    }

    async Prepare (url)
    {
        const texture = await this.Decode (url);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const generator = new THREE.PMREMGenerator (this.viewer.renderer);
        let target;
        try {
            generator.compileEquirectangularShader ();
            target = generator.fromEquirectangular (texture);
        } catch (error) {
            texture.dispose ();
            throw error;
        } finally {
            generator.dispose ();
        }
        return { texture, target };
    }

    async Load (previewUrl, renderUrl = null, fallbackUrl = null)
    {
        const request = ++this.request;
        let prepared;
        try {
            prepared = await this.Prepare (previewUrl);
        } catch (previewError) {
            if (!fallbackUrl || fallbackUrl === previewUrl) { throw previewError; }
            prepared = await this.Prepare (fallbackUrl);
        }
        if (request !== this.request) {
            prepared.texture.dispose (); prepared.target.dispose ();
            return false;
        }
        this.Release ();
        this.texture = prepared.texture;
        this.target = prepared.target;
        this.enabled = true;
        this.Update ();

        // The current catalog ships a low-resolution preview tier. When a
        // high-resolution render asset is added later, upgrade in-place after
        // the preview is already interactive.
        if (renderUrl) {
            this.Upgrade (request, renderUrl).catch (() => {});
        }
        return true;
    }

    async Upgrade (request, renderUrl)
    {
        const prepared = await this.Prepare (renderUrl);
        if (request !== this.request || !this.enabled) {
            prepared.texture.dispose (); prepared.target.dispose ();
            return false;
        }
        this.Release ();
        this.texture = prepared.texture;
        this.target = prepared.target;
        this.Update ();
        return true;
    }

    SetDefault ()
    {
        ++this.request;
        this.enabled = false;
        this.Update ();
    }

    Adjust (brightness, rotation, elevation)
    {
        this.brightness = brightness;
        this.rotation.set (THREE.MathUtils.degToRad (elevation), THREE.MathUtils.degToRad (rotation), 0, 'YXZ');
        this.Update ();
    }

    SetBackgroundVisible (visible)
    {
        this.showBackground = visible;
        this.Update ();
    }

    ApplyMaterialEnvironment (active)
    {
        this.viewer.scene.traverse ((object) => {
            if (!object.isMesh || !object.material) { return; }
            const materials = Array.isArray (object.material) ? object.material : [object.material];
            for (const material of materials) {
                if (!material?.isMeshPhongMaterial) { continue; }
                if (!this.materialState.has (material)) {
                    this.materialState.set (material, {
                        envMap : material.envMap || null,
                        envMapIntensity : material.envMapIntensity,
                        envMapRotation : material.envMapRotation?.clone ? material.envMapRotation.clone () : null
                    });
                }
                const previous = this.materialState.get (material);
                if (active) {
                    const changed = material.envMap !== this.texture;
                    material.envMap = this.texture;
                    material.envMapIntensity = this.brightness * (this.viewer.scene.userData.auto3dEnvironmentIntensity ?? 1);
                    if (material.envMapRotation?.copy) { material.envMapRotation.copy (this.rotation); }
                    if (changed) { material.needsUpdate = true; }
                } else {
                    const changed = material.envMap !== previous.envMap;
                    material.envMap = previous.envMap;
                    if (Number.isFinite (previous.envMapIntensity)) { material.envMapIntensity = previous.envMapIntensity; }
                    if (previous.envMapRotation && material.envMapRotation?.copy) { material.envMapRotation.copy (previous.envMapRotation); }
                    if (changed) { material.needsUpdate = true; }
                    this.materialState.delete (material);
                }
            }
        });
    }

    Update ()
    {
        const shading = this.viewer.shadingModel;
        const active = this.enabled && this.texture !== null;
        shading.hdriEnvironment = active ? this.target.texture : null;
        shading.hdriBackground = active && this.showBackground ? this.texture : null;
        this.probe.intensity = active ? this.brightness : 0;
        this.ApplyMaterialEnvironment (active);
        if (active) {
            this.probe.sh.copy (ProjectHDRI (this.texture.image, this.rotation));
        }
        const globalReflection = this.viewer.scene.userData.auto3dEnvironmentIntensity ?? 1;
        this.viewer.scene.environmentIntensity = active ? this.brightness * globalReflection : globalReflection;
        this.viewer.scene.environmentRotation.copy (active ? this.rotation : new THREE.Euler ());
        this.viewer.scene.backgroundRotation.copy (active ? this.rotation : new THREE.Euler ());
        this.viewer.scene.backgroundIntensity = active && this.showBackground ? this.brightness : 1;
        shading.UpdateShading ();
        this.viewer.Render ();
    }

    Release ()
    {
        if (this.texture !== null) { this.texture.dispose (); }
        if (this.target !== null) { this.target.dispose (); }
        this.texture = null;
        this.target = null;
    }

    Destroy ()
    {
        this.SetDefault ();
        this.Release ();
        this.viewer.scene.remove (this.probe);
    }
}
