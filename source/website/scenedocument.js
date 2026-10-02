import * as THREE from 'three';
import { Model } from '../engine/model/model.js';
import { Node } from '../engine/model/node.js';
import { PhysicalMaterial, MaterialType, TextureMap } from '../engine/model/material.js';
import { Matrix } from '../engine/geometry/matrix.js';
import { Transformation } from '../engine/geometry/transformation.js';
import { Direction } from '../engine/geometry/geometry.js';

export function CloneSurface (material)
{
    const copy = new material.constructor ();
    for (const key of Object.keys (material)) {
        const value = material[key];
        if (value instanceof TextureMap) {
            copy[key] = Object.assign (new TextureMap (), value, { offset : value.offset.Clone (), scale : value.scale.Clone () });
        } else { copy[key] = value && value.Clone ? value.Clone () : value; }
    }
    return copy;
}

function EditableSurface (material)
{
    if (material.type !== MaterialType.Phong) { return CloneSurface (material); }
    // A common PBR workflow keeps imported CAD/mesh surfaces editable alongside GLBs.
    const result = new PhysicalMaterial ();
    const original = CloneSurface (material);
    for (const key of Object.keys (result)) {
        if (key !== 'type' && material[key] !== undefined) { result[key] = original[key]; }
    }
    result.roughness = material.shininess > 0 ? Math.min (1, Math.sqrt (2 / (material.shininess * 100 + 2))) : 1;
    return result;
}

export function CopyNodeTree (source, parent, meshMap)
{
    const node = new Node ();
    parent.AddChildNode (node);
    node.SetName (source.GetName ());
    if (source.gltfNodeIndex !== undefined) { node.gltfNodeIndex = source.gltfNodeIndex; }
    node.SetTransformation (source.GetTransformation ().Clone ());
    source.GetMeshIndices ().forEach ((index) => node.AddMeshIndex (meshMap.get (index)));
    source.GetChildNodes ().forEach ((child) => CopyNodeTree (child, node, meshMap));
    return node;
}

export class SceneDocument
{
    constructor ()
    {
        this.model = new Model ();
        this.objects = [];
        this.name = 'Untitled session';
    }

    AddImported (source, name, upVector = Direction.Y, promote = true)
    {
        if (!this.objects.length) { this.model.SetUnit (source.GetUnit ()); }
        const materialOffset = this.model.MaterialCount ();
        source.materials.forEach ((material) => this.model.AddMaterial (promote ? EditableSurface (material) : CloneSurface (material)));
        const meshes = new Map ();
        source.meshes.forEach ((mesh, index) => {
            const copy = mesh.Clone ();
            for (const item of [...copy.triangles, ...copy.lines]) {
                if (item.mat !== null) { item.mat += materialOffset; }
            }
            meshes.set (index, this.model.AddMesh (copy));
        });
        const node = new Node ();
        this.model.root.AddChildNode (node);
        node.SetName (name);
        const asset = CopyNodeTree (source.root, node, meshes);
        const orientation = new THREE.Matrix4 ();
        if (upVector === Direction.X) { orientation.makeRotationZ (Math.PI / 2); }
        else if (upVector === Direction.Z) { orientation.makeRotationX (-Math.PI / 2); }
        orientation.multiply (new THREE.Matrix4 ().fromArray (asset.GetTransformation ().GetMatrix ().Get ()));
        asset.SetTransformation (new Transformation (new Matrix (orientation.toArray ())));
        const object = { id : typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID () : 'object-' + Date.now () + '-' + Math.random (), name, source : name, visible : true, node, position : [0, 0, 0], rotation : [0, 0, 0], scale : [1, 1, 1] };
        object.unit = source.GetUnit ();
        this.objects.push (object);
        this.ApplyTransform (object);
        return object;
    }

    ApplyTransform (object)
    {
        const matrix = new THREE.Matrix4 ().compose (
            new THREE.Vector3 (...object.position),
            new THREE.Quaternion ().setFromEuler (new THREE.Euler (...object.rotation.map (THREE.MathUtils.degToRad))),
            new THREE.Vector3 (...object.scale)
        );
        object.node.SetTransformation (new Transformation (new Matrix (matrix.toArray ())));
        object.node.SetName (object.name);
    }

    Owner (instance)
    {
        if (!instance) { return null; }
        let node = instance.node;
        while (node) {
            const object = this.objects.find ((item) => item.node === node);
            if (object) { return object; }
            node = node.GetParent ();
        }
        return null;
    }

    Remove (object)
    {
        const index = this.objects.indexOf (object);
        if (index < 0) { return; }
        this.model.root.RemoveChildNode (object.node);
        this.objects.splice (index, 1);
    }

    Restore (object, index)
    {
        this.model.root.AddChildNode (object.node);
        // AddChildNode gives the object a fresh id; descendants keep their unique ids.
        this.model.root.childNodes.splice (this.model.root.childNodes.indexOf (object.node), 1);
        this.model.root.childNodes.splice (index, 0, object.node);
        this.objects.splice (index, 0, object);
    }

    CompactModel (objects = this.objects, local = false)
    {
        const result = new Model ();
        result.SetName (this.name);
        result.SetUnit (this.model.GetUnit ());
        this.model.CloneProperties (result);
        const meshMap = new Map ();
        const materialMap = new Map ();
        for (const object of objects) {
            object.node.EnumerateMeshIndices ((index) => {
                if (meshMap.has (index)) { return; }
                const copy = this.model.GetMesh (index).Clone ();
                for (const item of [...copy.triangles, ...copy.lines]) {
                    if (item.mat === null) { continue; }
                    if (!materialMap.has (item.mat)) { materialMap.set (item.mat, result.AddMaterial (CloneSurface (this.model.GetMaterial (item.mat)))); }
                    item.mat = materialMap.get (item.mat);
                }
                meshMap.set (index, result.AddMesh (copy));
            });
            const node = CopyNodeTree (object.node, result.root, meshMap);
            if (local) { node.SetTransformation (new Transformation ()); }
        }
        return result;
    }

    Duplicate (object)
    {
        const asset = this.CompactModel ([object], true);
        // Drop the session wrapper so the copy has one editable object origin.
        asset.root = asset.root.GetChildNode (0);
        const copy = this.AddImported (asset, object.name + ' copy', Direction.Y, false);
        copy.unit = object.unit; copy.hiddenParts = [...(object.hiddenParts || [])];
        if (object.animationAsset) { copy.animationAsset = object.animationAsset; copy.playback = { ...object.playback, playing : false }; }
        copy.position = [...object.position]; copy.rotation = [...object.rotation]; copy.scale = [...object.scale];
        let minX = Infinity; let maxX = -Infinity;
        asset.EnumerateVertices ((vertex) => { minX = Math.min (minX, vertex.x); maxX = Math.max (maxX, vertex.x); });
        copy.position[0] += Math.max ((maxX - minX) * Math.abs (copy.scale[0]) * 1.1, 0.01);
        this.ApplyTransform (copy);
        return copy;
    }
}

export class SceneHistory
{
    constructor () { this.undo = []; this.redo = []; }
    Push (command) { this.undo.push (command); if (this.undo.length > 50) { this.undo.shift (); } this.redo = []; }
    async Undo () { const command = this.undo.pop (); if (command) { await command.undo (); this.redo.push (command); } }
    async Redo () { const command = this.redo.pop (); if (command) { await command.redo (); this.undo.push (command); } }
}

