import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ObjectsInSelectionRectangle, ProjectSelectionBounds, RectangleSelection, SelectionRectangle, VisibleSelectionBounds } from '../source/website/rectangleselection.js';

function Camera (orthographic = false)
{
    const camera = orthographic ? new THREE.OrthographicCamera (-5, 5, 5, -5, .1, 100) : new THREE.PerspectiveCamera (60, 1, .1, 100);
    camera.updateMatrixWorld (); return camera;
}
function SceneObject (id, x = 0, z = -5)
{
    const threeObject = new THREE.Group (), mesh = new THREE.Mesh (new THREE.BoxGeometry (1, 1, 1), new THREE.MeshBasicMaterial ());
    threeObject.position.set (x, 0, z); threeObject.add (mesh); threeObject.updateMatrixWorld (true);
    return { id, visible : true, threeObject };
}
function Box (min, max) { return new THREE.Box3 (new THREE.Vector3 (...min), new THREE.Vector3 (...max)); }

describe ('Rectangle selection projection', function () {
    it ('validates normalized rectangles and accepts both drag directions', () => {
        assert.deepEqual (SelectionRectangle ({ x1 : .8, y1 : .9, x2 : .2, y2 : .1 }), { x1 : .2, y1 : .1, x2 : .8, y2 : .9 });
        for (const patch of [{ x1 : -.1 }, { x2 : Infinity }, { y2 : 2 }, { x2 : .1 }, { y1 : NaN }]) {
            assert.throws (() => SelectionRectangle ({ x1 : .1, y1 : .2, x2 : .9, y2 : .8, ...patch }), /nonempty rectangle/);
        }
    });
    it ('projects perspective and orthographic bounds in viewport coordinates', () => {
        const perspective = ProjectSelectionBounds (Box ([-1, -1, -6], [1, 1, -4]), Camera ());
        assert.ok (perspective.x1 > .25 && perspective.x1 < .3); assert.equal (perspective.x1, perspective.y1); assert.equal (perspective.x2, perspective.y2);
        const orthographic = ProjectSelectionBounds (Box ([2, 0, -6], [4, 2, -4]), Camera (true));
        for (const [key, expected] of Object.entries ({ x1 : .7, y1 : .3, x2 : .9, y2 : .5 })) { assert.ok (Math.abs (orthographic[key] - expected) < 1e-9); }
    });
    it ('clips near-plane crossings and excludes behind-camera, offscreen and far-plane bounds', () => {
        const camera = Camera ();
        for (const bounds of [Box ([-1, -1, 1], [1, 1, 3]), Box ([-1, -1, -110], [1, 1, -101]), Box ([10, 10, -6], [12, 12, -4])]) { assert.equal (ProjectSelectionBounds (bounds, camera), null); }
        const crossing = ProjectSelectionBounds (Box ([-1, -1, -.2], [1, 1, .2]), camera);
        assert.deepEqual (crossing, { x1 : 0, y1 : 0, x2 : 1, y2 : 1 });
        const enclosing = ProjectSelectionBounds (Box ([-10000, -10000, -10000], [10000, 10000, 10000]), camera);
        assert.deepEqual (enclosing, { x1 : 0, y1 : 0, x2 : 1, y2 : 1 });
    });
    it ('measures transformed visible geometry without selecting hidden parts or hidden objects', () => {
        const visible = SceneObject ('visible', 2), hidden = SceneObject ('hidden'); hidden.visible = false;
        const rootHidden = SceneObject ('root-hidden'); rootHidden.threeObject.visible = false;
        const child = new THREE.Mesh (new THREE.BoxGeometry (3, 3, 3), new THREE.MeshBasicMaterial ()); child.position.x = -20; child.visible = false; visible.threeObject.add (child);
        visible.threeObject.rotation.y = Math.PI / 4; visible.threeObject.scale.set (2, 1, 1);
        const bounds = VisibleSelectionBounds (visible.threeObject);
        assert.ok (bounds.min.x > .9 && bounds.max.x < 3.1, 'hidden child does not expand the visible bounds');
        const hits = ObjectsInSelectionRectangle ([visible, hidden, rootHidden], Camera (), { x1 : .6, y1 : .2, x2 : 1, y2 : .8 });
        assert.deepEqual (hits.map (object => object.id), ['visible']);
    });
    it ('includes occluded objects and visible line geometry through intersecting bounds', () => {
        const front = SceneObject ('front', 0, -3), back = SceneObject ('back', 0, -6), outside = SceneObject ('outside', 8, -5);
        const lineRoot = new THREE.Group (); lineRoot.position.z = -5;
        const geometry = new THREE.BufferGeometry ().setFromPoints ([new THREE.Vector3 (-.5, 0, 0), new THREE.Vector3 (.5, 0, 0)]);
        lineRoot.add (new THREE.Line (geometry, new THREE.LineBasicMaterial ()));
        const hits = ObjectsInSelectionRectangle ([front, back, outside, { id : 'line', threeObject : lineRoot }], Camera (), { x1 : .49, y1 : .4, x2 : .7, y2 : .6 });
        assert.deepEqual (hits.map (object => object.id), ['front', 'back', 'line']);
    });
});

