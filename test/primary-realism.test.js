import assert from 'node:assert/strict';
import * as module from '../modules/primary-products/src/index.js';
import { ScaleProductChanges, WallLimit } from '../modules/primary-products/src/details.js';
import { ProductSurfaceMaps, LabelFinishes } from '../modules/primary-products/src/surfaces.js';
import { CreateLabelMesh } from '../modules/primary-products/src/artwork.js';
import { PrimaryProductModel } from '../source/website/primaryproductsadapter.js';
import { PrimaryProductsPanel } from '../source/website/primaryproductspanel.js';
import { PrimaryProductsWorkspace } from '../source/website/primaryproductsworkspace.js';
import { PrimaryProductsArtwork } from '../source/website/primaryproductsartwork.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { PackSession, ReadSession, CreateSessionArchive, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { Unit } from '../source/engine/model/unit.js';
import { ExporterGltf } from '../source/engine/export/exportergltf.js';
import { ExporterModel } from '../source/engine/export/exportermodel.js';
import { FileFormat } from '../source/engine/io/fileutils.js';

function fixture () {
    const editor = { document : new SceneDocument (), history : new SceneHistory (), selected : null, busy : false, readOnly : false, async Render () {}, RefreshButtons () {}, Status () {} };
    const panel = Object.assign (Object.create (PrimaryProductsPanel.prototype), { website : { auth : { user : { id : 'owner' } }, accountReady : true, sessionEditor : editor }, draft : module.ProductDesign ('boston-inspired'), Refresh () {}, LiveTarget () { return editor.selected; } });
    panel.products = new PrimaryProductsWorkspace (panel, async () => module); panel.artwork = new PrimaryProductsArtwork (panel); panel.website.primaryProductsPanel = panel; return { panel, editor };
}
describe ('Primary Products realistic construction and surfaces', function () {
    this.timeout (20000);
    it ('keeps every detailed catalog component closed with positive volume and finite normals', function () {
        for (const design of module.ListProductDesigns ()) {
            const data = module.CreatePrimaryProduct (module.ProductDesign (design.id)); assert.ok (data.quality.hollowWalls, design.id);
            for (const mesh of data.components) {
                const edges = new Map (), point = i => mesh.positions.slice (i*3, i*3+3), key = i => point (i).map (v => Math.round (v*1e6)).join (','); let volume = 0;
                assert.ok (mesh.normals.every (Number.isFinite));
                assert.ok (mesh.positions.every ((v, i) => v >= data.bounds.min[i % 3] - 1e-6 && v <= data.bounds.max[i % 3] + 1e-6), design.id + ' ' + mesh.id + ' outside envelope');
                for (let i = 0; i < mesh.indices.length; i += 3) { const ids = mesh.indices.slice (i, i+3), [a,b,c] = ids.map (point); volume += (a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
                    for (let j = 0; j < 3; j++) { const edge = [key (ids[j]), key (ids[(j+1)%3])].sort ().join ('/'); edges.set (edge, (edges.get (edge) || 0)+1); }
                }
                assert.ok (volume > 0, design.id + ' ' + mesh.id); assert.ok ([...edges.values ()].every (n => n === 2), design.id + ' ' + mesh.id);
            }
        }
    });
    it ('distinguishes beverage tabs, food beads, rounded shoulders and clamshell closures', function () {
        const can = module.CreatePrimaryProduct (module.ProductDesign ('standard-beverage'));
        assert.ok (can.components.some (m => m.id === 'pull-tab'));
        const y = id => can.components.find (m => m.id === id).positions.filter ((v, i) => i % 3 === 1);
        assert.ok (Math.max (...y ('body')) < Math.min (...y ('opening-score')), 'The closed body must not hide the scored end.');
        assert.ok (!module.CreatePrimaryProduct (module.ProductDesign ('food-can')).components.some (m => m.id === 'pull-tab'));
        const d = module.ProductDesign ('boston-inspired'), rounded = module.CreatePrimaryProduct (d), sloped = module.CreatePrimaryProduct ({ ...d, details : { ...d.details, shoulder : 'sloped' } }); assert.ok (rounded.components[0].positions.length > sloped.components[0].positions.length);
        assert.ok (module.CreatePrimaryProduct (module.ProductDesign ('retail-compact')).components.some (m => m.id === 'hinge'));
        assert.throws (() => module.UpdateProductDraft (d, { details : { wallMm : 200 } }));
        const small = module.UpdateProductDraft (d, ScaleProductChanges (d, .5)); assert.ok (small.details.wallMm <= WallLimit (small));
        assert.equal (module.DefaultProductDraft ().details, undefined); // Legacy envelopes remain readable.
    });
    it ('creates deterministic portable texture maps with physical tiling and material-specific response', function () {
        const fiber = ProductSurfaceMaps ('fiber'), metal = ProductSurfaceMaps ('brushed'); assert.notDeepEqual (new Uint8Array (fiber.bumpMap.buffer), new Uint8Array (metal.bumpMap.buffer)); assert.deepEqual (fiber, ProductSurfaceMaps ('fiber'));
        const data = module.CreatePrimaryProduct (module.ProductDesign ('flat-bottom-coffee')), model = PrimaryProductModel (data, Unit.Millimeter), body = model.materials[0];
        for (const key of ['normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap']) { assert.ok (body[key]?.buffer.byteLength > 50); }
        assert.equal (body.reliefMode, 'bump'); assert.ok (body.bumpScale > 0); assert.equal (body.roughnessMap.scale.x, data.definition.widthMm / data.definition.details.textureScaleMm);
        const inches = PrimaryProductModel (data, Unit.Inch); assert.ok (Math.abs (inches.materials[0].bumpScale * 25.4 - body.bumpScale) < 1e-10);
        const doc = new SceneDocument (); doc.AddImported (model, 'Bag'); const saved = OpenSessionArchive (CreateSessionArchive (PackSession (doc))).document.model.materials[0]; assert.deepEqual (saved.bumpMap.buffer, body.bumpMap.buffer);
        assert.ok (LabelFinishes.glossFilm.clearcoat > LabelFinishes.paperMatte.clearcoat); assert.equal (LabelFinishes.foil.metalness, 1);
    });
    it ('validates label finish/placement and keeps the actual patches on every family', function () {
        for (const id of ['boston-inspired', 'standard-beverage', 'flat-bottom-coffee', 'food-deli']) {
            const d = module.ProductDesign (id), base = { resourceId : 'a'.repeat (64), name : 'Art', mime : 'image/png', zone : 'front', widthMm : 20, heightMm : 20, finish : 'foil', offsetXmm : 2, offsetYmm : 3 };
            module.ValidateProductArtwork (d, [base]); const shifted = CreateLabelMesh (d, base), centered = CreateLabelMesh (d, { ...base, offsetXmm : 0, offsetYmm : 0 }); assert.notDeepEqual (shifted.positions, centered.positions);
            if (d.family === 'clamshell') { const back = CreateLabelMesh (d, { ...base, zone : 'back' }); assert.equal (back.positions.filter ((v, i) => i % 3 === 0).reduce ((a, b) => a + b) / 4, -2); }
            assert.throws (() => module.ValidateProductArtwork (d, [{ ...base, offsetXmm : 1000 }])); assert.throws (() => module.ValidateProductArtwork (d, [{ ...base, finish : 'bad' }]));
        }
    });
    it ('scales labels and construction atomically with identity, custom finish, texture density and Undo preserved', async function () {
        const { panel, editor } = fixture ();
        panel.artwork.entries = ['front', 'back'].map (zone => ({ resourceId : 'a'.repeat (64), name : 'A'.repeat (80), mime : 'image/png', zone, widthMm : 20, heightMm : 25, offsetXmm : 2, offsetYmm : 3, finish : 'glossFilm' }));
        panel.artwork.resources.set ('a'.repeat (64), ProductSurfaceMaps ('paper').bumpMap);
        await panel.products.Generate (); const old = editor.selected, width = panel.draft.diameterMm, mapScale = editor.document.model.materials[0].bumpMap.scale.x; editor.document.model.materials[0].clearcoat = .8;
        const registry = CreateAgentCommands (panel.website), result = await registry.Execute ('primary.scale', { factor : 1.2 }); assert.equal (result.ok, true, JSON.stringify (result)); assert.equal (editor.selected.id, old.id); assert.equal (panel.draft.diameterMm, width * 1.2); assert.equal (panel.artwork.entries[0].widthMm, 24); assert.equal (panel.artwork.entries[1].offsetXmm, 2.4);
        const material = editor.document.CompactModel ([editor.selected], true).materials[0]; assert.equal (material.clearcoat, .8); assert.equal (material.bumpMap.scale.x, mapScale * 1.2);
        const snapshot = editor.selected; assert.equal ((await registry.Execute ('primary.scale', { factor : 10 })).ok, false); assert.equal (editor.selected, snapshot);
        await editor.history.Undo (); assert.equal (editor.selected, old); await editor.history.Redo (); assert.equal (editor.selected, snapshot);
        assert.ok (editor.selected.userData._auto3dPrimaryProduct.length < 2048);
        const packed = PackSession (editor.document); assert.ok (ReadSession (packed).document.objects[0].userData._auto3dPrimaryProduct.includes ('details'));
        packed.model.materials[0].clearcoat = 2; assert.throws (() => ReadSession (packed), /clearcoat/);
        const macro = { version : 1, steps : [{ id : 'construction', command : 'primary.details.set', arguments : { closure : 'smooth' } }, { id : 'resize', command : 'primary.scale', arguments : { factor : 1, scaleArtwork : false } }] };
        assert.equal ((await registry.RunMacro (macro)).ok, true); assert.equal (panel.draft.details.closure, 'smooth'); assert.equal (panel.artwork.entries[0].widthMm, 24);
        const before = JSON.stringify (panel.draft); editor.readOnly = true;
        assert.equal ((await registry.RunMacro (macro)).ok, false); assert.equal (JSON.stringify (panel.draft), before); editor.readOnly = false;
        assert.equal ((await registry.Execute ('primary.details.set', { canStyle : 'food' })).ok, false); assert.equal (JSON.stringify (panel.draft), before);
    });
    it ('exports clearcoat and packed roughness maps into standard glTF material extensions', async function () {
        const d = module.ProductDesign ('cosmo-inspired'), model = PrimaryProductModel (module.CreatePrimaryProduct (d), Unit.Millimeter);
        const files = await new Promise (resolve => new ExporterGltf ().Export (new ExporterModel (model), FileFormat.Binary, resolve)), buffer = files[0].GetBufferContent (), json = JSON.parse (new TextDecoder ().decode (new Uint8Array (buffer, 20, new DataView (buffer).getUint32 (12, true))).trim ());
        assert.equal (json.materials[0].extensions.KHR_materials_clearcoat.clearcoatFactor, .8); assert.ok (json.materials[0].pbrMetallicRoughness.metallicRoughnessTexture); assert.ok (json.images.length >= 2);
    });
});
