import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { Model } from '../engine/model/model.js';
import { Mesh } from '../engine/model/mesh.js';
import { Triangle } from '../engine/model/triangle.js';
import { Line } from '../engine/model/line.js';
import { PhongMaterial, PhysicalMaterial, TextureMap, MaterialType } from '../engine/model/material.js';
import { Property, PropertyGroup, PropertyType } from '../engine/model/property.js';
import { RGBColor } from '../engine/model/color.js';
import { Coord2D } from '../engine/geometry/coord2d.js';
import { Coord3D } from '../engine/geometry/coord3d.js';
import { Node } from '../engine/model/node.js';
import { Matrix } from '../engine/geometry/matrix.js';
import { Transformation } from '../engine/geometry/transformation.js';
import { CheckModel } from '../engine/model/modelfinalization.js';
import { SceneDocument } from './scenedocument.js';

const TriangleKeys = ['v0', 'v1', 'v2', 'c0', 'c1', 'c2', 'n0', 'n1', 'n2', 'u0', 'u1', 'u2', 'mat', 'curve'];
const MaxArchiveBytes = 256 * 1024 * 1024;
export const LibraryCategories = ['Primary products', 'Retail shelf', 'Pallets', 'Accessories'];

export function EncodeBuffer (buffer)
{
    const bytes = new Uint8Array (buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i += 16384) { text += String.fromCharCode (...bytes.subarray (i, i + 16384)); }
    return btoa (text);
}

export function DecodeBuffer (text)
{
    const value = atob (text);
    return Uint8Array.from (value, (character) => character.charCodeAt (0)).buffer;
}

function PackMaterial (material)
{
    const result = {};
    for (const key of Object.keys (material)) {
        const value = material[key];
        result[key] = value instanceof TextureMap ? { ...value, buffer : value.buffer ? EncodeBuffer (value.buffer) : null } : value;
    }
    return result;
}

function ReadMaterial (data)
{
    const material = data.type === MaterialType.Phong ? new PhongMaterial () : new PhysicalMaterial ();
    if (Number.isInteger (data.gltfMaterialIndex)) { material.gltfMaterialIndex = data.gltfMaterialIndex; }
    for (const key of Object.keys (material)) {
        const value = data[key];
        if (value === undefined) { continue; }
        if (key.endsWith ('Map') && value) {
            const map = new TextureMap ();
            map.name = String (value.name || 'texture.png'); map.mimeType = value.mimeType || null;
            map.buffer = value.buffer ? DecodeBuffer (value.buffer) : null;
            map.offset = new Coord2D (value.offset.x, value.offset.y); map.scale = new Coord2D (value.scale.x, value.scale.y);
            map.rotation = value.rotation;
            if (![map.offset.x, map.offset.y, map.scale.x, map.scale.y, map.rotation].every (Number.isFinite)) { throw new Error ('Invalid texture transform.'); }
            material[key] = map;
        } else if (material[key] instanceof RGBColor) {
            if (!value || ![value.r, value.g, value.b].every ((component) => Number.isFinite (component) && component >= 0 && component <= 255)) { throw new Error ('Invalid material color.'); }
            material[key] = new RGBColor (value.r, value.g, value.b);
        }
        else if (typeof material[key] === 'number' && !Number.isFinite (value)) { throw new Error ('Invalid material value.'); }
        else if (typeof material[key] !== 'object' || value === null) { material[key] = value; }
    }
    return material;
}

function PackMesh (mesh)
{
    return {
        name : mesh.name, properties : mesh.propertyGroups,
        vertices : mesh.vertices.map ((point) => [point.x, point.y, point.z]),
        normals : mesh.normals.map ((point) => [point.x, point.y, point.z]),
        colors : mesh.vertexColors.map ((color) => [color.r, color.g, color.b]),
        uvs : mesh.uvs.map ((point) => [point.x, point.y]),
        triangles : mesh.triangles.map ((triangle) => TriangleKeys.map ((key) => triangle[key])),
        lines : mesh.lines.map ((line) => [line.vertices, line.mat])
    };
}

function ReadProperties (object, groups)
{
    for (const data of groups || []) {
        const group = new PropertyGroup (String (data.name));
        for (const property of data.properties || []) {
            const value = property.type === PropertyType.Color ? new RGBColor (property.value.r, property.value.g, property.value.b) : property.value;
            group.AddProperty (new Property (property.type, String (property.name), value));
        }
        object.AddPropertyGroup (group);
    }
}

function ReadVector (value, size)
{
    if (!Array.isArray (value) || value.length !== size || !value.every (Number.isFinite)) { throw new Error ('Invalid coordinates in session.'); }
    return [...value];
}

function PackNode (node)
{
    return { name : node.name, gltfNodeIndex : node.gltfNodeIndex, matrix : node.GetTransformation ().GetMatrix ().Get (), meshes : node.meshIndices, children : node.childNodes.map (PackNode) };
}

function ReadNode (data, parent, meshCount, depth = 0)
{
    if (depth > 128) { throw new Error ('Session hierarchy is too deep.'); }
    const node = new Node ();
    parent.AddChildNode (node); node.SetName (String (data.name));
    if (Number.isInteger (data.gltfNodeIndex)) { node.gltfNodeIndex = data.gltfNodeIndex; }
    node.SetTransformation (new Transformation (new Matrix (ReadVector (data.matrix, 16))));
    for (const index of data.meshes) {
        if (!Number.isInteger (index) || index < 0 || index >= meshCount) { throw new Error ('Invalid mesh reference.'); }
        node.AddMeshIndex (index);
    }
    data.children.forEach ((child) => ReadNode (child, node, meshCount, depth + 1));
    return node;
}

