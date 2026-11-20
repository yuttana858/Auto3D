import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { StudioPanel } from '../src/panel.js';
import { StudioWorkerClient } from '../src/workerclient.js';
import { StudioPrimitives, StudioIdentityMatrix, CreatePrimitiveDefinition, UpdateStudioNode, SetStudioTip, CombineStudioDefinitions } from '../src/definition.js';

const viewport = document.getElementById ('viewport'), status = document.getElementById ('status');
const selector = document.getElementById ('objects'), visibility = document.getElementById ('visible');
const fitButton = document.getElementById ('fit'), exampleButton = document.getElementById ('example');
const worker = new StudioWorkerClient ();
const objects = new Map ();
let selectedId = null, nextId = 1, busy = false, panel;
const renderer = new THREE.WebGLRenderer ({ antialias : true });
renderer.setPixelRatio (Math.min (devicePixelRatio, 2)); viewport.appendChild (renderer.domElement);
const scene = new THREE.Scene (); scene.background = new THREE.Color ('#1b2229');
scene.add (new THREE.HemisphereLight (0xc8e9ff, 0x3c454a, 2.3));
const light = new THREE.DirectionalLight (0xffffff, 3); light.position.set (200, 400, 300); scene.add (light);
const camera = new THREE.PerspectiveCamera (40, 1, .1, 100000);
const controls = new OrbitControls (camera, renderer.domElement); controls.enableDamping = true;
camera.position.set (130, 110, 160); controls.update ();
const grid = new THREE.GridHelper (400, 20, 0x427580, 0x32434b); grid.position.y = -32; scene.add (grid);

function Inspect ()
{
    const object = objects.get (selectedId);
    return { available : Boolean (object), objectId : object?.objectId, name : object?.name, definition : object?.definition, busy, editContext : 'standalone', objects : [...objects.values ()].map (item => ({ objectId : item.objectId, name : item.name, visible : item.mesh.visible })) };
}
function Refresh ()
{
    selector.replaceChildren ();
    for (const object of objects.values ()) {
        const option = document.createElement ('option'); option.value = object.objectId; option.textContent = object.name + (object.mesh.visible ? '' : ' (hidden)'); selector.appendChild (option);
    }
    selector.value = selectedId || ''; selector.disabled = busy || !objects.size;
    visibility.disabled = busy || !objects.has (selectedId); visibility.checked = objects.get (selectedId)?.mesh.visible ?? false;
    fitButton.disabled = busy || !objects.size; exampleButton.disabled = busy;
    panel?.Refresh ();
}
function Select (objectId)
{
    if (busy || !objects.has (objectId)) { return; }
    selectedId = objectId; Refresh (); Describe (objects.get (objectId));
}
function Describe (object)
{
    const stats = object.data.statistics;
    status.textContent = object.name + ' · ' + stats.triangles.toLocaleString () + ' triangles · ' + Number (stats.volumeMm3.toFixed (2)).toLocaleString () + ' mm³' + (stats.empty ? ' · empty Boolean result' : '');
}
function Fit (selected = true)
{
    const bounds = new THREE.Box3 ();
    for (const object of objects.values ()) {
        if (selected && object.objectId !== selectedId || !selected && !object.mesh.visible || object.data.statistics.empty) { continue; }
        bounds.expandByObject (object.mesh);
    }
    if (bounds.isEmpty ()) { return; }
    const center = bounds.getCenter (new THREE.Vector3 ()), radius = bounds.getBoundingSphere (new THREE.Sphere ()).radius;
    const halfFov = Math.min (THREE.MathUtils.degToRad (camera.fov / 2), Math.atan (Math.tan (THREE.MathUtils.degToRad (camera.fov / 2)) * camera.aspect));
    const distance = Math.max (radius / Math.sin (halfFov) * 1.15, 1);
    const direction = camera.position.clone ().sub (controls.target).normalize (); if (!direction.lengthSq ()) { direction.set (1, .8, 1).normalize (); }
    controls.target.copy (center); camera.position.copy (center).addScaledVector (direction, distance);
    camera.near = Math.max (distance / 10000, .001); camera.far = Math.max (distance * 10, 1000); camera.updateProjectionMatrix (); controls.update ();
}
function RenderSolid (data)
{
    const geometry = new THREE.BufferGeometry ();
    geometry.setAttribute ('position', new THREE.Float32BufferAttribute (data.positions, 3));
    geometry.setAttribute ('normal', new THREE.BufferAttribute (data.normals, 3));
    geometry.setIndex (new THREE.BufferAttribute (data.indices, 1));
    let start = 0;
    while (start < data.materialIndices.length) {
        let end = start + 1; while (end < data.materialIndices.length && data.materialIndices[end] === data.materialIndices[start]) { end++; }
        geometry.addGroup (start * 3, (end - start) * 3, data.materialIndices[start]); start = end;
    }
    const materials = data.materials.map (material => new THREE.MeshStandardMaterial ({ color : material.color, roughness : material.roughness, metalness : material.metalness, opacity : material.opacity, transparent : material.opacity < 1 }));
    return new THREE.Mesh (geometry, materials);
}
function DisposeMesh (mesh) { scene.remove (mesh); mesh.geometry.dispose (); mesh.material.forEach (material => material.dispose ()); }
function Add (definition, data, name)
{
    const objectId = 'preview-' + nextId++, mesh = RenderSolid (data); mesh.userData.objectId = objectId; scene.add (mesh);
    const object = { objectId, definition, data, name, mesh }; objects.set (objectId, object); selectedId = objectId; return object;
}
function Replace (object, definition, data)
{
    const mesh = RenderSolid (data); mesh.visible = object.mesh.visible; mesh.userData.objectId = object.objectId;
    DisposeMesh (object.mesh); scene.add (mesh); Object.assign (object, { definition, data, mesh }); return object;
}
function ObjectById (id = selectedId)
{
    const object = objects.get (id); if (!object) { throw new Error ('Select a preview model.'); } return object;
}
async function Run (action)
{
    if (busy) { throw new Error ('Wait for the current modeling operation.'); }
    busy = true; status.textContent = 'Computing solid…'; Refresh ();
    try { const result = await action (); const object = objects.get (selectedId); if (object) { Describe (object); } return result; }
    catch (error) { status.textContent = error.message; throw error; }
    finally { busy = false; Refresh (); }
}
const host = {
    inspect : Inspect, units : () => 'metric', blocked : () => busy,
    create : args => Run (async () => {
        const { type, parameters, ...options } = args, definition = CreatePrimitiveDefinition (type, parameters, options);
        const data = await worker.evaluate (definition), object = Add (definition, data, options.name || StudioPrimitives[type].label + ' ' + nextId);
        Fit (); return { objectId : object.objectId, message : 'Model generated.' };
    }),
    updateNode : ({ objectId, nodeId, ...patch }) => Run (async () => {
        const object = ObjectById (objectId), definition = UpdateStudioNode (object.definition, nodeId, patch);
        Replace (object, definition, await worker.evaluate (definition)); return { message : 'Selected model updated.' };
    }),
    setTip : ({ objectId, nodeId }) => Run (async () => {
        const object = ObjectById (objectId), definition = SetStudioTip (object.definition, nodeId);
        Replace (object, definition, await worker.evaluate (definition)); return { message : 'History output updated.' };
    }),
    boolean : ({ targetId, toolId, operation, keepOperands }) => Run (async () => {
        if (targetId === toolId) { throw new Error ('Choose two different models.'); }
        const target = ObjectById (targetId), tool = ObjectById (toolId);
        const definition = CombineStudioDefinitions (target.definition, tool.definition, [...StudioIdentityMatrix], operation);
        const data = await worker.evaluate (definition), object = Add (definition, data, target.name + ' · ' + operation);
        if (!keepOperands) { target.mesh.visible = false; tool.mesh.visible = false; }
        Fit (); return { objectId : object.objectId, message : 'Boolean complete; earlier shapes remain editable in history.' };
    }),
    cancel : () => worker.cancel (), fit : () => Fit (), selectObject : Select
};
panel = new StudioPanel (host, document.getElementById ('tools'));
selector.addEventListener ('change', () => Select (selector.value));
visibility.addEventListener ('change', () => { ObjectById ().mesh.visible = visibility.checked; Refresh (); });
fitButton.addEventListener ('click', () => Fit (false));
exampleButton.addEventListener ('click', () => {
    Run (async () => {
        const base = CreatePrimitiveDefinition ('box', { widthMm : 80, heightMm : 60, depthMm : 60 });
        const tool = CreatePrimitiveDefinition ('cylinder', { diameterMm : 28, heightMm : 100 }, { material : { color : '#ffbd71' } });
        const definition = CombineStudioDefinitions (base, tool, [...StudioIdentityMatrix], 'subtract');
        const data = await worker.evaluate (definition);
        for (const object of objects.values ()) { object.mesh.visible = false; }
        Add (definition, data, 'Bored block'); Fit ();
    }).catch (() => {});
});

