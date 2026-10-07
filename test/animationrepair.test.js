import * as assert from 'node:assert/strict';
import * as THREE from 'three';
import fs from 'node:fs';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { AnimationPlayer, LoadAnimationScene } from '../source/website/sessionanimation.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { SceneDocument } from '../source/website/scenedocument.js';
import { ImporterGltf } from '../source/engine/import/importergltf.js';
import { ConvertModelToThreeObject, ModelToThreeConversionParams, ModelToThreeConversionOutput } from '../source/engine/threejs/threeconverter.js';
import { RecoverySnapshot } from '../source/website/sessionrecovery.js';
import { CreateRecoveryArchive } from '../source/website/sessionrecoverypack.js';
import { OpenSessionArchive } from '../source/website/sessionarchive.js';

async function AnimatedObject ()
{
    const bytes = fs.readFileSync (new URL ('./testfiles/animation/animated.glb', import.meta.url));
    const buffer = bytes.buffer.slice (bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const importer = new ImporterGltf ();
    await new Promise ((resolve, reject) => importer.Import ('animated.glb', 'glb', buffer, {
        getDefaultMaterialColor : () => ({ r : 255, g : 255, b : 255 }), getDefaultLineMaterialColor : () => ({ r : 0, g : 0, b : 0 }), getFileBuffer : () => null,
        onSuccess : resolve, onError : () => reject (new Error ('Import failed')), onComplete : () => {}
    }));
    const model = importer.GetModel (); model.materials.forEach ((item, index) => { item.gltfMaterialIndex = index; });
    const document = new SceneDocument (); const object = document.AddImported (model, 'Animated cube');
    const root = await new Promise ((resolve) => ConvertModelToThreeObject (document.model, new ModelToThreeConversionParams (), new ModelToThreeConversionOutput (), { onModelLoaded : resolve, onTextureLoaded : () => {} }));
    object.threeObject = root.children[0]; object.animationAsset = { main : 'animated.glb', files : [{ name : 'animated.glb', buffer }] };
    return { document, object };
}

describe ('Animation and interaction repairs', () => {
    it ('Loads actual skeletal and morph GLB clips through the engine and session rig', async () => {
        const { document, object } = await AnimatedObject ();
        const player = await LoadAnimationScene (object, document.model, () => {});
        assert.equal (player.clips.length, 2);
        player.Seek (1); let bone;
        player.scene.traverse ((item) => { if (item.isBone) { bone = item; } });
        assert.ok (Math.abs (bone.quaternion.z - Math.SQRT1_2) < 1e-6);
        player.Choose (1); player.Seek (1); let mesh;
        player.scene.traverse ((item) => { if (item.isMesh) { mesh = item; } });
        assert.ok (mesh.isSkinnedMesh); assert.equal (mesh.frustumCulled, false); assert.equal (mesh.morphTargetInfluences[0], 1);
        player.Dispose ();
    });
    it ('Restarts finished non-looping clips and normalizes incomplete playback state', () => {
        const root = new THREE.Group (); const part = new THREE.Object3D (); part.name = 'part'; root.add (part);
        const clip = new THREE.AnimationClip ('Move', 1, [new THREE.VectorKeyframeTrack ('part.position', [0, 1], [0, 0, 0, 4, 0, 0])]);
        const player = new AnimationPlayer ({ playback : { loop : false } }, root, [clip], () => {});
        assert.equal (player.state.speed, 1); player.mixer.update (1.1); assert.equal (player.action.paused, true);
        player.Seek (0.5); assert.equal (player.action.paused, false); assert.equal (part.position.x, 2);
        player.Seek (1); player.Schedule = () => {}; player.SetPlaying (true); assert.equal (player.state.time, 0); assert.equal (part.position.x, 0);
        player.Dispose ();
    });
    it ('Does not finish a clip at zero when the first frame timestamp precedes Play', () => {
        const previousRequest = global.requestAnimationFrame; const previousCancel = global.cancelAnimationFrame;
        let callback; global.requestAnimationFrame = (fn) => { callback = fn; return 1; }; global.cancelAnimationFrame = () => {};
        let player;
        try {
            const root = new THREE.Group (); const part = new THREE.Object3D (); part.name = 'part'; root.add (part);
            player = new AnimationPlayer ({ playback : { loop : false } }, root, [new THREE.AnimationClip ('Move', 1, [new THREE.VectorKeyframeTrack ('part.position', [0, 1], [0, 0, 0, 4, 0, 0])])], () => {});
            player.SetPlaying (true); callback (player.previous - 1);
            assert.equal (player.action.paused, false); assert.equal (player.state.time, 0);
            callback (player.previous + 100); assert.ok (player.state.time > 0); assert.ok (part.position.x > 0);
        } finally { player?.Dispose (); global.requestAnimationFrame = previousRequest; global.cancelAnimationFrame = previousCancel; }
    });
    it ('Validates animation range commands and respects read-only sequences', async () => {
        const editor = { document : { objects : [] }, MarkDirty : () => {}, AnimationUI : () => {}, readOnly : false };
        editor.timeline = new SessionTimeline (editor);
        const commands = CreateAgentCommands ({ sessionEditor : editor });
        assert.equal ((await commands.Execute ('animation.timeline.range', { start : 4, end : 2 })).ok, false);
        assert.equal (editor.timeline.rangeStart, 0);
        assert.equal ((await commands.Execute ('animation.timeline.range', { start : 1, end : 4 })).ok, true);
        editor.readOnly = true;
        assert.equal ((await commands.Execute ('animation.timeline.range', { start : 0, end : 5 })).ok, false);
        assert.equal (editor.timeline.rangeStart, 1);
        const macro = await commands.RunMacro ({ version : 1, steps : [{ id : 'bad', command : 'animation.timeline.range', arguments : { start : -1, end : 5 } }] });
        assert.equal (macro.ok, false);
    });
    it ('Stops and loops playback at the saved range rather than the full duration', () => {
        const previousRequest = global.requestAnimationFrame; const previousCancel = global.cancelAnimationFrame;
        let callback; global.requestAnimationFrame = (fn) => { callback = fn; return 1; }; global.cancelAnimationFrame = () => {};
        try {
            const timeline = new SessionTimeline ({ document : { objects : [] } }); timeline.Seek = (time) => { timeline.time = time; };
            timeline.SetRange (1, 2); timeline.time = 5; timeline.Toggle (); assert.equal (timeline.time, 1);
            timeline.time = 1.95; callback (timeline.previous + 100); assert.equal (timeline.time, 2); assert.equal (timeline.playing, false);
            timeline.loop = true; timeline.Toggle (); timeline.time = 1.95; callback (timeline.previous + 100);
            assert.ok (timeline.time >= 1 && timeline.time < 2); assert.equal (timeline.playing, true); timeline.Stop ();
        } finally { global.requestAnimationFrame = previousRequest; global.cancelAnimationFrame = previousCancel; }
    });
    it ('Caches exact base dimensions across placement edits without another vertex scan', () => {
        const editor = { baseSizes : new WeakMap () }; const mesh = new THREE.Mesh (new THREE.BoxGeometry (2, 4, 6)); const object = { threeObject : mesh }; mesh.userData.originalMeshInstance = { node : {} }; mesh.userData.originalMeshInstance.node.parent = mesh.userData.originalMeshInstance.node;
        const size = SessionEditor.prototype.GetObjectBaseSize.call (editor, object);
        mesh.position.set (10, 20, 30); mesh.scale.set (2, 3, 4); mesh.clone = () => { throw new Error ('Unexpected clone'); };
        assert.deepEqual (SessionEditor.prototype.GetObjectBaseSize.call (editor, object), size); assert.deepEqual (size, [2, 4, 6]);
    });
    it ('Finalizes interrupted drag exactly once and restores navigation', () => {
        let records = 0; const editor = { website : { viewer : { navigation : { enabled : false }, UpdateGroundGrid : () => {} } }, selected : {}, dragStart : {}, RecordTransform : () => records++, UpdateDetails : () => {}, RequestInteractionRender : () => {} };
        SessionEditor.prototype.FinishDrag.call (editor); SessionEditor.prototype.FinishDrag.call (editor);
        assert.equal (records, 1); assert.equal (editor.website.viewer.navigation.enabled, true);
    });
    it ('Preserves scene/camera tracks, range markers and embedded source in worker recovery archives', async () => {
        const { document, object } = await AnimatedObject ();
        const timeline = new SessionTimeline ({ document, website : { viewer : {} } });
        timeline.time = 1; timeline.CaptureScene (); timeline.time = 3; object.position = [2, 0, 0]; timeline.CaptureScene (); timeline.SetRange (1, 4);
        timeline.cameraKeyframes = [{ id : 'camera', time : 2, interpolation : 'linear', eye : [3, 2, 1], center : [0, 0, 0], up : [0, 1, 0], fov : 45 }];
        const saved = OpenSessionArchive (CreateRecoveryArchive (structuredClone (RecoverySnapshot (document, { timeline : timeline.Serialize () }))));
        assert.equal (saved.document.objects[0].keyframes.length, 2); assert.equal (saved.view.timeline.rangeStart, 1); assert.equal (saved.view.timeline.rangeEnd, 4);
        assert.deepEqual (new Uint8Array (saved.document.objects[0].animationAsset.files[0].buffer), new Uint8Array (object.animationAsset.files[0].buffer));
        const reopened = new SessionTimeline ({ document : saved.document, website : { viewer : {} } }); reopened.Load (saved.view.timeline);
        assert.equal (reopened.cameraKeyframes.length, 1); assert.deepEqual (reopened.ObjectStateAt (saved.document.objects[0], 2).position, [1, 0, 0]);
        assert.throws (() => reopened.SetRange (3, 2), /range/);
        assert.doesNotThrow (() => reopened.SetRange (3.99, 4));
    });
});
