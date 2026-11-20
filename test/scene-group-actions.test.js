import assert from 'node:assert/strict';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { GroupSceneObjects, UngroupSceneObjects } from '../source/website/scenegroupactions.js';
import { SceneGroups, ExpandSceneGroups, SelectedSceneGroups } from '../source/website/scenegroups.js';
import { Model } from '../source/engine/model/model.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import { GenerateCuboid, GeneratorParams } from '../source/engine/model/generator.js';
import { FinalizeModel } from '../source/engine/model/modelfinalization.js';
import { Unit } from '../source/engine/model/unit.js';
import { PackSession, ReadSession } from '../source/website/sessionarchive.js';

function Fixture (count = 5)
{
    const document = new SceneDocument (), model = new Model (); model.SetUnit (Unit.Millimeter);
    const material = new PhysicalMaterial (); material.roughness = .23; material.metalness = .7; model.AddMaterial (material);
    model.AddMeshToRootNode (GenerateCuboid (new GeneratorParams ().SetMaterial (0), 20, 30, 10)); FinalizeModel (model, {});
    for (let i = 0; i < count; i++) {
        const object = document.AddImported (model, 'Object ' + i); object.position = [i * 45, i, -i]; object.rotation = [i, i * 20, 0]; object.scale = [1 + i * .2, 1, 1]; object.userData = { sku : 'sku-' + i, labelArt : '<svg><path d="M0 0h10v10Z"/></svg>' }; document.ApplyTransform (object);
        object.keyframes = [{ id : 'key-' + i, time : 1, interpolation : 'linear', position : [...object.position], rotation : [...object.rotation], scale : [...object.scale] }];
    }
    const editor = { document, history : new SceneHistory (), selected : null, selectedIds : new Set (), readOnly : false, busy : false, website : { auth : { user : { id : 'owner' } }, accountReady : true }, dirty : 0, MarkDirty () { this.dirty++; }, Status () {} };
    editor.SelectedObjects = () => document.objects.filter (object => editor.selectedIds.has (object.id));
    editor.SetSelection = (objects, { primary = null } = {}) => { editor.selectedIds = new Set (objects.map (object => object.id)); editor.selected = primary; };
    return editor;
}

function Select (editor, objects, primary = objects[0] || null) { editor.SetSelection (objects, { primary }); }
function Group (objects, id, kind = 'group', name = 'Group') { for (const object of objects) { Object.assign (object.userData, { _auto3dGroup : id, _auto3dGroupName : name }); if (kind !== null) { object.userData._auto3dGroupKind = kind; } } }
function Placement (objects) { return objects.map (object => ({ id : object.id, position : [...object.position], rotation : [...object.rotation], scale : [...object.scale], visible : object.visible, keyframes : structuredClone (object.keyframes), labelArt : object.userData.labelArt })); }

