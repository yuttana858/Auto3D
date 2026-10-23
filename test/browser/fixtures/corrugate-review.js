import * as THREE from 'three';
import { CreateFefcoBox, CreateBoard, CreateCorrugatedSample, DefaultEngineering } from '../../../modules/packaging/src/index.js';
const tasks = [];
async function Materials (definitions) {
    return Promise.all (definitions.map (async surface => {
        const material = new THREE.MeshPhysicalMaterial ({ color : new THREE.Color (...surface.color.map (v => v / 255)), roughness : surface.roughness, metalness : 0, bumpScale : surface.bumpScale ?? .08, normalScale : new THREE.Vector2 (surface.normalScale ?? .2, surface.normalScale ?? .2), side : THREE.DoubleSide });
        for (const [key, map] of Object.entries (surface)) {
            if (!['diffuseMap', 'normalMap', 'roughnessMap'].includes (key) || !map?.buffer) { continue; }
            const url = URL.createObjectURL (new Blob ([map.buffer], { type : 'image/png' })); const texture = await new THREE.TextureLoader ().loadAsync (url); URL.revokeObjectURL (url);
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set (map.scale?.x ?? 1, map.scale?.y ?? 1); texture.rotation = map.rotation || 0;
            if (key === 'diffuseMap') { texture.colorSpace = THREE.SRGBColorSpace; material.map = texture; } else { material[key] = texture; }
        }
        return material;
    }));
}
async function Show (title, data, kind) {
    const card = document.createElement ('section'); const label = document.createElement ('h2'); label.textContent = title; card.append (label); document.querySelector ('main').append (card);
    const renderer = new THREE.WebGLRenderer ({ antialias : true, preserveDrawingBuffer : true }); renderer.setSize (450, 420); renderer.setPixelRatio (1); card.append (renderer.domElement);
    const scene = new THREE.Scene (); scene.background = new THREE.Color ('#e9e6de'); scene.add (new THREE.HemisphereLight (0xffffff, 0x61503b, 2)); const light = new THREE.DirectionalLight (0xffffff, 3); light.position.set (kind === 'joint' ? -120 : 100, kind === 'joint' ? 80 : 150, kind === 'joint' ? 30 : 80); scene.add (light);
    const materials = await Materials (data.materials); const root = new THREE.Group (); let crease;
    for (const mesh of [...data.meshes.map (m => data.presentationMeshes?.find (p => p.name === m.name) || m), ...(data.visualMeshes || [])]) {
        if (kind === 'medium' && mesh.name === 'Outside liner') { continue; }
        const p = [], n = [], uv = []; const g = new THREE.BufferGeometry ();
        for (const t of mesh.triangles) { const start = p.length / 3; for (let i = 0; i < 3; i++) { p.push (...mesh.vertices[t.vertices[i]]); n.push (...mesh.normals[t.normals[i]]); uv.push (...mesh.uvs[t.uvs[i]]); } g.addGroup (start, 3, t.material); }
        g.setAttribute ('position', new THREE.Float32BufferAttribute (p, 3)); g.setAttribute ('normal', new THREE.Float32BufferAttribute (n, 3)); g.setAttribute ('uv', new THREE.Float32BufferAttribute (uv, 2));
        const object = new THREE.Mesh (g, materials); root.add (object); if (mesh.name === 'Visual crease · wall-1') { crease = object; }
    }
    scene.add (root); const bounds = new THREE.Box3 ().setFromObject (root); let center = bounds.getCenter (new THREE.Vector3 ());
    const camera = new THREE.PerspectiveCamera (38, 450 / 420, .01, 10000);
    if (kind === 'joint' && crease) { const corner = new THREE.Box3 ().setFromObject (crease).getCenter (new THREE.Vector3 ()); const outward = corner.clone ().sub (center); outward.y = 8; outward.normalize (); center = corner; center.y += 8; camera.position.copy (center).addScaledVector (outward, 34); }
    else { center.set (15, 1.5, -10); camera.position.copy (center).add (new THREE.Vector3 (12, 11, 36)); }
    camera.lookAt (center); renderer.render (scene, camera);
    if (renderer.getContext ().isContextLost ()) { throw new Error ('WebGL context lost'); }
}
const board = direction => {
    const profile = { version : 1, name : 'Texture review', grade : 'Measured visual sample', thickness : 3, paths : [{ id : 'outline', type : 'cut', closed : true, points : [[0, 0], [30, 0], [30, 24], [0, 24]] }] };
    profile.engineering = DefaultEngineering (profile); profile.engineering.materials[0].fluteDirectionDegrees = direction; profile.engineering.materials[0].flutePitchMm = 6;
    return CreateBoard (profile, { textured : true });
};
tasks.push (Show ('Rounded joint · same outer liner', CreateFefcoBox ({ code : '0200', length : 60, width : 40, height : 35, thickness : 3 }), 'joint'));
tasks.push (Show ('Across flutes · 90° sheet direction', board (90), 'edge'));
tasks.push (Show ('Along flutes · 0° sheet direction', board (0), 'edge'));
tasks.push (Show ('Medium detail · outer liner hidden', CreateCorrugatedSample ({ widthMm : 30, lengthMm : 24, flutePitchMm : 6, fluteAxisRadians : Math.PI / 2, samplesAcross : 128, samplesAlong : 16 }), 'medium'));
Promise.all (tasks).then (() => { window.reviewReady = true; }).catch (error => { console.error (error); window.reviewError = error.message; });
