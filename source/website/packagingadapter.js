import { Model } from '../engine/model/model.js';
import { Mesh } from '../engine/model/mesh.js';
import { Triangle } from '../engine/model/triangle.js';
import { Line } from '../engine/model/line.js';
import { Coord3D } from '../engine/geometry/coord3d.js';
import { Coord2D } from '../engine/geometry/coord2d.js';
import { PhysicalMaterial, TextureMap } from '../engine/model/material.js';
import { RGBColor } from '../engine/model/color.js';
import { Unit } from '../engine/model/unit.js';
import { CloneSurface } from './scenedocument.js';
import { Matrix4, BufferGeometry, Float32BufferAttribute } from 'three';

export const PackagingUnitMM = { [Unit.Millimeter] : 1, [Unit.Centimeter] : 10, [Unit.Meter] : 1000, [Unit.Inch] : 25.4, [Unit.Foot] : 304.8 };
function PackagingTexture (definition)
{
    const map = Object.assign (new TextureMap (), definition);
    map.offset = new Coord2D (definition.offset?.x ?? 0, definition.offset?.y ?? 0);
    map.scale = new Coord2D (definition.scale?.x ?? 1, definition.scale?.y ?? 1);
    return map;
}
const inBrowser = typeof document !== 'undefined';
const entry = new URL (inBrowser ? './packaging/packaging.module.js' : '../../modules/packaging/src/index.js', import.meta.url);
if (inBrowser) { entry.search = new URL (import.meta.url).search; }
let modulePromise = null;
let attempts = 0;
export function LoadPackagingModule ()
{
    if (!modulePromise) {
        modulePromise = (async () => {
            if (inBrowser) {
                const css = new URL ('./packaging.module.css', entry); css.search = entry.search;
                await new Promise ((resolve, reject) => { const link = document.createElement ('link'); link.rel = 'stylesheet'; link.href = css.href; link.onload = resolve; link.onerror = () => { link.remove (); reject (new Error ('Unable to load Packaging styles. Open Packaging again to retry.')); }; document.head.appendChild (link); });
            }
            const url = new URL (entry); if (inBrowser && attempts > 0) { url.searchParams.set ('retry', String (attempts)); } attempts++;
            const module = await import (url.href); if (module.PackagingAPIVersion !== 1) { throw new Error ('Unsupported Packaging module API.'); } return module;
        })().catch (error => { modulePromise = null; throw error; });
    }
    return modulePromise;
}
export function PackagingModel (data, unit = Unit.Millimeter, surfaces = {})
{
    const factor = PackagingUnitMM[unit]; if (!factor) { throw new Error ('Set known scene units before adding packaging geometry.'); }
    const model = new Model (); model.SetUnit (unit);
    for (const definition of data.materials) {
        if (surfaces[definition.role]) {
            const material = CloneSurface (surfaces[definition.role]); material.boardSurfaceRole = definition.role;
            if (material.boardFluteLinked) { for (const key of ['normalMap', 'bumpMap']) { if (definition[key]) { material[key] = PackagingTexture (definition[key]); } } }
            // Rebuild recognized default edge pixels when measured paper layers
            // change, retaining authored maps and all existing UV adjustments.
            if (definition.role === 'edge') {
                for (const [key, map] of Object.entries (definition)) {
                    const previous = material[key];
                    if (!key.endsWith ('Map') || !map || previous?.name !== map.name || !/^corrugated-edge(?:-[a-z]+)?\.png$/.test (previous.name)) { continue; }
                    material[key] = PackagingTexture ({ ...map, offset : previous.offset, scale : previous.scale, rotation : previous.rotation });
                }
            }
            model.AddMaterial (material); continue;
        }
        const material = new PhysicalMaterial (); material.name = definition.name; material.color = new RGBColor (...definition.color);
        material.boardFluteLinked = definition.boardFluteLinked === true; material.boardSurfaceRole = definition.role;
        for (const key of ['roughness', 'metalness', 'specularIntensity', 'bumpScale', 'normalScale', 'aoIntensity', 'displacementScale']) { if (definition[key] !== undefined) { material[key] = definition[key]; } }
        for (const [key, map] of Object.entries (definition)) { if (key.endsWith ('Map') && map) { material[key] = PackagingTexture (map); } }
        model.AddMaterial (material);
    }
    for (const definition of [...data.meshes, ...(data.visualMeshes || [])]) {
        if (!definition.triangles.length && !definition.lines.length) { continue; }
        const mesh = new Mesh (); mesh.SetName (definition.name);
        definition.vertices.forEach (point => mesh.AddVertex (new Coord3D (...point.map (value => value / factor)))); definition.normals.forEach (normal => mesh.AddNormal (new Coord3D (...normal))); definition.uvs.forEach (uv => mesh.AddTextureUV (new Coord2D (...uv)));
        definition.triangles.forEach (triangle => mesh.AddTriangle (new Triangle (...triangle.vertices).SetNormals (...triangle.normals).SetTextureUVs (...triangle.uvs).SetMaterial (triangle.material).SetCurve (0)));
        definition.lines.forEach (line => mesh.AddLine (new Line (line.vertices).SetMaterial (line.material)));
        model.AddMeshToRootNode (mesh);
    }
    return model;
}
export async function CreateFefcoModel (input, unit = Unit.Millimeter) { const module = await LoadPackagingModule (); return PackagingModel (module.CreateFefcoBox (input), unit); }
export async function CreatePackagingModel (profile, unit = Unit.Millimeter) { const module = await LoadPackagingModule (); return PackagingModel (module.CreateBoard (profile), unit); }

