import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { CreateSessionArchive, OpenSessionArchive, PackSession } from '../source/website/sessionarchive.js';
import { CreateRecoveryArchive } from '../source/website/sessionrecoverypack.js';
import { RecoverySnapshot } from '../source/website/sessionrecovery.js';
import { IsTwoManifold } from '../source/engine/model/modelutils.js';
import { CalculateVolume } from '../source/engine/model/quantities.js';
import { CreateFefcoModel } from '../source/website/packagingadapter.js';
import { RGBColor } from '../source/engine/model/color.js';
import { Unit } from '../source/engine/model/unit.js';
import { FefcoProfile } from '../modules/packaging/src/fefco.js';
function Editor () { const website = { preferences : { units : 'metric' }, auth : { user : { id : 'test' } }, accountReady : true }; const editor = { website, document : new SceneDocument (), history : new SceneHistory (), Render : async () => {}, Status : () => {} }; editor.packaging = new PackagingWorkspace (editor); website.sessionEditor = editor; return editor; }
describe ('Packaging adapter and unfolding', () => {
    it ('Keeps generator geometry, texture creation and catalog UI out of the Auto3D startup bundle', async () => {
        const result = await build ({ entryPoints : ['source/website/index.js'], bundle : true, write : false, outdir : 'work/boundary', metafile : true, define : { 'import.meta.url' : 'document.currentScript.src' }, loader : { '.ttf' : 'file', '.woff' : 'file', '.svg' : 'file' } });
        const names = Object.keys (result.metafile.inputs); for (const file of ['geometry.js', 'mesh.js', 'material.js', 'panel.js', 'index.js', 'folding.js', 'foldplayback.js']) { assert.equal (names.includes ('modules/packaging/src/' + file), false, file + ' must be loaded separately'); }
        assert.equal (names.includes ('source/website/packagingadapter.js'), true); assert.equal (names.includes ('modules/packaging/src/profile.js'), true);
    });
    it ('Unfolds to a watertight physical sheet and preserves the current edited liner and edge material', async () => {
        const editor = Editor (); await editor.packaging.GenerateFefco ({ code : '0201' }); const original = editor.selected;
        const liner = editor.document.model.materials.find (m => m.name === 'Natural kraft liner'); liner.name = 'Custom kraft'; liner.roughness = 0.76; liner.color = new RGBColor (240, 200, 160); liner.multiplyDiffuseMap = true;
        const result = await editor.packaging.UnfoldSelected (); assert.equal (result.state, 'flat'); assert.equal (editor.document.objects.length, 1); assert.notEqual (editor.selected.id, original.id); assert.equal (editor.selected.userData._auto3dPackagingState, 'flat');
        const model = editor.document.CompactModel (); const savedLiner = model.materials.find (m => m.name === 'Custom kraft'); assert.deepEqual (savedLiner.color, liner.color); assert.equal (savedLiner.roughness, 0.76); assert.equal (savedLiner.multiplyDiffuseMap, true); assert.deepEqual (savedLiner.diffuseMap.buffer, liner.diffuseMap.buffer);
        const board = model.meshes.find (mesh => mesh.TriangleCount () > 0); assert.ok (IsTwoManifold (board));
        const polygon = editor.selected.packagingProfile.paths[0].points; const area = Math.abs (polygon.reduce ((sum, p, index) => { const q = polygon[(index + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2); assert.ok (Math.abs (Math.abs (CalculateVolume (board)) - area * 3) < 0.1);
        assert.equal (model.meshes.filter (mesh => mesh.LineCount () > 0).length, 2);
    });
    it ('Restores the folded object, order, selection and previous drawing on Undo; redo restores the flat sheet', async () => {
        const editor = Editor (); await editor.packaging.GenerateFefco (); const source = editor.selected; const previous = FefcoProfile ({ code : '0200' }); editor.document.packaging = previous;
        const result = await editor.packaging.UnfoldSelected (); assert.deepEqual (editor.document.packaging, source.packagingProfile); await editor.history.Undo (); assert.equal (editor.selected, source); assert.equal (editor.document.objects[0], source); assert.deepEqual (editor.document.packaging, previous);
        await editor.history.Redo (); assert.equal (editor.document.objects.length, 1); assert.equal (editor.selected.id, result.objectId);
    });
    it ('Preserves flat state, parameters, line guides and textures through archives and recovery', async () => {
        const editor = Editor (); await editor.packaging.GenerateFefco ({ code : '0200' }); await editor.packaging.UnfoldSelected ();
        for (const archive of [CreateSessionArchive (PackSession (editor.document)), CreateRecoveryArchive (RecoverySnapshot (editor.document, {}))]) { const saved = OpenSessionArchive (archive).document; assert.equal (saved.objects[0].userData._auto3dPackagingState, 'flat'); assert.equal (JSON.parse (saved.objects[0].userData._auto3dFefco).code, '0200'); assert.ok (saved.model.LineCount () > 0); assert.ok (saved.model.materials.some (m => m.diffuseMap?.buffer)); }
    });
    it ('Uses shared commands, typed phrases and macros; respects selection, scale, read-only, account and schema checks', async () => {
        const editor = Editor (); const registry = CreateAgentCommands (editor.website); assert.equal ((await registry.Execute ('packaging.fefco.unfold')).ok, false);
        const macro = await registry.RunMacro ({ version : 1, steps : [{ id : 'box', command : 'packaging.fefco.generate', arguments : { code : '0200' } }, { id : 'flat', command : 'packaging.fefco.unfold', arguments : { objectId : { $ref : 'box.objectId' } } }] }); assert.equal (macro.ok, true, JSON.stringify (macro));
        assert.equal ((await registry.Execute ('packaging.fefco.unfold')).ok, false); await editor.history.Undo (); editor.selected.scale = [2, 1, 1]; assert.equal ((await registry.Execute ('packaging.fefco.unfold')).ok, false); editor.selected.scale = [1, 1, 1];
        editor.readOnly = true; assert.equal ((await registry.Execute ('packaging.fefco.unfold')).ok, false); editor.readOnly = false; const user = editor.website.auth.user; editor.website.auth.user = null; assert.equal ((await registry.Execute ('packaging.fefco.unfold')).ok, false); editor.website.auth.user = user;
        assert.equal ((await registry.Execute ('packaging.fefco.unfold', { extra : true })).ok, false); assert.equal ((await registry.Execute ('commands.text', { text : 'unfold box' })).ok, true);
    });
    it ('Keeps physical mm dimensions when the session uses inches', async () => { const editor = Editor (); editor.document.AddImported (await CreateFefcoModel ({}, Unit.Inch), 'Inch scene seed'); const seed = await editor.packaging.GenerateFefco (); await editor.packaging.UnfoldSelected (seed.objectId); const model = editor.document.CompactModel ([editor.selected]); const board = model.meshes.find (mesh => mesh.TriangleCount () > 0); assert.ok (Math.abs (Math.max (...board.vertices.map (p => p.y)) - 3 / 25.4) < 0.00001); });
    it ('Rolls back a failed unfold render and releases busy state', async () => { const editor = Editor (); await editor.packaging.GenerateFefco (); const source = editor.selected; const profile = editor.document.packaging; const count = editor.history.undo.length; let renders = 0; editor.Render = async () => { if (!renders++) { throw new Error ('render failed'); } }; await assert.rejects (() => editor.packaging.UnfoldSelected (), /render failed/); assert.equal (editor.selected, source); assert.deepEqual (editor.document.objects, [source]); assert.deepEqual (editor.document.packaging, profile); assert.equal (editor.busy, false); assert.equal (editor.history.undo.length, count); });
    it ('Rejects mutation if the document changes while the module is loading', async () => { const editor = Editor (); const pending = editor.packaging.GenerateFefco (); editor.document = new SceneDocument (); await assert.rejects (pending, /workspace changed/); assert.equal (editor.document.objects.length, 0); assert.equal (editor.document.packaging, null); editor.document.packaging = FefcoProfile ({}); const extrusion = editor.packaging.Extrude (); editor.document = new SceneDocument (); await assert.rejects (extrusion, /workspace changed/); assert.equal (editor.document.objects.length, 0); });
});