function Fixture (run)
{
    const previous = { document : globalThis.document, window : globalThis.window };
    function target () { return { listeners : new Map (), addEventListener (name, callback) { this.listeners.set (name, callback); }, removeEventListener (name) { this.listeners.delete (name); } }; }
    const body = { classList : { contains : () => false }, appendChild () {} };
    globalThis.document = { ...target (), body, querySelector : () => null, createElement : () => ({ style : {}, dataset : {}, hidden : false, setAttribute () {}, remove () {} }) };
    globalThis.window = target ();
    const rect = { left : 20, top : 40, width : 400, height : 400 }, canvas = { ...target (), style : {}, getBoundingClientRect : () => ({ ...rect }), setPointerCapture (id) { this.capture = id; }, hasPointerCapture (id) { return this.capture === id; }, releasePointerCapture () { this.capture = null; } };
    const objects = [SceneObject ('a'), SceneObject ('b', 2)], clicks = [], selections = []; let cancelledClicks = 0;
    const editor = { mode : 'select', busy : false, document : { objects }, selected : null, selection : [], website : { accountReady : true, auth : { user : { id : 'owner' } }, viewer : { camera : Camera (), renderer : { domElement : canvas }, navigation : { clickDetector : { Cancel () { cancelledClicks++; } }, Click (...args) { clicks.push (args); } } } }, SetMode (mode) { this.mode = mode; }, SetSelection (hits, options) { selections.push ({ hits, options }); this.selection = hits; this.selected = hits[0] || null; }, SelectedObjects () { return this.selection; }, RefreshButtons () {}, Status () {} };
    const tool = new RectangleSelection (editor);
    const event = (x, y, extra = {}) => ({ pointerId : 1, button : 0, isPrimary : true, clientX : rect.left + x, clientY : rect.top + y, preventDefault () {}, stopImmediatePropagation () {}, ...extra });
    try { return run ({ tool, editor, canvas, rect, objects, clicks, selections, event, cancelledClicks : () => cancelledClicks }); }
    finally { tool.Dispose (); globalThis.document = previous.document; globalThis.window = previous.window; }
}

