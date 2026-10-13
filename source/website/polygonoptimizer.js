import { ArrayPlacement } from './arraylayout.js';
import * as THREE from 'three';
import { Mesh } from '../engine/model/mesh.js';
import { Triangle } from '../engine/model/triangle.js';
import { ModelToThreeConversionParams, ModelToThreeConversionOutput, ConvertModelToThreeObject } from '../engine/threejs/threeconverter.js';
import { WorkspaceDialog } from './modellibrary.js';

const Yield = () => new Promise ((resolve) => setTimeout (resolve, 0));
export async function PackOptimizationMesh (mesh)
{
    const buffer = (items, keys) => { const result = new Float32Array (items.length * keys.length); items.forEach ((item, index) => keys.forEach ((key, axis) => { result[index * keys.length + axis] = item[key]; })); return result; };
    const data = { vertices : buffer (mesh.vertices, ['x', 'y', 'z']), normals : buffer (mesh.normals, ['x', 'y', 'z']), uvs : buffer (mesh.uvs, ['x', 'y']), colors : buffer (mesh.vertexColors, ['r', 'g', 'b']), corners : new Int32Array (mesh.triangles.length * 12), materials : new Int32Array (mesh.triangles.length * 2) };
    for (let i = 0; i < mesh.triangles.length; i++) { const triangle = mesh.triangles[i]; for (let corner = 0; corner < 3; corner++) { ['v', 'n', 'u', 'c'].forEach ((key, axis) => { data.corners[i * 12 + corner * 4 + axis] = triangle[key + corner] ?? -1; }); } data.materials[i * 2] = triangle.mat ?? -1; data.materials[i * 2 + 1] = triangle.curve ?? -1; if (i % 20000 === 0) { await Yield (); } }
    return data;
}
export async function RebuildOptimizationMesh (source, result)
{
    const mesh = new Mesh (); mesh.SetName (source.GetName ()); source.CloneProperties (mesh);
    const maps = new Map (['v', 'n', 'u', 'c'].map ((key) => [key, new Map ()]));
    const arrays = { v : 'vertices', n : 'normals', u : 'uvs', c : 'vertexColors' };
    const remap = (key, index) => { if (index < 0) { return null; } const map = maps.get (key); if (!map.has (index)) { map.set (index, mesh[arrays[key]].length); mesh[arrays[key]].push (source[arrays[key]][index].Clone ()); } return map.get (index); };
    for (let i = 0; i < result.corners.length / 12; i++) { const triangle = new Triangle (); for (let corner = 0; corner < 3; corner++) { ['v', 'n', 'u', 'c'].forEach ((key, axis) => { triangle[key + corner] = remap (key, result.corners[i * 12 + corner * 4 + axis]); }); } triangle.mat = result.materials[i * 2] < 0 ? null : result.materials[i * 2]; triangle.curve = result.materials[i * 2 + 1] < 0 ? null : result.materials[i * 2 + 1]; mesh.AddTriangle (triangle); if (i % 20000 === 0) { await Yield (); } }
    mesh.lines = source.lines.map ((line) => { const copy = line.Clone (); copy.vertices = line.vertices.map ((index) => remap ('v', index)); return copy; });
    return mesh;
}
export class PolygonOptimizer
{
    constructor (editor) { this.editor = editor; this.preview = null; this.worker = null; this.generation = 0; }
    async Simplify (mesh, retain, error, generation)
    {
        const data = await PackOptimizationMesh (mesh);
        if (generation !== this.generation) { throw new Error ('Optimization cancelled.'); }
        const script = Array.from (document.scripts).find ((item) => item.src.includes ('o3dv.website.min.js'));
        const workerUrl = new URL ('o3dv.optimize.js', script?.src || import.meta.url); workerUrl.search = script ? new URL (script.src).search : '';
        const worker = new Worker (workerUrl); this.worker = worker;
        try { return await new Promise ((resolve, reject) => { this.reject = reject; worker.onmessage = (event) => event.data.error ? reject (new Error (event.data.error)) : resolve (event.data.result); worker.onerror = () => reject (new Error ('Polygon worker could not finish. Try a smaller model.')); worker.postMessage ({ mesh : data, retain, error }, Object.values (data).map ((value) => value.buffer)); }); }
        finally { worker.terminate (); this.worker = null; this.reject = null; }
    }
    Cancel () { this.generation++; this.worker?.terminate (); this.reject?.(new Error ('Optimization cancelled.')); this.preview = null; return { cancelled : true }; }
    async Preview (retain = 0.5, error = 0.001, objects = this.editor.SelectedObjects ())
    {
        const editor = this.editor;
        if (editor.busy || editor.readOnly || !objects.length || !Number.isFinite (retain) || retain < 0.05 || retain > 1 || !Number.isFinite (error) || error < 0 || error > 0.05) { throw new Error ('Select editable objects and use 5–100% triangles with 0–5% relative error.'); }
        if (objects.some ((object) => object.player || object.animationAsset)) { throw new Error ('Animated models retain their rig and morph topology. Optimize a static model instead.'); }
        this.preview = null; editor.busy = true; editor.RefreshButtons (); const revision = editor.recoveryRevision; const generation = ++this.generation;
        const indices = new Set (); objects.forEach ((object) => object.node.EnumerateMeshIndices ((index) => indices.add (index)));
        const patches = new Map (); let before = 0; let after = 0; let maxError = 0;
        try {
            let completed = 0;
            for (const index of indices) { editor.Status ('Optimizing polygons… mesh ' + (++completed) + ' / ' + indices.size); const original = editor.document.model.GetMesh (index); if (!original.triangles.length) { continue; } const result = await this.Simplify (original, retain, error, generation); patches.set (index, await RebuildOptimizationMesh (original, result)); before += result.before; after += result.after; maxError = Math.max (maxError, result.error); }
            const occurrences = new Map (); objects.forEach ((object) => object.node.EnumerateMeshIndices ((index) => occurrences.set (index, (occurrences.get (index) || 0) + 1)));
            let displayedBefore = 0; let displayedAfter = 0; for (const [index, mesh] of patches) { displayedBefore += editor.document.model.GetMesh (index).TriangleCount () * occurrences.get (index); displayedAfter += mesh.TriangleCount () * occurrences.get (index); }
            if (generation !== this.generation) { throw new Error ('Optimization cancelled.'); }
            this.preview = { patches, objects : [...objects], revision, summary : { before : displayedBefore, after : displayedAfter, uniqueBefore : before, uniqueAfter : after, relativeError : maxError, retain } };
            editor.Status ('Polygon preview ready: ' + displayedBefore.toLocaleString () + ' → ' + displayedAfter.toLocaleString () + ' triangles. Original unchanged.'); return this.preview.summary;
        } finally { editor.busy = false; editor.RefreshButtons (); }
    }
    async PreviewArray (counts, retain = 1, error = 0.001)
    {
        const editor = this.editor; const total = counts.reduce ((a, b) => a * b, 1);
        if (counts.length !== 3 || counts.some ((count) => !Number.isInteger (count) || count < 1 || count > 20) || editor.document.objects.length + total - 1 > 1000 || !editor.selected) { throw new Error ('Use valid array counts within the 1,000-object session limit.'); }
        const result = await this.Preview (retain, error, [editor.selected]); return { ...result, counts, arrayBefore : result.before * total, arrayAfter : result.after * total };
    }
    async Apply ()
    {
        const editor = this.editor; const preview = this.preview;
        if (editor.readOnly || editor.busy || !preview || preview.revision !== editor.recoveryRevision || preview.objects.some ((object) => !editor.document.objects.includes (object))) { throw new Error ('Preview is unavailable or the scene changed. Preview again before applying.'); }
        const mapping = new Map (); preview.patches.forEach ((mesh, index) => mapping.set (index, editor.document.model.AddMesh (mesh)));
        const records = [];
        preview.objects.forEach ((object) => object.node.Enumerate ((node) => { const before = [...node.meshIndices]; if (before.some ((index) => mapping.has (index))) { records.push ({ node, before, after : before.map ((index) => mapping.get (index) ?? index) }); } }));
        const apply = async (key) => { records.forEach ((record) => { record.node.meshIndices = [...record[key]]; }); editor.baseSizes = new WeakMap (); await editor.Render (); editor.MarkDirty (); };
        await apply ('after'); editor.history.Push ({ undo : () => apply ('before'), redo : () => apply ('after') }); this.preview = null; return preview.summary;
    }
    async PreviewRoot ()
    {
        if (!this.preview) { throw new Error ('Create a polygon preview first.'); }
        const editor = this.editor; const records = [];
        const mapping = new Map (); this.preview.patches.forEach ((mesh, index) => mapping.set (index, editor.document.model.AddMesh (mesh)));
        let model;
        try { this.preview.objects.forEach ((object) => object.node.Enumerate ((node) => { records.push ({ node, indices : [...node.meshIndices] }); node.meshIndices = node.meshIndices.map ((index) => mapping.get (index) ?? index); })); model = editor.document.CompactModel (this.preview.objects); }
        finally { records.forEach ((record) => { record.node.meshIndices = record.indices; }); }
        const output = new ModelToThreeConversionOutput (); const root = await new Promise ((resolve) => ConvertModelToThreeObject (model, new ModelToThreeConversionParams (), output, { onTextureLoaded : () => {}, onModelLoaded : resolve })); return { root, urls : output.objectUrls };
    }
    async ShowPreview (parent, counts = null, layerRotation = 0, gap = new THREE.Vector3 (), cellSize = null)
    {
        const { root, urls } = await this.PreviewRoot ();
        if (!parent.isConnected) { root.traverse ((mesh) => { mesh.geometry?.dispose (); if (mesh.material) { (Array.isArray (mesh.material) ? mesh.material : [mesh.material]).forEach ((material) => material.dispose ()); } }); urls.forEach (URL.revokeObjectURL); throw new Error ('Preview closed.'); }
        const scene = new THREE.Scene (); scene.background = new THREE.Color (0x303238); const bounds = new THREE.Box3 ().setFromObject (root); const size = cellSize || bounds.getSize (new THREE.Vector3 ());
        const view = new THREE.Group (); view.add (root);
        if (counts) {
            const matrices = []; for (let h = 0; h < counts[2]; h++) { for (let l = 0; l < counts[1]; l++) { for (let w = 0; w < counts[0]; w++) { const placement = ArrayPlacement ({ position : [0, 0, 0], rotation : [0, 0, 0] }, bounds, size, w, l, h, layerRotation, gap); matrices.push (new THREE.Matrix4 ().compose (new THREE.Vector3 (...placement.position), new THREE.Quaternion ().setFromEuler (new THREE.Euler (...placement.rotation.map (THREE.MathUtils.degToRad))), new THREE.Vector3 (1, 1, 1))); } } }
            root.updateMatrixWorld (true); const array = new THREE.Group (); root.traverse ((mesh) => { if (!mesh.isMesh) { return; } const instances = new THREE.InstancedMesh (mesh.geometry, mesh.material, matrices.length); matrices.forEach ((matrix, index) => instances.setMatrixAt (index, matrix.clone ().multiply (mesh.matrixWorld))); array.add (instances); }); view.remove (root); view.add (array);
        }
        const box = new THREE.Box3 ().setFromObject (view); const center = box.getCenter (new THREE.Vector3 ()); view.position.sub (center); const pivot = new THREE.Group (); pivot.add (view); const extent = Math.max (...box.getSize (new THREE.Vector3 ()).toArray (), 0.001); scene.add (pivot); scene.add (new THREE.HemisphereLight (0xffffff, 0x555555, 2)); const light = new THREE.DirectionalLight (0xffffff, 2); light.position.set (1, 2, 3); scene.add (light);
        const canvas = document.createElement ('canvas'); canvas.className = 'polygon_preview_canvas'; canvas.setAttribute ('aria-label', counts ? 'Optimized array preview' : 'Optimized model preview'); parent.appendChild (canvas);
        const renderer = new THREE.WebGLRenderer ({ canvas, antialias : true }); renderer.setPixelRatio (Math.min (window.devicePixelRatio, 2)); renderer.setSize (Math.min (parent.clientWidth || 550, 550), 300, false); const camera = new THREE.PerspectiveCamera (40, canvas.width / canvas.height, extent / 1000, extent * 100); camera.position.set (extent * 1.3, extent * 0.8, extent * 1.5); camera.lookAt (0, 0, 0); const render = () => renderer.render (scene, camera); render ();
        let start; canvas.onpointerdown = (event) => { start = { x : event.clientX, y : event.clientY }; canvas.setPointerCapture (event.pointerId); }; canvas.onpointermove = (event) => { if (!start) { return; } pivot.rotation.y += (event.clientX - start.x) * 0.01; pivot.rotation.x += (event.clientY - start.y) * 0.01; start = { x : event.clientX, y : event.clientY }; render (); }; canvas.onpointerup = canvas.onpointercancel = () => { start = null; };
        return () => { scene.traverse ((mesh) => { if (mesh.isInstancedMesh) { mesh.dispose (); } }); renderer.dispose (); renderer.forceContextLoss (); root.traverse ((mesh) => { mesh.geometry?.dispose (); if (mesh.material) { (Array.isArray (mesh.material) ? mesh.material : [mesh.material]).forEach ((material) => material.dispose ()); } }); urls.forEach (URL.revokeObjectURL); canvas.remove (); };
    }
    Open ()
    {
        const editor = this.editor; const dialog = WorkspaceDialog ('Optimize polygons'); const label = document.createElement ('label'); label.textContent = 'Retain triangles (%)'; const retain = document.createElement ('input'); retain.type = 'number'; retain.min = '5'; retain.max = '100'; retain.value = '50'; retain.setAttribute ('aria-label', 'Retain triangles percentage'); label.appendChild (retain); dialog.appendChild (label);
        const hint = document.createElement ('p'); hint.textContent = 'Preview seam-aware reduction with a 0.1% relative error limit. Materials, UV seams, normals and borders are preserved. Actual reduction may be smaller to retain quality. Drag the preview to inspect it.'; dialog.appendChild (hint);
        const status = document.createElement ('p'); status.setAttribute ('role', 'status'); dialog.appendChild (status); const host = document.createElement ('div'); dialog.appendChild (host);
        let dispose = null; const preview = document.createElement ('button'); preview.textContent = 'Preview decimation'; const apply = document.createElement ('button'); apply.textContent = 'Apply optimization'; apply.disabled = true; const cancel = document.createElement ('button'); cancel.textContent = 'Cancel optimization'; dialog.append (preview, apply, cancel);
        retain.oninput = () => { apply.disabled = true; this.preview = null; dispose?.(); dispose = null; };
        preview.onclick = async () => { preview.disabled = true; apply.disabled = true; status.textContent = 'Optimizing polygons…'; dispose?.(); try { const result = await this.Preview (Number (retain.value) / 100); status.textContent = result.before.toLocaleString () + ' → ' + result.after.toLocaleString () + ' triangles'; dispose = await this.ShowPreview (host); apply.disabled = editor.readOnly || result.after >= result.before; } catch (error) { status.textContent = error.message; } finally { preview.disabled = false; } };
        apply.onclick = async () => { apply.disabled = true; try { await this.Apply (); dialog.close (); } catch (error) { status.textContent = error.message; } };
        cancel.onclick = () => { this.Cancel (); dialog.close (); }; dialog.addEventListener ('close', () => { this.Cancel (); dispose?.(); }, { once : true }); return { opened : true };
    }
}
