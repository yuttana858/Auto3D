import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { AutoPalletWorkspace } from '../source/website/autopalletworkspace.js';
import { MeasureWorldBoundsMm } from '../source/website/autopackworkspace.js';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { FinalizeModel } from '../source/engine/model/modelfinalization.js';
import { Model } from '../source/engine/model/model.js';
import { PhysicalMaterial } from '../source/engine/model/material.js';
import { GenerateCuboid, GeneratorParams } from '../source/engine/model/generator.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { Unit } from '../source/engine/model/unit.js';

// GenerateCuboid spans 0..size from its pivot, so the pivot is not the box centre;
// that exercises the pivot-to-bounds offset, including for 90° turned boxes.
function fixture (unit = Unit.Millimeter, size = [203, 156, 303], position = [40, 0, -25])
{
    const website = { preferences : { units : 'metric' }, auth : { user : { id : 'auto-pallet-owner' } }, accountReady : true };
    const editor = { website, document : new SceneDocument (), history : new SceneHistory (), busy : false, readOnly : false, Render : async () => {}, Status : () => {}, RefreshButtons : () => {}, MarkDirty : () => {} };
    website.sessionEditor = editor; editor.packaging = new PackagingWorkspace (editor);
    editor.packaging.autoPallet ||= new AutoPalletWorkspace (editor.packaging);
    const model = new Model (); model.SetUnit (unit); model.AddMaterial (new PhysicalMaterial ()); model.AddMeshToRootNode (GenerateCuboid (new GeneratorParams ().SetMaterial (0), ...size));
    FinalizeModel (model, {});
    const box = editor.document.AddImported (model, 'Shipper'); box.position = position; editor.document.ApplyTransform (box);
    editor.selected = box; editor.SelectedObjects = () => editor.selected ? [editor.selected] : [];
    return { editor, box, pallet : editor.packaging.autoPallet };
}
const near = (a, b, tolerance = 1e-6) => assert.ok (Math.abs (a - b) < tolerance, `${a} != ${b}`);

