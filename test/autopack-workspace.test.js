import assert from 'node:assert/strict';
import { AutoPackWorkspace, MeasureWorldBoundsMm } from '../source/website/autopackworkspace.js';
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
import { EngineeringMeasurements } from '../modules/packaging/src/engineering.js';

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
        assert.equal (editor.packaging.FoldInspect ().state, 'completed'); assert.equal (editor.busy, false); assert.equal (editor.document.objects.length, 2); assert.equal (editor.history.undo.length, 1, 'the whole Auto Pack is one Undo step');
        assert.equal (JSON.stringify ([product.position, product.rotation, product.scale]), transform); assert.equal (editor.document.objects[0], product);
        const packed = editor.selected; assert.equal (packed.id, result.objectId); assert.equal (packed.userData._auto3dPackagingState, 'folded');
        const restored = ReadSession (PackSession (editor.document)).document.objects.find (o => o.id === packed.id); assert.equal (JSON.parse (restored.userData._auto3dAutoPack).productId, product.id);
        // The carton is a standard generated box: its CAD profile carries the board record and inside-basis
        // measurement layer, and the engineering inside dimensions are exactly the fit targets.
        const engineering = EngineeringMeasurements (packed.packagingProfile), inside = Object.fromEntries (engineering.dimensions.filter (d => ['length', 'width', 'height'].includes (d.id)).map (d => [d.id, d]));
        assert.equal (JSON.parse (packed.userData._auto3dAutoPack).basis, 'engineering-inside');
        assert.ok (['length', 'width', 'height'].every (id => inside[id].basis === 'inside'));
        near (inside.length.insideMm, 60 + .0508 + 3); near (inside.width.insideMm, 24 + .0508); near (inside.height.insideMm, 80 + .0508);
        assert.equal (engineering.material.caliperMm, JSON.parse (packed.userData._auto3dFefco).thickness);
        await editor.history.Undo (); assert.deepEqual (editor.document.objects, [product]); assert.equal (editor.selected, product);
        await editor.history.Redo (); assert.equal (editor.document.objects.length, 2); assert.equal (editor.selected.userData._auto3dPackagingState, 'folded'); await editor.history.Undo (); assert.deepEqual (editor.document.objects, [product]);
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
    it ('plays the assembly sequence: products rise in place, pieces lower in later, everything ends packed, one Undo restores', async () => {
        const { auto, editor, product } = fixture ();
        const copies = [1, 2].map (index => { const copy = editor.document.Instance (product); copy.position = [index * 50, 0, 0]; editor.document.ApplyTransform (copy); return copy; });
        const products = [product, ...copies]; products.forEach (item => { item.userData = { _auto3dGroup : 'row', _auto3dGroupName : 'Array group', _auto3dGroupKind : 'array' }; });
        editor.SelectedObjects = () => products; const original = products.map (item => [...item.position]);
        // Stand-in meshes record where the sequence draws each object.
        const mesh = () => ({ position : { x : 0, y : 0, z : 0, set (x, y, z) { Object.assign (this, { x, y, z }); }, fromArray (a) { this.set (...a); } }, visible : true, updateMatrixWorld () {} });
        products.forEach (o => { o.threeObject = mesh (); });
        const result = await auto.Generate ({ duration : 1, partitions : true, pads : ['bottom', 'top', 'front', 'back'] });
        const sequence = auto.sequence, info = sequence.Inspect ();
        assert.deepEqual (info.stages.map (s => s.name), ['lift', 'erect', 'bottom', 'sides', 'partitions', 'products', 'top', 'close']);
        assert.deepEqual (info.order, [product.id, copies[0].id, copies[1].id]); assert.ok (info.entryMm > 83);
        const pieces = result.contents.pieces.map (id => editor.document.objects.find (o => o.id === id)), drawn = o => [o.threeObject.position.x, o.threeObject.position.y, o.threeObject.position.z];
        pieces.forEach (o => { o.threeObject ||= mesh (); }); /* only products and pieces; the carton keeps the fold's own preview */
        sequence.Frame (0); assert.ok (pieces.every (o => o.threeObject.visible === false), 'pads and partitions start hidden');
        products.forEach ((item, i) => { const at = drawn (item); original[i].forEach ((v, axis) => near (at[axis], v)); }); /* drawn where they were, before the partition spread */
        const stage = name => info.stages.find (s => s.name === name);
        sequence.Frame ((stage ('erect').start + stage ('erect').end) / 2); assert.ok (sequence.Inspect ().fold > 0 && sequence.Inspect ().fold < 0.76);
        products.forEach (item => assert.ok (drawn (item)[1] > item.position[1] + 83, 'hovering above the open carton while it erects'));
        sequence.Frame (stage ('close').start); assert.equal (sequence.Inspect ().fold, 0.76); products.forEach (item => near (drawn (item)[1], item.position[1]));
        assert.ok (pieces.every (o => o.threeObject.visible));
        const operation = editor.packaging.foldOperation; operation.player.now = () => operation.player.last + 2000; operation.player.Tick (); await operation.completion;
        assert.equal (editor.packaging.FoldInspect ().state, 'completed', JSON.stringify (editor.packaging.lastFold)); assert.equal (editor.history.undo.length, 1, 'contents, carton and fold are one Undo step');
        [...products, ...pieces].forEach (o => { const at = drawn (o); o.position.forEach ((v, axis) => near (at[axis], v)); assert.equal (o.threeObject.visible, true); });
        await editor.history.Undo (); assert.deepEqual (editor.document.objects, products); products.forEach ((item, i) => assert.deepEqual (item.position, original[i]));
    });
    it ('packs an array with nested partitions and pads: opens gaps, nests strips, fits the carton around everything', async () => {
        const { auto, editor, product } = fixture ();
        const copies = [1, 2].map (index => { const copy = editor.document.Instance (product); copy.position = [index * 50, 0, 0]; editor.document.ApplyTransform (copy); return copy; });
        const products = [product, ...copies]; products.forEach (item => { item.userData = { _auto3dGroup : 'row', _auto3dGroupName : 'Array group of Selected product', _auto3dGroupKind : 'array' }; });
        editor.SelectedObjects = () => products; const positions = products.map (item => [...item.position]);
        const options = { partitions : true, pads : ['bottom', 'top', 'front', 'back'], boardId : 'nominal-e', grade : '44 ECT' };
        // Preview: 3 columns touching, so 2 gaps open to 1.5 mm board + 2 × 0.5 mm; carton sized for everything.
        const preview = auto.Inspect (options).contents;
        assert.equal (preview.partitions.layout.columns, 3); assert.equal (preview.partitions.strips, 2); near (preview.partitions.growthMm.length, 5); assert.equal (preview.pads.length, 4);
        near (preview.packedMm.width, 155); near (preview.packedMm.height, 83); near (preview.packedMm.length, 33);
        assert.equal (editor.document.objects.length, 3);
        const result = await auto.Generate ({ duration : 1, ...options }); assert.equal (result.started, true);
        assert.equal (result.contents.pieces.length, 6); assert.equal (result.contents.moved, 2); assert.match (result.contents.board, /E flute · 44 ECT/); assert.match (result.message, /2 partition strips and 4 pads/);
        const bounds = object => MeasureWorldBoundsMm (editor.document, object, 1), pieces = result.contents.pieces.map (id => editor.document.objects.find (o => o.id === id));
        const productBounds = products.map (bounds), strips = pieces.filter (o => JSON.parse (o.userData._auto3dAccessory).kind === 'partition').map (bounds);
        // Products now stand 2.5 mm apart and each strip sits in a gap without touching them.
        near (productBounds[1].min[0] - productBounds[0].max[0], 2.5); near (productBounds[2].min[0] - productBounds[1].max[0], 2.5);
        for (const s of strips) { near (s.size[0], 1.5); near (s.size[1], 80); near (s.size[2], 30); for (const p of productBounds) { assert.ok (s.max[0] <= p.min[0] + 1e-9 || s.min[0] >= p.max[0] - 1e-9); } }
        // The carton is fitted around products and contents, and guards them all.
        const flat = editor.document.objects.find (o => o.userData._auto3dAutoPack), saved = JSON.parse (flat.userData._auto3dAutoPack);
        assert.equal (saved.productIds.length, 9); near (saved.size[0], 155); near (saved.size[1], 83); near (saved.size[2], 33);
        assert.ok (pieces.every (o => JSON.parse (o.userData._auto3dAccessory).cartonId === flat.id));
        const operation = editor.packaging.foldOperation; editor.packaging.FoldControl ('cancel'); await operation.completion;
        // Undo removes the carton, then the contents, and puts the products back.
        await editor.history.Undo (); await editor.history.Undo ();
        assert.deepEqual (editor.document.objects, products); products.forEach ((item, i) => assert.deepEqual (item.position, positions[i]));
        await assert.rejects (auto.Generate ({ duration : 1, pads : ['side'] }), /pad positions/);
        editor.SelectedObjects = () => [product]; assert.match (auto.Inspect ({ partitions : true }).contents.reason, /at least two products/);
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
