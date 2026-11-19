import { ConvertModelToThreeObject, ModelToThreeConversionParams, ModelToThreeConversionOutput } from '../source/engine/threejs/threeconverter.js';
import assert from 'node:assert/strict';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { PackSession, ReadSession, CreateSessionArchive } from '../source/website/sessionarchive.js';
import { ModelLibrary } from '../source/website/modellibrary.js';
import { SceneGroups } from '../source/website/scenegroups.js';
import { Model } from '../source/engine/model/model.js';
import { Node } from '../source/engine/model/node.js';
import { Mesh } from '../source/engine/model/mesh.js';
import { Triangle } from '../source/engine/model/triangle.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
function source () {
    const model = new Model (); model.AddMaterial (new PhysicalMaterial ()); const mesh = new Mesh (); [[0,0,0],[1,0,0],[0,1,0]].forEach (p => mesh.AddVertex (new Coord3D (...p))); mesh.AddNormal (new Coord3D (0,0,1)); mesh.AddTriangle (new Triangle (0,1,2).SetNormals (0,0,0).SetMaterial (0).SetCurve (0)); model.AddMesh (mesh); const node = new Node (); node.AddMeshIndex (0); model.root.AddChildNode (node); return model;
}
function setup () {
    const editor = Object.create (SessionEditor.prototype); editor.document = new SceneDocument (); editor.selected = editor.document.AddImported (source (), 'Current box'); editor.selectedIds = new Set ([editor.selected.id]); editor.history = new SceneHistory (); editor.Render = async () => {}; editor.RefreshButtons = () => {}; editor.Status = () => {}; editor.website = { auth : { user : { id : 'owner' } }, accountReady : true };
    const saved = new SceneDocument (); const bottle = saved.AddImported (source (), 'REDCON fixture'); bottle.userData = { _auto3dGroup : 'same', _auto3dGroupName : 'Bottles' }; return { editor, saved };
}
describe ('Saved Library Add and model groups', () => {
    it ('appends models to the same document, preserves the original and records one reversible import', async () => {
        const { editor, saved } = setup (); const document = editor.document, first = editor.selected; editor.document.objects[0].userData = { _auto3dGroup : 'same', _auto3dGroupName : 'Existing' };
        const result = await editor.AppendArchive (ReadSession (PackSession (saved))); assert.equal (result.objectCount, 1); assert.equal (editor.document, document); assert.equal (document.objects[0], first); assert.equal (document.objects.length, 2); assert.equal (editor.selected.name, 'REDCON fixture'); assert.notEqual (editor.selected.userData._auto3dGroup, 'same');
        await editor.history.Undo (); assert.equal (document.objects.length, 1); assert.equal (editor.selected, first); await editor.history.Redo (); assert.equal (document.objects.length, 2);
    });
    it ('rolls back objects, materials, meshes and selection if scene rendering fails', async () => {
        const { editor, saved } = setup (); const previous = editor.selected; let calls = 0; editor.Render = async () => { if (++calls === 1) { throw new Error ('GPU failed'); } };
        const materials = editor.document.model.MaterialCount (), meshes = editor.document.model.MeshCount ();
        await assert.rejects (() => editor.AppendArchive (ReadSession (PackSession (saved))), /GPU failed/); assert.equal (editor.document.objects.length, 1); assert.equal (editor.selected, previous); assert.equal (editor.document.model.MaterialCount (), materials); assert.equal (editor.document.model.MeshCount (), meshes);
        assert.equal (editor.history.undo.length, 0);
    });
    it ('appends visibility, motion easing and embedded clips with new IDs and reversible timeline duration', async () => {
        const { editor, saved } = setup (); editor.timeline = new SessionTimeline (editor); const model = saved.objects[0];
        model.visibilityKeys = [{ id : 'hide', time : 0, visible : false }, { id : 'show', time : 1, visible : true }];
        model.keyframes = [0, 2].map (time => ({ id : 'motion-' + time, time, interpolation : 'smooth', motionEasing : 'strong', position : [time, 0, 0], rotation : [0, 0, 0], scale : [1, 1, 1] }));
        model.animationAsset = { main : 'clip.glb', files : [{ name : 'clip.glb', buffer : new ArrayBuffer (4) }] };
        const clip = { id : 'clip', objectId : model.id, clip : 0, time : 1, duration : 9, speed : 1, loop : false, baseClip : 0, baseTime : .5 };
        const archive = ReadSession (PackSession (saved, { timeline : { embeddedClips : [clip] } }));
        assert.equal (archive.document.objects[0].keyframes[0].motionEasing, 'strong');
        await editor.AppendArchive (archive); const added = editor.selected;
        assert.deepEqual (added.visibilityKeys.map (key => [key.time, key.visible]), [[0, false], [1, true]]); assert.notEqual (added.visibilityKeys[0].id, 'hide');
        assert.equal (editor.timeline.embeddedClips[0].objectId, added.id); assert.notEqual (editor.timeline.embeddedClips[0].id, clip.id); assert.equal (editor.timeline.duration, 10); assert.equal (editor.timeline.rangeEnd, 10);
        assert.ok (Math.abs (editor.timeline.ObjectStateAt (added, .5).position[0] - .03125) < 1e-9);
        await editor.history.Undo (); assert.equal (editor.timeline.embeddedClips.length, 0); assert.equal (editor.timeline.duration, 5); assert.equal (editor.timeline.rangeEnd, 5);
        await editor.history.Redo (); assert.equal (editor.timeline.embeddedClips[0].objectId, added.id); assert.equal (editor.timeline.duration, 10);
    });
    it ('rolls back an account change during scene conversion without recording import history', async () => {
        const { editor, saved } = setup (); editor.Render = async () => { editor.website.auth.user.id = 'changed'; };
        await assert.rejects (() => editor.AppendArchive (ReadSession (PackSession (saved))), /Account or workspace changed/);
        assert.equal (editor.document.objects.length, 1); assert.equal (editor.history.undo.length, 0);
    });
    it ('locks fetching, rejects concurrent Add and handles account changes before mutation', async () => {
        const { editor, saved } = setup (); const library = new ModelLibrary (editor); let finish; library.accountStorage.Archive = () => new Promise (resolve => { finish = resolve; });
        const loading = library.LoadItem ({ id : 'saved', name : 'REDCON', personal : true }, true); assert.equal (editor.busy, true);
        await assert.rejects (() => library.LoadItem ({ id : 'saved', name : 'REDCON', personal : true }, true), /Wait/);
        editor.website.auth.user.id = 'different'; finish (CreateSessionArchive (PackSession (saved))); await assert.rejects (() => loading, /Account or workspace changed/); assert.equal (editor.document.objects.length, 1); assert.equal (editor.busy, false);
    });
    it ('propagates asynchronous mesh conversion failures instead of leaving Add pending forever', async () => {
        const model = source (); model.meshes[0].GetTriangle = () => { throw new Error ('Invalid saved mesh'); };
        const conversion = new Promise ((resolve, reject) => ConvertModelToThreeObject (model, new ModelToThreeConversionParams (), new ModelToThreeConversionOutput (), { onTextureLoaded : () => {}, onModelLoaded : resolve, onError : reject }));
        await assert.rejects (() => Promise.race ([conversion, new Promise ((resolve, reject) => setTimeout (() => reject (new Error ('Conversion stalled')), 200))]), /Invalid saved mesh/);
    });
    it ('keeps selection bounds hidden throughout folding and array preparation/playback', () => {
        const { editor } = setup (); editor.selectionBox = { visible : true }; editor.packaging = { foldOperation : {} }; editor.UpdateSelectionBox (); assert.equal (editor.selectionBox.visible, false);
        editor.packaging.foldOperation = null; editor.arrayOperation = {}; editor.selectionBox.visible = true; editor.UpdateSelectionBox (); assert.equal (editor.selectionBox.visible, false);
    });
    it ('collects stable array/group rows and changes expansion without changing transforms', () => {
        const { editor } = setup (); const copy = editor.document.Instance (editor.selected); editor.document.objects.forEach (o => { o.userData = { _auto3dGroup : 'array', _auto3dGroupName : 'Box array' }; });
        const groups = SceneGroups (editor.document.objects); assert.equal (groups.length, 1); assert.equal (groups[0].name, 'Array group of Box'); assert.equal (groups[0].objects.length, 2);
        const before = JSON.stringify (editor.document.objects.map (o => o.position)); assert.equal (editor.SetGroupExpanded ('array', true).expanded, true); assert.equal (editor.GroupsInspect ()[0].expanded, true); assert.equal (JSON.stringify (editor.document.objects.map (o => o.position)), before);
        assert.throws (() => editor.SetGroupExpanded ('missing', true)); assert.notEqual (copy.id, editor.selected.id);
    });
});
