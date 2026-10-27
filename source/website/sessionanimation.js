import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export class AnimationPlayer
{
    constructor (object, scene, clips, render)
    {
        this.object = object; this.scene = scene; this.clips = clips; this.render = render; this.mixer = new THREE.AnimationMixer (scene);
        this.state = { clip : 0, time : 0, speed : 1, playing : false, loop : true, ...object.playback };
        this.state.clip = Number.isInteger (this.state.clip) ? this.state.clip : 0;
        this.state.time = Number.isFinite (this.state.time) ? this.state.time : 0;
        this.state.speed = Number.isFinite (this.state.speed) && this.state.speed > 0 ? this.state.speed : 1;
        this.state.clip = Math.min (clips.length - 1, Math.max (0, this.state.clip));
        this.state.loop = this.state.loop !== false;
        object.playback = this.state;
        this.Choose (this.state.clip, this.state.time); if (this.state.playing) { this.Schedule (); }
    }
    Choose (index, time = 0)
    {
        if (!Number.isInteger (index) || !this.clips[index]) { throw new Error ('Animation clip is unavailable.'); }
        this.mixer.stopAllAction (); this.state.clip = index; this.action = this.mixer.clipAction (this.clips[index]); this.ApplyLoopMode (); this.action.reset ().play (); this.Seek (time);
    }
    ApplyLoopMode ()
    {
        if (!this.action) { return; }
        this.action.setLoop (this.state.loop ? THREE.LoopRepeat : THREE.LoopOnce, this.state.loop ? Infinity : 1);
        this.action.clampWhenFinished = !this.state.loop;
    }
    SetLoop (loop)
    {
        this.state.loop = loop !== false;
        this.ApplyLoopMode ();
    }
    Seek (time)
    {
        this.action.paused = false; this.action.enabled = true; this.action.play ();
        this.action.time = Math.min (this.clips[this.state.clip].duration, Math.max (0, Number.isFinite (time) ? time : 0)); this.mixer.update (0); this.state.time = this.action.time; this.render ();
    }
    Toggle () { this.SetPlaying (!this.state.playing); }
    SetPlaying (playing)
    {
        this.state.playing = Boolean (playing);
        if (this.state.playing) {
            if (this.action.paused || this.state.time >= this.clips[this.state.clip].duration - 1e-6) { this.Choose (this.state.clip, 0); }
            this.Schedule ();
        } else { cancelAnimationFrame (this.frame); this.frame = null; }
        this.onPlaybackChanged?.(this.state.playing);
    }
    Schedule ()
    {
        if (this.frame) { return; } this.previous = performance.now ();
        const tick = (time) => {
            this.frame = null; if (!this.state.playing) { return; }
            const delta = Math.max (0, Math.min ((time - this.previous) / 1000, 0.1)); this.previous = time; this.mixer.update (delta * this.state.speed); this.state.time = this.action.time;
            if (this.onTime) { this.onTime (this.state.time); } this.render ();
            if (!this.state.loop && this.action.time >= this.clips[this.state.clip].duration - 1e-6) { this.state.playing = false; if (this.onPlaybackChanged) { this.onPlaybackChanged (false); } return; }
            this.frame = requestAnimationFrame (tick);
        }; this.frame = requestAnimationFrame (tick);
    }
    ExportClips ()
    {
        // UUID targets keep animation tracks unique across multiple imported rigs.
        return this.clips.map ((clip) => {
            const copy = clip.clone ();
            copy.tracks.forEach ((track) => {
                const binding = THREE.PropertyBinding.parseTrackName (track.name); const target = THREE.PropertyBinding.findNode (this.scene, binding.nodeName);
                if (target) { const suffix = track.name.slice (track.name.indexOf ('.')); track.name = target.uuid + suffix; }
            });
            copy.name = this.object.name + ' / ' + (clip.name || 'Animation'); return copy;
        });
    }
    Dispose () { if (this.frame) { cancelAnimationFrame (this.frame); } this.frame = null; this.mixer.stopAllAction (); this.mixer.uncacheRoot (this.scene); this.object.player = null; }
}

