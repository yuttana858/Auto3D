import assert from 'node:assert/strict';
import { AutoPackWorkspace } from '../source/website/autopackworkspace.js';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { FinalizeModel } from '../source/engine/model/modelfinalization.js';
import { Model } from '../source/engine/model/model.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import { GenerateCuboid, GeneratorParams } from '../source/engine/model/generator.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { PackSession, ReadSession } from '../source/website/sessionarchive.js';
import { Unit } from '../source/engine/model/unit.js';

function fixture (unit = Unit.Millimeter, size = [50, 80, 30]) {
    const website = { preferences : { units : 'metric' }, auth : { user : { id : 'auto-pack-owner' } }, accountReady : true };
    const editor = { website, document : new SceneDocument (), history : new SceneHistory (), busy : false, readOnly : false, Render : async () => {}, Status : () => {}, RefreshButtons : () => {}, MarkDirty : () => {} };
    website.sessionEditor = editor; editor.packaging = new PackagingWorkspace (editor);
    editor.packaging.autoPack ||= new AutoPackWorkspace (editor.packaging);
    const model = new Model (); model.SetUnit (unit); model.AddMaterial (new PhysicalMaterial ()); model.AddMeshToRootNode (GenerateCuboid (new GeneratorParams ().SetMaterial (0), ...size));
    FinalizeModel (model, {});
    const product = editor.document.AddImported (model, 'Selected product'); editor.selected = product; editor.SelectedObjects = () => editor.selected ? [editor.selected] : [];
    return { editor, product, auto : editor.packaging.autoPack };
}
const near = (a, b) => assert.ok (Math.abs (a - b) < 1e-7, `${a} != ${b}`);
describe ('Auto Pack scene integration', function () {
    this.timeout (60000);
    let request, cancel, pending;
    beforeEach (() => { request = global.requestAnimationFrame; cancel = global.cancelAnimationFrame; global.requestAnimationFrame = callback => { pending = callback; return 1; }; global.cancelAnimationFrame = () => { pending = null; }; });
    afterEach (() => { global.requestAnimationFrame = request; global.cancelAnimationFrame = cancel; });
    it ('measures transformed world bounds rather than the unscaled source mesh', () => {
        const { editor, product, auto } = fixture (); product.position = [412.25, -27.5, 93.125]; product.rotation = [0, 90, 0]; product.scale = [2, 1.5, 1]; editor.document.ApplyTransform (product);
        const state = auto.Inspect (); assert.equal (state.available, true, state.reason); assert.equal (state.objectId, product.id);
        near (state.productMm.width, 30); near (state.productMm.length, 100); near (state.productMm.height, 120); near (state.clearanceMm, .0254);
        assert.deepEqual (product.position, [412.25, -27.5, 93.125]); assert.deepEqual (product.scale, [2, 1.5, 1]); assert.equal (editor.history.undo.length, 0);
    });
    it ('converts inch geometry to canonical millimetres independently of display units', () => {
        const { auto, editor } = fixture (Unit.Inch, [2, 4, 3]);
        for (const units of ['metric', 'standard']) { editor.website.preferences.units = units; const state = auto.Inspect (); assert.equal (state.available, true, state.reason); near (state.productMm.width, 50.8); near (state.productMm.length, 76.2); near (state.productMm.height, 101.6); near (state.clearanceMm, .0254); }
    });
    it ('does not offer packing without selected visible solid geometry or known units', () => {
        const { auto, editor, product } = fixture (); editor.selected = null; assert.equal (auto.Inspect ().available, false);
        editor.selected = product; product.visible = false; assert.equal (auto.Inspect ().available, false); product.visible = true;
        editor.document.model.SetUnit (Unit.Unknown); assert.equal (auto.Inspect ().available, false); assert.equal (editor.history.undo.length, 0);
    });
    it ('adds and folds a carton while preserving the product, with reversible flat and folded states', async () => {
        const { auto, editor, product } = fixture (); product.position = [25, 40, -65]; product.scale = [1.2, 1, .8]; editor.document.ApplyTransform (product);
        const transform = JSON.stringify ([product.position, product.rotation, product.scale]);
        const result = await auto.Generate ({ duration : 1 }); assert.equal (result.started, true); assert.equal (result.productId, product.id); assert.equal (editor.busy, true);
        const flat = editor.document.objects.find (o => o !== product); assert.equal (flat.userData._auto3dPackagingState, 'flat'); assert.equal (editor.history.undo.length, 1);
        const summary = auto.Inspect (); assert.equal (summary.available, false); assert.equal (summary.fitted, true); assert.equal (summary.objectId, product.id); near (summary.productMm.width, 60); near (summary.productMm.height, 80); near (summary.productMm.length, 24);
        assert.throws (() => SessionEditor.prototype.Archive.call (editor), /Finish or cancel folding/);
        const operation = editor.packaging.foldOperation; operation.player.now = () => operation.player.last + 2000; pending (); await operation.completion;
        assert.equal (editor.packaging.FoldInspect ().state, 'completed'); assert.equal (editor.busy, false); assert.equal (editor.document.objects.length, 2); assert.equal (editor.history.undo.length, 2);
        assert.equal (JSON.stringify ([product.position, product.rotation, product.scale]), transform); assert.equal (editor.document.objects[0], product);
        const packed = editor.selected; assert.equal (packed.id, result.objectId); assert.equal (packed.userData._auto3dPackagingState, 'folded');
        const restored = ReadSession (PackSession (editor.document)).document.objects.find (o => o.id === packed.id); assert.equal (JSON.parse (restored.userData._auto3dAutoPack).productId, product.id);
        await editor.history.Undo (); assert.equal (editor.selected.userData._auto3dPackagingState, 'flat'); await editor.history.Undo (); assert.deepEqual (editor.document.objects, [product]); assert.equal (editor.selected, product);
        await editor.history.Redo (); await editor.history.Redo (); assert.equal (editor.selected.userData._auto3dPackagingState, 'folded'); assert.equal (editor.document.objects.length, 2);
    });
    it ('pause/cancel restores the generated flat carton and Undo removes only that carton', async () => {
        const { auto, editor, product } = fixture (); await auto.Generate ({ duration : 1 }); const operation = editor.packaging.foldOperation;
        editor.packaging.FoldControl ('pause'); assert.equal (editor.packaging.FoldInspect ().state, 'paused'); editor.packaging.FoldControl ('cancel'); await operation.completion;
        assert.equal (editor.packaging.FoldInspect ().state, 'cancelled'); assert.equal (editor.selected.userData._auto3dPackagingState, 'flat'); assert.equal (editor.history.undo.length, 1); assert.equal (editor.busy, false);
        await editor.history.Undo (); assert.deepEqual (editor.document.objects, [product]); assert.equal (editor.selected, product);
    });
    it ('blocks saving during clearance inspection and rejects an account change before mutation', async () => {
        const { auto, editor, product } = fixture (); let checking = false;
        editor.Status = message => { if (message.includes ('checking clearance')) { checking = true; assert.equal (editor.busy, true); assert.throws (() => SessionEditor.prototype.Archive.call (editor), /Finish or cancel folding/); editor.website.auth.user = null; } };
        await assert.rejects (() => auto.Generate (), /session changed|account changed/); assert.equal (checking, true); assert.deepEqual (editor.document.objects, [product]); assert.equal (editor.selected, product); assert.equal (editor.busy, false); assert.equal (editor.history.undo.length, 0); assert.equal (editor.packaging.foldOperation, null);
    });
    it ('does not leak fold history into a session switched during the final render', async () => {
        const { auto, editor, product } = fixture (), originalDocument = editor.document, originalHistory = editor.history;
        const nextDocument = new SceneDocument (), nextHistory = new SceneHistory (); let renders = 0;
        editor.Render = async () => {
            if (++renders === 3) {
                editor.document = nextDocument; editor.history = nextHistory; editor.selected = null;
                editor.website.auth.user = { id : 'another-owner' };
            }
        };
        await auto.Generate ({ duration : 1 }); const operation = editor.packaging.foldOperation;
        operation.player.now = () => operation.player.last + 2000; pending (); await operation.completion;
        assert.equal (renders, 3); assert.equal (editor.document, nextDocument); assert.equal (editor.history, nextHistory);
        assert.equal (nextHistory.undo.length, 0); assert.equal (nextDocument.objects.length, 0); assert.equal (editor.selected, null);
        assert.equal (originalHistory.undo.length, 1); assert.equal (originalDocument.objects.length, 2); assert.equal (originalDocument.objects[0], product);
        assert.equal (originalDocument.objects[1].userData._auto3dPackagingState, 'flat'); assert.equal (editor.busy, false);
        assert.equal (editor.packaging.FoldInspect ().state, 'failed'); assert.equal (editor.packaging.foldOperation, null);
    });
    it ('rolls back flat-carton creation after a failed render', async () => {
        const { auto, editor, product } = fixture (); const profile = editor.document.packaging; let renders = 0; editor.Render = async () => { if (renders++ === 0) { throw new Error ('render failed'); } };
        await assert.rejects (() => auto.Generate (), /render failed/); assert.deepEqual (editor.document.objects, [product]); assert.equal (editor.document.packaging, profile); assert.equal (editor.selected, product); assert.equal (editor.busy, false); assert.equal (editor.history.undo.length, 0);
    });
    it ('packs a selected array as one product around the combined bounds and guards every member', async () => {
        const { auto, editor, product } = fixture ();
        const copies = [1, 2].map (index => { const copy = editor.document.Instance (product); copy.position = [index * 50, 0, 0]; editor.document.ApplyTransform (copy); return copy; });
        const group = [product, ...copies]; group.forEach (item => { item.userData = { _auto3dGroup : 'array-1', _auto3dGroupName : 'Array group of Selected product', _auto3dGroupKind : 'array' }; });
        editor.SelectedObjects = () => group;
        const state = auto.Inspect (); assert.equal (state.available, true, state.reason); assert.deepEqual (state.objectIds, group.map (item => item.id));
        // Three 50 × 80 × 30 cuboids side by side along X: 150 wide.
        near (state.productMm.width, 150); near (state.productMm.height, 80); near (state.productMm.length, 30); assert.match (state.objectName, /3 products/);
        const result = await auto.Generate ({ duration : 1 }); assert.deepEqual (result.productIds, group.map (item => item.id)); assert.match (result.message, /3 selected products/);
        const operation = editor.packaging.foldOperation; editor.packaging.FoldControl ('cancel'); await operation.completion;
        const carton = editor.selected, saved = JSON.parse (carton.userData._auto3dAutoPack); assert.deepEqual (saved.productIds, group.map (item => item.id)); near (saved.size[0], 150);
        assert.match (auto.Inspect ().objectName, /^3 products · saved fit$/);
        // Moving any member of the array blocks replay until Auto Pack runs again.
        copies[1].position[2] += 1; editor.document.ApplyTransform (copies[1]); await assert.rejects (() => editor.packaging.AnimateFold (), /product changed/);
        copies[1].position[2] -= 1; editor.document.ApplyTransform (copies[1]);
        editor.SelectedObjects = () => [...group, carton]; editor.selected = product; assert.match (auto.Inspect ().reason, /rather than their Auto Pack carton/);
    });
    it ('refuses replay and dimension edits after the fitted product or carton moves', async () => {
        const { auto, editor, product } = fixture (); await auto.Generate ({ duration : 1 }); const operation = editor.packaging.foldOperation;
        editor.packaging.FoldControl ('cancel'); await operation.completion; const flat = editor.selected, count = editor.history.undo.length;
        product.position[0] += 1; editor.document.ApplyTransform (product); await assert.rejects (() => editor.packaging.AnimateFold (), /product changed/); product.position[0] -= 1; editor.document.ApplyTransform (product);
        flat.position[2] += 1; editor.document.ApplyTransform (flat); await assert.rejects (() => editor.packaging.AnimateFold (), /carton moved/); flat.position[2] -= 1; editor.document.ApplyTransform (flat);
        await assert.rejects (() => editor.packaging.UpdateDimensions ({ width : 200 }), /fitted by Auto Pack/); assert.equal (editor.history.undo.length, count); assert.equal (editor.busy, false);
    });
    it ('exposes strict command inspection and rejects invalid or read-only generation', async () => {
        const { editor } = fixture (), registry = CreateAgentCommands (editor.website);
        const inspected = await registry.Execute ('packaging.auto.inspect'); assert.equal (inspected.ok, true); assert.equal (inspected.result.available, true);
        for (const args of [{ duration : 0 }, { duration : 31 }, { duration : '8' }, { clearanceMm : 0 }]) { assert.equal ((await registry.Execute ('packaging.auto.generate', args)).ok, false); }
        editor.readOnly = true; assert.equal ((await registry.Execute ('packaging.auto.generate')).ok, false); assert.equal ((await registry.Execute ('packaging.auto.inspect')).ok, true); assert.equal (editor.history.undo.length, 0);
    });
    it ('rejects unauthenticated, read-only and busy generation without altering the product', async () => {
        for (const flag of ['auth', 'readOnly', 'busy']) {
            const { auto, editor, product } = fixture ();
            if (flag === 'auth') { editor.website.auth.user = null; } else { editor[flag] = true; }
            await assert.rejects (() => auto.Generate ()); assert.equal (editor.document.objects.length, 1); assert.equal (editor.selected, product); assert.equal (editor.history.undo.length, 0);
        }
    });
});
