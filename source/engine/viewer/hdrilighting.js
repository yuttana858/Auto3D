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
        this.probe = new THREE.LightProbe ();
        this.probe.intensity = 0;
        viewer.scene.add (this.probe);
        viewer.shadingModel.hdriProbe = this.probe;
    }

    async Load (url)
    {
        const request = ++this.request;
        const texture = await new RGBELoader ().setDataType (THREE.FloatType).loadAsync (url);
        if (request !== this.request) {
            texture.dispose ();
            return false;
        }
        texture.mapping = THREE.EquirectangularReflectionMapping;
        const generator = new THREE.PMREMGenerator (this.viewer.renderer);
        let target;
        try {
            target = generator.fromEquirectangular (texture);
        } catch (error) {
            texture.dispose ();
            throw error;
        } finally {
            generator.dispose ();
        }
        this.Release ();
        this.texture = texture;
        this.target = target;
        this.enabled = true;
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

    Update ()
    {
        const shading = this.viewer.shadingModel;
        const active = this.enabled && this.texture !== null;
        shading.hdriEnvironment = active ? this.target.texture : null;
        shading.hdriBackground = active && this.showBackground ? this.texture : null;
        this.probe.intensity = active ? this.brightness : 0;
        if (active) {
            this.probe.sh.copy (ProjectHDRI (this.texture.image, this.rotation));
        }
        this.viewer.scene.environmentIntensity = active ? this.brightness : 1;
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
