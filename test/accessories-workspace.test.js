import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { AccessoryData } from '../source/website/accessoriesworkspace.js';
import { MeasureWorldBoundsMm } from '../source/website/autopackworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { EngineeringMeasurements } from '../modules/packaging/src/engineering.js';

function fixture ()
{
    const website = { preferences : { units : 'metric' }, auth : { user : { id : 'accessories-owner' } }, accountReady : true };
    const editor = { website, document : new SceneDocument (), history : new SceneHistory (), busy : false, readOnly : false, Render : async () => {}, Status : () => {}, RefreshButtons : () => {}, MarkDirty : () => {} };
    website.sessionEditor = editor; editor.packaging = new PackagingWorkspace (editor); editor.SelectedObjects = () => editor.selected ? [editor.selected] : [];
    return { editor, packaging : editor.packaging, accessories : editor.packaging.accessories };
}
const near = (a, b, tolerance = 1e-6) => assert.ok (Math.abs (a - b) < tolerance, `${a} != ${b}`);
const bounds = (editor, object) => MeasureWorldBoundsMm (editor.document, object, 1, 'object');

describe ('Carton accessories in the scene', function () {
    this.timeout (60000);
    for (const turned of [false, true]) {
        it ('adds pads and interlocking partitions inside a generated carton' + (turned ? ' turned 90°' : ''), async () => {
            const { editor, packaging, accessories } = fixture ();
            const { objectId } = await packaging.GeneratePreset ('0201', { length : 300, width : 200, height : 150, thickness : 3, closure : 'closed', basis : 'inside' });
            const carton = editor.document.objects.find (o => o.id === objectId);
            if (turned) { carton.rotation = [0, 90, 0]; carton.position = [40, 0, -20]; editor.document.ApplyTransform (carton); }
            editor.selected = carton;
            const state = accessories.Inspect ({ partitions : { columns : 3, rows : 2 } });
            assert.equal (state.available, true, state.reason);
            // Same inside size as the dimension tools (inside basis of the generated carton).
            const inside = Object.fromEntries (EngineeringMeasurements (carton.packagingProfile).dimensions.map (d => [d.id, d.insideMm]));
            for (const key of ['length', 'width', 'height']) { near (state.insideMm[key], inside[key]); }
            near (state.insideMm.length, 300); near (state.insideMm.width, 200); near (state.insideMm.height, 150);
            assert.equal (state.partitions.cells, 6); assert.ok (state.boards.records.some (r => r.id === 'nominal-b')); assert.ok (state.boards.grades.includes ('32 ECT'));
            const preview = accessories.Inspect ({ pads : { positions : ['bottom', 'top'], keepBox : true } }); near (preview.pads.pads[0].lengthMm, 298); assert.equal (preview.pads.keepBox, true);

            const cartonBounds = bounds (editor, carton), center = [(cartonBounds.min[0] + cartonBounds.max[0]) / 2, (cartonBounds.min[2] + cartonBounds.max[2]) / 2];
            const floor = cartonBounds.min[1] + (cartonBounds.size[1] - 150) / 2, lengthX = turned; // Generated cartons run their length along Z.
            const insideMin = [center[0] - (lengthX ? 150 : 100), floor, center[1] - (lengthX ? 100 : 150)], insideMax = [center[0] + (lengthX ? 150 : 100), floor + 150, center[1] + (lengthX ? 100 : 150)];
            const within = b => [0, 1, 2].every (i => b.min[i] >= insideMin[i] - 1e-6 && b.max[i] <= insideMax[i] + 1e-6);

            const pads = await accessories.AddPads ({ positions : ['bottom', 'top'], keepBox : true }); assert.equal (pads.pieces, 2); assert.equal (pads.box, null);
            const [bottom, top] = pads.objectIds.map (id => bounds (editor, editor.document.objects.find (o => o.id === id)));
            near (bottom.min[1], floor); near (bottom.size[1], 3); near (top.max[1], floor + 150);
            near (bottom.size[lengthX ? 0 : 2], 298); near (bottom.size[lengthX ? 2 : 0], 198); assert.ok (within (bottom) && within (top));

            const parts = await accessories.AddPartitions ({ columns : 3, rows : 2 }); assert.equal (parts.pieces, 3);
            const strips = parts.objectIds.map (id => editor.document.objects.find (o => o.id === id));
            for (const strip of strips) {
                const b = bounds (editor, strip), data = AccessoryData (strip);
                assert.ok (within (b), data.strip + ' leaves the carton');
                // Strips stand on the bottom pad and stop 1 mm under the top pad.
                near (b.min[1], floor + 3 + 1); near (b.max[1], floor + 150 - 3 - 1);
                const along = data.strip.startsWith ('length') === lengthX ? 0 : 2; near (b.size[along === 0 ? 2 : 0], 3);
                assert.equal (strip.packagingProfile.engineering.materials[0].caliperMm, 3);
            }
            // Width strips sit on the cell boundaries along the length.
            const widthCentres = strips.filter (s => AccessoryData (s).strip.startsWith ('width')).map (s => { const b = bounds (editor, s), axis = lengthX ? 0 : 2; return (b.min[axis] + b.max[axis]) / 2 - insideMin[axis]; }).sort ((a, b) => a - b);
            near (widthCentres[0], parts.partitions.cellMm.length + 1.5); near (widthCentres[1], 2 * parts.partitions.cellMm.length + 4.5);
            // Pads and strips form one group with the carton; partitions block more pads.
            const group = carton.userData._auto3dGroup; assert.ok (group); assert.ok (editor.document.objects.every (o => o.userData._auto3dGroup === group));
            await assert.rejects (accessories.AddPads ({ positions : ['front'], keepBox : true }), /before partitions/);
            assert.match (accessories.Inspect ().partitionReason, /already has partitions/);
            // One Undo step per action.
            assert.equal (editor.history.undo.length, 3);
            await editor.history.undo.at (-1).undo (); assert.equal (editor.document.objects.length, 3);
            await editor.history.undo.at (-2).undo (); assert.equal (editor.document.objects.length, 1); assert.equal (carton.userData._auto3dGroup, undefined);
        });
    }
    it ('grows the carton inside through the dimension tools so pads keep the product space', async () => {
        const { editor, packaging, accessories } = fixture ();
        await packaging.GeneratePreset ('0201', { length : 300, width : 200, height : 150, thickness : 3, closure : 'closed', basis : 'inside' });
        // An E-flute 44 ECT pad board (1.5 mm) on all four positions; the carton board is 3 mm.
        const result = await accessories.AddPads ({ positions : ['bottom', 'top', 'front', 'back'], boardId : 'nominal-e', grade : '44 ECT' });
        assert.equal (result.thicknessMm, 1.5); assert.match (result.boardName, /E flute · 44 ECT/); assert.equal (result.pieces, 4);
        near (result.box.before.height, 150); near (result.box.after.height, 153); near (result.box.after.width, 203); near (result.box.after.length, 300);
        const carton = editor.document.objects.find (o => o.userData._auto3dFefco && !AccessoryData (o));
        const inside = Object.fromEntries (EngineeringMeasurements (carton.packagingProfile).dimensions.map (d => [d.id, d.insideMm]));
        near (inside.height, 153); near (inside.width, 203);
        // The space between the pads is the original inside size.
        const pieces = result.objectIds.map (id => editor.document.objects.find (o => o.id === id)), by = position => bounds (editor, pieces.find (o => AccessoryData (o).position === position));
        near (by ('top').min[1] - by ('bottom').max[1], 150); near (by ('back').min[0] - by ('front').max[0], 200);
        assert.equal (pieces[0].packagingProfile.engineering.materials[0].caliperMm, 1.5); assert.match (pieces[0].packagingProfile.grade, /44 ECT/);
        // Partitions then fit between all four pads.
        const parts = await accessories.AddPartitions ({ columns : 2, rows : 2 }); near (parts.partitions.cellMm.height, 148); near (2 * parts.partitions.cellMm.width + 3, 200);
        assert.equal (editor.history.undo.length, 4);
        await editor.history.undo.at (-1).undo (); await editor.history.undo.at (-2).undo (); await editor.history.undo.at (-3).undo ();
        assert.equal (editor.document.objects.length, 1); near (Object.fromEntries (EngineeringMeasurements (editor.document.objects[0].packagingProfile).dimensions.map (d => [d.id, d.insideMm])).height, 150);
    });
    it ('refuses flat, tilted and unselected cartons and exposes strict commands', async () => {
        const { editor, packaging, accessories } = fixture ();
        assert.match (accessories.Inspect ().reason, /Select a generated carton/);
        const { objectId } = await packaging.GeneratePreset ('0201', { length : 300, width : 200, height : 150, thickness : 3, basis : 'inside' });
        const carton = editor.document.objects.find (o => o.id === objectId); editor.selected = carton;
        carton.rotation = [0, 30, 0]; editor.document.ApplyTransform (carton); assert.match (accessories.Inspect ().reason, /90° steps/);
        carton.rotation = [0, 0, 0]; carton.userData._auto3dPackagingState = 'flat'; assert.match (accessories.Inspect ().reason, /Fold the carton/);
        delete carton.userData._auto3dPackagingState;
        editor.website.packagingPanel = { Refresh () {} };
        const registry = CreateAgentCommands (editor.website, editor);
        assert.equal ((await registry.Execute ('packaging.accessories.inspect', { columns : 4, rows : 3 })).result.partitions.cells, 12);
        assert.equal ((await registry.Execute ('packaging.accessories.partitions', { columns : 1, rows : 1 })).ok, false);
        assert.equal ((await registry.Execute ('packaging.accessories.partitions', { columns : 13, rows : 2 })).ok, false);
        assert.equal ((await registry.Execute ('packaging.accessories.pads', { positions : ['side'] })).ok, false);
        assert.equal ((await registry.Execute ('packaging.accessories.pads', { positions : ['top'], grade : 'cardboard' })).ok, false);
        assert.equal (editor.document.objects.length, 1);
        const added = await registry.Execute ('packaging.accessories.partitions', { columns : 2, rows : 2 }); assert.equal (added.ok, true, JSON.stringify (added)); assert.equal (added.result.pieces, 2);
        editor.readOnly = true; await assert.rejects (accessories.AddPads ({ positions : ['bottom'] }), /./);
    });
});
