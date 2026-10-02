import * as assert from 'node:assert';
import * as THREE from 'three';
import { SceneDocument, SceneHistory } from '../../source/website/scenedocument.js';
import { PackSession, ReadSession, CreateSessionArchive, OpenSessionArchive } from '../../source/website/sessionarchive.js';
import { Model } from '../../source/engine/model/model.js';
import { Node } from '../../source/engine/model/node.js';
import { Mesh } from '../../source/engine/model/mesh.js';
import { Triangle } from '../../source/engine/model/triangle.js';
import { Coord3D } from '../../source/engine/geometry/coord3d.js';
import { PhongMaterial, PhysicalMaterial, MaterialType, TextureMap } from '../../source/engine/model/material.js';
import { GetBoundingBox } from '../../source/engine/model/modelutils.js';
import { Direction } from '../../source/engine/geometry/geometry.js';
import { Unit } from '../../source/engine/model/unit.js';
import { DisplayLength } from '../../source/website/preferences.js';
import { AnimationPlayer } from '../../source/website/sessionanimation.js';

function Asset (material = new PhysicalMaterial ())
{
    const model = new Model (); model.AddMaterial (material); model.SetUnit (Unit.Meter);
    const mesh = new Mesh (); [[0, 0, 0], [2, 0, 0], [0, 1, 0]].forEach ((point) => mesh.AddVertex (new Coord3D (...point))); mesh.AddNormal (new Coord3D (0, 0, 1)); mesh.AddTriangle (new Triangle (0, 1, 2).SetNormals (0, 0, 0).SetMaterial (0).SetCurve (0)); model.AddMesh (mesh);
    const branch = new Node (); branch.SetName ('parent'); model.root.AddChildNode (branch); const child = new Node (); branch.AddChildNode (child); child.AddMeshIndex (0); child.gltfNodeIndex = 7; return model;
}

