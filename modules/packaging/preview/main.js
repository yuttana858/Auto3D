import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FefcoPanel, DefaultFefco, ValidateFefco, CreateFefcoBox, UnfoldFefco } from '../src/index.js';
let parameters = { ...DefaultFefco }; let current = null; let busy = false;
const viewport = document.getElementById ('viewport'); const status = document.getElementById ('status');
const renderer = new THREE.WebGLRenderer ({ antialias : true }); renderer.setPixelRatio (Math.min (devicePixelRatio, 2)); viewport.appendChild (renderer.domElement);
const scene = new THREE.Scene (); scene.background = new THREE.Color (0xeceff1); scene.add (new THREE.HemisphereLight (0xffffff, 0x6d614f, 2)); const sun = new THREE.DirectionalLight (0xffffff, 2.5); sun.position.set (300, 700, 400); scene.add (sun);
const camera = new THREE.PerspectiveCamera (38, 1, 0.1, 100000); const controls = new OrbitControls (camera, renderer.domElement); controls.enableDamping = true; let object = null;
function Show (data)
{
    if (object) { scene.remove (object); object.traverse (node => node.geometry?.dispose ()); object.userData.materials.forEach (material => { material.map?.dispose (); material.dispose (); }); }
    const materials = data.materials.map (surface => { const material = new THREE.MeshPhysicalMaterial ({ color : new THREE.Color (...surface.color.map (value => value / 255)), roughness : surface.roughness ?? 1, metalness : surface.metalness ?? 0, side : THREE.DoubleSide });
        if (surface.diffuseMap) { const url = URL.createObjectURL (new Blob ([surface.diffuseMap.buffer], { type : 'image/png' })); material.map = new THREE.TextureLoader ().load (url, () => URL.revokeObjectURL (url)); material.map.wrapS = material.map.wrapT = THREE.RepeatWrapping; material.map.colorSpace = THREE.SRGBColorSpace; } return material; });
    object = new THREE.Group (); object.userData.materials = materials;
    for (const mesh of data.meshes) {
        if (mesh.triangles.length) {
            const positions = []; const normals = []; const uvs = []; const geometry = new THREE.BufferGeometry ();
            mesh.triangles.forEach (triangle => { const start = positions.length / 3; for (let i = 0; i < 3; i++) { positions.push (...mesh.vertices[triangle.vertices[i]]); normals.push (...mesh.normals[triangle.normals[i]]); uvs.push (...mesh.uvs[triangle.uvs[i]]); } geometry.addGroup (start, 3, triangle.material); });
            geometry.setAttribute ('position', new THREE.Float32BufferAttribute (positions, 3)); geometry.setAttribute ('normal', new THREE.Float32BufferAttribute (normals, 3)); geometry.setAttribute ('uv', new THREE.Float32BufferAttribute (uvs, 2)); object.add (new THREE.Mesh (geometry, materials));
        }
        if (mesh.lines.length) { const positions = mesh.lines.flatMap (line => line.vertices.flatMap (index => mesh.vertices[index])); const geometry = new THREE.BufferGeometry (); geometry.setAttribute ('position', new THREE.Float32BufferAttribute (positions, 3)); const color = materials[mesh.lines[0].material].color; const material = new THREE.LineBasicMaterial ({ color }); object.userData.materials.push (material); object.add (new THREE.LineSegments (geometry, material)); }
    }
    scene.add (object); const box = new THREE.Box3 ().setFromObject (object); const center = box.getCenter (new THREE.Vector3 ()); const size = box.getSize (new THREE.Vector3 ()); const distance = Math.max (size.x, size.y, size.z) * 1.8;
    controls.target.copy (center); camera.position.copy (center).add (new THREE.Vector3 (0.45, 0.9, 0.65).normalize ().multiplyScalar (distance)); camera.lookAt (center); controls.update (); current = data;
    status.textContent = (data.state === 'flat' ? 'Flat kraft dieline · CUT red / SCORE blue' : 'Folded FEFCO ' + parameters.code) + ' · Packaging module 1.0.0';
}
const host = {
    inspect : () => parameters, configure : changes => { parameters = ValidateFefco ({ ...parameters, ...changes }); panel.Refresh (); return parameters; },
    generate : () => Show (CreateFefcoBox (parameters)), unfold : () => { if (!current || current.state === 'flat') { throw new Error ('Generate a folded box first.'); } const flat = UnfoldFefco (current.parameters, current.profile); for (const role of ['liner', 'edge']) { flat.materials[flat.materials.findIndex (item => item.role === role)] = current.materials.find (item => item.role === role); } Show (flat); },
    factor : () => 1, blocked : () => busy, canUnfold : () => Boolean (current) && current.state !== 'flat',
    run : async action => { if (busy) { return; } busy = true; panel.SetDisabled (); try { await action (); } catch (error) { status.textContent = error.message; } finally { busy = false; panel.Refresh (); } }
};
const panel = new FefcoPanel (host, document.getElementById ('tools'));
const resizeObserver = new ResizeObserver (() => { const { width, height } = viewport.getBoundingClientRect (); renderer.setSize (width, height); camera.aspect = width / Math.max (height, 1); camera.updateProjectionMatrix (); }); resizeObserver.observe (viewport);
renderer.setAnimationLoop (() => { controls.update (); renderer.render (scene, camera); });
