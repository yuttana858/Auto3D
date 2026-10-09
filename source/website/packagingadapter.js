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

export const PackagingUnitMM = { [Unit.Millimeter] : 1, [Unit.Centimeter] : 10, [Unit.Meter] : 1000, [Unit.Inch] : 25.4, [Unit.Foot] : 304.8 };
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
        if (surfaces[definition.role]) { model.AddMaterial (CloneSurface (surfaces[definition.role])); continue; }
        const material = new PhysicalMaterial (); material.name = definition.name; material.color = new RGBColor (...definition.color);
        for (const key of ['roughness', 'metalness', 'specularIntensity']) { if (definition[key] !== undefined) { material[key] = definition[key]; } }
        if (definition.diffuseMap) { material.diffuseMap = Object.assign (new TextureMap (), definition.diffuseMap); }
        model.AddMaterial (material);
    }
    for (const definition of data.meshes) {
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
    return { liner : model.materials[indices[0].index], edge : model.materials[(indices[1] || indices[0]).index] };
}
