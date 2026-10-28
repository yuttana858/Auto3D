import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FefcoPanel, DefaultFefco, ValidateFefco, CreateFefcoBox, UnfoldFefco, CreateFefcoFoldRig, FefcoFoldPose, InspectFefcoFold, FoldPlayback, PackagingModuleVersion, FefcoDimensions, ResolveFefcoDimensions, FefcoPreset, FefcoAnimationPlan, FefcoProfile, DefaultEngineering, EngineeringMeasurements, EditEngineering, ScoreForTarget, EngineeringPanel, ValidateBoardAppearance } from '../src/index.js';
let parameters = { ...DefaultFefco }; let current = null; let busy = false; let playback = null; let dimensionBasis = 'inside'; let tolerance = 0; let engineeringPanel = null;
const viewport = document.getElementById ('viewport'); const status = document.getElementById ('status');
const renderer = new THREE.WebGLRenderer ({ antialias : true }); renderer.setPixelRatio (Math.min (devicePixelRatio, 2)); viewport.appendChild (renderer.domElement);
const scene = new THREE.Scene (); scene.background = new THREE.Color (0xeceff1); scene.add (new THREE.HemisphereLight (0xffffff, 0x6d614f, 2)); const sun = new THREE.DirectionalLight (0xffffff, 2.5); sun.position.set (300, 700, 400); scene.add (sun);
const camera = new THREE.PerspectiveCamera (38, 1, 0.1, 100000); const controls = new OrbitControls (camera, renderer.domElement); controls.enableDamping = true; let object = null;
function Show (data)
{
    if (object) { scene.remove (object); object.traverse (node => node.geometry?.dispose ()); object.userData.materials.forEach (material => { for (const key of ['map', 'normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'specularColorMap', 'aoMap', 'displacementMap']) { material[key]?.dispose (); } material.dispose (); }); }
    const materials = data.materials.map (surface => { const material = new THREE.MeshPhysicalMaterial ({ color : new THREE.Color (...surface.color.map (value => value / 255)), roughness : surface.roughness ?? 1, metalness : surface.metalness ?? 0, bumpScale : surface.bumpScale ?? 0.08, normalScale : new THREE.Vector2 (surface.normalScale ?? 0.2, surface.normalScale ?? 0.2), aoMapIntensity : surface.aoIntensity ?? 0.25, displacementScale : 0, side : THREE.DoubleSide });
        for (const [key, map] of Object.entries (surface)) { if (!key.endsWith ('Map') || !map?.buffer) { continue; } const url = URL.createObjectURL (new Blob ([map.buffer], { type : map.mimeType || 'image/png' })); const texture = new THREE.TextureLoader ().load (url, () => URL.revokeObjectURL (url)); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set (map.scale?.x ?? 1, map.scale?.y ?? 1); texture.offset.set (map.offset?.x ?? 0, map.offset?.y ?? 0); texture.rotation = map.rotation || 0; if (key === 'diffuseMap') { texture.colorSpace = THREE.SRGBColorSpace; material.map = texture; } else if (key === 'specularMap') { texture.colorSpace = THREE.SRGBColorSpace; material.specularColorMap = texture; } else { material[key] = texture; } } return material; });
    object = new THREE.Group (); object.userData.materials = materials;
    for (const mesh of [...data.meshes.map (mesh => data.presentationMeshes?.find (display => display.name === mesh.name) || mesh), ...(data.visualMeshes || [])]) {
        if (mesh.triangles.length) {
            const positions = []; const normals = []; const uvs = []; const geometry = new THREE.BufferGeometry ();
            mesh.triangles.forEach (triangle => { const start = positions.length / 3; for (let i = 0; i < 3; i++) { positions.push (...mesh.vertices[triangle.vertices[i]]); normals.push (...mesh.normals[triangle.normals[i]]); uvs.push (...mesh.uvs[triangle.uvs[i]]); } geometry.addGroup (start, 3, triangle.material); });
            geometry.setAttribute ('position', new THREE.Float32BufferAttribute (positions, 3)); geometry.setAttribute ('normal', new THREE.Float32BufferAttribute (normals, 3)); geometry.setAttribute ('uv', new THREE.Float32BufferAttribute (uvs, 2)); const node = new THREE.Mesh (geometry, materials); node.name = mesh.name; object.add (node);
        }
        if (mesh.lines.length) { const positions = mesh.lines.flatMap (line => line.vertices.flatMap (index => mesh.vertices[index])); const geometry = new THREE.BufferGeometry (); geometry.setAttribute ('position', new THREE.Float32BufferAttribute (positions, 3)); const color = materials[mesh.lines[0].material].color; const material = new THREE.LineBasicMaterial ({ color }); object.userData.materials.push (material); object.add (new THREE.LineSegments (geometry, material)); }
    }
    scene.add (object); const box = new THREE.Box3 ().setFromObject (object); const center = box.getCenter (new THREE.Vector3 ()); const size = box.getSize (new THREE.Vector3 ()); const distance = Math.max (size.x, size.y, size.z) * 1.8;
    controls.target.copy (center); camera.position.copy (center).add (new THREE.Vector3 (0.45, 0.9, 0.65).normalize ().multiplyScalar (distance)); camera.lookAt (center); controls.update (); current = data;
    DrawCAD (); engineeringPanel?.Refresh ();
    status.textContent = (data.state === 'flat' ? 'Flat kraft dieline · CUT red / SCORE blue' : 'Folded FEFCO ' + data.parameters.code) + ' · Packaging module ' + PackagingModuleVersion;
}
function PreviewDimensions ()
{
    if (!current) { return null; }
    const result = { ...FefcoDimensions (current.parameters, tolerance), name : 'Packaging preview', code : current.parameters.code, basis : dimensionBasis, objectId : 'preview' };
    if (current.profile.engineering) { const e = EngineeringMeasurements (current.profile); result.inside = Object.fromEntries (e.dimensions.map (d => [d.id, d.insideMm])); result.outside = Object.fromEntries (e.dimensions.map (d => [d.id, d.outsideMm])); result.editable = false; result.editReason = 'Edit below in Measurement layer'; }
    return result;
}
const host = {
    appearance : () => ({ available : Boolean (current), settings : ValidateBoardAppearance (current?.profile.appearance) }),
    updateAppearance : changes => { const profile = { ...current.profile, appearance : ValidateBoardAppearance ({ ...ValidateBoardAppearance (current.profile.appearance), ...changes }) }; Show (current.state === 'flat' ? UnfoldFefco (current.parameters, profile) : CreateFefcoBox (current.parameters, profile)); },
    dimensions : () => PreviewDimensions (),
    convertGenerationBasis : ({ from, to, length, width, height }) => { const next = ValidateFefco ({ ...parameters, length, width, height }); const material = current?.parameters.code === next.code && current.profile.engineering ? EngineeringMeasurements (current.profile).material : DefaultEngineering (FefcoProfile (next), next.code).materials[0]; const dimensions = {}; for (const [axis, id] of ['length', 'width', 'height'].entries ()) { const score = ScoreForTarget ({ axis, basis : from, targetMm : next[id] }, material); if (to !== 'score') { ScoreForTarget ({ axis, basis : to, targetMm : 10000 }, material); } dimensions[id] = score + (to === 'inside' ? -material.insideFactors[axis] : to === 'outside' ? material.outsideFactors[axis] : 0) * next.thickness; } return { dimensions }; },
    dimensionMode : basis => { dimensionBasis = basis; panel.RefreshDimensions (); }, dimensionsBlocked : () => busy,
    updateDimensions : changes => { if (current.profile.engineering) { throw new Error ('Use the Measurement layer for engineering-linked dimensions.'); } const p = current.parameters; const desired = { ...FefcoDimensions (p, tolerance)[dimensionBasis] }; for (const key of ['length', 'width', 'height']) { if (changes[key] !== undefined) { desired[key] = changes[key]; } } const nextTolerance = changes.tolerance ?? tolerance; const next = ResolveFefcoDimensions ({ ...p, thickness : changes.thickness ?? p.thickness }, desired, dimensionBasis, nextTolerance); const data = current.state === 'flat' ? UnfoldFefco (next) : CreateFefcoBox (next); for (const role of ['liner', 'edge', 'inner', 'closed']) { data.materials[data.materials.findIndex (m => m.role === role)] = current.materials.find (m => m.role === role); } parameters = next; tolerance = nextTolerance; Show (data); },
    inspect : () => parameters, configure : changes => { parameters = ValidateFefco ({ ...parameters, ...changes }); panel.Refresh (); return parameters; },
    preset : (code, changes = {}) => {
        const { basis, ...fields } = changes; let next = FefcoPreset ({ ...parameters, ...fields }, code); let profile = FefcoProfile (next);
        if (basis && basis !== 'score') {
            const engineering = DefaultEngineering (profile, code); const record = panel.BoardRecords ().find (item => item.id === panel.newBoardSelect.value); const prior = current?.parameters.code === code && current.profile.engineering ? EngineeringMeasurements (current.profile).material : null;
            const material = { ...engineering.materials[0], ...(prior || {}), ...(record || {}), caliperMm : next.thickness, calibrated : prior?.calibrated ?? false };
            next = ValidateFefco ({ ...next, ...Object.fromEntries (['length', 'width', 'height'].map ((key, axis) => [key, ScoreForTarget ({ axis, basis, targetMm : next[key] }, material)])) });
            profile = FefcoProfile (next); engineering.materials[0] = material; engineering.activeMaterialId = material.id; engineering.dimensions.forEach (dimension => { dimension.basis = basis; }); profile.engineering = engineering;
        }
        const data = CreateFefcoBox (next, profile); parameters = next; tolerance = 0; Show (data);
    },
    generate : (changes = {}) => { const next = ValidateFefco ({ ...parameters, ...changes }); const data = CreateFefcoBox (next); parameters = next; tolerance = 0; Show (data); }, unfold : () => { if (!current || current.state === 'flat') { throw new Error ('Generate a folded box first.'); } const flat = UnfoldFefco (current.parameters, current.profile); for (const role of ['liner', 'edge', 'inner', 'closed']) { flat.materials[flat.materials.findIndex (item => item.role === role)] = current.materials.find (item => item.role === role); } Show (flat); },
    animate : async () => {
        if (!current) { throw new Error ('Generate a box first.'); } const original = current; const plan = FefcoAnimationPlan (current.parameters, current.state); const rig = CreateFefcoFoldRig (current.parameters, current.profile); const clearance = await InspectFefcoFold (rig, async progress => { status.textContent = 'Processing · checking folding surfaces · ' + Math.round (progress * 100) + '%'; await new Promise (resolve => setTimeout (resolve, 0)); }); if (!clearance.clear) { throw new Error ('Fold blocked: ' + clearance.intersections[0].panels.join (' / ')); } rig.materials = current.materials.filter (item => ['liner', 'edge'].includes (item.role)); Show (rig);
        const applyPose = progress => { const pose = FefcoFoldPose (rig, progress); object.children.forEach ((node, index) => { if (index < pose.matrices.length) { node.matrixAutoUpdate = false; node.matrix.fromArray (pose.displayMatrices[index]); } else { const mesh = pose.visualMeshes[index - pose.matrices.length]; const position = node.geometry.getAttribute ('position'); const normal = node.geometry.getAttribute ('normal'); const uv = node.geometry.getAttribute ('uv'); let at = 0; for (const triangle of mesh.triangles) { for (let c = 0; c < 3; c++) { position.setXYZ (at, ...mesh.vertices[triangle.vertices[c]]); normal.setXYZ (at, ...mesh.normals[triangle.normals[c]]); if (uv) { uv.setXY (at, ...mesh.uvs[triangle.uvs[c]]); } at++; } } position.needsUpdate = true; normal.needsUpdate = true; if (uv) { uv.needsUpdate = true; } node.geometry.computeBoundingSphere (); } }); object.updateMatrixWorld (true); return pose; };
        let radius = 0; for (const progress of [0, 0.22, 0.48, 0.72, 1]) { applyPose (progress); radius = Math.max (radius, new THREE.Box3 ().setFromObject (object).getBoundingSphere (new THREE.Sphere ()).radius); }
        applyPose (plan.from); const bounds = new THREE.Box3 ().setFromObject (object); let center = bounds.getCenter (new THREE.Vector3 ()); controls.target.copy (center); camera.position.copy (center).add (new THREE.Vector3 (0.45, 0.9, 0.65).normalize ().multiplyScalar (radius * 2.6)); controls.update ();
        playback = new FoldPlayback (progress => { const pose = applyPose (plan.from + (plan.to - plan.from) * progress); const next = new THREE.Box3 ().setFromObject (object).getCenter (new THREE.Vector3 ()); const delta = next.clone ().sub (center); controls.target.add (delta); camera.position.add (delta); center = next; const stage = plan.action === 'unfold' ? ({ 'closing top' : 'opening top', 'closing base' : 'opening base', 'erecting walls' : 'unwrapping walls' }[pose.stage] || pose.stage) : pose.stage; status.textContent = stage + ' · ' + Math.round (progress * 100) + '%'; panel.RefreshPlayback (); });
        try { const result = await playback.Start (); const next = { ...rig.parameters, closure : plan.targetClosure }; const data = result.completed ? (plan.targetState === 'flat' ? UnfoldFefco (next, original.profile) : CreateFefcoBox (next, original.profile)) : original; if (result.completed) { for (const role of ['liner', 'edge', 'inner', 'closed']) { data.materials[data.materials.findIndex (m => m.role === role)] = rig.materials.find (m => m.role === role); } } data.profile = original.profile; Show (data); } catch (error) { Show (original); throw error; }
    },
    animation : () => current ? FefcoAnimationPlan (current.parameters, current.state) : null,
    playback : () => playback?.Inspect () || { state : 'idle', progress : 0 }, control : action => { if (!playback) { throw new Error ('Start folding first.'); } if (action === 'pause') { playback.Pause (); } else if (action === 'resume') { playback.Resume (); } else { playback.Stop (); } panel.RefreshPlayback (); },
    factor : () => 1, blocked : () => busy, canUnfold : () => Boolean (current) && current.state !== 'flat', canAnimate : () => Boolean (current),
    run : async action => { if (busy) { return; } busy = true; panel.SetDisabled (); try { await action (); } catch (error) { status.textContent = error.message; } finally { busy = false; panel.Refresh (); engineeringPanel?.Refresh (); } }
};
const panel = new FefcoPanel (host, document.getElementById ('tools'));
const resizeObserver = new ResizeObserver (() => { const { width, height } = viewport.getBoundingClientRect (); renderer.setSize (width, height); camera.aspect = width / Math.max (height, 1); camera.updateProjectionMatrix (); }); resizeObserver.observe (viewport);
renderer.setAnimationLoop (() => { controls.update (); renderer.render (scene, camera); });

function DrawCAD ()
{
    const svg = document.getElementById ('cad'); if (!current) { return; } svg.replaceChildren ();
    const profile = current.profile; const points = profile.paths.flatMap (p => p.points); const xs = points.map (p => p[0]), ys = points.map (p => p[1]); const x = Math.min (...xs), y = Math.min (...ys), w = Math.max (...xs) - x, h = Math.max (...ys) - y; const size = w / 65; svg.setAttribute ('viewBox', [x - size * 3, -y - h - size * 3, w + size * 6, h + size * 6].join (' '));
    const make = (tag, attrs, text) => { const n = document.createElementNS (svg.namespaceURI, tag); for (const [key, value] of Object.entries (attrs)) { n.setAttribute (key, value); } if (text) { n.textContent = text; } svg.appendChild (n); return n; };
    for (const path of profile.paths) { make ('path', { d : path.points.map ((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + -p[1]).join (' ') + (path.closed ? 'Z' : ''), fill : path.type === 'cut' ? '#c4a47922' : 'none', stroke : path.type === 'cut' ? '#d96c69' : '#4f9cc9', 'stroke-width' : w / 900, 'stroke-dasharray' : path.type === 'score' ? '8 5' : '' }); }
    const report = EngineeringMeasurements ({ ...profile, engineering : profile.engineering || DefaultEngineering (profile, current.parameters.code) });
    if (report.state.visible) { for (const [i, d] of report.dimensions.entries ()) { const offset = size * (1.5 + i); const a = [d.a[0], -d.a[1] + offset], b = [d.b[0], -d.b[1] + offset]; make ('line', { x1 : a[0], y1 : a[1], x2 : b[0], y2 : b[1], stroke : '#a564d3', 'stroke-width' : w / 700 }); make ('text', { x : (a[0] + b[0]) / 2, y : (a[1] + b[1]) / 2 - size / 3, 'font-size' : size, fill : '#754395', 'text-anchor' : 'middle' }, d.id + ' ' + Number (d.valueMm.toFixed (4)) + ' ±' + Number (d.toleranceMm.toFixed (4)) + ' mm · ' + d.basis); } }
}
engineeringPanel = new EngineeringPanel ({
    inspect : () => { const profile = current?.profile || FefcoProfile (parameters); return EngineeringMeasurements ({ ...profile, engineering : profile.engineering || DefaultEngineering (profile, parameters.code) }); },
    update : changes => {
        if (!current) { throw new Error ('Generate a box first.'); }
        const edit = EditEngineering (current.profile, changes, current.parameters.code); const p = { ...current.parameters, thickness : edit.material.caliperMm };
        for (const dimension of edit.driving) { p[dimension.id] = ScoreForTarget (dimension, edit.material); }
        const next = ValidateFefco (p); const profile = { ...FefcoProfile (next), engineering : edit.engineering }; const data = current.state === 'flat' ? UnfoldFefco (next, profile) : CreateFefcoBox (next, profile); data.profile = profile; parameters = next; Show (data); return EngineeringMeasurements (profile);
    }, factor : () => 1, blocked : () => busy, run : action => host.run (action)
}, document.getElementById ('tools'));