describe ('Rectangle selection interactions', function () {
    it ('commits a captured drag with additive/subtractive modifiers and preserves single clicks', () => Fixture (({ tool, editor, canvas, event, clicks, selections }) => {
        tool.SetActive (true); assert.equal (canvas.style.cursor, 'crosshair');
        tool.Down (event (100, 100, { shiftKey : true })); tool.Move (event (260, 280)); assert.equal (tool.overlay.hidden, false); tool.Up (event (260, 280));
        assert.equal (selections.length, 1); assert.deepEqual (selections[0].hits.map (object => object.id), ['a']); assert.deepEqual (selections[0].options, { mode : 'add', expandGroups : true });
        tool.Down (event (110, 100, { altKey : true })); assert.equal (tool.overlay.dataset.mode, 'subtract'); tool.Up (event (260, 280)); assert.equal (selections[1].options.mode, 'subtract');
        tool.Down (event (200, 200)); tool.Up (event (201, 201)); assert.equal (clicks.length, 1); assert.equal (clicks[0][0], 1); assert.equal (clicks[0][1].x, 201);
        assert.equal (canvas.capture, null); assert.equal (tool.overlay.hidden, true); assert.equal (editor.mode, 'select');
    }));
    it ('does not take over right drag or Space-pan and cancels on wheel, blur and Escape', () => Fixture (({ tool, canvas, event, selections }) => {
        tool.SetActive (true); tool.Down (event (10, 10, { button : 2 })); assert.equal (tool.drag, null);
        tool.website.viewer.navigation.spacePan = true; tool.Down (event (10, 10)); assert.equal (tool.drag, null); tool.website.viewer.navigation.spacePan = false;
        tool.Down (event (20, 20)); canvas.listeners.get ('wheel') (); assert.equal (tool.drag, null); assert.equal (tool.active, true);
        tool.Down (event (20, 20)); window.listeners.get ('blur') (); assert.equal (tool.drag, null);
        tool.Down (event (20, 20)); document.listeners.get ('keydown') ({ key : 'Escape', preventDefault () {}, stopImmediatePropagation () {} });
        assert.equal (tool.active, false); assert.equal (tool.drag, null); assert.equal (canvas.style.cursor, ''); assert.equal (selections.length, 0);
    }));
    it ('leaves navigation click detection alone when it does not own a drag', () => Fixture (({ tool, canvas, event, cancelledClicks, clicks }) => {
        for (const name of ['lostpointercapture', 'pointercancel', 'wheel']) { canvas.listeners.get (name) (); }
        tool.Cancel (); assert.equal (cancelledClicks (), 0);
        tool.SetActive (true); canvas.listeners.get ('lostpointercapture') (); canvas.listeners.get ('wheel') (); assert.equal (cancelledClicks (), 0);
        tool.Down (event (200, 200)); assert.equal (cancelledClicks (), 1);
        tool.Up (event (201, 201)); assert.equal (cancelledClicks (), 2); assert.equal (clicks.length, 1, 'rectangle-mode clicks still reach ordinary selection');
        canvas.listeners.get ('lostpointercapture') (); tool.SetActive (false); assert.equal (cancelledClicks (), 2, 'late capture cleanup cannot cancel another tool click');
    }));
    it ('cancels stale drags after session, account, camera, layout, model or busy-state changes', () => {
        const changes = [f => { f.editor.document = { objects : [...f.objects] }; }, f => { f.editor.website.auth.user = { id : 'another-owner' }; }, f => { f.editor.website.viewer.camera.position.x = 1; }, f => { f.rect.width = 500; }, f => { f.objects[0].threeObject = new THREE.Group (); }, f => { f.editor.busy = true; }, f => { f.editor.mode = 'translate'; }];
        for (const change of changes) { Fixture (f => { f.tool.SetActive (true); f.tool.Down (f.event (100, 100)); change (f); f.tool.Up (f.event (300, 300)); assert.equal (f.selections.length, 0); assert.equal (f.tool.drag, null); assert.equal (f.canvas.capture, null); }); }
    });
    it ('shares the normalized selection service and validates before changing selection', () => Fixture (({ tool, editor, selections }) => {
        const result = tool.Select ({ x1 : .4, y1 : .4, x2 : .6, y2 : .6, expandGroups : false }); assert.deepEqual (result.objectIds, ['a']); assert.equal (result.includesOccluded, true);
        assert.throws (() => tool.Select ({ x1 : 0, y1 : 0, x2 : 1, y2 : 1, mode : 'unknown' }), /selection mode/);
        editor.busy = true; assert.throws (() => tool.Select ({ x1 : 0, y1 : 0, x2 : 1, y2 : 1 }), /idle viewer/); assert.equal (selections.length, 1);
    }));
    it ('refuses signed-out selection and yields when another measurement tool takes over', () => Fixture (({ tool, editor, event, selections }) => {
        editor.website.auth.user = null; assert.throws (() => tool.SetActive (true), /Sign in/); assert.throws (() => tool.Select ({ x1 : 0, y1 : 0, x2 : 1, y2 : 1 }), /idle viewer/);
        editor.website.auth.user = { id : 'owner' }; tool.SetActive (true); tool.Down (event (100, 100));
        editor.website.measureTool = { IsActive : () => true }; tool.Up (event (300, 300)); assert.equal (selections.length, 0); assert.equal (tool.drag, null);
    }));
});
