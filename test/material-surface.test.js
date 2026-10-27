import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PhysicalMaterial, TextureMap } from '../source/engine/model/material.js';
import { DisposeThreeObjects } from '../source/engine/threejs/threeutils.js';
import { Model } from '../source/engine/model/model.js';
import { ThreeMaterialHandler } from '../source/engine/threejs/threeconverter.js';
import { AIWorkspace } from '../source/website/aiworkspace.js';
import { MaterialPanel } from '../source/website/materialpanel.js';
import { AutoGenerateTextures, ApplySurfaceRelief, ApplySpotVarnish } from '../source/website/materialtextures.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { CreateFefcoModel } from '../source/website/packagingadapter.js';
import { CreateSessionArchive, PackSession, OpenSessionArchive } from '../source/website/sessionarchive.js';
function Panel () {
    const original = new PhysicalMaterial (); const model = new Model (); model.AddMaterial (original);
    const entry = { index : 0, original, material : new THREE.MeshPhysicalMaterial (), meshes : [] };
    const website = { auth : { user : { id : 'account' } }, accountReady : true, viewer : {}, model };
    const editor = { website, document : { model, objects : [] }, history : new SceneHistory (), Render : async () => {}, Status : () => {}, MarkDirty : () => {}, RefreshButtons : () => {} };
    editor.PushHistory = (undo, redo) => editor.history.Push ({ undo, redo }); website.sessionEditor = editor;
    const panel = Object.create (MaterialPanel.prototype); Object.assign (panel, { website, AllEntries : () => [entry], SampleSurfaceImage : async () => null, Update : () => {} }); website.materialPanel = panel;
    return { panel, editor, original, entry };
}
describe ('Editable generated surface maps', () => {
    it ('Applies a reversible varnish mask and restores the original finish when disabled', async () => {
        const { panel, editor, original } = Panel (); original.roughnessMap = new TextureMap (); original.specularMap = new TextureMap (); original.varnishMaskMap = new TextureMap ();
        const roughness = original.roughnessMap, specular = original.specularMap;
        panel.SampleImpressionMask = async () => ({ width : 1, height : 1, pixels : new Uint8Array ([255, 255, 255, 255]) }); panel.SampleMappedSurface = async () => null;
        const result = await ApplySpotVarnish (panel, { index : 0, gloss : .95 }); assert.equal (result.geometryChanged, false); assert.equal (original.varnishSettings.gloss, .95); assert.equal (original.varnishBaseRoughnessMap, roughness);
        assert.notEqual (original.roughnessMap, roughness); assert.equal (original.bumpMap, null);
        await editor.history.Undo (); assert.equal (original.varnishSettings, null); assert.equal (original.roughnessMap.buffer, roughness.buffer);
        await editor.history.Redo (); await ApplySpotVarnish (panel, { index : 0, enabled : false }); assert.equal (original.roughnessMap.buffer, roughness.buffer); assert.equal (original.specularMap.buffer, specular.buffer);
    });
    it ('Shares UV coordinates/rotation/tiling with strict commands and reversible board linkage', async () => {
        const { panel, editor, original } = Panel (); original.bumpMap = new TextureMap (); original.boardFluteLinked = true; panel.website.viewer.Render = () => {};
        const registry = CreateAgentCommands (panel.website);
        assert.equal ((await registry.Execute ('material.texture.mapping', { index : 0, slot : 'bumpMap', tileU : 2, offsetU : .25, rotationDegrees : 90 })).ok, true);
        assert.equal (original.bumpMap.scale.x, 2); assert.equal (original.bumpMap.rotation, Math.PI / 2); assert.equal (original.boardFluteLinked, false);
        await editor.history.Undo (); assert.equal (original.bumpMap.scale.x, 1); assert.equal (original.boardFluteLinked, true);
        await editor.history.Redo (); assert.equal (panel.InspectTexture (0, 'bumpMap').offsetU, .25);
        assert.equal ((await registry.Execute ('material.texture.mapping', { index : 0, slot : 'bumpMap', tileV : 0 })).ok, false); assert.equal (original.bumpMap.scale.y, 1);
    });
    it ('Composes corrugated/emboss relief with reversible settings and preserves artwork and CAD', async () => {
        const { panel, editor, original } = Panel ();
        original.diffuseMap = new TextureMap (); original.normalMap = new TextureMap ();
        original.impressionMap = Object.assign (new TextureMap (), { name : 'die.png', buffer : new Uint8Array ([1]).buffer });
        const artwork = original.diffuseMap; const normal = original.normalMap;
        panel.SampleImpressionMask = async () => ({ width : 1, height : 1, pixels : new Uint8Array ([255, 255, 255, 255]) });
        const result = await ApplySurfaceRelief (panel, { index : 0, impression : 'emboss', grain : 0.4 });
        assert.equal (result.geometryChanged, false); assert.equal (original.reliefMode, 'bump'); assert.equal (original.bumpScale, .3);
        assert.equal (original.diffuseMap, artwork); assert.equal (original.normalMap, normal); assert.equal (editor.history.undo.length, 1);
        const bytes = original.bumpMap.buffer;
        await editor.history.Undo (); assert.equal (original.surfaceRelief, null); assert.equal (original.bumpMap, null); assert.equal (original.reliefMode, 'normal');
        await editor.history.Redo (); assert.equal (original.surfaceRelief.impression, 'emboss'); assert.deepEqual (original.bumpMap.buffer, bytes);
        await ApplySurfaceRelief (panel, { index : 0, clearMask : true }); assert.equal (original.impressionMap, null); assert.equal (original.surfaceRelief.impression, 'off');
    });
    it ('Blocks stale-account relief generation and rolls back failed renders', async () => {
        const stale = Panel (); stale.original.impressionMap = new TextureMap ();
        stale.panel.SampleImpressionMask = async () => { stale.panel.website.auth.user = { id : 'other' }; return { width : 1, height : 1, pixels : new Uint8Array (4) }; };
        await assert.rejects (() => ApplySurfaceRelief (stale.panel, { index : 0 }), /account changed/); assert.equal (stale.original.bumpMap, null); assert.equal (stale.editor.busy, false);
        const failed = Panel (); let renders = 0; failed.editor.Render = async () => { if (!renders++) { throw new Error ('Relief render failed'); } };
        await assert.rejects (() => ApplySurfaceRelief (failed.panel, { index : 0 }), /Relief render failed/); assert.equal (failed.original.bumpMap, null); assert.equal (failed.original.surfaceRelief, null); assert.equal (failed.editor.history.undo.length, 0);
    });
    it ('Exposes strict relief commands with macro and read-only support', async () => {
        const { panel, editor } = Panel (); const registry = CreateAgentCommands (panel.website);
        const macro = await registry.RunMacro ({ version : 1, steps : [{ id : 'surface', command : 'material.surface.relief', arguments : { index : 0, flute : 0.5 } }] });
        assert.equal (macro.ok, true); assert.equal (macro.completed[0].result.geometryChanged, false);
        assert.equal ((await registry.Execute ('material.surface.relief', { index : 0, cycles : 1.1 })).ok, false);
        assert.equal ((await registry.Execute ('material.surface.relief', { index : 0, surprise : 1 })).ok, false);
        editor.readOnly = true; assert.equal ((await registry.Execute ('material.surface.relief', { index : 0 })).ok, false);
    });
    it ('Keeps independent roughness through reversed asynchronous load order and retains both relief maps', () => {
        for (const mode of ['normal', 'bump', 'off']) {
            const original = new PhysicalMaterial (); original.reliefMode = mode; original.name = 'Board';
            for (const key of ['metalnessMap', 'roughnessMap', 'normalMap', 'bumpMap', 'specularMap']) { original[key] = Object.assign (new TextureMap (), { name : key }); }
            const model = new Model (); model.AddMaterial (original); const handler = new ThreeMaterialHandler (model, {}, {}, { defaultMaterials : [] }); const callbacks = [];
            handler.LoadFaceTexture = (material, map, callback) => { if (map) { callbacks.push ([map.name, callback]); } };
            const result = handler.CreateThreeFaceMaterial (0); for (const [name, callback] of callbacks.reverse ()) { callback (Object.assign (new THREE.Texture (), { name })); }
            assert.equal (result.name, 'Board'); assert.equal (result.specularColorMap.name, 'specularMap'); assert.equal (result.specularMap, undefined); assert.equal (result.roughnessMap.name, 'roughnessMap'); assert.equal (result.metalnessMap.name, 'metalnessMap'); assert.equal (result.auto3dNormalMap.name, 'normalMap');
            assert.equal (!!result.normalMap, mode === 'normal'); assert.equal (!!result.bumpMap, mode === 'bump');
        }
        const { original } = Panel (); original.metalnessMap = new TextureMap (); const model = new Model (); model.AddMaterial (original);
        const handler = new ThreeMaterialHandler (model, {}, {}, { defaultMaterials : [] }); handler.LoadFaceTexture = (m, map, callback) => { if (map) { callback (new THREE.Texture ()); } };
        const packed = handler.CreateThreeFaceMaterial (0); assert.equal (packed.roughnessMap, packed.metalnessMap);
    });
    it ('Releases shared and inactive surface images once when rebuilding a model, without disposing the viewer environment', () => {
        const image = new THREE.Texture (); const inactive = new THREE.Texture (); const environment = new THREE.Texture (); let images = 0; let normals = 0; let environments = 0;
        image.addEventListener ('dispose', () => images++); inactive.addEventListener ('dispose', () => normals++); environment.addEventListener ('dispose', () => environments++);
        const material = new THREE.MeshPhysicalMaterial ({ map : image, roughnessMap : image, envMap : environment }); material.auto3dNormalMap = inactive;
        const group = new THREE.Group (); group.add (new THREE.Mesh (new THREE.BoxGeometry (), material), new THREE.Mesh (new THREE.BoxGeometry (), material)); DisposeThreeObjects (group);
        assert.equal (images, 1); assert.equal (normals, 1); assert.equal (environments, 0);
    });
    it ('Generates missing maps as one reversible operation while retaining authored maps and their UV placement', async () => {
        const { panel, editor, original } = Panel (); original.diffuseMap = Object.assign (new TextureMap (), { name : 'artwork.png', buffer : new Uint8Array ([1, 2, 3]).buffer }); original.diffuseMap.scale.x = 3;
        const result = await AutoGenerateTextures (panel, { index : 0 }); assert.equal (result.generated, true); assert.equal (editor.history.undo.length, 1); assert.equal (original.diffuseMap.name, 'artwork.png'); assert.equal (original.normalMap.scale.x, 3);
        const normalBytes = original.normalMap.buffer; await editor.history.Undo (); assert.equal (original.normalMap, null); assert.equal (original.diffuseMap.name, 'artwork.png'); await editor.history.Redo (); assert.deepEqual (original.normalMap.buffer, normalBytes);
        assert.equal ((await AutoGenerateTextures (panel, { index : 0 })).generated, false); assert.equal (editor.history.undo.length, 1);
        await AutoGenerateTextures (panel, { index : 0, overwrite : true }); assert.equal (original.diffuseMap.name, 'artwork.png'); assert.equal (editor.history.undo.length, 2);
    });
    it ('Generates for all surface materials owned by a generated object ID', async () => {
        const { panel, editor } = Panel (); const doc = new SceneDocument (); const object = doc.AddImported (await CreateFefcoModel ({}), 'Generated object'); editor.document = doc; panel.website.model = doc.model;
        for (const material of doc.model.materials) { material.normalMap = null; }
        panel.AllEntries = () => doc.model.materials.map ((original, index) => ({ original, index, meshes : [], material : new THREE.MeshPhysicalMaterial () }));
        const result = await AutoGenerateTextures (panel, { objectId : object.id }); assert.equal (result.generated, true); assert.equal (result.materials.length, 3); assert.equal (editor.history.undo.length, 1); assert.ok (doc.model.materials.slice (0, 3).every (m => m.normalMap)); assert.equal (doc.model.materials[3].normalMap, null);
        await editor.history.Undo (); assert.ok (doc.model.materials.every (m => !m.normalMap));
    });
    it ('Retains solid material tint, rejects stale-account results and rolls back renderer failures', async () => {
        const { panel, editor, original } = Panel (); await AutoGenerateTextures (panel, { index : 0 }); assert.equal (original.multiplyDiffuseMap, true);
        const stale = Panel (); stale.panel.SampleSurfaceImage = async () => { stale.panel.website.auth.user = { id : 'different' }; return null; };
        await assert.rejects (() => AutoGenerateTextures (stale.panel, { index : 0 }), /account changed/); assert.equal (stale.original.normalMap, null); assert.equal (stale.editor.busy, false);
        const failed = Panel (); let calls = 0; failed.editor.Render = async () => { if (!calls++) { throw new Error ('Renderer failed'); } };
        await assert.rejects (() => AutoGenerateTextures (failed.panel, { index : 0 }), /Renderer failed/); assert.equal (failed.original.diffuseMap, null); assert.equal (failed.editor.history.undo.length, 0); assert.equal (failed.editor.busy, false);
        assert.equal (editor.busy, false);
    });
    it ('Shares strict generator, removal and relief commands with macros and blocks read-only or signed-out mutations', async () => {
        const { panel, editor, original } = Panel (); const registry = CreateAgentCommands (panel.website);
        for (const args of [{}, { index : .5 }, { index : 0, objectId : 'x' }, { index : 0, overwrite : 'yes' }, { index : 0, extra : true }]) { assert.equal ((await registry.Execute ('material.textures.generate', args)).ok, false); }
        assert.equal (editor.history.undo.length, 0);
        const macro = await registry.RunMacro ({ version : 1, steps : [{ id : 'maps', command : 'material.textures.generate', arguments : { index : 0 } }, { id : 'relief', command : 'material.relief', arguments : { index : 0, mode : 'bump' } }] });
        assert.equal (macro.ok, true); assert.equal (original.reliefMode, 'bump'); assert.ok (original.normalMap); assert.equal ((await registry.Execute ('material.set', { index : 0, property : 'emissiveIntensity', value : .6 })).ok, true); assert.equal (original.emissiveIntensity, .6); assert.equal ((await registry.Execute ('material.set', { index : 0, property : 'emissiveIntensity', value : -1 })).ok, false); await editor.history.Undo (); assert.equal (original.reliefMode, 'normal');
        assert.equal ((await registry.Execute ('material.texture.remove', { index : 0, slot : 'roughnessMap' })).ok, true); assert.equal (original.roughnessMap, null); await editor.history.Undo (); assert.ok (original.roughnessMap);
        editor.readOnly = true; assert.equal ((await registry.Execute ('material.textures.generate', { index : 0 })).ok, false); await assert.rejects (() => panel.GenerateTextures ({ index : 0 }), /editable/);
        editor.readOnly = false; panel.website.auth.user = null; assert.equal ((await registry.Execute ('material.relief', { index : 0, mode : 'off' })).ok, false);
    });
    it ('Routes AI import through preview and the shared append service, preserving failures', async () => {
        const workspace = Object.create (AIWorkspace.prototype); const calls = [];
        workspace.SelectTask = async id => { calls.push (['preview', id]); };
        workspace.AddSelected = async () => { calls.push (['append']); return { added : 'generated' }; };
        assert.deepEqual (await workspace.ImportTask ({ id : 'result' }), { added : 'generated' }); assert.deepEqual (calls, [['preview', 'result'], ['append']]);
        workspace.SelectTask = async () => { throw new Error ('Download unavailable'); }; calls.length = 0;
        await assert.rejects (() => workspace.ImportTask ({ id : 'result' }), /Download unavailable/); assert.deepEqual (calls, []);
    });
    it ('Preserves every automatic box map, independent tiling and selected relief in portable archives', async () => {
        const doc = new SceneDocument (); doc.AddImported (await CreateFefcoModel ({}), 'RSC'); const material = doc.model.materials[0]; material.reliefMode = 'bump'; material.emissiveIntensity = .65; material.roughnessMap.scale.x = 2.5; material.normalMap.offset.y = .125;
        material.surfaceRelief = { grain : 0.4, impression : 'deboss' }; material.impressionMap = material.bumpMap;
        const before = PackSession (doc).model.meshes;
        const saved = OpenSessionArchive (CreateSessionArchive (PackSession (doc))).document.model.materials.find (item => item.name === material.name);
        for (const key of ['diffuseMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'bumpMap', 'aoMap', 'specularMap', 'displacementMap']) { assert.deepEqual (saved[key].buffer, material[key].buffer); }
        assert.equal (saved.emissiveIntensity, .65); assert.equal (saved.reliefMode, 'bump'); assert.equal (saved.roughnessMap.scale.x, 2.5); assert.equal (saved.normalMap.offset.y, .125);
        assert.equal (saved.surfaceRelief.impression, 'deboss'); assert.equal (saved.surfaceRelief.grain, .4); assert.deepEqual (saved.impressionMap.buffer, material.impressionMap.buffer);
        const roundTrip = OpenSessionArchive (CreateSessionArchive (PackSession (doc))).document;
        assert.equal (JSON.stringify (PackSession (roundTrip).model.meshes), JSON.stringify (before));
        const badSettings = PackSession (doc); badSettings.model.materials[0].surfaceRelief = { strength : -1 }; assert.throws (() => OpenSessionArchive (CreateSessionArchive (badSettings)), /relief/);
        const invalid = PackSession (doc); invalid.model.materials[0].reliefMode = 'invalid'; assert.throws (() => OpenSessionArchive (CreateSessionArchive (invalid)), /relief/);
    });
});
