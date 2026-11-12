import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { Navigation } from '../source/engine/viewer/navigation.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { Coord2D } from '../source/engine/geometry/coord2d.js';
import { NavigationMode } from '../source/engine/viewer/camera.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
describe ('Selected-object orbit', () => {
    it ('Fits the selected visible object at the viewport center without including other or hidden objects', () => {
        const root = new THREE.Group (); root.position.set (100, 20, -30); root.add (new THREE.Mesh (new THREE.BoxGeometry (10, 20, 30), new THREE.MeshBasicMaterial ()));
        const hidden = new THREE.Mesh (new THREE.BoxGeometry (100, 100, 100), new THREE.MeshBasicMaterial ()); hidden.position.x = 1000; hidden.visible = false; root.add (hidden);
        let sphere; const editor = { selected : { id : 'box', visible : true, threeObject : root }, SelectedViewBounds : SessionEditor.prototype.SelectedViewBounds, SelectedObjects () { return [this.selected]; }, website : { viewer : { navigation : {}, FitSphereToWindow : value => { sphere = value; } } } };
        SessionEditor.prototype.Focus.call (editor); assert.deepEqual (sphere.center.toArray (), [100, 20, -30]); assert.ok (sphere.radius < 20);
    });
    it ('Targets transformed visible bounds while preserving eye and FOV', async () => {
        const root = new THREE.Group (); root.position.set (100, 20, -30); const box = new THREE.Mesh (new THREE.BoxGeometry (10, 20, 30), new THREE.MeshBasicMaterial ()); root.add (box); const hidden = box.clone (); hidden.position.x = 1000; hidden.visible = false; root.add (hidden);
        const navigation = { camera : { eye : new Coord3D (0, 0, 500), center : new Coord3D (0, 0, 0), fov : 45 }, StopCameraMovement () {} }; const editor = { selected : { id : 'box', visible : true, threeObject : root }, SelectedViewBounds : SessionEditor.prototype.SelectedViewBounds, SelectedObjects () { return [this.selected]; }, website : { viewer : { navigation } }, OrbitSelected : SessionEditor.prototype.OrbitSelected }; editor.website.sessionEditor = editor;
        const before = navigation.camera.eye.Clone (); const result = await CreateAgentCommands (editor.website).Execute ('camera.orbit.focus_selected'); assert.equal (result.ok, true); assert.deepEqual (result.result.pivot, [100, 20, -30]); assert.deepEqual (navigation.camera.eye, before); assert.deepEqual ([navigation.camera.center.x, navigation.camera.center.y, navigation.camera.center.z], [100, 20, -30]); editor.selected.visible = false; assert.equal (editor.OrbitSelected ().focused, false); assert.equal (navigation.orbitCenter, null);
    });
    it ('Frames and targets the union of selected objects, excluding hidden objects', () => {
        const make = (id, x, visible = true) => { const mesh = new THREE.Mesh (new THREE.BoxGeometry (2, 2, 2)); mesh.position.x = x; return { id, visible, threeObject : mesh }; };
        const objects = [make ('left', -10), make ('right', 20), make ('hidden', 1000, false)]; let sphere;
        const editor = { selected : objects[0], SelectedObjects : () => objects, SelectedViewBounds : SessionEditor.prototype.SelectedViewBounds, website : { viewer : { navigation : { StopCameraMovement () {}, camera : { center : new Coord3D (0, 0, 0) } }, FitSphereToWindow : value => { sphere = value; } } } };
        const result = SessionEditor.prototype.Focus.call (editor); assert.deepEqual (result.objectIds, ['left', 'right']); assert.deepEqual (sphere.center.toArray (), [5, 0, 0]); assert.ok (sphere.radius < 17);
        const orbit = SessionEditor.prototype.OrbitSelected.call (editor); assert.deepEqual (orbit.pivot, [5, 0, 0]);
    });
    it ('Focus command preserves a multi-selection when no object ID is supplied', async () => {
        const objects = ['a', 'b'].map ((id, index) => { const threeObject = new THREE.Mesh (new THREE.BoxGeometry (2, 2, 2)); threeObject.position.x = index * 10; return { id, visible : true, threeObject }; });
        const editor = { selected : objects[0], SelectedObjects : () => objects, SelectedViewBounds : SessionEditor.prototype.SelectedViewBounds, Focus : SessionEditor.prototype.Focus, Select () { throw new Error ('Focus must retain the current selection'); }, website : { viewer : { navigation : {}, FitSphereToWindow () {} } } }; editor.website.sessionEditor = editor;
        const result = await CreateAgentCommands (editor.website).Execute ('view.focus', {}); assert.equal (result.ok, true); assert.deepEqual (result.result.objectIds, ['a', 'b']);
    });
    it ('Rotates eye and target around the selected pivot as a rigid camera movement', () => {
        for (const navigationMode of [NavigationMode.FixedUpVector, NavigationMode.FreeOrbit]) {
            const nav = Object.create (Navigation.prototype); Object.assign (nav, { navigationMode, orbitCenter : new Coord3D (100, 20, 0), camera : { eye : new Coord3D (0, 0, 500), center : new Coord3D (0, 0, 0), up : new Coord3D (0, 1, 0) } });
            const distance = (a, b) => Math.hypot (a.x - b.x, a.y - b.y, a.z - b.z); const radius = distance (nav.camera.eye, nav.orbitCenter), zoom = distance (nav.camera.eye, nav.camera.center); nav.Orbit (20, 10); assert.ok (Math.abs (distance (nav.camera.eye, nav.orbitCenter) - radius) < 1e-8); assert.ok (Math.abs (distance (nav.camera.eye, nav.camera.center) - zoom) < 1e-8);
        }
    });
    it ('Preserves a Z-up orbit and holds X/Y/Z as temporary axis constraints', () => {
        const nav = Object.create (Navigation.prototype); Object.assign (nav, { navigationMode : NavigationMode.FixedUpVector, orbitCenter : new Coord3D (0, 0, 0), camera : { eye : new Coord3D (2, 3, 4), center : new Coord3D (0, 0, 0), up : new Coord3D (0, 0, 1) }, heldOrbitAxes : [] });
        nav.Orbit (20, 0); assert.ok (Math.abs (nav.camera.eye.z - 4) < 1e-9);
        for (const axis of ['x', 'y', 'z']) { nav.OnAxisKeyDown ({ key : axis }); const before = nav.camera.eye[axis]; nav.Orbit (15, 0); assert.ok (Math.abs (nav.camera.eye[axis] - before) < 1e-9); nav.OnAxisKeyUp ({ key : axis }); }
        nav.OnAxisKeyDown ({ key : 'x', target : { closest : () => true } }); assert.equal (nav.heldOrbitAxes.length, 0);
    });
    it ('Orbits horizontally without rolling in both Y-up and Z-up views', () => {
        for (const up of [new Coord3D (0, 1, 0), new Coord3D (0, 0, 1)]) {
            const nav = Object.create (Navigation.prototype); Object.assign (nav, { navigationMode : NavigationMode.FixedUpVector, orbitCenter : null, heldOrbitAxes : [], camera : { eye : new Coord3D (10, 0, 0), center : new Coord3D (0, 0, 0), up : up.Clone () } });
            const before = nav.camera.eye.Clone (); nav.Orbit (30, 0); assert.deepEqual (nav.camera.up, up); assert.ok (Math.hypot (nav.camera.eye.x - before.x, nav.camera.eye.y - before.y, nav.camera.eye.z - before.z) > 1); assert.ok (Math.abs (nav.camera.eye.x * up.x + nav.camera.eye.y * up.y + nav.camera.eye.z * up.z) < 1e-9);
        }
    });
    it ('Temporarily constrains the object rotation gizmo and restores it on release', () => {
        const controls = { showX : true, showY : true, showZ : true, axis : 'Y', dragging : true }; const editor = { controls, mode : 'rotate', website : { viewer : { RequestRender () {} } } };
        SessionEditor.prototype.SetRotationAxisOverride.call (editor, 'X'); assert.deepEqual ([controls.showX, controls.showY, controls.showZ, controls.axis], [true, false, false, 'X']); SessionEditor.prototype.SetRotationAxisOverride.call (editor, null); assert.deepEqual ([controls.showX, controls.showY, controls.showZ, controls.axis], [true, true, true, 'Y']);
    });
    it ('Only initializes focus once after a genuine right drag, preserving short context clicks and other gestures', () => {
        const nav = Object.create (Navigation.prototype); const calls = []; let click = true; Object.assign (nav, { enabled : true, canvas : {}, mouse : { Move () {}, GetPosition : () => new Coord2D (0, 0), GetMoveDiff : () => new Coord2D (10, 5), IsButtonDown : () => true, GetButton : () => 3 }, clickDetector : { Move () {}, IsClick : () => click }, onOrbitStart : () => calls.push ('focus'), Orbit : () => calls.push ('orbit'), Update () {} });
        nav.OnMouseMove ({}); assert.deepEqual (calls, []); click = false; nav.OnMouseMove ({}); nav.OnMouseMove ({}); assert.deepEqual (calls, ['focus', 'orbit', 'orbit']); assert.equal (nav.suppressContextMenu, true);
    });
    it ('Keeps optional sideways pan and default orbit routing separate', () => {
        const nav = Object.create (Navigation.prototype); const calls = []; let diff = new Coord2D (10, 0);
        Object.assign (nav, { enabled : true, canvas : {}, camera : { eye : new Coord3D (0, 0, 1000), center : new Coord3D (0, 0, 0) }, mouse : { Move () {}, GetPosition : () => new Coord2D (0, 0), GetMoveDiff : () => diff, IsButtonDown : () => true, GetButton : () => 3 }, clickDetector : { Move () {}, IsClick : () => false }, onOrbitStart : () => calls.push (['focus']), Orbit : (x, y) => calls.push (['orbit', x, y]), Pan : (x, y) => calls.push (['pan', x, y]), Update () {} });
        nav.rightDragPansHorizontally = true;
        nav.OnMouseMove ({}); diff = new Coord2D (0, 4); nav.OnMouseMove ({}); diff = new Coord2D (-6, 2); nav.OnMouseMove ({});
        assert.deepEqual (calls, [['focus'], ['pan', 10, 0], ['orbit', 0, 2], ['pan', -6, 0], ['orbit', 0, 1]]); assert.equal (nav.suppressContextMenu, true);
        nav.rightDragPansHorizontally = false; calls.length = 0; diff = new Coord2D (10, 4); nav.OnMouseMove ({});
        assert.deepEqual (calls, [['orbit', 5, 2]], 'the mini viewer keeps full right-drag orbit');
        const middle = Object.assign (Object.create (nav), { mouse : { ...nav.mouse, GetButton : () => 2 } }); calls.length = 0; middle.OnMouseMove ({});
        assert.deepEqual (calls, [['pan', 10, 4]], 'middle-drag pan is unchanged');
    });
});
