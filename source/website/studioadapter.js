import { Model } from '../engine/model/model.js';
import { Mesh } from '../engine/model/mesh.js';
import { Triangle } from '../engine/model/triangle.js';
import { Coord3D } from '../engine/geometry/coord3d.js';
import { Coord2D } from '../engine/geometry/coord2d.js';
import { PhysicalMaterial } from '../engine/model/material.js';
import { RGBColor } from '../engine/model/color.js';
import { Unit } from '../engine/model/unit.js';
import { CloneSurface } from './scenedocument.js';
import { GetBoxUVTriangle } from './materialuv.js';

const factors = { [Unit.Millimeter] : 1, [Unit.Centimeter] : 10, [Unit.Meter] : 1000, [Unit.Inch] : 25.4, [Unit.Foot] : 304.8 };
export const StudioMeshPrefix = 'studio:';

export function StudioUnitFactor (unit)
{
    const factor = factors[unit];
    if (!factor) { throw new Error ('Set known scene units before modeling with 3Dstudio.'); }
    return factor;
}

function ValidGeometry (data)
{
    const array = value => Array.isArray (value) || ArrayBuffer.isView (value) && !(value instanceof DataView);
    if (!data || !array (data.positions) || !array (data.normals) || !array (data.indices) || !array (data.materialIndices) || !Array.isArray (data.materials)) { throw new Error ('Invalid 3Dstudio geometry.'); }
    const vertices = data.positions.length / 3, triangles = data.indices.length / 3;
    if (data.statistics?.empty || vertices === 0 || triangles === 0) { throw new Error ('The operation produced an empty solid. Move or resize the cutter and try again.'); }
    if (data.statistics?.closed === false || !Number.isInteger (vertices) || !Number.isInteger (triangles) || vertices > 2000000 || triangles > 2000000 || data.normals.length !== data.positions.length || data.materialIndices.length !== triangles || !data.materials.length || data.materials.length > 64) { throw new Error ('Invalid or oversized 3Dstudio solid.'); }
    const every = (values, predicate) => { for (let i = 0; i < values.length; i++) { if (!predicate (values[i])) { return false; } } return true; };
    if (!every (data.positions, Number.isFinite) || !every (data.normals, Number.isFinite) || !every (data.indices, value => Number.isInteger (value) && value >= 0 && value < vertices) || !every (data.materialIndices, value => Number.isInteger (value) && value >= 0 && value < data.materials.length)) { throw new Error ('Invalid 3Dstudio mesh coordinates or indices.'); }
    const ids = new Set ();
    for (const material of data.materials) {
        if (!material || typeof material.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test (material.id) || ids.has (material.id) || !/^#[0-9a-fA-F]{6}$/.test (material.color) || ['roughness', 'metalness', 'opacity'].some (key => !Number.isFinite (material[key]) || material[key] < 0 || material[key] > 1)) { throw new Error ('Invalid 3Dstudio material provenance.'); }
        ids.add (material.id);
    }
}

function StudioMaterial (source)
{
    const material = new PhysicalMaterial (); material.name = source.name || '3Dstudio · ' + source.id;
    material.color = new RGBColor (...source.color.slice (1).match (/.{2}/g).map (part => parseInt (part, 16)));
    for (const key of ['roughness', 'metalness', 'opacity']) { material[key] = source[key]; }
    material.transparent = material.opacity < 1; material.doubleSided = false;
    return material;
}

// Every provenance role gets a stable mesh name. Advanced material names are
// user editable, so names on the materials themselves cannot identify a role.
export function StudioModel (data, unit)
{
    const factor = StudioUnitFactor (unit); ValidGeometry (data);
    const model = new Model (); model.SetUnit (unit);
    const roles = data.materials.map (source => {
        const material = StudioMaterial (source);
        const mesh = new Mesh (); mesh.SetName (StudioMeshPrefix + source.id);
        return { material, mesh, vertices : new Map (), materialIndex : null };
    });
    for (let triangle = 0; triangle < data.indices.length / 3; triangle++) {
        const role = roles[data.materialIndices[triangle]];
        if (role.materialIndex === null) { role.materialIndex = model.AddMaterial (role.material); }
        const indices = [];
        for (let corner = 0; corner < 3; corner++) {
            const index = data.indices[triangle * 3 + corner];
            if (!role.vertices.has (index)) {
                const point = index * 3;
                const mapped = role.mesh.AddVertex (new Coord3D (data.positions[point] / factor, data.positions[point + 1] / factor, data.positions[point + 2] / factor));
                role.mesh.AddNormal (new Coord3D (data.normals[point], data.normals[point + 1], data.normals[point + 2])); role.vertices.set (index, mapped);
            }
            indices.push (role.vertices.get (index));
        }
        role.mesh.AddTriangle (new Triangle (...indices).SetNormals (...indices).SetMaterial (role.materialIndex).SetCurve (0));
    }
    for (const role of roles) {
        if (!role.mesh.TriangleCount ()) { continue; }
        const bounds = { min : [Infinity, Infinity, Infinity], max : [-Infinity, -Infinity, -Infinity] };
        for (const vertex of role.mesh.vertices) { [vertex.x, vertex.y, vertex.z].forEach ((value, axis) => { bounds.min[axis] = Math.min (bounds.min[axis], value); bounds.max[axis] = Math.max (bounds.max[axis], value); }); }
        // Match the advanced material editor's box projection so preserved
        // texture maps remain mapped after a geometry/history rebuild.
        for (const triangle of role.mesh.triangles) {
            const points = [triangle.v0, triangle.v1, triangle.v2].map (index => { const vertex = role.mesh.GetVertex (index); return [vertex.x, vertex.y, vertex.z]; });
            triangle.SetTextureUVs (...GetBoxUVTriangle (points, bounds).map (uv => role.mesh.AddTextureUV (new Coord2D (...uv))));
        }
        model.AddMeshToRootNode (role.mesh);
    }
    return model;
}

// Sources can include both Boolean operands. A remap is explicit, rather than
// inferring the graph builder's collision-free ID naming convention.
export function PreserveStudioMaterials (model, definition, sources)
{
    const next = new Map (definition.nodes.filter (node => node.kind === 'primitive').map (node => [node.id, node.material]));
    const retained = {};
    for (const { model : previous, definition : oldDefinition, materials = {}, nodeIds = {}, materialChanges = {} } of sources) {
        const old = new Map (oldDefinition.nodes.filter (node => node.kind === 'primitive').map (node => [node.id, node.material]));
        const palette = { ...materials };
        for (const mesh of previous.meshes) {
            if (!mesh.GetName ().startsWith (StudioMeshPrefix) || !mesh.TriangleCount ()) { continue; }
            // Material edits in the main viewer always win over an old snapshot.
            palette[mesh.GetName ().slice (StudioMeshPrefix.length)] = previous.materials[mesh.GetTriangle (0).mat];
        }
        for (const [oldId, material] of Object.entries (palette)) {
            const id = Object.hasOwn (nodeIds, oldId) ? nodeIds[oldId] : oldId;
            if (!old.has (oldId) || !next.has (id)) { continue; }
            const replacement = model.meshes.find (item => item.GetName () === StudioMeshPrefix + id);
            const materialIndex = replacement?.TriangleCount () ? replacement.GetTriangle (0).mat : null;
            const generated = materialIndex === null ? StudioMaterial ({ ...next.get (id), id }) : model.materials[materialIndex];
            const copy = CloneSurface (material);
            for (const key of ['color', 'roughness', 'metalness', 'opacity']) { if (old.get (oldId)[key] !== next.get (id)[key] || Object.hasOwn (materialChanges, oldId) && materialChanges[oldId].includes (key)) { copy[key] = generated[key]; if (key === 'opacity') { copy.transparent = generated.transparent; } } }
            if (materialIndex === null) { retained[id] = copy; } else { model.materials[materialIndex] = copy; }
        }
    }
    // Only inactive primitive roles need a separate palette. The graph's
    // 64-node bound also bounds this palette; no historical geometry is stored.
    return retained;
}
