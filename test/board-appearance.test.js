import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { PackSession, ReadSession } from '../source/website/sessionarchive.js';
import { ApplyPackagingPresentation, PreparePackagingPresentations } from '../source/website/packagingadapter.js';
import { CreateFefcoFoldRig } from '../modules/packaging/src/folding.js';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { ArrayObjectBounds } from '../source/website/arraylayout.js';
const setup = () => { const website = { auth : { user : { id : 'owner' } }, accountReady : true, preferences : { units : 'metric' } }; const editor = { website, document : new SceneDocument (), history : new SceneHistory (), Render : async () => {}, Status : () => {}, MarkDirty : () => {} }; website.sessionEditor = editor; editor.packaging = new PackagingWorkspace (editor); return editor; };
describe ('Board appearance shared UI/Agent services', () => {
    it ('Persists independent settings and surface roles with one Undo, preserving CAD and authored maps', async () => {
        const editor = setup (); await editor.packaging.GenerateFefco ({ length : 100, width : 80, height : 60 }); const object = editor.selected, geometry = JSON.stringify (PackSession (editor.document).model); const role = editor.document.model.materials.find (m => m.boardSurfaceRole === 'liner'); role.diffuseMap.name = 'authored-print.png'; role.normalMap.name = 'authored-normal.png';
        const beforePrint = role.diffuseMap.buffer, beforeNormal = role.normalMap.buffer; const registry = CreateAgentCommands (editor.website); const count = editor.history.undo.length;
        const result = await registry.Execute ('packaging.appearance.update', { panelBow : .4, paperGrain : .7, cutCompression : .2 }); assert.equal (result.ok, true, JSON.stringify (result)); assert.equal (object.packagingProfile.appearance.panelBow, .4); assert.equal (editor.history.undo.length, count + 1);
        assert.equal (role.diffuseMap.name, 'authored-print.png'); assert.equal (role.diffuseMap.buffer, beforePrint); assert.equal (role.normalMap.buffer, beforeNormal);
        const archive = ReadSession (PackSession (editor.document)); assert.equal (archive.document.objects[0].packagingProfile.appearance.panelBow, .4); assert.equal (archive.document.model.materials.find (m => m.name === role.name).boardSurfaceRole, 'liner');
        await editor.history.Undo (); assert.equal (object.packagingProfile.appearance, undefined); await editor.history.Redo (); assert.equal (object.packagingProfile.appearance.paperGrain, .7);
        const after = PackSession (editor.document); const original = JSON.parse (geometry); assert.equal (JSON.stringify (after.model.meshes), JSON.stringify (original.meshes));
        const snapshot = JSON.stringify (object.packagingProfile); assert.equal ((await registry.Execute ('packaging.appearance.update', { panelBow : 2 })).ok, false); editor.readOnly = true; assert.equal ((await registry.Execute ('packaging.appearance.update', { enabled : false })).ok, false); assert.equal (JSON.stringify (object.packagingProfile), snapshot);
    });
    it ('Rolls back appearance and generated materials if the renderer rejects the update', async () => {
        const editor = setup (); await editor.packaging.GenerateFefco ({ length : 100, width : 80, height : 60 }); const snapshot = () => { const data = PackSession (editor.document); delete data.metadata; return JSON.stringify (data); }; const before = snapshot (), history = editor.history.undo.length; let renders = 0;
        editor.Render = async () => { if (++renders === 1) { throw new Error ('GPU unavailable'); } };
        await assert.rejects (() => editor.packaging.UpdateAppearance ({ paperGrain : .8 }), /GPU unavailable/);
        assert.equal (snapshot (), before); assert.equal (editor.history.undo.length, history);
    });
    it ('Restores display detail on a saved flat dieline without requiring separate panel meshes', async () => {
        const data = CreateFefcoFoldRig ({ length : 100, width : 80, height : 60 }), root = new THREE.Group ();
        const mesh = new THREE.Mesh (new THREE.BoxGeometry (), data.materials.slice (0, 3).map (() => new THREE.MeshStandardMaterial ())); mesh.name = data.profile.name + ' · Dieline board'; mesh.userData.originalMaterials = [0, 1, 2]; root.add (mesh);
        const object = { threeObject : root, packagingProfile : data.profile, userData : { _auto3dFefco : JSON.stringify (data.parameters), _auto3dPackagingState : 'flat' } };
        await PreparePackagingPresentations ([object], data.materials.map (m => ({ boardSurfaceRole : m.role })), 1);
        assert.equal (mesh.userData.auto3dBoardAppearance, true); assert.ok (mesh.geometry.attributes.position.count > 100);
    });
    it ('Changes GPU geometry while size and array measurements use the original engine coordinates', () => {
        const data = CreateFefcoFoldRig ({ length : 100, width : 80, height : 60 }); const original = data.meshes[0], root = new THREE.Group (), mesh = new THREE.Mesh (new THREE.BoxGeometry (), data.materials.slice (0, 3).map (() => new THREE.MeshStandardMaterial ()));
        mesh.name = original.name; mesh.userData.originalMaterials = [0, 1, 2]; mesh.userData.originalMeshInstance = { GetMesh : () => ({ GetName : () => original.name, vertices : original.vertices.map (p => ({ x : p[0], y : p[1], z : p[2] })) }) }; root.add (mesh);
        const originalSize = ArrayObjectBounds (root).getSize (new THREE.Vector3 ()).toArray ();
        ApplyPackagingPresentation (root, data, 1, data.materials.map (m => ({ boardSurfaceRole : m.role })));
        assert.equal (mesh.userData.auto3dBoardAppearance, true); assert.ok (mesh.geometry.attributes.position.count > 100); assert.deepEqual (ArrayObjectBounds (root).getSize (new THREE.Vector3 ()).toArray (), originalSize);
        const editor = Object.create (SessionEditor.prototype); editor.baseSizes = new WeakMap (); assert.deepEqual (editor.GetObjectBaseSize ({ threeObject : root }), originalSize);
    });
});