export default function suite ()
{
    describe ('Multi-object sessions', () => {
        it ('Keeps ownership and unique node IDs across imports, duplicate and restore', () => {
            const scene = new SceneDocument (); const first = scene.AddImported (Asset (), 'one'); const second = scene.AddImported (Asset (), 'two'); const third = scene.Duplicate (first);
            scene.Remove (second); scene.Restore (second, 1);
            const ids = []; scene.model.root.Enumerate ((node) => ids.push (node.id)); assert.equal (new Set (ids).size, ids.length);
            const owners = []; scene.model.EnumerateMeshInstances ((instance) => owners.push (scene.Owner (instance))); assert.deepEqual (owners, [first, second, third]);
            scene.model.materials[0].roughness = 0.2; assert.equal (scene.model.materials[1].roughness, 1); assert.equal (scene.model.materials[2].roughness, 1);
        });
        it ('Promotes CAD surfaces to valid physical materials alongside GLB surfaces', () => {
            const scene = new SceneDocument (); scene.AddImported (Asset (new PhongMaterial ()), 'CAD'); assert.equal (scene.model.materials[0].type, MaterialType.Physical); assert.ok (scene.model.materials[0].roughness > 0);
        });
        it ('Applies world transforms and compacts away removed geometry', () => {
            const scene = new SceneDocument (); const first = scene.AddImported (Asset (), 'one'); const second = scene.AddImported (Asset (), 'two'); first.position = [10, 3, 0]; first.scale = [2, 1, 1]; scene.ApplyTransform (first); scene.Remove (second);
            const compact = scene.CompactModel (); const bounds = GetBoundingBox (compact); assert.equal (compact.MeshCount (), 1); assert.equal (compact.MaterialCount (), 1); assert.equal (bounds.min.x, 10); assert.equal (bounds.max.x, 14);
        });
        it ('Round-trips visibility, transforms, textured materials and original animation data', () => {
            const surface = new PhysicalMaterial (); surface.gltfMaterialIndex = 3; surface.diffuseMap = new TextureMap (); surface.diffuseMap.name = 'pixel.png'; surface.diffuseMap.buffer = new Uint8Array ([0, 128, 255]).buffer; surface.bumpScale = 0.7;
            const scene = new SceneDocument (); const object = scene.AddImported (Asset (surface), 'animated.glb'); object.position = [2, 3, 4]; object.visible = false; scene.ApplyTransform (object);
            object.animationAsset = { main : 'animated.glb', files : [{ name : 'animated.glb', buffer : new Uint8Array ([1, 2, 255]).buffer }] }; object.playback = { clip : 1, time : 0.5, speed : 2, playing : true };
            const reopened = OpenSessionArchive (CreateSessionArchive (PackSession (scene)));
            assert.deepEqual (reopened.document.objects[0].position, [2, 3, 4]); assert.equal (reopened.document.objects[0].visible, false); assert.equal (reopened.document.objects[0].playback.playing, false); assert.equal (reopened.document.objects[0].playback.time, 0.5);
            assert.deepEqual (new Uint8Array (reopened.document.objects[0].animationAsset.files[0].buffer), new Uint8Array ([1, 2, 255])); assert.deepEqual (new Uint8Array (reopened.document.model.materials[0].diffuseMap.buffer), new Uint8Array ([0, 128, 255])); assert.equal (reopened.document.model.materials[0].gltfMaterialIndex, 3); assert.equal (reopened.document.model.materials[0].bumpScale, 0.7);
            let importedIndex; reopened.document.model.root.Enumerate ((node) => { if (node.gltfNodeIndex !== undefined) { importedIndex = node.gltfNodeIndex; } }); assert.equal (importedIndex, 7);
        });
        it ('Rejects corrupted references, repeated IDs and nonfinite transforms', () => {
            const scene = new SceneDocument (); scene.AddImported (Asset (), 'one'); scene.AddImported (Asset (), 'two'); const data = PackSession (scene);
            data.objects[1].id = data.objects[0].id; assert.throws (() => ReadSession (data), /Repeated/); data.objects[1].id = 'new'; data.objects[0].position[0] = Infinity; assert.throws (() => ReadSession (data), /coordinates/); data.objects[0].position[0] = 0; data.model.meshes[0].triangles[0][0] = 10000; assert.throws (() => ReadSession (data), /geometry/);
        });
        it ('Undo and redo keep the order and clear redo after another object edit', async () => {
            const history = new SceneHistory (); let value = 1; history.Push ({ undo : () => { value = 0; }, redo : () => { value = 1; } }); await history.Undo (); assert.equal (value, 0); await history.Redo (); assert.equal (value, 1); await history.Undo (); history.Push ({ undo : () => {}, redo : () => {} }); assert.equal (history.redo.length, 0);
        });
        it ('Converts declared units while leaving unspecified dimensions explicit', () => {
            assert.equal (DisplayLength (0.0254, Unit.Meter, 'standard'), '1 in'); assert.equal (DisplayLength (1, Unit.Inch, 'metric'), '25.4 mm'); assert.equal (DisplayLength (7, Unit.Unknown, 'metric'), '7 model units');
        });
        it ('Seeks skeletal/morph-compatible tracks and exports distinct UUID targets', () => {
            const root = new THREE.Group (); const target = new THREE.Object3D (); target.name = 'part'; root.add (target);
            const clip = new THREE.AnimationClip ('Move', 1, [new THREE.VectorKeyframeTrack ('part.position', [0, 1], [0, 0, 0, 4, 0, 0])]); const object = { name : 'one' }; const player = new AnimationPlayer (object, root, [clip], () => {});
            player.Seek (0.5); assert.equal (target.position.x, 2); assert.equal (player.state.time, 0.5); const track = player.ExportClips ()[0].tracks[0]; assert.equal (track.name, target.uuid + '.position'); player.Dispose ();
        });
    });
}

