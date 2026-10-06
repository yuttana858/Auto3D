import * as THREE from 'three';
import { clone as CloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

export class ModelPreview
{
    constructor (website)
    {
        this.website = website;
        this.root = document.createElement ('section');
        this.root.className = 'model_preview_panel';
        this.root.setAttribute ('aria-label', 'Interactive model preview');
        const title = document.createElement ('div');
        title.className = 'model_preview_title';
        title.textContent = 'Model preview';
        this.canvas = document.createElement ('canvas');
        this.canvas.setAttribute ('aria-label', 'Drag to rotate model preview');
        this.root.append (title, this.canvas);
        const panel = document.getElementById ('data_panel_content');
        panel.insertBefore (this.root, panel.firstChild);

        this.renderer = new THREE.WebGLRenderer ({ canvas : this.canvas, antialias : true, alpha : true });
        this.renderer.setPixelRatio (Math.min (window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        this.scene = new THREE.Scene ();
        this.camera = new THREE.PerspectiveCamera (35, 1, 0.01, 1000);
        this.pivot = new THREE.Group ();
        this.scene.add (this.pivot);
        this.scene.add (new THREE.HemisphereLight (0xffffff, 0x5f6670, 2.2));
        const key = new THREE.DirectionalLight (0xffffff, 2.6); key.position.set (3, 5, 4); this.scene.add (key);
        const fill = new THREE.DirectionalLight (0xffffff, 1.1); fill.position.set (-4, 1, -2); this.scene.add (fill);
        this.drag = null;

        this.canvas.addEventListener ('pointerdown', (event) => {
            if (event.button !== 0) { return; }
            this.canvas.setPointerCapture (event.pointerId);
            this.drag = this.TrackballPoint (event);
            event.preventDefault ();
        });
        this.canvas.addEventListener ('pointermove', (event) => {
            if (!this.drag || !this.pivot.children.length) { return; }
            const current = this.TrackballPoint (event);
            const rotation = new THREE.Quaternion ().setFromUnitVectors (this.drag, current);
            this.pivot.quaternion.premultiply (rotation).normalize ();
            this.drag = current;
            this.Render ();
            event.preventDefault ();
        });
        const end = (event) => {
            if (this.drag && this.canvas.hasPointerCapture (event.pointerId)) { this.canvas.releasePointerCapture (event.pointerId); }
            this.drag = null;
        };
        this.canvas.addEventListener ('pointerup', end);
        this.canvas.addEventListener ('pointercancel', end);
        this.canvas.addEventListener ('dblclick', () => { this.pivot.quaternion.identity (); this.Render (); });
        this.resize = new ResizeObserver (() => this.Resize ());
        this.resize.observe (this.root);
        this.Clear ();
    }

    TrackballPoint (event)
    {
        const rect = this.canvas.getBoundingClientRect ();
        let x = (2 * (event.clientX - rect.left) / Math.max (1, rect.width)) - 1;
        let y = 1 - (2 * (event.clientY - rect.top) / Math.max (1, rect.height));
        const length = x * x + y * y;
        let z;
        if (length <= 1) { z = Math.sqrt (1 - length); }
        else { const scale = 1 / Math.sqrt (length); x *= scale; y *= scale; z = 0; }
        return new THREE.Vector3 (x, y, z).normalize ();
    }

    Resize ()
    {
        const width = Math.max (1, this.root.clientWidth);
        const height = Math.max (120, Math.min (220, Math.round (width * 0.7)));
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.renderer.setSize (width, height, false);
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix ();
        }
        this.Render ();
    }

    Update ()
    {
        while (this.pivot.children.length) { this.pivot.remove (this.pivot.children[0]); }
        const source = this.website.viewer.mainModel?.mainModel?.GetRootObject?.();
        if (!source || !source.children.length) { this.Clear (); return; }
        const clone = CloneSkinned (source);
        const box = new THREE.Box3 ().setFromObject (clone, true);
        if (box.isEmpty ()) { this.Clear (); return; }
        const center = box.getCenter (new THREE.Vector3 ());
        clone.position.sub (center);
        clone.updateMatrixWorld (true);
        this.pivot.add (clone);
        this.pivot.quaternion.identity ();
        const centered = new THREE.Box3 ().setFromObject (clone, true);
        const sphere = centered.getBoundingSphere (new THREE.Sphere ());
        const radius = Math.max (sphere.radius, 0.01);
        const distance = radius / Math.sin (THREE.MathUtils.degToRad (this.camera.fov * 0.5)) * 1.15;
        this.camera.near = Math.max (0.001, distance - radius * 2.5);
        this.camera.far = distance + radius * 4;
        this.camera.position.set (distance * 0.65, distance * 0.45, distance);
        this.camera.lookAt (0, 0, 0);
        this.camera.updateProjectionMatrix ();
        this.root.classList.add ('has_model');
        this.Resize ();
    }

    Clear ()
    {
        while (this.pivot.children.length) { this.pivot.remove (this.pivot.children[0]); }
        this.root.classList.remove ('has_model');
        this.Render ();
    }

    Render ()
    {
        if (!this.renderer) { return; }
        this.renderer.render (this.scene, this.camera);
    }
}
