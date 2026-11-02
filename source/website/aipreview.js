import * as THREE from 'three';
import { ReleaseWebGLRenderer } from './webglcleanup.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Recover if pointer capture is lost or release arrives outside the preview.
export function ReleasePreviewDrag (controls, pointerId)
{
    if (!controls?._pointers?.length || (pointerId !== undefined && !controls._pointers.includes (pointerId))) { return; }
    const element = controls.domElement; for (const id of controls._pointers) { if (element.hasPointerCapture?.(id)) { try { element.releasePointerCapture (id); } catch { /* Capture may already have ended. */ } } }
    controls._pointers.length = 0; controls._pointerPositions = {}; controls.state = -1;
    element.ownerDocument.removeEventListener ('pointermove', controls._onPointerMove); element.ownerDocument.removeEventListener ('pointerup', controls._onPointerUp); element.style.cursor = '';
}

export class AIPreview
{
    constructor (host)
    {
        this.host = host; this.renderer = new THREE.WebGLRenderer ({ antialias : true, preserveDrawingBuffer : true }); this.renderer.setPixelRatio (Math.min (devicePixelRatio, 2)); host.appendChild (this.renderer.domElement);
        this.scene = new THREE.Scene (); this.scene.background = new THREE.Color (0x20262e);
        this.scene.add (new THREE.HemisphereLight (0xffffff, 0x657080, 2)); const key = new THREE.DirectionalLight (0xffffff, 3); key.position.set (3, 5, 4); this.scene.add (key);
        this.camera = new THREE.PerspectiveCamera (40, 1, .01, 10000); this.camera.position.set (3, 2, 3);
        this.controls = new OrbitControls (this.camera, this.renderer.domElement); this.controls.zoomSpeed = .5; this.controls.addEventListener ('change', () => this.Render ());
        this.onPointerRelease = event => ReleasePreviewDrag (this.controls, event.pointerId); this.onBlur = () => ReleasePreviewDrag (this.controls);
        this.renderer.domElement.addEventListener ('lostpointercapture', this.onPointerRelease); window.addEventListener ('pointerup', this.onPointerRelease); window.addEventListener ('blur', this.onBlur);
        this.resize = new ResizeObserver (() => this.Resize ()); this.resize.observe (host); this.Resize ();
    }
    Resize () { const w = Math.max (1, this.host.clientWidth), h = Math.max (1, this.host.clientHeight); this.renderer.setSize (w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix (); this.Render (); }
    Render () { this.renderer.render (this.scene, this.camera); }
    Clear ()
    {
        this.generation = (this.generation || 0) + 1; this.renderer.setAnimationLoop (null); this.mixer?.stopAllAction (); this.mixer = null;
        if (this.root) { this.scene.remove (this.root); this.DisposeRoot (this.root); this.root = null; }
    }
    DisposeRoot (root) { const textures = new Set (), materials = new Set (), geometries = new Set (); root.traverse (node => { if (node.geometry) { geometries.add (node.geometry); } for (const material of node.material ? (Array.isArray (node.material) ? node.material : [node.material]) : []) { materials.add (material); for (const value of Object.values (material)) { if (value?.isTexture) { textures.add (value); } } } }); textures.forEach (v => v.dispose ()); materials.forEach (v => v.dispose ()); geometries.forEach (v => v.dispose ()); }
    async Load (buffer, scale = 1, onProgress = () => {})
    {
        this.Clear (); const generation = this.generation;
        const loader = new GLTFLoader ().setMeshoptDecoder (MeshoptDecoder); const draco = new DRACOLoader ();
        const script = [...document.scripts].find (item => item.src.includes ('o3dv.website.min.js')); if (script) { draco.setDecoderPath (new URL ('draco/', script.src).href); loader.setDRACOLoader (draco); }
        let gltf; try { gltf = await loader.parseAsync (buffer, ''); } finally { draco.dispose (); }
        if (generation !== this.generation) { this.DisposeRoot (gltf.scene); return false; }
        this.clipCount = gltf.animations.length; this.root = gltf.scene; this.root.scale.multiplyScalar (scale); this.scene.add (this.root);
        // Decode the GLB once, then reveal drawable model parts progressively without changing hierarchy or skins.
        const nodes = []; this.root.traverse (node => { if (node.isMesh || node.isLine || node.isPoints) { nodes.push (node); } }); nodes.forEach (node => { node.userData.aiVisible = node.visible; node.visible = false; });
        for (let i = 0; i < nodes.length; i++) { if (generation !== this.generation) { return false; } nodes[i].visible = nodes[i].userData.aiVisible; delete nodes[i].userData.aiVisible; onProgress (i + 1, nodes.length); this.Fit (); await new Promise (requestAnimationFrame); }
        if (gltf.animations.length) { this.mixer = new THREE.AnimationMixer (this.root); gltf.animations.forEach (clip => this.mixer.clipAction (clip).play ()); const clock = new THREE.Clock (); this.renderer.setAnimationLoop (() => { if (this.host.getClientRects ().length) { this.mixer?.update (Math.min (.1, clock.getDelta ())); this.Render (); } }); }
        this.Fit (); return true;
    }
    Fit () { if (!this.root) { return; } const box = new THREE.Box3 ().setFromObject (this.root); if (box.isEmpty ()) { return; } const sphere = box.getBoundingSphere (new THREE.Sphere ()); const radius = Math.max (.001, sphere.radius); const distance = radius / Math.sin (THREE.MathUtils.degToRad (this.camera.fov / 2)) / Math.min (1, this.camera.aspect) * 1.1; this.controls.target.copy (sphere.center); this.camera.position.copy (sphere.center).add (new THREE.Vector3 (1, .65, 1).normalize ().multiplyScalar (distance)); this.camera.near = radius / 1000; this.camera.far = distance + radius * 100; this.camera.updateProjectionMatrix (); this.controls.update (); this.Render (); }
    Thumbnail () { this.Render (); return this.renderer.domElement.toDataURL ('image/png'); }
    Dispose () { this.Clear (); this.resize.disconnect (); this.onBlur (); window.removeEventListener ('pointerup', this.onPointerRelease); window.removeEventListener ('blur', this.onBlur); this.renderer.domElement.removeEventListener ('lostpointercapture', this.onPointerRelease); this.controls.dispose (); ReleaseWebGLRenderer (this.renderer); this.renderer.domElement.remove (); }
}