export async function LoadAnimationScene (object, model, render)
{
    const asset = object.animationAsset; const main = asset.files.find ((file) => file.name === asset.main || file.name.split ('/').pop () === asset.main.split ('/').pop ());
    if (!main) { throw new Error ('Original glTF data is missing.'); }
    const urls = [];
    const manager = new THREE.LoadingManager (); manager.setURLModifier ((url) => {
        if (url.startsWith ('data:') || url.startsWith ('blob:') || /draco_(decoder|wasm_wrapper)\.(js|wasm)$/.test (url)) { return url; }
        const path = decodeURIComponent (url).replace (/^\.\//, ''); const name = path.split ('/').pop ();
        const base = asset.main.includes ('/') ? asset.main.slice (0, asset.main.lastIndexOf ('/') + 1) : '';
        const file = asset.files.find ((file) => file.name === path || file.name === base + path) || asset.files.find ((file) => file.name.split ('/').pop () === name);
        if (!file) { throw new Error ('Missing animation resource: ' + name); }
        const blob = URL.createObjectURL (new Blob ([file.buffer])); urls.push (blob); return blob;
    });
    let gltf;
    const loader = new GLTFLoader (manager).setMeshoptDecoder (MeshoptDecoder);
    let draco = null;
    if (typeof document !== 'undefined' && document.scripts) {
        const script = Array.from (document.scripts).find ((item) => item.src.includes ('o3dv.website.min.js'));
        if (script) { draco = new DRACOLoader (manager).setDecoderPath (new URL ('draco/', script.src).href); loader.setDRACOLoader (draco); }
    }
    try { gltf = await loader.parseAsync (main.buffer, ''); } finally { urls.forEach (URL.revokeObjectURL); draco?.dispose (); }
    if (!gltf.animations.length) { gltf.scene.traverse ((item) => { item.geometry?.dispose (); if (item.material) { (Array.isArray (item.material) ? item.material : [item.material]).forEach ((material) => material.dispose ()); } }); return null; }
    const references = []; const materials = new Map ();
    object.threeObject.traverse ((mesh) => {
        if (!mesh.userData.originalMeshInstance) { return; }
        references.push (mesh.userData); mesh.userData.originalMaterials.forEach ((index, slot) => materials.set (index, mesh.material[slot]));
    });
    gltf.scene.traverse ((mesh) => {
        if (!mesh.isMesh) { return; }
        let parent = mesh; let association = null;
        while (parent && !Number.isInteger (association?.nodes)) { association = gltf.parser.associations.get (parent); parent = parent.parent; }
        const reference = references.find ((data) => data.originalMeshInstance.node.gltfNodeIndex === association?.nodes);
        if (!reference) { throw new Error ('Could not associate the animated mesh with the object hierarchy.'); }
        const original = Array.isArray (mesh.material) ? mesh.material : [mesh.material];
        const indices = original.map ((material) => {
            const sourceIndex = gltf.parser.associations.get (material)?.materials;
            return reference.originalMaterials.find ((index) => model.GetMaterial (index).gltfMaterialIndex === sourceIndex) ?? reference.originalMaterials[0];
        });
        // Animated vertices can leave their rest-pose bounds. Avoid stale
        // frustum bounds without a full CPU skinning scan on every frame.
        if (mesh.isSkinnedMesh || mesh.morphTargetInfluences?.length) { mesh.frustumCulled = false; }
        // Keep the rig/morph geometry; use editable scene materials and the engine's UV convention.
        mesh.material = indices.map ((index) => materials.get (index));
        if (mesh.material.some ((material) => !material)) { throw new Error ('Animated material mapping is unavailable.'); }
        for (const channel of ['uv', 'uv1']) { const uv = mesh.geometry.getAttribute (channel); if (uv) { for (let index = 0; index < uv.count; index++) { uv.setY (index, -uv.getY (index)); } uv.needsUpdate = true; } }
        if (mesh.geometry.groups.length === 0 && mesh.material.length === 1) { mesh.geometry.addGroup (0, mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count, 0); }
        mesh.userData = { originalMeshInstance : reference.originalMeshInstance, originalMaterials : indices, threeMaterials : null };
    });
    const removed = [...object.threeObject.children]; removed.forEach ((child) => { object.threeObject.remove (child); child.traverse ((mesh) => mesh.geometry?.dispose ()); }); object.threeObject.add (gltf.scene);
    const player = new AnimationPlayer (object, gltf.scene, gltf.animations, render); object.player = player; return player;
}
