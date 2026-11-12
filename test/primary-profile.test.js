import assert from 'node:assert/strict';
import * as module from '../modules/primary-products/src/index.js';
import { ProfileProjection } from '../modules/primary-products/src/profile.js';
import { PrimaryProductsPanel } from '../source/website/primaryproductspanel.js';
import { PrimaryProductsWorkspace } from '../source/website/primaryproductsworkspace.js';
import { PrimaryProductsArtwork } from '../source/website/primaryproductsartwork.js';
import { PrimaryProfileWorkspace } from '../source/website/primaryprofileworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import { PackSession, ReadSession } from '../source/website/sessionarchive.js';
import { ProductSurfaceMaps } from '../modules/primary-products/src/surfaces.js';
function fixture () {
    const editor = { document : new SceneDocument (), history : new SceneHistory (), selected : null, busy : false, readOnly : false, async Render () {}, RefreshButtons () {}, Status () {} };
    const panel = Object.assign (Object.create (PrimaryProductsPanel.prototype), { website : { auth : { user : { id : 'owner' } }, preferences : { units : 'metric' }, accountReady : true, sessionEditor : editor }, draft : module.ProductDesign ('rect-cleaner'), Refresh () {} });
    panel.products = new PrimaryProductsWorkspace (panel, async () => module); panel.artwork = new PrimaryProductsArtwork (panel); panel.profileEditor = new PrimaryProfileWorkspace (panel); panel.website.primaryProductsPanel = panel;
    return { panel, editor, registry : CreateAgentCommands (panel.website) };
}
describe ('Live Primary Products profile', function () {
    this.timeout (20000);
    it ('updates bottle dimensions atomically, including cross-section transitions and fixed closure dimensions', () => {
        const d = module.ProductDesign ('boston-inspired'), old = module.BottleShape (d);
        const next = module.ProfileChanges (d, { heightMm : 200, crossSection : 'rectangle', lengthMm : 50, cornerRadiusMm : 8 });
        assert.equal (next.diameterMm, d.diameterMm); assert.equal (next.bottleSection.depthMm, 50); assert.equal (next.heightMm, 200); assert.deepEqual (next.bottleShape, old);
        const round = module.ProfileChanges (next, { crossSection : 'round', widthMm : 70, lengthMm : 70 }); assert.equal (round.bottleSection, undefined); assert.equal (round.diameterMm, 70);
        assert.throws (() => module.ProfileChanges (d, { capHeightMm : 190 })); assert.throws (() => module.ProfileChanges (d, { heightMm : NaN })); assert.throws (() => module.ProfileChanges (d, {})); assert.throws (() => module.ProfileChanges (d, { unsupported : 1 }));
        assert.throws (() => module.ProfileChanges (module.DefaultProductDraft ('can'), { neckHeightMm : 10 })); assert.throws (() => module.ProfileChanges (d, { cornerRadiusMm : 2 }));
    });
    it ('projects actual component geometry for all families without nonfinite paths', () => {
        for (const id of ['rect-cleaner', 'standard-beverage', 'flat-bottom-coffee', 'food-deli']) {
            const d = module.ProductDesign (id); for (const plane of ['front', 'top']) { const paths = ProfileProjection (d, plane); assert.equal (paths.length, module.CreatePrimaryProduct (d).components.length); assert.ok (paths.every (p => p.path.startsWith ('M') && !/NaN|Infinity/.test (p.path))); }
        }
        const d = module.ProductDesign ('boston-inspired'); assert.notEqual (ProfileProjection (d)[0].path, ProfileProjection (module.ProfileChanges (d, { shoulderHeightMm : 35 }))[0].path);
    });
    it ('rebuilds the selected object with artwork, edited finish, placement, archive and one-step Undo retained', async () => {
        const { panel, editor, registry } = fixture ();
        panel.artwork.entries = [{ resourceId : 'a'.repeat (64), name : 'Label', mime : 'image/png', zone : 'front', widthMm : 20, heightMm : 25, finish : 'foil' }]; panel.artwork.resources.set ('a'.repeat (64), ProductSurfaceMaps ('paper').bumpMap);
        await panel.products.Generate (); const original = editor.selected; original.position = [2, 3, 4]; editor.document.ApplyTransform (original); editor.document.model.materials[0].clearcoat = .72;
        const result = await registry.Execute ('primary.profile.update', { objectId : original.id, heightMm : 260, neckDiameterMm : 28 }); assert.equal (result.ok, true, JSON.stringify (result)); assert.equal (editor.document.objects.length, 1); assert.equal (editor.selected.id, original.id); assert.deepEqual (editor.selected.position, [2, 3, 4]);
        assert.equal (panel.products.Selected ().definition.draft.heightMm, 260); assert.equal (panel.products.Selected ().definition.artwork[0].finish, 'foil');
        const materials = editor.document.CompactModel ([editor.selected], true).materials; assert.equal (materials[0].clearcoat, .72); assert.ok (materials.some (m => m.name.startsWith ('Primary label')));
        const saved = ReadSession (PackSession (editor.document)).document; assert.ok (saved.objects[0].userData._auto3dPrimaryProduct.includes ('260'));
        await editor.history.Undo (); assert.equal (editor.selected, original); assert.equal (panel.profileEditor.Inspect ().draft.heightMm, 240); await editor.history.Redo (); assert.equal (panel.profileEditor.Inspect ().draft.heightMm, 260);
    });
    it ('rejects invalid fit, stale selection, readonly edits and failed renders without changing the product or draft', async () => {
        const { panel, editor, registry } = fixture (); await panel.products.Generate (); const original = editor.selected, draft = panel.draft;
        for (const changes of [{ heightMm : 20 }, { objectId : 'another-object', heightMm : 270 }, { crossSection : 'bad' }]) { assert.equal ((await registry.Execute ('primary.profile.update', changes)).ok, false); assert.equal (editor.selected, original); assert.deepEqual (panel.draft, draft); }
        editor.readOnly = true; assert.equal ((await registry.Execute ('primary.profile.update', { heightMm : 270 })).ok, false); editor.readOnly = false;
        editor.Render = async () => { throw new Error ('Render failed'); }; assert.equal ((await registry.Execute ('primary.profile.update', { heightMm : 270 })).ok, false); assert.equal (editor.selected, original); assert.deepEqual (panel.draft, draft); assert.equal (panel.profileEditor.committing, false);
    });
    it ('supports macros without needing a UI open, and validates label fit before mutation', async () => {
        const { panel, editor, registry } = fixture (); await panel.products.Generate (); const id = editor.selected.id;
        const result = await registry.RunMacro ({ version : 1, steps : [{ id : 'shape', command : 'primary.profile.update', arguments : { objectId : id, shoulderHeightMm : 35 } }, { id : 'read', command : 'primary.profile.inspect' }] }); assert.equal (result.ok, true, JSON.stringify (result)); assert.equal (result.completed[1].result.draft.bottleShape.shoulderHeightMm, 35);
        panel.artwork.entries = [{ resourceId : 'a'.repeat (64), name : 'Label', mime : 'image/png', zone : 'front', widthMm : 20, heightMm : 90 }]; panel.artwork.resources.set ('a'.repeat (64), ProductSurfaceMaps ('paper').bumpMap); await panel.products.Generate (true); const before = editor.selected;
        assert.equal ((await registry.Execute ('primary.profile.update', { shoulderHeightMm : 120 })).ok, false); assert.equal (editor.selected, before);
    });
});
