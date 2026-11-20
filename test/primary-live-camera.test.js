import assert from 'node:assert/strict';
import * as module from '../modules/primary-products/src/index.js';
import { Camera } from '../source/engine/viewer/camera.js';
import { UpVector } from '../source/engine/viewer/viewer.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { Direction } from '../source/engine/geometry/geometry.js';
import { PrimaryProductsWorkspace } from '../source/website/primaryproductsworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';

function Fixture ()
{
    const events = [], upVector = new UpVector ();
    const viewer = {
        camera : new Camera (new Coord3D (40, 30, 500), new Coord3D (10, 15, -20), new Coord3D (0, 1, 0), 37),
        GetCamera () { return this.camera; },
        SetCamera (camera) { events.push ('restore'); this.camera = camera; this.pending = null; },
        navigation : { orbitCenter : null, FinishCameraMovement () { events.push ('settle'); if (viewer.pending) { viewer.camera = viewer.pending; viewer.pending = null; } } }
    };
    const editor = {
        document : new SceneDocument (), history : new SceneHistory (), selected : null, busy : false, readOnly : false,
        async Render (fit = false, beforeDisplay = null) {
            events.push ('render');
            const convert = this.nextConversion; this.nextConversion = null;
            if (convert) { await convert (); }
            beforeDisplay?.();
            // Website.OnModelLoaded resets orientation even when Render receives fit=false.
            viewer.camera = upVector.SetDirection (Direction.Y, viewer.camera);
            if (this.failNextRender) { this.failNextRender = false; throw new Error ('Render failed'); }
        },
        Select (object) { events.push ('select'); this.selected = object; },
        Focus () {
            events.push ('focus');
            const center = new Coord3D (0, panel.draft.heightMm / 2, 0);
            viewer.navigation.orbitCenter = center.Clone ();
            viewer.pending = new Camera (new Coord3D (-200, center.y + 100, 300), center, new Coord3D (0, 1, 0), 37);
        },
        RefreshButtons () {}, Status () {}
    };
    const panel = {
        website : { auth : { user : { id : 'owner' } }, accountReady : true, sessionEditor : editor, viewer },
        draft : module.DefaultProductDraft ('bottle'), callouts : false, Refresh () {},
        Blocked () { return editor.busy || editor.readOnly || this.products.active; }
    };
    const workspace = new PrimaryProductsWorkspace (panel, async () => module); panel.products = workspace;
    const manualView = (offset, pivot = true) => {
        viewer.camera = new Camera (new Coord3D (275 + offset, -80, 640), new Coord3D (30, 50 + offset, -90), new Coord3D (0.2, 0.95, -0.1), 31 + offset / 10);
        viewer.navigation.orbitCenter = pivot ? new Coord3D (12 + offset, 145, -35) : null;
        return { camera : viewer.camera.Clone (), pivot : viewer.navigation.orbitCenter?.Clone () || null };
    };
    const assertView = expected => { assert.deepEqual (viewer.GetCamera (), expected.camera); assert.deepEqual (viewer.navigation.orbitCenter, expected.pivot); };
    return { panel, editor, viewer, workspace, events, manualView, assertView };
}

describe ('Primary Products live camera', () => {
    it ('frames a new product and finishes the fit before generation resolves', async () => {
        const { workspace, panel, editor, viewer, events } = Fixture ();
        const result = await workspace.Generate ();
        assert.equal (editor.selected.id, result.objectId);
        assert.deepEqual (events, ['render', 'select', 'focus', 'settle']);
        assert.deepEqual (viewer.GetCamera ().center, new Coord3D (0, panel.draft.heightMm / 2, 0));
        assert.deepEqual (viewer.navigation.orbitCenter, viewer.GetCamera ().center);
        assert.equal (viewer.pending, null, 'a subsequent live edit must not cancel an unfinished fit');
    });

    it ('retains the current orbit, pan, zoom, FOV and pivot through live rebuild, Undo and Redo', async () => {
        const { workspace, panel, editor, events, manualView, assertView } = Fixture ();
        await workspace.Generate (); const source = editor.selected;
        const editedView = manualView (0); events.length = 0;
        panel.draft = module.UpdateProductDraft (panel.draft, { heightMm : 260 });
        await workspace.Generate (true); const replacement = editor.selected;
        assert.notEqual (replacement, source); assert.equal (replacement.id, source.id);
        assert.equal (workspace.Selected ().definition.draft.heightMm, 260); assertView (editedView);
        assert.deepEqual (events, ['render', 'restore']);

        const undoView = manualView (20); events.length = 0;
        await editor.history.Undo (); assert.equal (editor.selected, source); assertView (undoView);
        assert.deepEqual (events, ['render', 'restore']);

        const redoView = manualView (40, false); events.length = 0;
        await editor.history.Redo (); assert.equal (editor.selected, replacement); assertView (redoView);
        assert.deepEqual (events, ['render', 'restore']);
    });

    it ('restores the original product and current view when rendering an update fails', async () => {
        const { workspace, panel, editor, events, manualView, assertView } = Fixture ();
        await workspace.Generate (); const source = editor.selected, originalDefinition = workspace.Selected ().definition;
        const historyLength = editor.history.undo.length, view = manualView (30); events.length = 0;
        panel.draft = module.UpdateProductDraft (panel.draft, { heightMm : 270 }); editor.failNextRender = true;
        await assert.rejects (workspace.Generate (true), /Render failed/);
        assert.equal (editor.selected, source); assert.deepEqual (editor.document.objects, [source]);
        assert.deepEqual (workspace.Selected ().definition, originalDefinition); assert.equal (editor.history.undo.length, historyLength);
        assertView (view); assert.deepEqual (events, ['render', 'restore', 'render', 'restore']);
        assert.equal (editor.busy, false); assert.equal (workspace.active, false);
    });

    it ('retains navigation performed while the updated geometry is converting', async () => {
        const { workspace, panel, editor, events, manualView, assertView } = Fixture ();
        await workspace.Generate (); const beforeConversion = manualView (0); events.length = 0;
        let entered, resume;
        const started = new Promise (resolve => { entered = resolve; }), paused = new Promise (resolve => { resume = resolve; });
        editor.nextConversion = async () => { entered (); await paused; };
        panel.draft = module.UpdateProductDraft (panel.draft, { heightMm : 260 });
        const rebuilding = workspace.Generate (true); await started;
        assertView (beforeConversion);
        const movedDuringConversion = manualView (60);
        resume (); await rebuilding;
        assertView (movedDuringConversion);
        assert.equal (workspace.Selected ().definition.draft.heightMm, 260);
        assert.deepEqual (events, ['render', 'restore']);
    });
});
