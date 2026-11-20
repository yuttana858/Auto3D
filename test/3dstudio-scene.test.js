import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CreatePrimitiveDefinition, ValidateStudioDefinition } from '../modules/3dstudio/src/definition.js';
import { EvaluateStudio } from '../modules/3dstudio/src/kernel.js';
import { StudioWorkspace, StudioDataKey } from '../source/website/studioworkspace.js';
import { StudioModel, StudioMeshPrefix } from '../source/website/studioadapter.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { SessionTimeline } from '../source/website/sessiontimeline.js';
import { PackSession, ReadSession, CreateSessionArchive, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { RecoverySnapshot } from '../source/website/sessionrecovery.js';
import { PackRecoverySnapshot } from '../source/website/sessionrecoverypack.js';
import { Unit } from '../source/engine/model/unit.js';
import { GetBoundingBox } from '../source/engine/model/modelutils.js';
import { RGBColor } from '../source/engine/model/color.js';
import { TextureMap } from '../source/engine/model/material.js';

function Fixture (evaluate = EvaluateStudio)
{
    const editor = { document : new SceneDocument (), history : new SceneHistory (), selected : null, selectedIds : new Set (), busy : false, readOnly : false, renders : 0, async Render (fit, callback) { callback?.(); this.renders++; }, RefreshButtons () {}, Status () {}, Focus () { this.focused = (this.focused || 0) + 1; }, SelectedObjects () { return this.document.objects.filter (object => this.selectedIds.has (object.id)); } };
    const panel = { website : { auth : { user : { id : 'owner' } }, accountReady : true, sessionEditor : editor }, Refresh () {}, Blocked () { return editor.busy || editor.readOnly || !this.website.auth.user || !this.website.accountReady; } };
    const workspace = new StudioWorkspace (panel, evaluate); panel.studio = workspace;
    return { panel, editor, workspace };
}
function Select (editor, ...objects) { editor.selected = objects[0] || null; editor.selectedIds = new Set (objects.map (object => object.id)); }
function Near (actual, expected, tolerance = 1e-5) { assert.ok (Math.abs (actual - expected) <= tolerance, actual + ' != ' + expected); }
function Bounds (editor, object) { return GetBoundingBox (editor.document.CompactModel ([object])); }
function Surface (editor, object, nodeId = 'primitive-1')
{
    let result;
    object.node.EnumerateMeshIndices (index => { const mesh = editor.document.model.GetMesh (index); if (mesh.GetName () === StudioMeshPrefix + nodeId && mesh.TriangleCount ()) { result = editor.document.model.GetMaterial (mesh.GetTriangle (0).mat); } });
    assert.ok (result, 'Missing material for ' + nodeId); return result;
}
function Deferred () { let resolve, reject; const promise = new Promise ((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

describe ('3Dstudio scene integration', function () {
    this.timeout (15000);

    it ('accepts the real renderer timeline normalization while retaining post-render selection guards', async function () {
        const { editor, workspace } = Fixture (), timeline = { objectKeyCache : new WeakMap () };
        editor.Render = async (fit, beforeDisplay) => {
            beforeDisplay?.();
            // SessionEditor.Render ends in RefreshUI/AnimationUI, which runs
            // this real normalizer even for a newly created static primitive.
            for (const object of editor.document.objects) { SessionTimeline.prototype.NormalizeObjectKeyframes.call (timeline, object); }
        };
        await workspace.Create (); assert.deepEqual (editor.selected.keyframes, []); assert.equal (editor.history.undo.length, 1);
        const first = editor.selected; await workspace.UpdateNode ({ nodeId : 'primitive-1', parameters : { widthMm : 80 } }); assert.equal (editor.selected.id, first.id); assert.equal (editor.history.undo.length, 2);
        const updated = editor.selected; editor.Render = async (fit, beforeDisplay) => { beforeDisplay?.(); Select (editor); };
        await assert.rejects (workspace.UpdateNode ({ nodeId : 'primitive-1', parameters : { widthMm : 90 } }), /scene changed/i);
        assert.equal (editor.document.objects[0], updated); assert.equal (editor.history.undo.length, 2);
    });

    it ('creates independent solids with separated placement, one Undo, known units and inspectable persistent history', async function () {
        const { editor, workspace } = Fixture (), initialUnit = editor.document.model.GetUnit ();
        const result = await workspace.Create ({ type : 'box', parameters : { widthMm : 20, heightMm : 30, depthMm : 40 } }); const first = editor.selected;
        assert.deepEqual (first.position, [0, 0, 0]); assert.equal (editor.document.model.GetUnit (), Unit.Millimeter); assert.equal (result.metrics.volumeMm3, 24000);
        assert.equal (editor.history.undo.length, 1); assert.equal (editor.focused, 1); assert.equal (workspace.Inspect ().objectId, first.id);
        await editor.history.Undo (); assert.equal (editor.document.objects.length, 0); assert.equal (editor.document.model.GetUnit (), initialUnit);
        await editor.history.Redo (); assert.equal (editor.selected, first); assert.equal (editor.document.model.GetUnit (), Unit.Millimeter);
        const context = workspace.Inspect ().editContext;
        await workspace.Create ({ type : 'sphere', parameters : { diameterMm : 30, segments : 16 } }); const second = editor.selected;
        assert.ok (Bounds (editor, second).min.x >= Bounds (editor, first).max.x + 10 - 1e-6);
        assert.notEqual (workspace.Inspect ().editContext, context); assert.equal (editor.history.undo.length, 2); assert.equal (workspace.Inspect ().objects.length, 2);
        await editor.history.Undo (); assert.equal (editor.selected, first); await editor.history.Redo (); assert.equal (editor.selected, second);
        assert.deepEqual (ValidateStudioDefinition (JSON.parse (second.userData[StudioDataKey])), workspace.Inspect ().definition);
    });

    it ('updates the pinned solid without moving it or losing groups, visibility, tracks, advanced surfaces or duplicates', async function () {
        const { editor, workspace } = Fixture (); await workspace.Create (); const original = editor.selected;
        Object.assign (original, { name : 'Fixture body', visible : false, castShadow : false, receiveShadow : false, position : [30, 40, 50], rotation : [14, 22, 31], scale : [-2, 1.5, .7], keyframes : [{ time : 0, position : [30, 40, 50] }], visibilityKeys : [{ time : 1, visible : false }] });
        original.userData._auto3dGroup = 'fixture-group'; original.userData.sku = 'fixture-1'; editor.document.ApplyTransform (original);
        const duplicate = editor.document.Duplicate (original), duplicateRecipe = duplicate.userData[StudioDataKey], context = workspace.Inspect ().editContext;
        const surface = Surface (editor, original); surface.name = 'Paint renamed by user'; surface.roughness = .82; surface.clearcoat = .76; surface.ior = 1.69; surface.diffuseMap = new TextureMap (); surface.diffuseMap.name = 'paint.png';
        await workspace.UpdateNode ({ objectId : original.id, nodeId : 'primitive-1', parameters : { widthMm : 70 } }); const updated = editor.selected;
        assert.equal (updated.id, original.id); assert.equal (updated.name, original.name); assert.equal (updated.visible, false); assert.equal (updated.castShadow, false); assert.equal (updated.receiveShadow, false);
        for (const key of ['position', 'rotation', 'scale', 'keyframes', 'visibilityKeys']) { assert.deepEqual (updated[key], original[key]); }
        assert.equal (updated.userData._auto3dGroup, 'fixture-group'); assert.equal (updated.userData.sku, 'fixture-1'); assert.equal (duplicate.userData[StudioDataKey], duplicateRecipe); assert.equal (editor.document.objects[0], updated);
        assert.equal (Surface (editor, updated).roughness, .82); assert.equal (Surface (editor, updated).ior, 1.69); assert.equal (Surface (editor, updated).diffuseMap.name, 'paint.png'); assert.notEqual (Surface (editor, updated).diffuseMap, surface.diffuseMap);
        const regenerated = editor.document.CompactModel ([updated], true).meshes[0];
        assert.ok (regenerated.triangles.every (triangle => triangle.HasTextureUVs ())); assert.ok (regenerated.uvs.every (uv => Number.isFinite (uv.x) && Number.isFinite (uv.y))); assert.ok (regenerated.uvs.some (uv => uv.x === 1)); assert.ok (regenerated.uvs.some (uv => uv.y === 1));
        assert.equal (workspace.Inspect ().editContext, context); assert.equal (editor.history.undo.length, 2);
        await editor.history.Undo (); assert.equal (editor.selected, original); await editor.history.Redo (); assert.equal (editor.selected, updated);
        // Selecting the recipe's original value is still an explicit override
        // of an advanced editor change to that same channel.
        await workspace.UpdateNode ({ objectId : updated.id, nodeId : 'primitive-1', material : { roughness : .45, color : '#ff4400', opacity : .3 } });
        const changed = Surface (editor, editor.selected); assert.equal (changed.roughness, .45); assert.deepEqual (changed.color, new RGBColor (255, 68, 0)); assert.equal (changed.opacity, .3); assert.equal (changed.transparent, true); assert.equal (changed.clearcoat, .76); assert.equal (changed.ior, 1.69);
    });

    it ('subtracts into a new editable result, preserves operand materials including cut faces, and restores both inputs on Undo', async function () {
        const { editor, workspace } = Fixture (); await workspace.Create ({ parameters : { widthMm : 40, heightMm : 40, depthMm : 40 } }); const target = editor.selected;
        await workspace.Create ({ type : 'cylinder', parameters : { diameterMm : 10, heightMm : 50, segments : 32 }, material : { color : '#f06020' } }); const tool = editor.selected;
        tool.position = [0, -5, 0]; editor.document.ApplyTransform (tool); Select (editor, target, tool);
        Surface (editor, target).clearcoat = .65; Surface (editor, tool).roughness = .09;
        const result = await workspace.Boolean ({ operation : 'subtract' }), object = editor.selected;
        assert.notEqual (object.id, target.id); assert.equal (target.visible, false); assert.equal (tool.visible, false); assert.equal (editor.document.objects.length, 3); assert.equal (editor.history.undo.length, 3);
        assert.ok (result.metrics.volumeMm3 < 64000 && result.metrics.volumeMm3 > 60000); assert.equal (result.metrics.closed, true);
        const toolNode = result.definition.nodes.find (node => node.kind === 'primitive' && node.id !== 'primitive-1');
        assert.equal (Surface (editor, object).clearcoat, .65); assert.equal (Surface (editor, object, toolNode.id).roughness, .09); assert.deepEqual (Surface (editor, object, toolNode.id).color, new RGBColor (240, 96, 32));
        await editor.history.Undo (); assert.equal (editor.document.objects.length, 2); assert.equal (target.visible, true); assert.equal (tool.visible, true); assert.equal (editor.selected, target); assert.deepEqual ([...editor.selectedIds], [target.id, tool.id]);
        await editor.history.Redo (); assert.equal (editor.selected, object); assert.equal (target.visible, false); assert.equal (tool.visible, false);
        await workspace.UpdateNode ({ objectId : object.id, nodeId : toolNode.id, parameters : { diameterMm : 20 } });
        assert.equal (editor.selected.id, object.id); assert.equal (JSON.parse (tool.userData[StudioDataKey]).nodes[0].parameters.diameterMm, 10); assert.ok ((await EvaluateStudio (workspace.Inspect ().definition)).statistics.volumeMm3 < result.metrics.volumeMm3);
    });

    it ('uses canonical-mm relative matrices for mirrored, rotated and nonuniformly scaled operands in an inch scene', async function () {
        const { editor, workspace } = Fixture (); const seed = StudioModel (await EvaluateStudio (CreatePrimitiveDefinition ('box')), Unit.Inch); editor.document.AddImported (seed, 'Existing inch import');
        await workspace.Create ({ parameters : { widthMm : 25.4, heightMm : 25.4, depthMm : 25.4 } }); const target = editor.selected;
        await workspace.Create ({ parameters : { widthMm : 12.7, heightMm : 12.7, depthMm : 12.7 } }); const tool = editor.selected;
        Object.assign (target, { position : [3, 2, -1], rotation : [13, 37, 29], scale : [-2, 1.5, .75] });
        Object.assign (tool, { position : [3.1, 2.1, -.9], rotation : [-17, 11, 56], scale : [.8, -1.2, 2] }); editor.document.ApplyTransform (target); editor.document.ApplyTransform (tool);
        const expected = new THREE.Matrix4 ().fromArray (target.node.GetWorldTransformation ().GetMatrix ().Get ()).invert ().multiply (new THREE.Matrix4 ().fromArray (tool.node.GetWorldTransformation ().GetMatrix ().Get ())).toArray (); expected[12] *= 25.4; expected[13] *= 25.4; expected[14] *= 25.4;
        const a = Bounds (editor, target), b = Bounds (editor, tool);
        const result = await workspace.Boolean ({ operation : 'union', targetId : target.id, toolId : tool.id, keepOperands : true }); const object = editor.selected;
        const matrix = result.definition.nodes.find (node => node.kind === 'transform').matrix;
        matrix.forEach ((value, at) => Near (value, expected[at], 1e-8));
        for (const key of ['position', 'rotation', 'scale']) { assert.deepEqual (object[key], target[key]); }
        assert.equal (target.visible, true); assert.equal (tool.visible, true); assert.equal (object.unit, Unit.Inch);
        const bounds = Bounds (editor, object); for (const axis of ['x', 'y', 'z']) { Near (bounds.min[axis], Math.min (a.min[axis], b.min[axis])); Near (bounds.max[axis], Math.max (a.max[axis], b.max[axis])); }
    });

    it ('keeps embedded inputs after originals are removed and survives rollback, resume, portable archive and recovery', async function () {
        const { editor, workspace } = Fixture (); await workspace.Create (); const target = editor.selected;
        await workspace.Create ({ type : 'sphere', parameters : { diameterMm : 35, segments : 16 } }); const tool = editor.selected; tool.position = [0, 10, 0]; editor.document.ApplyTransform (tool);
        const made = await workspace.Boolean ({ operation : 'subtract', targetId : target.id, toolId : tool.id }); const result = editor.selected;
        editor.document.Remove (target); editor.document.Remove (tool);
        await workspace.SetTip ({ objectId : result.id, nodeId : 'primitive-1' }); assert.equal (workspace.Inspect ().definition.rootId, 'primitive-1'); assert.equal (workspace.Inspect ().definition.tipId, made.definition.tipId);
        assert.equal ((await EvaluateStudio (workspace.Inspect ().definition)).statistics.volumeMm3, 125000);
        await workspace.SetTip ({ nodeId : null }); Near ((await EvaluateStudio (workspace.Inspect ().definition)).statistics.volumeMm3, made.metrics.volumeMm3);
        const packed = PackSession (editor.document), saved = OpenSessionArchive (CreateSessionArchive (packed)).document;
        assert.equal (saved.objects.length, 1); assert.deepEqual (JSON.parse (saved.objects[0].userData[StudioDataKey]), workspace.Inspect ().definition);
        const recovery = ReadSession (PackRecoverySnapshot (structuredClone (RecoverySnapshot (editor.document, {})))).document;
        assert.equal (recovery.objects[0].userData[StudioDataKey], saved.objects[0].userData[StudioDataKey]);
        editor.document = saved; editor.history = new SceneHistory (); Select (editor, saved.objects[0]);
        const nodeId = workspace.Inspect ().definition.nodes.find (node => node.kind === 'primitive' && node.id !== 'primitive-1').id;
        await workspace.UpdateNode ({ nodeId, parameters : { diameterMm : 20 } }); assert.equal (editor.document.objects.length, 1); assert.ok ((await EvaluateStudio (workspace.Inspect ().definition)).statistics.volumeMm3 > made.metrics.volumeMm3);
        const invalid = structuredClone (packed); invalid.objects[0].userData[StudioDataKey] = JSON.stringify ({ schemaVersion : 99 }); assert.throws (() => ReadSession (invalid), /3Dstudio|modeling/);
    });

    it ('keeps modeling and history unchanged for invalid, empty, unsupported and concurrent operations', async function () {
        const { editor, workspace } = Fixture (); await workspace.Create (); const target = editor.selected;
        await assert.rejects (workspace.UpdateNode ({ nodeId : 'primitive-1', parameters : { widthMm : -4 } }), /invalid_arguments/);
        await assert.rejects (workspace.Boolean ({ operation : 'subtract', targetId : target.id, toolId : target.id }), /different solids/);
        const imported = editor.document.Duplicate (target); delete imported.userData[StudioDataKey];
        await assert.rejects (workspace.Boolean ({ operation : 'union', targetId : target.id, toolId : imported.id }), /Other modules/);
        const count = editor.history.undo.length, meshes = editor.document.model.meshes.length, materials = editor.document.model.materials.length;
        editor.document.Remove (imported); await workspace.Create ({ parameters : { widthMm : 100, heightMm : 100, depthMm : 100 } }); const tool = editor.selected; tool.position = [0, -10, 0]; editor.document.ApplyTransform (tool);
        const before = [...editor.document.objects], currentUndo = editor.history.undo.length;
        await assert.rejects (workspace.Boolean ({ operation : 'subtract', targetId : target.id, toolId : tool.id }), /empty solid/);
        assert.deepEqual (editor.document.objects, before); assert.equal (editor.history.undo.length, currentUndo); assert.equal (target.visible, true); assert.equal (tool.visible, true);
        editor.readOnly = true; await assert.rejects (workspace.Create (), /permission_required/); editor.readOnly = false;
        editor.busy = true; await assert.rejects (workspace.Create (), /Wait/); editor.busy = false;
        assert.equal (count, 1); assert.ok (editor.document.model.meshes.length >= meshes); assert.ok (editor.document.model.materials.length >= materials);
    });

    for (const changed of ['selection', 'account', 'document', 'readOnly', 'accountReady', 'source', 'cancel', 'history']) {
        it ('rejects stale ' + changed + ' before committing asynchronous geometry', async function () {
            const { panel, editor, workspace } = Fixture (); await workspace.Create (); const source = editor.selected, document = editor.document, history = editor.history, beforeUnit = document.model.GetUnit (), beforeMeshCount = document.model.meshes.length;
            const deferred = Deferred (); workspace.evaluate = () => deferred.promise;
            const waiting = workspace.UpdateNode ({ objectId : source.id, nodeId : 'primitive-1', parameters : { widthMm : 75 } });
            assert.equal (workspace.active, true); assert.equal (editor.busy, true); await assert.rejects (workspace.Create (), /Wait/);
            if (changed === 'selection') { Select (editor); }
            if (changed === 'account') { panel.website.auth.user = { id : 'other' }; }
            if (changed === 'document') { editor.document = new SceneDocument (); }
            if (changed === 'readOnly') { editor.readOnly = true; }
            if (changed === 'accountReady') { panel.website.accountReady = false; }
            if (changed === 'source') { source.position[0] += 1; }
            if (changed === 'cancel') { workspace.Cancel (); }
            if (changed === 'history') { history.Push ({ undo () {}, redo () {} }); }
            deferred.resolve (await EvaluateStudio (CreatePrimitiveDefinition ())); await assert.rejects (waiting, /conflict/);
            assert.deepEqual (document.objects, [source]); assert.equal (document.model.meshes.length, beforeMeshCount); assert.equal (document.model.GetUnit (), beforeUnit); assert.equal (history.undo.length, changed === 'history' ? 2 : 1); assert.equal (workspace.active, false);
            // A stale completion must not clear a lock owned by a replacement
            // account/session; the app lifecycle owns that new context.
            assert.equal (editor.busy, ['account', 'document'].includes (changed));
        });
    }

    it ('rolls back render failures with geometry storage, original object ordering, material state, units, selection and history intact', async function () {
        for (const action of ['create', 'update', 'boolean']) {
            const { editor, workspace } = Fixture (EvaluateStudio);
            let source = null, tool = null;
            if (action !== 'create') { await workspace.Create (); source = editor.selected; }
            if (action === 'boolean') { await workspace.Create (); tool = editor.selected; tool.position[0] = 10; editor.document.ApplyTransform (tool); Select (editor, source, tool); }
            const document = editor.document, objects = [...document.objects], selection = editor.selected, selectedIds = [...editor.selectedIds], unit = document.model.GetUnit (), meshes = document.model.meshes.length, materials = document.model.materials.length, undo = [...editor.history.undo];
            let render = 0; editor.Render = async () => { if (++render === 1) { throw new Error ('Injected renderer failure'); } };
            const request = action === 'create' ? workspace.Create () : action === 'update' ? workspace.UpdateNode ({ nodeId : 'primitive-1', parameters : { widthMm : 100 } }) : workspace.Boolean ({ operation : 'union', targetId : source.id, toolId : tool.id });
            await assert.rejects (request, /Injected renderer failure/);
            assert.deepEqual (document.objects, objects); assert.equal (editor.selected, selection); assert.deepEqual ([...editor.selectedIds], selectedIds); assert.equal (document.model.GetUnit (), unit); assert.equal (document.model.meshes.length, meshes); assert.equal (document.model.materials.length, materials); assert.deepEqual (editor.history.undo, undo); assert.equal (source?.visible ?? true, true); assert.equal (tool?.visible ?? true, true); assert.equal (editor.busy, false);
        }
    });

    it ('preserves inactive advanced PBR through rollback, disable, duplication, archive/recovery and resume', async function () {
        const { editor, workspace } = Fixture (); await workspace.Create (); const target = editor.selected;
        await workspace.Create ({ type : 'cylinder', parameters : { diameterMm : 20, heightMm : 60, segments : 16 } }); const tool = editor.selected;
        tool.position = [0, -5, 0]; editor.document.ApplyTransform (tool);
        const custom = Surface (editor, tool); custom.name = 'Painted cut'; custom.clearcoat = .73; custom.ior = 1.62; custom.diffuseMap = new TextureMap (); custom.diffuseMap.name = 'cut.png'; custom.diffuseMap.mimeType = 'image/png'; custom.diffuseMap.buffer = new Uint8Array ([1, 2, 3, 4]).buffer; custom.diffuseMap.scale.x = 3;
        const made = await workspace.Boolean ({ operation : 'subtract', targetId : target.id, toolId : tool.id }), output = editor.selected;
        const leafId = made.definition.nodes.find (node => node.kind === 'primitive' && node.id !== 'primitive-1').id, booleanId = made.definition.tipId;
        editor.document.Remove (target); editor.document.Remove (tool);
        await workspace.UpdateNode ({ nodeId : booleanId, enabled : false });
        assert.equal (editor.selected.studioMaterials[leafId].clearcoat, .73);
        await workspace.UpdateNode ({ nodeId : booleanId, enabled : true }); assert.equal (Surface (editor, editor.selected, leafId).clearcoat, .73); assert.deepEqual (Object.keys (editor.selected.studioMaterials), []);
        await workspace.SetTip ({ nodeId : 'primitive-1' }); const rolled = editor.selected;
        const duplicate = editor.document.Duplicate (rolled), instance = editor.document.Instance (rolled);
        assert.notEqual (duplicate.studioMaterials[leafId], rolled.studioMaterials[leafId]); assert.notEqual (instance.studioMaterials[leafId], rolled.studioMaterials[leafId]);
        duplicate.studioMaterials[leafId].diffuseMap.scale.x = 10; assert.equal (rolled.studioMaterials[leafId].diffuseMap.scale.x, 3); editor.document.Remove (duplicate); editor.document.Remove (instance);
        const packed = PackSession (editor.document), reopened = OpenSessionArchive (CreateSessionArchive (packed)).document;
        const recovered = ReadSession (PackRecoverySnapshot (structuredClone (RecoverySnapshot (editor.document, {})))).document;
        for (const document of [reopened, recovered]) {
            assert.equal (document.objects[0].studioMaterials[leafId].clearcoat, .73); assert.equal (document.objects[0].studioMaterials[leafId].diffuseMap.scale.x, 3);
            assert.deepEqual (new Uint8Array (document.objects[0].studioMaterials[leafId].diffuseMap.buffer), new Uint8Array ([1, 2, 3, 4]));
            editor.document = document; editor.history = new SceneHistory (); Select (editor, document.objects[0]);
            await workspace.SetTip ({ nodeId : null }); const surface = Surface (editor, editor.selected, leafId);
            assert.equal (surface.clearcoat, .73); assert.equal (surface.ior, 1.62); assert.equal (surface.diffuseMap.name, 'cut.png'); assert.equal (surface.diffuseMap.scale.x, 3);
            assert.equal (editor.selected.id, output.id); assert.deepEqual (Object.keys (editor.selected.studioMaterials), []);
        }
        for (const change of [object => { object.studioMaterials = []; }, object => { object.studioMaterials.unknown = object.studioMaterials[leafId]; }, object => { object.studioMaterials = Object.fromEntries (Array.from ({ length : 65 }, (_, index) => ['leaf-' + index, {}])); }, object => { object.studioMaterials[leafId].clearcoat = 2; }, object => { delete object.userData[StudioDataKey]; }]) {
            const invalid = structuredClone (packed); change (invalid.objects[0]); assert.throws (() => ReadSession (invalid), /palette|clearcoat/);
        }
    });

    it ('cancels a pending lazy module load before launching a worker evaluation', async function () {
        const ready = Deferred (); let evaluations = 0;
        const { editor, workspace } = Fixture (async (definition, guard) => { await ready.promise; guard (); evaluations++; return EvaluateStudio (definition); });
        const pending = workspace.Create (); workspace.Cancel (); ready.resolve (); await assert.rejects (pending, /canceled/);
        assert.equal (evaluations, 0); assert.equal (editor.document.objects.length, 0); assert.equal (editor.busy, false);
    });

    it ('keeps Undo and Redo retryable when scene rendering fails during restoration', async function () {
        const { editor, workspace } = Fixture (); await workspace.Create (); const before = editor.selected;
        await workspace.UpdateNode ({ nodeId : 'primitive-1', parameters : { widthMm : 75 } }); const after = editor.selected;
        let renders = 0; editor.Render = async () => { if (++renders === 1) { throw new Error ('Undo render failed'); } };
        await assert.rejects (editor.history.Undo (), /Undo render failed/); assert.equal (editor.selected, after); assert.equal (editor.history.undo.length, 2); assert.equal (editor.history.redo.length, 0);
        await editor.history.Undo (); assert.equal (editor.selected, before); assert.equal (editor.history.undo.length, 1); assert.equal (editor.history.redo.length, 1);
        renders = 0; editor.Render = async () => { if (++renders === 1) { throw new Error ('Redo render failed'); } };
        await assert.rejects (editor.history.Redo (), /Redo render failed/); assert.equal (editor.selected, before); assert.equal (editor.history.undo.length, 1); assert.equal (editor.history.redo.length, 1);
        await editor.history.Redo (); assert.equal (editor.selected, after); assert.equal (editor.history.undo.length, 2); assert.equal (editor.history.redo.length, 0);
    });

    it ('rejects unitless occupied scenes and validates kernel payloads before scene insertion', async function () {
        const data = await EvaluateStudio (CreatePrimitiveDefinition ());
        const { editor, workspace } = Fixture (); const imported = StudioModel (data, Unit.Millimeter); imported.SetUnit (Unit.Unknown); editor.document.AddImported (imported, 'Unitless import');
        await assert.rejects (workspace.Create (), /known scene units/); assert.equal (editor.document.objects.length, 1);
        for (const invalid of [{ ...data, positions : new Float64Array ([NaN, 0, 0]) }, { ...data, indices : new Uint32Array ([999999, 0, 1]) }, { ...data, positions : new Array (data.positions.length) }, { ...data, indices : new Array (data.indices.length) }, { ...data, statistics : { ...data.statistics, closed : false } }, { ...data, materials : [{ ...data.materials[0], color : 'red' }] }]) {
            assert.throws (() => StudioModel (invalid, Unit.Millimeter), /Invalid/);
            const fixture = Fixture (async () => invalid); await assert.rejects (fixture.workspace.Create ()); assert.equal (fixture.editor.document.objects.length, 0); assert.equal (fixture.editor.history.undo.length, 0);
        }
    });
});
