import assert from 'node:assert/strict';
import * as module from '../modules/primary-products/src/index.js';
import { PrimaryProductsPanel } from '../source/website/primaryproductspanel.js';
import { PrimaryProductsWorkspace } from '../source/website/primaryproductsworkspace.js';
import { PrimaryProductsArtwork } from '../source/website/primaryproductsartwork.js';
import { PrimaryProfileWorkspace } from '../source/website/primaryprofileworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

function fixture ()
{
    const editor = { document : new SceneDocument (), history : new SceneHistory (), selected : null, busy : false, readOnly : false, async Render () {}, RefreshButtons () {}, Status () {} };
    const website = { auth : { user : { id : 'owner' } }, accountReady : true, preferences : { units : 'metric' }, sessionEditor : editor };
    const panel = Object.assign (Object.create (PrimaryProductsPanel.prototype), { website, draft : module.ProductDesign ('boston-inspired') });
    panel.products = new PrimaryProductsWorkspace (panel, async () => module); panel.artwork = new PrimaryProductsArtwork (panel); panel.profileEditor = new PrimaryProfileWorkspace (panel); website.primaryProductsPanel = panel;
    return { panel, editor, website, registry : CreateAgentCommands (website) };
}
function holdNextLoad (panel)
{
    let release; const wait = new Promise (resolve => { release = resolve; }); let first = true;
    panel.products.load = async () => { if (first) { first = false; await wait; } return module; };
    return release;
}
describe ('Selected product live controls', function () {
    this.timeout (20000);
    it ('keeps unselected controls as a draft and refuses stale targets or invalid input', async () => {
        const { panel, editor, registry } = fixture ();
        const draft = await registry.Execute ('primary.live.configure', { heightMm : 230 }); assert.equal (draft.ok, true, JSON.stringify (draft)); assert.equal (draft.result.updated, false); assert.equal (editor.document.objects.length, 0);
        await panel.products.Generate (); const original = editor.selected;
        for (const args of [{ objectId : 'stale', color : '#334455' }, { heightMm : -1 }, { details : { capMaterial : 'unknown' } }]) { assert.equal ((await registry.Execute ('primary.live.configure', args)).ok, false); }
        assert.equal (editor.selected, original); assert.equal (panel.products.Selected ().definition.draft.heightMm, 230);
    });
    it ('coalesces rapid edits to one object and one Undo interaction without losing the last input', async () => {
        const { panel, editor } = fixture (); await panel.products.Generate (); const original = editor.selected, before = editor.history.undo.length;
        const release = holdNextLoad (panel);
        const first = panel.LiveConfigure ({ heightMm : 225 }), second = panel.LiveConfigure ({ color : '#334455' }), last = panel.LiveConfigure ({ heightMm : 235 });
        assert.equal (panel.Inspect ().liveUpdating, true); assert.equal (panel.Live ().Blocked (), false);
        release (); const results = await Promise.all ([first, second, last]);
        assert.ok (results.every (result => result.updated && result.objectId === original.id)); assert.equal (editor.document.objects.length, 1);
        assert.equal (panel.products.Selected ().definition.draft.heightMm, 235); assert.equal (panel.products.Selected ().definition.draft.color, '#334455');
        assert.equal (editor.history.undo.length, before + 1); assert.equal (panel.Inspect ().liveUpdating, false);
        await editor.history.Undo (); assert.equal (editor.selected, original);
        await editor.history.Redo (); assert.equal (panel.products.Selected ().definition.draft.heightMm, 235);
    });
    it ('rejects queued work after selection changes and does not overwrite the newer selection', async () => {
        const { panel, editor } = fixture (); await panel.products.Generate (); const first = editor.selected; await panel.products.Generate (); const second = editor.selected;
        editor.selected = first; panel.Refresh (); const count = editor.history.undo.length, release = holdNextLoad (panel);
        const edit = panel.LiveConfigure ({ heightMm : 245 }); const rejected = assert.rejects (edit, /changed/);
        editor.selected = second; release (); await rejected;
        assert.equal (editor.selected, second); assert.equal (editor.document.objects.length, 2); assert.equal (editor.history.undo.length, count); assert.equal (panel.draft.heightMm, module.ProductDesign ('boston-inspired').heightMm);
    });
    it ('refuses readonly and unrelated busy sessions, and rolls back render failures', async () => {
        const { panel, editor } = fixture (); await panel.products.Generate (); const original = editor.selected;
        editor.readOnly = true; await assert.rejects (panel.LiveConfigure ({ color : '#112233' }), /editable/); editor.readOnly = false;
        editor.busy = true; await assert.rejects (panel.LiveConfigure ({ color : '#112233' }), /idle/); editor.busy = false;
        let once = true; editor.Render = async () => { if (once) { once = false; throw new Error ('Render failed'); } };
        await assert.rejects (panel.LiveConfigure ({ heightMm : 240 }), /Render failed/);
        assert.equal (editor.selected, original); assert.equal (editor.busy, false); assert.equal (panel.Live ().active, false); assert.deepEqual (panel.draft, panel.products.Selected ().definition.draft);
    });
    it ('applies named glass construction and independent cap PBR settings while keeping edited body finish', async () => {
        const { panel, editor } = fixture (); await panel.products.Generate (); const id = editor.selected.id;
        editor.document.model.materials[0].clearcoat = .73;
        await panel.LiveDetails ({ glassPreset : 'heavy' });
        assert.equal (panel.products.Selected ().definition.draft.details.glassPreset, 'heavy'); assert.equal (panel.draft.details.wallMm, 3); assert.equal (panel.draft.details.baseMm, 6);
        await panel.LiveDetails ({ capMaterial : 'aluminum', capColor : '#b69560', capWallMm : 1.1 });
        const model = editor.document.CompactModel ([editor.selected], true), cap = model.meshes.find (mesh => mesh.GetName () === 'cap'), body = model.meshes.find (mesh => mesh.GetName () === 'body');
        const material = model.materials[cap.GetTriangle (0).mat]; assert.equal (material.metalness, 1); assert.deepEqual ([material.color.r, material.color.g, material.color.b], [182, 149, 96]); assert.equal (model.materials[body.GetTriangle (0).mat].clearcoat, .73);
        assert.equal (editor.selected.id, id); assert.equal (editor.document.objects.length, 1);
        await panel.LiveDetails ({ wallMm : 2.5 }); assert.equal (panel.draft.details.glassPreset, 'custom'); assert.equal (panel.draft.details.wallMm, 2.5);
    });
    it ('updates displayed grain and texture scale without discarding unrelated advanced materials', async () => {
        const { panel, editor } = fixture (); await panel.products.Generate ();
        const body = () => { const model = editor.document.CompactModel ([editor.selected], true), mesh = model.meshes.find (item => item.GetName () === 'body'); return model.materials[mesh.GetTriangle (0).mat]; };
        editor.document.model.materials[0].clearcoat = .73; assert.ok (body ().bumpMap);
        await panel.LiveDetails ({ textureStrength : 0 }); assert.equal (body ().bumpMap, null); assert.equal (body ().clearcoat, .73);
        await panel.LiveDetails ({ textureStrength : .8, textureScaleMm : 40 });
        assert.match (body ().bumpMap.name, /0.8/); assert.ok (Math.abs (body ().bumpMap.scale.y - panel.draft.heightMm / 40) < 1e-9); assert.equal (body ().clearcoat, .73);
        await editor.history.Undo (); assert.equal (body ().bumpMap, null);
    });
});