const raycaster = new THREE.Raycaster (), pointer = new THREE.Vector2 (); let pointerDown;
renderer.domElement.addEventListener ('pointerdown', event => { if (event.button === 0) { pointerDown = [event.clientX, event.clientY]; } });
renderer.domElement.addEventListener ('pointerup', event => {
    if (event.button !== 0 || !pointerDown || Math.hypot (event.clientX - pointerDown[0], event.clientY - pointerDown[1]) > 4) { pointerDown = null; return; }
    pointerDown = null;
    const rect = renderer.domElement.getBoundingClientRect (); pointer.set ((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); raycaster.setFromCamera (pointer, camera);
    const hit = raycaster.intersectObjects ([...objects.values ()].filter (object => object.mesh.visible).map (object => object.mesh))[0]; if (hit) { Select (hit.object.userData.objectId); }
});
const resize = new ResizeObserver (() => {
    const { width, height } = viewport.getBoundingClientRect (); renderer.setSize (width, height); camera.aspect = width / Math.max (height, 1); camera.updateProjectionMatrix ();
});
resize.observe (viewport);
renderer.setAnimationLoop (() => { controls.update (); renderer.render (scene, camera); });
window.addEventListener ('pagehide', () => { worker.dispose (); panel.Dispose (); resize.disconnect (); renderer.setAnimationLoop (null); controls.dispose (); for (const object of objects.values ()) { DisposeMesh (object.mesh); } grid.geometry.dispose (); grid.material.dispose (); renderer.dispose (); });
host.create ({ type : 'box', parameters : { widthMm : 60, heightMm : 60, depthMm : 60 } }).catch (() => {});