export function ApplyFefcoFoldPose (root, rig, pose, unit)
{
    const factor = PackagingUnitMM[unit]; const matrices = new Map (rig.panels.map ((panel, index) => { const values = [...pose.matrices[index]]; for (const axis of [12, 13, 14]) { values[axis] /= factor; } return [panel.name, values]; }));
    const visuals = new Map ((pose.visualMeshes || []).map (mesh => [mesh.name, mesh]));
    root.traverse (item => { if (item.isMesh && visuals.has (item.name)) { const data = visuals.get (item.name); const positions = item.geometry.getAttribute ('position'); const normals = item.geometry.getAttribute ('normal'); const uvs = item.geometry.getAttribute ('uv'); let i = 0; for (const triangle of data.triangles) { for (let corner = 0; corner < 3; corner++) { positions.setXYZ (i, ...data.vertices[triangle.vertices[corner]].map (value => value / factor)); normals.setXYZ (i, ...data.normals[triangle.normals[corner]]); if (uvs) { uvs.setXY (i, ...data.uvs[triangle.uvs[corner]]); } i++; } } positions.needsUpdate = true; normals.needsUpdate = true; if (uvs) { uvs.needsUpdate = true; } item.geometry.computeBoundingSphere (); } else if (item.isMesh && matrices.has (item.name)) { item.matrixAutoUpdate = false; item.matrix.copy (new Matrix4 ().fromArray (matrices.get (item.name))); } }); root.updateMatrixWorld (true);
}

