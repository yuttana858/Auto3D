import * as assert from 'node:assert';
import * as THREE from 'three';
import { SceneDocument, SceneHistory } from '../../source/website/scenedocument.js';
import { PackSession, ReadSession, CreateSessionArchive, OpenSessionArchive, MigrateSessionData, SessionVersion } from '../../source/website/sessionarchive.js';
import { Model } from '../../source/engine/model/model.js';
import { Node } from '../../source/engine/model/node.js';
import { Mesh } from '../../source/engine/model/mesh.js';
import { Triangle } from '../../source/engine/model/triangle.js';
import { Coord3D } from '../../source/engine/geometry/coord3d.js';
import { PhongMaterial, PhysicalMaterial, MaterialType, TextureMap } from '../../source/engine/model/material.js';
import { GetBoundingBox } from '../../source/engine/model/modelutils.js';
import { Direction } from '../../source/engine/geometry/geometry.js';
import { Unit } from '../../source/engine/model/unit.js';
import { DisplayLength, DisplaySizeFromScale, ScaleFromDisplaySize, UnitFactor } from '../../source/website/preferences.js';
import { AnimationPlayer } from '../../source/website/sessionanimation.js';
import { SessionTimeline } from '../../source/website/sessiontimeline.js';
import { ArrayOffset, DropToFloorDelta } from '../../source/website/sessioneditor.js';
import { RecoveryArchiveBuffer, NormalizeLibraryPath, LibraryPathParent, RenameLibraryPath } from '../../source/website/modellibrary.js';

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
            object.animationAsset = { main : 'animated.glb', files : [{ name : 'animated.glb', buffer : new Uint8Array ([1, 2, 255]).buffer }] }; object.playback = { clip : 1, time : 0.5, speed : 2, playing : true, loop : false };
            const reopened = OpenSessionArchive (CreateSessionArchive (PackSession (scene)));
            assert.deepEqual (reopened.document.objects[0].position, [2, 3, 4]); assert.equal (reopened.document.objects[0].visible, false); assert.equal (reopened.document.objects[0].playback.playing, true); assert.equal (reopened.document.objects[0].playback.loop, false); assert.equal (reopened.document.objects[0].playback.time, 0.5);
            assert.deepEqual (new Uint8Array (reopened.document.objects[0].animationAsset.files[0].buffer), new Uint8Array ([1, 2, 255])); assert.deepEqual (new Uint8Array (reopened.document.model.materials[0].diffuseMap.buffer), new Uint8Array ([0, 128, 255])); assert.equal (reopened.document.model.materials[0].gltfMaterialIndex, 3); assert.equal (reopened.document.model.materials[0].bumpScale, 0.7);
            const view = { backgroundPreset : 'outdoor', horizonGradient : true, showGroundGrid : false, lighting : { mode : 'hdri', environment : 'studio_small_09', background : true, brightness : 1.25, rotation : 35, elevation : -10, effects : { environmentIntensity : 0.8, modelReflections : true, modelReflectionIntensity : 0.6 } } }; const packedView = PackSession (scene, view); assert.deepEqual (packedView.view, view); assert.equal (packedView.model.materials[0].specularIntensity, surface.specularIntensity);
            let importedIndex; reopened.document.model.root.Enumerate ((node) => { if (node.gltfNodeIndex !== undefined) { importedIndex = node.gltfNodeIndex; } }); assert.equal (importedIndex, 7);
        });
        it ('Round-trips object user data, shadow flags and keyframes in session schema v5', () => {
            const scene = new SceneDocument (); const object = scene.AddImported (Asset (), 'one');
            object.userData = { SKU : 'PKG-001', Notes : 'Primary bottle' };
            object.castShadow = false; object.receiveShadow = true;
            const reopened = OpenSessionArchive (CreateSessionArchive (PackSession (scene)));
            assert.deepEqual (reopened.document.objects[0].userData, object.userData);
            assert.equal (reopened.document.objects[0].castShadow, false);
            assert.equal (reopened.document.objects[0].receiveShadow, true);
            const legacy = PackSession (scene); legacy.version = 2; delete legacy.objects[0].userData; delete legacy.objects[0].castShadow; delete legacy.objects[0].receiveShadow;
            const migrated = ReadSession (legacy).document.objects[0];
            assert.deepEqual (migrated.userData, {});
            assert.equal (migrated.castShadow, true);
            assert.equal (migrated.receiveShadow, true);
        });

        it ('Round-trips native object and camera timeline data', () => {
            const scene = new SceneDocument (); const object = scene.AddImported (Asset (), 'one');
            object.keyframes = [
                { id : 'start', time : 0, interpolation : 'smooth', position : [0, 0, 0], rotation : [0, 350, 0], scale : [1, 1, 1] },
                { id : 'end', time : 2, interpolation : 'linear', position : [10, 0, 0], rotation : [0, 10, 0], scale : [2, 2, 2] }
            ];
            const timeline = { version : 1, duration : 4, time : 1, loop : true, interpolation : 'smooth', cameraKeyframes : [{ id : 'cam', time : 1, interpolation : 'smooth', eye : [5, 4, 3], center : [0, 0, 0], up : [0, 1, 0], fov : 40, distance : 7.071, azimuth : 59.0, elevation : 34.4 }] };
            const reopened = OpenSessionArchive (CreateSessionArchive (PackSession (scene, { timeline })));
            assert.equal (reopened.document.objects[0].keyframes.length, 2);
            assert.deepEqual (reopened.document.objects[0].keyframes[1].position, [10, 0, 0]);
            assert.deepEqual (reopened.view.timeline, timeline);
        });
        it ('Tweens native transform and camera keyframes smoothly', () => {
            const object = { keyframes : [
                { id : 'a', time : 0, interpolation : 'linear', position : [0, 0, 0], rotation : [0, 350, 0], scale : [1, 1, 1] },
                { id : 'b', time : 2, interpolation : 'linear', position : [10, 0, 0], rotation : [0, 10, 0], scale : [3, 3, 3] }
            ] };
            const timeline = new SessionTimeline ({ document : { objects : [object] }, website : { viewer : {} } });
            timeline.cameraKeyframes = [
                { id : 'c1', time : 0, interpolation : 'smooth', eye : [0, 0, 10], center : [0, 0, 0], up : [0, 1, 0], fov : 30 },
                { id : 'c2', time : 2, interpolation : 'smooth', eye : [10, 0, 0], center : [0, 0, 0], up : [0, 1, 0], fov : 50 }
            ];
            const state = timeline.ObjectStateAt (object, 1);
            assert.deepEqual (state.position, [5, 0, 0]); assert.deepEqual (state.scale, [2, 2, 2]); assert.ok (Math.abs (state.rotation[1]) < 1e-6);
            const camera = timeline.CameraStateAt (1);
            assert.deepEqual (camera.eye, [5, 0, 5]); assert.equal (camera.fov, 40);
        });
        it ('Computes touching W/L/H array offsets and floor deltas', () => {
            const size = new THREE.Vector3 (2, 3, 4);
            assert.deepEqual (ArrayOffset (size, 2, 1, 3), [4, 9, 4]);
            const box = new THREE.Box3 (new THREE.Vector3 (-2, -5, -7), new THREE.Vector3 (6, 8, 9));
            assert.deepEqual (DropToFloorDelta (box, { direction : Direction.Y, isFlipped : false }), [0, 5, 0]);
            assert.deepEqual (DropToFloorDelta (box, { direction : Direction.Z, isFlipped : true }), [0, 0, -9]);
            assert.deepEqual (DropToFloorDelta (box, { direction : Direction.X, isFlipped : false }), [2, 0, 0]);
        });

        it ('Writes the current schema and migrates v1 sessions forward', () => {
            const scene = new SceneDocument (); scene.AddImported (Asset (), 'one');
            const current = PackSession (scene); assert.equal (current.version, SessionVersion); assert.ok (current.metadata.savedAt);
            const legacy = { ...current, version : 1 }; delete legacy.metadata;
            const migrated = MigrateSessionData (legacy); assert.equal (migrated.version, SessionVersion); assert.equal (migrated.metadata.migratedFrom, 1);
            assert.equal (ReadSession (legacy).document.objects.length, 1);
            assert.throws (() => ReadSession ({ ...current, version : SessionVersion + 1 }), /newer application version/);
        });
        it ('Rejects corrupted references, repeated IDs and nonfinite transforms', () => {
            const scene = new SceneDocument (); scene.AddImported (Asset (), 'one'); scene.AddImported (Asset (), 'two'); const data = PackSession (scene);
            data.objects[1].id = data.objects[0].id; assert.throws (() => ReadSession (data), /Repeated/); data.objects[1].id = 'new'; data.objects[0].position[0] = Infinity; assert.throws (() => ReadSession (data), /coordinates/); data.objects[0].position[0] = 0; data.model.meshes[0].triangles[0][0] = 10000; assert.throws (() => ReadSession (data), /geometry/);
        });
        it ('Normalizes recovery checkpoint Blob, ArrayBuffer and typed-array storage forms', async () => {
            const source = new Uint8Array ([1, 2, 3, 255]);
            for (const stored of [source.buffer, source, new Blob ([source])]) {
                const buffer = await RecoveryArchiveBuffer (stored);
                assert.deepEqual (new Uint8Array (buffer), source);
            }
            await assert.rejects (() => RecoveryArchiveBuffer ({ bad : true }), /unavailable/);
        });

        it ('Normalizes nested Library paths and cascades folder renames', () => {
            assert.equal (NormalizeLibraryPath (' Project A / Concepts / Rev 1 '), 'Project A/Concepts/Rev 1');
            assert.equal (NormalizeLibraryPath ('Project:*?/Concepts'), 'Project/Concepts');
            assert.equal (LibraryPathParent ('Project A/Concepts/Rev 1'), 'Project A/Concepts');
            assert.equal (RenameLibraryPath ('Project A/Concepts/Rev 1', 'Project A/Concepts', 'Project A/Development'), 'Project A/Development/Rev 1');
            assert.equal (RenameLibraryPath ('Other/Concepts', 'Project A', 'Project B'), 'Other/Concepts');
        });

        it ('Undo and redo keep the order and clear redo after another object edit', async () => {
            const history = new SceneHistory (); let value = 1; history.Push ({ undo : () => { value = 0; }, redo : () => { value = 1; } }); await history.Undo (); assert.equal (value, 0); await history.Redo (); assert.equal (value, 1); await history.Undo (); history.Push ({ undo : () => {}, redo : () => {} }); assert.equal (history.redo.length, 0);
        });
        it ('Converts declared units and unit-aware scaling while leaving unspecified units explicit', () => {
            assert.equal (DisplayLength (0.0254, Unit.Meter, 'standard'), '1 in');
            assert.equal (DisplayLength (1, Unit.Inch, 'metric'), '25.4 mm');
            assert.equal (DisplayLength (7, Unit.Unknown, 'metric'), '7 model units');
            assert.equal (UnitFactor (Unit.Meter, 'metric'), 1000);
            assert.equal (DisplaySizeFromScale (2, 0.5, Unit.Meter, 'metric'), 1000);
            assert.equal (ScaleFromDisplaySize (2, 1000, Unit.Meter, 'metric'), 0.5);
            assert.equal (DisplaySizeFromScale (2, 3, Unit.Unknown, 'metric'), 3);
            assert.equal (ScaleFromDisplaySize (2, 3, Unit.Unknown, 'metric'), 3);
        });
        it ('Seeks skeletal/morph-compatible tracks and exports distinct UUID targets', () => {
            const root = new THREE.Group (); const target = new THREE.Object3D (); target.name = 'part'; root.add (target);
            const clip = new THREE.AnimationClip ('Move', 1, [new THREE.VectorKeyframeTrack ('part.position', [0, 1], [0, 0, 0, 4, 0, 0])]); const object = { name : 'one', playback : { clip : 0, time : 0, speed : 1, playing : false, loop : false } }; const player = new AnimationPlayer (object, root, [clip], () => {});
            assert.equal (player.action.loop, THREE.LoopOnce); assert.equal (player.action.clampWhenFinished, true);
            player.SetLoop (true); assert.equal (player.action.loop, THREE.LoopRepeat); assert.equal (player.action.clampWhenFinished, false);
            player.Seek (0.5); assert.equal (target.position.x, 2); assert.equal (player.state.time, 0.5); const track = player.ExportClips ()[0].tracks[0]; assert.equal (track.name, target.uuid + '.position'); player.Dispose ();
        });
    });
}