describe ('Scene grouping actions', function () {
    it ('groups whole existing groups without moving geometry, and restores membership and selection with Undo', async function () {
        const editor = Fixture (), objects = editor.document.objects;
        Group (objects.slice (0, 2), 'array-a', 'array', 'Array group of Bottles'); objects[1].visible = false;
        Group (objects.slice (2, 4), 'other', 'group', 'Other');
        const before = Placement (objects), metadata = objects.map (object => ({ ...object.userData })), geometry = [...editor.document.model.meshes];
        Select (editor, [objects[0], objects[4]], objects[4]);
        const result = GroupSceneObjects (editor, editor.SelectedObjects (), 'Products');
        assert.deepEqual (result.objectIds, [objects[0].id, objects[1].id, objects[4].id]);
        assert.equal (SceneGroups (objects).find (group => group.id === result.groupId).array, false);
        assert.equal (objects[2].userData._auto3dGroup, 'other'); assert.deepEqual (Placement (objects), before); assert.deepEqual (editor.document.model.meshes, geometry);
        assert.equal (editor.selected, objects[4]); assert.equal (editor.selectedIds.size, 3); assert.equal (editor.history.undo.length, 1);
        await editor.history.Undo (); assert.deepEqual (objects.map (object => object.userData), metadata); assert.deepEqual ([...editor.selectedIds], [objects[0].id, objects[4].id]); assert.equal (editor.selected, objects[4]);
        await editor.history.Redo (); assert.deepEqual (Placement (objects), before); assert.equal (objects[1].userData._auto3dGroup, result.groupId); assert.equal (editor.selectedIds.size, 3);
    });

    it ('ungroups every member even when only one group member was explicitly selected', async function () {
        const editor = Fixture (), objects = editor.document.objects; Group (objects.slice (0, 3), 'group-a'); Group (objects.slice (3), 'other');
        const before = Placement (objects); Select (editor, [objects[1]]);
        const result = UngroupSceneObjects (editor); assert.equal (result.ungrouped, 3); assert.deepEqual (result.groupIds, ['group-a']);
        assert.ok (objects.slice (0, 3).every (object => !Object.keys (object.userData).some (key => key.startsWith ('_auto3dGroup'))));
        assert.equal (objects[3].userData._auto3dGroup, 'other'); assert.equal (editor.selectedIds.size, 3); assert.equal (editor.selected, objects[1]);
        await editor.history.Undo (); assert.equal (objects[0].userData._auto3dGroupKind, 'group'); assert.deepEqual ([...editor.selectedIds], [objects[1].id]);
        await editor.history.Redo (); assert.deepEqual (Placement (objects), before);
    });

    it ('Ungroup Array dissolves only selected arrays, retaining copies, materials, labels and animation tracks', async function () {
        const editor = Fixture (), objects = editor.document.objects; Group (objects.slice (0, 3), 'array-a', 'array', 'Array group of Boxes'); Group (objects.slice (3), 'ordinary');
        Select (editor, [objects[0], objects[3]], objects[0]); const before = Placement (objects), meshCount = editor.document.model.MeshCount (), material = editor.document.model.GetMaterial (0);
        const result = UngroupSceneObjects (editor, { arraysOnly : true });
        assert.equal (result.arraysOnly, true); assert.equal (result.ungrouped, 3); assert.equal (objects[3].userData._auto3dGroup, 'ordinary'); assert.equal (editor.document.objects.length, 5);
        assert.equal (editor.document.model.MeshCount (), meshCount); assert.equal (editor.document.model.GetMaterial (0), material); assert.deepEqual (Placement (objects), before);
        assert.ok (objects.slice (0, 3).every (object => object.userData._auto3dGroupKind === undefined));
        const restored = ReadSession (PackSession (editor.document)).document;
        assert.deepEqual (Placement (restored.objects), before); assert.equal (restored.objects[0].userData._auto3dGroup, undefined); assert.equal (restored.objects[3].userData._auto3dGroup, 'ordinary'); assert.equal (restored.model.GetMaterial (0).roughness, .23);
        await editor.history.Undo (); assert.equal (SceneGroups (objects).find (group => group.id === 'array-a').array, true); assert.equal (objects[0].userData._auto3dGroupKind, 'array');
        await editor.history.Redo (); assert.deepEqual (Placement (objects), before); assert.equal (objects[0].userData._auto3dGroup, undefined);
    });

    it ('recognizes legacy arrays but treats explicit ordinary groups with array-like names as ordinary', function () {
        const editor = Fixture (), objects = editor.document.objects;
        Group (objects.slice (0, 2), 'legacy', null, 'Bottle array'); Group (objects.slice (2, 4), 'ordinary', 'group', 'Can array');
        const groups = SceneGroups (objects); assert.equal (groups[0].array, true); assert.equal (groups[0].name, 'Array group of Bottle'); assert.equal (groups[1].array, false); assert.equal (groups[1].name, 'Can array');
        Select (editor, [objects[2]]); assert.throws (() => UngroupSceneObjects (editor, { arraysOnly : true }), /Select an array/); assert.equal (editor.history.undo.length, 0);
        Select (editor, [objects[0]]); assert.equal (UngroupSceneObjects (editor, { arraysOnly : true }).ungrouped, 2);
        assert.equal (objects[2].userData._auto3dGroup, 'ordinary');
    });

    it ('preserves unrelated metadata written after a grouping change during Undo/Redo', async function () {
        const editor = Fixture (); Select (editor, editor.document.objects.slice (0, 2));
        GroupSceneObjects (editor); const object = editor.selected; object.userData.sku = 'edited-after-grouping';
        await editor.history.Undo (); assert.equal (object.userData.sku, 'edited-after-grouping');
        await editor.history.Redo (); assert.equal (object.userData.sku, 'edited-after-grouping');
    });

    it ('rejects invalid, stale, readonly, busy and signed-out mutations before changing anything', function () {
        const editor = Fixture (); Select (editor, editor.document.objects.slice (0, 2)); const before = PackSession (editor.document);
        for (const name of ['', ' ', 'a'.repeat (101), 1]) { assert.throws (() => GroupSceneObjects (editor, editor.SelectedObjects (), name), /group name/); }
        assert.throws (() => GroupSceneObjects (editor, [editor.selected, editor.selected]), /at least two/); assert.throws (() => GroupSceneObjects (editor, [{}]), /current session/); assert.throws (() => UngroupSceneObjects (editor), /Select a group/);
        for (const flag of ['readOnly', 'busy']) { editor[flag] = true; assert.throws (() => GroupSceneObjects (editor), /editable/); assert.throws (() => UngroupSceneObjects (editor), /editable/); editor[flag] = false; }
        editor.website.accountReady = false; assert.throws (() => GroupSceneObjects (editor), /editable/); editor.website.accountReady = true;
        editor.website.auth.user = null; assert.throws (() => GroupSceneObjects (editor), /editable/); assert.equal (editor.history.undo.length, 0);
        const after = PackSession (editor.document); after.metadata = before.metadata; assert.deepEqual (after, before);
    });

    it ('guards history against replacement documents/accounts and removed objects', function () {
        const editor = Fixture (); Select (editor, editor.document.objects.slice (0, 2)); GroupSceneObjects (editor);
        const document = editor.document, grouped = document.objects.map (object => ({ ...object.userData })), undo = editor.history.undo.at (-1).undo;
        editor.document = new SceneDocument (); assert.throws (undo, /different account or session/); editor.document = document;
        editor.website.auth.user = { id : 'another-owner' }; assert.throws (undo, /different account or session/); editor.website.auth.user = { id : 'owner' };
        const removed = document.objects[0]; document.Remove (removed); assert.throws (undo, /different account or session/); document.Restore (removed, 0);
        assert.deepEqual (document.objects.map (object => object.userData), grouped);
    });

    it ('rolls back membership if selection refresh fails before recording history', function () {
        const editor = Fixture (); Select (editor, editor.document.objects.slice (0, 2)); const before = editor.document.objects.map (object => ({ ...object.userData }));
        const set = editor.SetSelection; let fail = true; editor.SetSelection = (...args) => { if (fail) { fail = false; throw new Error ('Selection display failed'); } set (...args); };
        assert.throws (() => GroupSceneObjects (editor), /Selection display failed/); assert.deepEqual (editor.document.objects.map (object => object.userData), before); assert.equal (editor.history.undo.length, 0);
    });

    it ('expands membership and reports selected groups without including detached objects', function () {
        const editor = Fixture (), objects = editor.document.objects; Group (objects.slice (0, 2), 'a'); Group (objects.slice (2, 4), 'b');
        assert.deepEqual (ExpandSceneGroups (objects, [objects[1], objects[4]]), [objects[0], objects[1], objects[4]]);
        assert.deepEqual (SelectedSceneGroups (objects, [objects[1]]).map (group => group.id), ['a']);
        const removed = objects[0]; editor.document.Remove (removed); assert.deepEqual (ExpandSceneGroups (objects, [objects[0]]), [objects[0]]);
    });
});