export function FefcoSurfaces (model)
{
    // The large board faces identify the current liner even if the user renamed it.
    const area = model.materials.map (() => 0);
    for (const mesh of model.meshes) { for (const triangle of mesh.triangles) {
        const [a, b, c] = [triangle.v0, triangle.v1, triangle.v2].map (index => mesh.vertices[index]);
        const u = [b.x - a.x, b.y - a.y, b.z - a.z]; const v = [c.x - a.x, c.y - a.y, c.z - a.z];
        area[triangle.mat] += Math.hypot (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    } }
    const indices = area.map ((value, index) => ({ value, index })).sort ((a, b) => b.value - a.value).filter (item => item.value > 0);
    if (!indices.length) { throw new Error ('The selected box has no board material.'); }
    const tagged = Object.fromEntries (model.materials.filter (material => material.boardSurfaceRole).map (material => [material.boardSurfaceRole, material]));
    return { liner : tagged.liner || model.materials[indices[0].index], edge : tagged.edge || model.materials[(indices[1] || indices[0]).index], ...(tagged.inner ? { inner : tagged.inner } : {}), ...(tagged.closed ? { closed : tagged.closed } : {}) };
}

// Replace GPU buffers only. Engine meshes remain the canonical source for CAD,
// archives, manufacturing exports, quantities and array spacing.
export function ApplyPackagingPresentation (root, data, unit, materials = [], foldPreview = false, geometryCache = null)
{
    const factor = PackagingUnitMM[unit]; if (!factor) { return; }
    const definitions = new Map ([...(data.presentationMeshes || []), ...(data.visualMeshes || [])].map (mesh => [mesh.name, mesh]));
    // A saved pre-1.7.2 crease has only edge/inner/closed slots. Resolve any
    // newly required facing from this object's own panel materials, never by
    // treating a definition's material index as an existing GPU slot index.
    const available = new Map ();
    root.traverse (item => {
        if (!item.isMesh || (item.userData.auto3dFoldPresentation && !foldPreview)) { return; }
        const gpu = Array.isArray (item.material) ? item.material : [item.material];
        (item.userData.originalMaterials || []).forEach ((id, slot) => {
            const role = materials[id]?.boardSurfaceRole;
            if (role && gpu[slot] && !available.has (role)) { available.set (role, { id, material : gpu[slot] }); }
        });
    });
    root.traverse (item => {
        const mesh = definitions.get (item.name); if (!item.isMesh || (item.userData.auto3dFoldPresentation && !foldPreview) || !mesh || (!mesh.presentationOnly && !mesh.visualOnly && !item.userData.auto3dBoardAppearance)) { return; }
        const ids = [...(item.userData.originalMaterials || [])];
        const roles = ids.map (index => materials[index]?.boardSurfaceRole);
        const gpu = Array.isArray (item.material) ? [...item.material] : [item.material];
        for (const role of new Set (mesh.triangles.map (triangle => data.materials[triangle.material]?.role))) {
            const source = available.get (role);
            if (!role || roles.includes (role) || !source) { continue; }
            roles.push (role); ids.push (source.id); gpu.push (source.material);
        }
        if (ids.length !== (item.userData.originalMaterials || []).length) { item.userData.originalMaterials = ids; item.material = gpu; }
        const cacheKey = JSON.stringify ([factor, roles, Array.isArray (item.material) ? item.material.length : 1]); let shared = geometryCache?.get (mesh);
        if (geometryCache && !shared) { shared = new Map (); geometryCache.set (mesh, shared); }
        const cached = shared?.get (cacheKey);
        if (cached) { if (item.geometry !== cached) { item.geometry.dispose (); item.geometry = cached; } item.userData.auto3dBoardAppearance = mesh.presentationOnly === true || mesh.visualOnly === true; return; }
        const positions = [], normals = [], uvs = []; const geometry = new BufferGeometry ();
        for (const triangle of mesh.triangles) {
            const role = data.materials[triangle.material]?.role; let material = roles.indexOf (role); if (material < 0) { material = roles.indexOf (role === 'inner' || role === 'closed' ? 'liner' : role); } if (material < 0) { material = Math.max (0, Math.min (triangle.material, (Array.isArray (item.material) ? item.material.length : 1) - 1)); }
            const start = positions.length / 3; for (let i = 0; i < 3; i++) { positions.push (...mesh.vertices[triangle.vertices[i]].map (value => value / factor)); normals.push (...mesh.normals[triangle.normals[i]]); uvs.push (...mesh.uvs[triangle.uvs[i]]); }
            const last = geometry.groups.at (-1); if (last && last.materialIndex === material) { last.count += 3; } else { geometry.addGroup (start, 3, material); }
        }
        geometry.setAttribute ('position', new Float32BufferAttribute (positions, 3)); geometry.setAttribute ('normal', new Float32BufferAttribute (normals, 3)); geometry.setAttribute ('uv', new Float32BufferAttribute (uvs, 2));
        geometry.computeBoundingSphere (); geometry.computeBoundingBox (); shared?.set (cacheKey, geometry); item.geometry.dispose (); item.geometry = geometry; item.userData.auto3dBoardAppearance = mesh.presentationOnly === true || mesh.visualOnly === true;
    });
}
export async function PreparePackagingPresentations (objects, materials, unit)
{
    if (!objects.some (object => object.packagingProfile)) { return; }
    const module = await LoadPackagingModule (); const cache = new Map (), geometryCache = new WeakMap ();
    for (const object of objects) {
        if (!object.packagingProfile || !object.threeObject) { continue; }
        const profile = object.packagingProfile, parameters = object.userData?._auto3dFefco ? JSON.parse (object.userData._auto3dFefco) : null;
        const flat = object.userData?._auto3dPackagingState === 'flat'; let localRig = false; object.threeObject.traverse (mesh => { if (mesh.name === 'Left wall') { localRig = true; } });
        if (parameters) { const expected = module.FefcoProfile (parameters); if (JSON.stringify (expected.paths) !== JSON.stringify (profile.paths) || expected.thickness !== profile.thickness) { continue; } }
        const key = JSON.stringify ([profile, parameters, flat, localRig]);
        let data = cache.get (key); if (!data) { data = parameters ? flat ? localRig ? module.CreateFefcoFoldRig (parameters, profile) : module.UnfoldFefco (parameters, profile) : module.CreateFefcoBox (parameters, profile) : module.CreateBoard (profile, { textured : true }); cache.set (key, data); }
        ApplyPackagingPresentation (object.threeObject, data, unit, materials, false, geometryCache);
    }
}
export function BoardAppearanceMaterialChanges (document, object, definitions)
{
    const ids = new Set (); document.model.EnumerateMeshInstances (instance => { if (document.Owner (instance) === object) { instance.GetMesh ().triangles.forEach (triangle => ids.add (triangle.mat)); } });
    const changes = [];
    for (const id of ids) {
        const material = document.model.materials[id]; const legacy = material.diffuseMap?.name === 'kraft-fiber.png' ? 'liner' : material.diffuseMap?.name === 'corrugated-edge.png' ? 'edge' : ''; const definition = definitions.find (item => item.role === (material.boardSurfaceRole || legacy)); if (!definition) { continue; }
        const before = CloneSurface (material), after = CloneSurface (material); let changed = false;
        for (const [key, map] of Object.entries (definition)) {
            if (!key.endsWith ('Map') || !map || !material[key]?.name || !/^(?:(kraft-fiber|inner-kraft-fiber|closed-kraft-fiber|corrugated-edge)(-(color|normal|bump|roughness|metalness|specular|ao|height))?|board-((liner|inner|closed)-)?flute-(normal|bump))\.png$/.test (material[key].name)) { continue; }
            after.boardSurfaceRole = definition.role; after[key] = PackagingTexture ({ ...map, offset : material[key].offset, scale : material[key].scale, rotation : material[key].rotation }); changed = true;
        }
        if (changed) { changes.push ({ material, before, after }); }
    }
    return changes;
}
