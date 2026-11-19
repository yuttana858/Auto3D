import assert from 'node:assert/strict';
import * as module from '../modules/primary-products/src/index.js';
import { NewLabelCAD } from '../modules/primary-products/src/labelcad.js';
import { PrimaryProductsWorkspace, PrimaryProductDataKey } from '../source/website/primaryproductsworkspace.js';
import { PrimaryProductsArtwork } from '../source/website/primaryproductsartwork.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { PackSession, CreateSessionArchive, OpenSessionArchive } from '../source/website/sessionarchive.js';
import { RecoverySnapshot } from '../source/website/sessionrecovery.js';
import { PackRecoverySnapshot } from '../source/website/sessionrecoverypack.js';
import { ProductSurfaceMaps } from '../modules/primary-products/src/surfaces.js';

function fixture ()
{
    const editor = { document : new SceneDocument (), history : new SceneHistory (), selected : null, busy : false, readOnly : false, async Render () {}, RefreshButtons () {}, Status () {} };
    const panel = { website : { auth : { user : { id : 'owner' } }, accountReady : true, sessionEditor : editor }, draft : module.DefaultProductDraft (), Refresh () {}, Inspect () { return this.draft; }, Blocked () { return editor.busy || editor.readOnly; } };
    panel.artwork = new PrimaryProductsArtwork (panel); panel.products = new PrimaryProductsWorkspace (panel, async () => module); return { panel, editor };
}
describe ('CAD label archive and scene integration', function () {
    it ('persists body and circular cap CAD with portable textures, identity, placement and Undo', async function () {
        const { panel, editor } = fixture (); await panel.products.Generate (); const original = editor.selected, id = original.id;
        original.position = [3, 4, 5]; original.scale = [2, 2, 2]; editor.document.ApplyTransform (original);
        const resource = ProductSurfaceMaps ('paper').bumpMap, hash = 'a'.repeat (64); panel.artwork.resources.set (hash, resource);
        panel.artwork.entries = ['front', 'cap-top'].map (zone => {
            const cad = NewLabelCAD (12, 12, zone === 'cap-top'); cad.paths.push ({ ...cad.paths[0], id : 'ink', type : 'artwork', fill : '#336699', stroke : 'none', strokeWidth : 0 });
            return { resourceId : hash, name : zone, mime : 'image/png', zone, widthMm : 12, heightMm : 12, cad };
        });
        await panel.products.Generate (true, true); assert.equal (editor.selected.id, id); assert.deepEqual (editor.selected.position, [3, 4, 5]); assert.deepEqual (editor.selected.scale, [2, 2, 2]);
        const saved = OpenSessionArchive (CreateSessionArchive (PackSession (editor.document))).document, definition = JSON.parse (saved.objects[0].userData[PrimaryProductDataKey]);
        assert.equal (definition.artwork.length, 2); assert.deepEqual (definition.artwork, panel.artwork.entries);
        const loaded = new PrimaryProductsArtwork (panel); loaded.Load (definition, saved.CompactModel ([saved.objects[0]], true)); assert.deepEqual (loaded.Inspect (), panel.artwork.entries); assert.deepEqual (loaded.resources.get (hash).buffer, resource.buffer);
        const recovered = PackRecoverySnapshot (RecoverySnapshot (editor.document)); assert.ok (JSON.stringify (recovered).includes ('cap-top'));
        await editor.history.Undo (); assert.equal (editor.selected, original); assert.equal (JSON.parse (editor.selected.userData[PrimaryProductDataKey]).artwork, undefined);
        await editor.history.Redo (); assert.deepEqual (JSON.parse (editor.selected.userData[PrimaryProductDataKey]).artwork, definition.artwork);
    });
});