describe ('Auto pallet scene integration', function () {
    this.timeout (60000);
    it ('plans from the selected box world bounds without changing the scene', () => {
        const { editor, box, pallet } = fixture ();
        const state = pallet.Inspect (); assert.equal (state.available, true, state.reason);
        near (state.boxMm.width, 203); near (state.boxMm.length, 303); near (state.boxMm.height, 156);
        assert.equal (state.plan.perLayer, 20); assert.equal (state.plan.layers, 8); assert.equal (state.plan.total, 160);
        assert.equal (editor.document.objects.length, 1); assert.deepEqual (box.position, [40, 0, -25]); assert.equal (editor.history.undo.length, 0);
        assert.equal (pallet.Inspect ({ maxHeightMm : 127 + 2 * 156 }).plan.layers, 2);
        assert.match (pallet.Inspect ({ color : 'green' }).reason, /blue, brown or black/);
    });
    it ('builds a centred, non-overlapping column-stacked load on the pallet with one Undo step', async () => {
        const { editor, box, pallet } = fixture (Unit.Millimeter, [228.6, 200, 304.8]);
        const before = MeasureWorldBoundsMm (editor.document, box, 1); const center = [(before.min[0] + before.max[0]) / 2, (before.min[2] + before.max[2]) / 2];
        const result = await pallet.Generate ({ maxHeightMm : 127 + 3 * 200, color : 'brown' });
        assert.equal (result.perLayer, 17); assert.equal (result.layers, 3); assert.equal (result.boxes, 51); assert.equal (result.pattern, 'mixed orientation');
        const objects = editor.document.objects; assert.equal (objects.length, 52);
        const palletObject = objects.find (o => o.id === result.palletId); assert.ok (palletObject.userData._auto3dPallet); assert.match (palletObject.name, /Brown/);
        const palletBounds = MeasureWorldBoundsMm (editor.document, palletObject, 1);
        near (palletBounds.size[0], 1016); near (palletBounds.size[2], 1219.2); near (palletBounds.size[1], 127);
        near ((palletBounds.min[0] + palletBounds.max[0]) / 2, center[0]); near ((palletBounds.min[2] + palletBounds.max[2]) / 2, center[1]); near (palletBounds.min[1], before.min[1]);
        const boxes = objects.filter (o => o !== palletObject).map (o => MeasureWorldBoundsMm (editor.document, o, 1));
        const turned = objects.filter (o => o !== palletObject && o.rotation[1] === 90).length; assert.ok (turned > 0 && turned < 51);
        for (const b of boxes) {
            near (b.size[1], 200); assert.ok ([228.6, 304.8].some (v => Math.abs (b.size[0] - v) < 1e-6));
            assert.ok (b.min[0] >= palletBounds.min[0] - 1e-6 && b.max[0] <= palletBounds.max[0] + 1e-6 && b.min[2] >= palletBounds.min[2] - 1e-6 && b.max[2] <= palletBounds.max[2] + 1e-6, 'box overhangs the pallet');
            const level = (b.min[1] - palletBounds.max[1]) / 200; near (level, Math.round (level));
        }
        for (let i = 0; i < boxes.length; i++) {
            for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i], b = boxes[j], apart = [0, 1, 2].some (axis => a.max[axis] <= b.min[axis] + 1e-6 || b.max[axis] <= a.min[axis] + 1e-6);
                assert.ok (apart, `boxes ${i} and ${j} overlap`);
            }
        }
        const group = palletObject.userData._auto3dGroup; assert.ok (objects.every (o => o.userData._auto3dGroup === group));
        assert.equal (editor.history.undo.length, 1); assert.equal (editor.selected, box);
        await editor.history.undo.at (-1).undo ();
        assert.deepEqual (editor.document.objects, [box]); assert.deepEqual (box.position, [40, 0, -25]); assert.equal (box.userData._auto3dGroup, undefined);
        await editor.history.undo.at (-1).redo ();
        assert.equal (editor.document.objects.length, 52); assert.equal (editor.document.objects[1].id, result.palletId);
    });
    it ('converts inch scenes to millimetres and refuses unsafe selections', async () => {
        const inch = fixture (Unit.Inch, [8, 6, 12], [0, 0, 0]);
        const state = inch.pallet.Inspect (); assert.equal (state.available, true, state.reason); near (state.boxMm.width, 203.2); near (state.boxMm.length, 304.8);
        const { editor, box, pallet } = fixture ();
        box.rotation = [90, 0, 0]; editor.document.ApplyTransform (box); assert.match (pallet.Inspect ().reason, /X and Z rotation/);
        box.rotation = [0, 0, 0]; box.userData = { _auto3dPackagingState : 'flat' }; assert.match (pallet.Inspect ().reason, /Fold the box/);
        box.userData = {}; editor.readOnly = true; await assert.rejects (pallet.Generate (), /./); editor.readOnly = false;
        editor.selected = null; assert.match (pallet.Inspect ().reason, /Select one visible box/);
        const tiny = fixture (Unit.Millimeter, [40, 40, 40]); await assert.rejects (tiny.pallet.Generate (), /object session limit|More than/);
        assert.equal (tiny.editor.document.objects.length, 1);
    });
    it ('exposes plan, inspect and generate as strict agent commands', async () => {
        const { editor } = fixture (); const website = editor.website; website.packagingPanel = { Refresh () {} };
        const registry = CreateAgentCommands (website, editor);
        const plan = await registry.Execute ('packaging.pallet.plan', { width : 203, length : 303, height : 156 });
        assert.equal (plan.ok, true, JSON.stringify (plan)); assert.equal (plan.result.total, 160);
        assert.equal ((await registry.Execute ('packaging.pallet.plan', { width : 203, length : 303 })).ok, false);
        assert.equal ((await registry.Execute ('packaging.pallet.inspect', { color : 'black' })).result.plan.total, 160);
        assert.equal ((await registry.Execute ('packaging.pallet.generate', { color : 'pink' })).ok, false);
        assert.equal (editor.document.objects.length, 1);
    });
});
