import { ExporterGltf } from '../source/engine/export/exportergltf.js';
import { ExporterModel } from '../source/engine/export/exportermodel.js';
import { FileFormat } from '../source/engine/io/fileutils.js';
import assert from 'node:assert/strict';
import * as module from '../modules/primary-products/src/index.js';
import { PrimaryProductsWorkspace, PrimaryProductDataKey } from '../source/website/primaryproductsworkspace.js';
import { PrimaryProductModel } from '../source/website/primaryproductsadapter.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { PackSession, ReadSession, CreateSessionArchive, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { RecoverySnapshot } from '../source/website/sessionrecovery.js';
import { PackRecoverySnapshot } from '../source/website/sessionrecoverypack.js';
import { Unit } from '../source/engine/model/unit.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { ResolveDimension, ValidateDimensions } from '../source/website/dimensioncore.js';

function Fixture (load = async () => module)
{
    const editor = { document : new SceneDocument (), history : new SceneHistory (), selected : null, busy : false, readOnly : false, async Render () {}, RefreshButtons () {}, Status () {} };
    const panel = { website : { auth : { user : { id : 'owner' } }, accountReady : true, sessionEditor : editor }, draft : module.DefaultProductDraft (), Refresh () {}, Inspect () { return this.draft; }, Blocked () { return !this.website.auth.user || !this.website.accountReady || editor.busy || editor.readOnly || this.products.active; } };
    panel.products = new PrimaryProductsWorkspace (panel, load); return { panel, editor, workspace : panel.products };
}
describe ('Primary Products scene integration', function () {
    it ('generates opaque components through strict shared commands, with one undo/redo step', async function () {
        const { panel, editor } = Fixture (); const commands = CreateAgentCommands ({ sessionEditor : editor, primaryProductsPanel : panel });
        assert.equal ((await commands.Execute ('primary.generate', { unexpected : true })).ok, false);
        const r = await commands.Execute ('primary.generate'); assert.equal (r.ok, true, JSON.stringify (r));
        assert.deepEqual (r.result.components, ['body', 'cap']); assert.equal (editor.document.objects.length, 1); assert.equal (editor.history.undo.length, 1);
        const model = editor.document.model; assert.equal (model.materials[0].metalness, 0); assert.equal (model.materials[0].roughness, panel.draft.roughness);
        await editor.history.Undo (); assert.equal (editor.document.objects.length, 0);
        await editor.history.Redo (); assert.equal (editor.selected.id, r.result.objectId); assert.equal (editor.document.objects.length, 1);
    });
    it ('adds W × L × H callouts with the generation step and keeps them on live resizes', async function () {
        this.timeout (20000); const { panel, editor, workspace } = Fixture (); panel.draft = module.UpdateProductDraft (module.DefaultProductDraft ('pouch'), { widthMm : 150, depthMm : 30, heightMm : 210 });
        const made = await workspace.Generate (); assert.equal (made.callouts, true); const dims = editor.document.dimensions; assert.equal (dims.length, 3);
        assert.deepEqual (dims.map (d => [d.kind, d.axis, d.objectId]), [['design', 'width', made.objectId], ['design', 'length', made.objectId], ['design', 'height', made.objectId]]);
        const lengths = () => editor.document.dimensions.map (d => { const r = ResolveDimension (editor.document, d); assert.equal (r.stale, undefined, r.reason); return [r.basis, Math.round (r.lengthMm * 1000) / 1000, Math.round (r.length * 1000) / 1000]; });
        assert.deepEqual (lengths (), [['W', 150, 150], ['L', 30, 30], ['H', 210, 210]]); assert.equal (editor.document.dimensionsVisible, true);
        await editor.history.Undo (); assert.equal (editor.document.objects.length, 0); assert.deepEqual (editor.document.dimensions, []);
        await editor.history.Redo (); assert.equal (editor.document.dimensions.length, 3);
        panel.draft = module.UpdateProductDraft (panel.draft, { heightMm : 260 }); await workspace.Generate (true); assert.equal (editor.document.dimensions.length, 3); assert.deepEqual (lengths ()[2], ['H', 260, 260]);
        panel.callouts = false; panel.draft = module.DefaultProductDraft ('can'); editor.selected = null; const plain = await workspace.Generate (); assert.equal (plain.callouts, false); assert.equal (editor.document.dimensions.length, 3);
        assert.throws (() => ValidateDimensions ([{ id : 'x', objectId : 'o', kind : 'design', offset : 0, visible : true }]), /design/);
        assert.throws (() => ValidateDimensions ([{ id : 'x', objectId : 'o', kind : 'design', axis : 'width', corner : [0, 0, 1], offset : 0, visible : true, mesh : 1 }]), /design dimension/);
    });
    it ('updates identity, transform, ordering and metadata without altering duplicates; undo restores original surfaces', async function () {
        const { panel, editor, workspace } = Fixture (); await workspace.Generate ();
        const source = editor.selected; source.name = 'My bottle'; source.position = [1, 2, 3]; source.rotation = [0.1, 0.2, 0.3]; source.scale = [2, 1, 3]; source.userData.sku = 'abc'; editor.document.ApplyTransform (source);
        const copy = editor.document.Duplicate (source);
        const copyDefinition = copy.userData[PrimaryProductDataKey];
        panel.draft = module.UpdateProductDraft (panel.draft, { heightMm : 250, roughness : 0.2 });
        await workspace.Generate (true); const updated = editor.selected;
        assert.equal (updated.id, source.id); assert.equal (updated.name, 'My bottle'); assert.deepEqual (updated.position, source.position); assert.deepEqual (updated.rotation, source.rotation); assert.deepEqual (updated.scale, source.scale); assert.equal (updated.userData.sku, 'abc');
        assert.equal (editor.document.objects[0], updated); assert.equal (copy.userData[PrimaryProductDataKey], copyDefinition);
        await editor.history.Undo (); assert.equal (editor.selected, source); assert.equal (editor.document.objects[0], source);
        await editor.history.Redo (); assert.equal (editor.selected, updated);
        panel.draft = module.DefaultProductDraft ('can'); workspace.LoadSelected (); assert.equal (panel.draft.heightMm, 250);
    });
    it ('persists custom bottle dimensions through rebuild, file/recovery and Undo without changing duplicates', async function () {
        const { panel,editor,workspace } = Fixture (); await workspace.Generate (); const original=editor.selected, copy=editor.document.Duplicate(original), old=copy.userData[PrimaryProductDataKey];
        panel.draft=module.UpdateProductDraft(panel.draft,{bottleShape:{neckDiameterMm:24,shoulderHeightMm:30,neckHeightMm:20,capHeightMm:20}}); await workspace.Generate(true); assert.equal(editor.selected.id,original.id); assert.equal(copy.userData[PrimaryProductDataKey],old);
        const saved=OpenSessionArchive(CreateSessionArchive(PackSession(editor.document))).document; assert.deepEqual(JSON.parse(saved.objects[0].userData[PrimaryProductDataKey]).draft.bottleShape,panel.draft.bottleShape);
        const recovery=ReadSession(PackRecoverySnapshot(structuredClone(RecoverySnapshot(editor.document,{})))).document; assert.deepEqual(JSON.parse(recovery.objects[0].userData[PrimaryProductDataKey]).draft.bottleShape,panel.draft.bottleShape);
        await editor.history.Undo(); assert.equal(editor.selected,original); await editor.history.Redo(); workspace.LoadSelected(); assert.equal(panel.draft.bottleShape.neckDiameterMm,24);
    });
    it ('persists the authoring definition and baked geometry through file/recovery round trips', async function () {
        const { panel, editor, workspace } = Fixture (); panel.draft = module.DefaultProductDraft ('can'); await workspace.Generate ();
        const packed = PackSession (editor.document); const saved = OpenSessionArchive (CreateSessionArchive (packed)).document;
        assert.equal (saved.objects.length, 1); assert.equal (saved.model.meshes.length, 3);
        assert.equal (saved.objects[0].userData[PrimaryProductDataKey], editor.selected.userData[PrimaryProductDataKey]);
        const recovery = PackRecoverySnapshot (structuredClone (RecoverySnapshot (editor.document, {})));
        assert.equal (ReadSession (recovery).document.objects[0].userData[PrimaryProductDataKey], editor.selected.userData[PrimaryProductDataKey]);
        const invalid = structuredClone (packed); invalid.objects[0].userData[PrimaryProductDataKey] = JSON.stringify ({ schemaVersion : 999 }); assert.throws (() => ReadSession (invalid));
        const incomplete = structuredClone (packed); incomplete.objects[0].userData[PrimaryProductDataKey] = JSON.stringify ({ schemaVersion : 1, generatorVersion : 1, units : 'mm', draft : {} }); assert.throws (() => ReadSession (incomplete));
    });
    it ('generates, edits and reopens pouches while preserving legacy bottle definitions', async function () {
        const { panel, editor, workspace } = Fixture (); panel.draft = module.DefaultProductDraft ('pouch');
        const commands = CreateAgentCommands ({ sessionEditor : editor, primaryProductsPanel : panel });
        assert.equal ((await commands.Execute ('primary.generate')).ok, true);
        const id = editor.selected.id; panel.draft.widthMm = 180;
        await workspace.Generate (true); assert.equal (editor.selected.id, id);
        const saved = OpenSessionArchive (CreateSessionArchive (PackSession (editor.document))).document;
        const definition = module.ValidateProductDefinition (JSON.parse (saved.objects[0].userData[PrimaryProductDataKey]));
        assert.equal (definition.draft.widthMm, 180); assert.equal (definition.draft.family, 'pouch');
        await editor.history.Undo (); workspace.LoadSelected (); assert.equal (panel.draft.widthMm, 140);
        assert.equal (module.ValidateProductDefinition (module.ProductDefinition (module.DefaultProductDraft ())).draft.diameterMm, 65);
    });
    it ('persists and rebuilds clamshells with material defaults and stable identity', async function () {
        const { panel, editor, workspace } = Fixture (); panel.draft = module.ProductDesign ('food-fiber'); await workspace.Generate ();
        const id = editor.selected.id; assert.equal (editor.document.model.meshes.length, 2);
        assert.equal (panel.draft.color, '#b69b71'); panel.draft.widthMm = 230; await workspace.Generate (true); assert.equal (editor.selected.id, id);
        const saved = OpenSessionArchive (CreateSessionArchive (PackSession (editor.document))).document;
        const definition = module.ValidateProductDefinition (JSON.parse (saved.objects[0].userData[PrimaryProductDataKey]));
        assert.equal (definition.draft.family, 'clamshell'); assert.equal (definition.draft.widthMm, 230); assert.equal (definition.draft.material, 'moldedFiber');
        const recovery = ReadSession (PackRecoverySnapshot (structuredClone (RecoverySnapshot (editor.document, {})))).document;
        assert.equal (recovery.objects[0].userData[PrimaryProductDataKey], saved.objects[0].userData[PrimaryProductDataKey]);
        await editor.history.Undo (); workspace.LoadSelected (); assert.equal (panel.draft.widthMm, 200);
    });
    it ('applies artwork without resetting advanced surface edits and restores the prior object on Undo', async function () {
        const { panel, editor, workspace } = Fixture (); panel.draft = module.ProductDesign ('food-deli'); await workspace.Generate ();
        const previous = editor.selected; editor.document.model.materials[0].roughness = .91; editor.document.model.materials[0].ior = 1.62; editor.document.model.materials[0].transmission = .8;
        await workspace.Generate (true, true);
        const material = editor.document.CompactModel ([editor.selected], true).materials[0];
        assert.equal (material.roughness, .91); assert.equal (material.ior, 1.62); assert.equal (material.transmission, .8); assert.equal (editor.selected.id, previous.id);
        await editor.history.Undo (); assert.equal (editor.selected, previous);
    });
    it ('converts mm geometry into known scene units and rejects unknown units', function () {
        const data = module.CreatePrimaryProduct (module.DefaultProductDraft ('can'));
        for (const [unit, factor] of [[Unit.Millimeter, 1], [Unit.Meter, 1000], [Unit.Inch, 25.4]]) {
            const model = PrimaryProductModel (data, unit); const max = Math.max (...model.meshes.flatMap (mesh => mesh.vertices.map (v => v.y))); assert.ok (Math.abs (max * factor - 122) < 1e-8);
            assert.equal (model.materials[0].metalness, 1);
        }
        assert.throws (() => PrimaryProductModel (data, 'unknown'));
        assert.equal (PrimaryProductModel (module.CreatePrimaryProduct ({ ...module.DefaultProductDraft (), material : 'glass' }), Unit.Millimeter).materials[0].transmission, 1);
    });
    it ('exports portable GLB geometry with the edited opaque physical surface', async function () {
        const draft = { ...module.DefaultProductDraft ('can'), roughness : 0.23, color : '#cc5522' };
        const model = PrimaryProductModel (module.CreatePrimaryProduct (draft), Unit.Millimeter);
        const files = await new Promise (resolve => new ExporterGltf ().Export (new ExporterModel (model), FileFormat.Binary, resolve));
        const buffer = files[0].GetBufferContent (); const view = new DataView (buffer);
        assert.equal (view.getUint32 (0, true), 0x46546c67); assert.equal (view.getUint32 (4, true), 2);
        const json = JSON.parse (new TextDecoder ().decode (new Uint8Array (buffer, 20, view.getUint32 (12, true))).trim ());
        assert.equal (json.meshes.length, 3); const pbr = json.materials[0].pbrMetallicRoughness;
        assert.equal (pbr.metallicFactor, 1); assert.equal (pbr.roughnessFactor, 0.23); assert.ok (pbr.baseColorFactor[0] > pbr.baseColorFactor[1]);
    });
    it ('rejects read-only, invalid selections and concurrent requests before committing', async function () {
        const { panel, editor, workspace } = Fixture (); editor.readOnly = true; await assert.rejects (workspace.Generate ()); editor.readOnly = false;
        await assert.rejects (workspace.Generate (true), /Select/); assert.equal (editor.document.objects.length, 0);
        let resolve; const f = Fixture (() => new Promise (r => { resolve = r; })); const pending = f.workspace.Generate ();
        await assert.rejects (f.workspace.Generate ()); f.panel.website.auth.user = { id : 'other' }; resolve (module); await assert.rejects (pending, /changed/);
        assert.equal (f.editor.document.objects.length, 0); assert.equal (f.editor.history.undo.length, 0); assert.equal (f.editor.busy, false);
    });
    it ('restores the selected source after failed Apply and avoids rendering another account', async function () {
        const f = Fixture (); await f.workspace.Generate (); const source = f.editor.selected;
        let calls = 0; f.editor.Render = async () => { if (++calls === 1) { throw new Error ('apply failed'); } };
        f.panel.draft.heightMm = 220;
        await assert.rejects (f.workspace.Generate (true), /apply failed/);
        assert.equal (f.editor.selected, source); assert.equal (f.editor.document.objects[0], source); assert.equal (f.editor.history.undo.length, 1);
        const switched = Fixture (); let renders = 0;
        switched.editor.Render = async () => { renders++; switched.panel.website.auth.user = { id : 'new-owner' }; };
        await assert.rejects (switched.workspace.Generate (), /changed/);
        assert.equal (renders, 1); assert.equal (switched.editor.document.objects.length, 0); assert.equal (switched.editor.history.undo.length, 0);
    });
    it ('rolls back a render failure and a session switch without writing history or touching the new scene', async function () {
        const { editor, workspace } = Fixture (); let count = 0; editor.Render = async () => { if (++count === 1) { throw new Error ('render failed'); } };
        await assert.rejects (workspace.Generate (), /render failed/); assert.equal (editor.document.objects.length, 0); assert.equal (editor.history.undo.length, 0); assert.equal (editor.busy, false);
        let resolve; const f = Fixture (() => new Promise (r => { resolve = r; })); const old = f.editor.document; const pending = f.workspace.Generate (); f.editor.document = new SceneDocument (); resolve (module);
        await assert.rejects (pending, /changed/); assert.equal (old.objects.length, 0); assert.equal (f.editor.document.objects.length, 0);
    });
});