export function PackSession (document, view = {}, objects = document.objects, kind = 'session')
{
    const model = document.CompactModel (objects);
    return {
        format : 'SW Auto3D', version : 1, kind, name : document.name, view,
        objects : objects.map ((object) => ({ id : object.id, name : object.name, source : object.source, unit : object.unit, visible : object.visible, hiddenParts : object.hiddenParts || [], position : object.position, rotation : object.rotation, scale : object.scale, playback : object.playback, animationAsset : object.animationAsset ? { main : object.animationAsset.main, files : object.animationAsset.files.map ((file) => ({ name : file.name, buffer : EncodeBuffer (file.buffer) })) } : null })),
        model : { unit : model.unit, properties : model.propertyGroups, materials : model.materials.map (PackMaterial), meshes : model.meshes.map (PackMesh), nodes : model.root.childNodes.map (PackNode) }
    };
}

export function ReadSession (data)
{
    if (!data || data.format !== 'SW Auto3D' || data.version !== 1) { throw new Error ('This is not a supported Auto3D session.'); }
    if (!Array.isArray (data.objects) || data.objects.length > 1000 || data.objects.length !== data.model.nodes.length) { throw new Error ('Invalid object list.'); }
    const document = new SceneDocument ();
    const model = new Model ();
    model.unit = data.model.unit;
    ReadProperties (model, data.model.properties);
    data.model.materials.forEach ((material) => model.AddMaterial (ReadMaterial (material)));
    for (const item of data.model.meshes) {
        const mesh = new Mesh (); mesh.SetName (String (item.name)); ReadProperties (mesh, item.properties);
        item.vertices.forEach ((point) => mesh.AddVertex (new Coord3D (...ReadVector (point, 3))));
        item.normals.forEach ((point) => mesh.AddNormal (new Coord3D (...ReadVector (point, 3))));
        item.colors.forEach ((color) => mesh.AddVertexColor (new RGBColor (...ReadVector (color, 3))));
        item.uvs.forEach ((point) => mesh.AddTextureUV (new Coord2D (...ReadVector (point, 2))));
        item.triangles.forEach ((values) => {
            if (!Array.isArray (values) || values.length !== TriangleKeys.length) { throw new Error ('Invalid triangle.'); }
            if (values.some ((value) => value !== null && (!Number.isInteger (value) || value < 0))) { throw new Error ('Invalid triangle index.'); }
            const triangle = new Triangle (values[0], values[1], values[2]);
            TriangleKeys.forEach ((key, index) => { triangle[key] = values[index]; });
            mesh.AddTriangle (triangle);
        });
        item.lines.forEach ((line) => {
            if (!Array.isArray (line[0]) || line[0].length < 2 || line[0].some ((index) => !Number.isInteger (index) || index < 0 || index >= mesh.VertexCount ()) || !Number.isInteger (line[1]) || line[1] < 0 || line[1] >= model.MaterialCount ()) { throw new Error ('Invalid line reference.'); }
            mesh.AddLine (new Line (line[0]).SetMaterial (line[1]));
        });
        model.AddMesh (mesh);
    }
    const nodes = data.model.nodes.map ((node) => ReadNode (node, model.root, model.MeshCount ()));
    if (!CheckModel (model)) { throw new Error ('Session contains invalid geometry.'); }
    document.name = String (data.name || 'Untitled session'); document.model = model;
    const ids = new Set ();
    document.objects = data.objects.map ((data, index) => {
        const id = String (data.id);
        if (ids.has (id)) { throw new Error ('Repeated object id.'); } ids.add (id);
        const object = { id, name : String (data.name), source : String (data.source), visible : data.visible !== false, node : nodes[index], position : ReadVector (data.position, 3), rotation : ReadVector (data.rotation, 3), scale : ReadVector (data.scale, 3) };
        object.unit = Number.isInteger (data.unit) ? data.unit : model.unit;
        object.hiddenParts = Array.isArray (data.hiddenParts) ? data.hiddenParts.filter ((index) => Number.isInteger (index) && index >= 0) : [];
        if (data.animationAsset) {
            object.animationAsset = { main : String (data.animationAsset.main), files : data.animationAsset.files.map ((file) => ({ name : String (file.name), buffer : DecodeBuffer (file.buffer) })) };
            object.playback = { clip : Number.isInteger (data.playback?.clip) ? data.playback.clip : 0, time : Number.isFinite (data.playback?.time) ? Math.max (0, data.playback.time) : 0, speed : Number.isFinite (data.playback?.speed) ? Math.max (0.1, Math.min (4, data.playback.speed)) : 1, playing : false };
        }
        if (object.scale.some ((value) => Math.abs (value) < 1e-6)) { throw new Error ('An object has zero scale.'); }
        document.ApplyTransform (object);
        return object;
    });
    return { document, view : data.view || {}, kind : data.kind === 'model' ? 'model' : 'session' };
}

export function CreateSessionArchive (data)
{
    return zipSync ({ 'session.json' : strToU8 (JSON.stringify (data)) }, { level : 6 });
}

export function OpenSessionArchive (buffer)
{
    if (buffer.byteLength > MaxArchiveBytes) { throw new Error ('Session is larger than 256 MB.'); }
    const files = unzipSync (new Uint8Array (buffer), { filter : (entry) => {
        if (entry.originalSize > MaxArchiveBytes) { throw new Error ('Expanded session is larger than 256 MB.'); }
        return entry.name === 'session.json';
    } });
    if (!files['session.json']) { throw new Error ('Session file is missing.'); }
    return ReadSession (JSON.parse (strFromU8 (files['session.json'])));
}