describe ('Primary Products embedded label source', function () {
    it ('keeps label pixels, dielectric ink and authoring through archives, recovery, reload, edits and GLB', async function () {
        const { readFileSync } = await import ('node:fs'), { createHash } = await import ('node:crypto');
        const { PrimaryProductsArtwork } = await import ('../source/website/primaryproductsartwork.js');
        const source = readFileSync ('test/testfiles/obj/texture.png'), buffer = source.buffer.slice (source.byteOffset, source.byteOffset + source.byteLength), id = createHash ('sha256').update (source).digest ('hex');
        const f = Fixture (); f.panel.draft = module.DefaultProductDraft ('can'); f.panel.artwork = new PrimaryProductsArtwork (f.panel);
        f.panel.artwork.entries = [{ resourceId : id, name : 'Original.png', mime : 'image/png', zone : 'front', widthMm : 40, heightMm : 60 }];
        f.panel.artwork.resources.set (id, { buffer }); await f.workspace.Generate ();
        const label = f.editor.document.model.materials.find (m => m.name.startsWith ('Primary label'));
        assert.equal (label.metalness, 0); assert.equal (label.transparent, true); assert.deepEqual (new Uint8Array (label.diffuseMap.buffer), new Uint8Array (buffer));
        label.name = 'Renamed ink surface';
        const packed = PackSession (f.editor.document), saved = OpenSessionArchive (CreateSessionArchive (packed)).document;
        f.editor.document = saved; f.editor.selected = saved.objects[0]; f.panel.artwork.Clear (); f.workspace.LoadSelected ();
        assert.equal (f.panel.artwork.Inspect ()[0].name, 'Original.png'); assert.deepEqual (new Uint8Array (f.panel.artwork.resources.get (id).buffer), new Uint8Array (buffer));
        f.panel.draft.heightMm = 150; await f.workspace.Generate (true); assert.equal (f.panel.artwork.Inspect ()[0].heightMm, 60);
        const recovery = ReadSession (PackRecoverySnapshot (structuredClone (RecoverySnapshot (f.editor.document, {})))).document;
        assert.ok (recovery.model.materials.some (m => m.diffuseMap?.buffer.byteLength === buffer.byteLength));
        const files = await new Promise (resolve => new ExporterGltf ().Export (new ExporterModel (f.editor.document.CompactModel ()), FileFormat.Binary, resolve));
        const glb = files[0].GetBufferContent (), view = new DataView (glb), json = JSON.parse (new TextDecoder ().decode (new Uint8Array (glb, 20, view.getUint32 (12, true))).trim ());
        assert.ok (json.images?.length); assert.ok (json.materials.some (m => m.alphaMode === 'BLEND' && m.pbrMetallicRoughness.metallicFactor === 0));
        const metadata = JSON.parse (f.editor.selected.userData[PrimaryProductDataKey]); assert.ok (JSON.stringify (metadata).length < 2000);
    });
});
