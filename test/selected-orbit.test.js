import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { Navigation } from '../source/engine/viewer/navigation.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { Coord2D } from '../source/engine/geometry/coord2d.js';
import { NavigationMode } from '../source/engine/viewer/camera.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
describe ('Selected-object orbit', () => {
    it ('Uses transformed visible bounds and preserves eye/target/FOV when assigning the pivot', async () => {
        const root = new THREE.Group (); root.position.set (100, 20, -30); const box = new THREE.Mesh (new THREE.BoxGeometry (10, 20, 30), new THREE.MeshBasicMaterial ()); root.add (box); const hidden = box.clone (); hidden.position.x = 1000; hidden.visible = false; root.add (hidden);
        const navigation = { camera : { eye : new Coord3D (0, 0, 500), center : new Coord3D (0, 0, 0), fov : 45 }, StopCameraMovement () {} }; const editor = { selected : { id : 'box', visible : true, threeObject : root }, website : { viewer : { navigation } }, OrbitSelected : SessionEditor.prototype.OrbitSelected }; editor.website.sessionEditor = editor;
        const before = JSON.stringify (navigation.camera); const result = await CreateAgentCommands (editor.website).Execute ('camera.orbit.focus_selected'); assert.equal (result.ok, true); assert.deepEqual (result.result.pivot, [100, 20, -30]); assert.equal (JSON.stringify (navigation.camera), before); editor.selected.visible = false; assert.equal (editor.OrbitSelected ().focused, false); assert.equal (navigation.orbitCenter, null);
    });
    it ('Rotates eye and target around the selected pivot as a rigid camera movement', () => {
        for (const navigationMode of [NavigationMode.FixedUpVector, NavigationMode.FreeOrbit]) {
            const nav = Object.create (Navigation.prototype); Object.assign (nav, { navigationMode, orbitCenter : new Coord3D (100, 20, 0), camera : { eye : new Coord3D (0, 0, 500), center : new Coord3D (0, 0, 0), up : new Coord3D (0, 1, 0) } });
            const distance = (a, b) => Math.hypot (a.x - b.x, a.y - b.y, a.z - b.z); const radius = distance (nav.camera.eye, nav.orbitCenter), zoom = distance (nav.camera.eye, nav.camera.center); nav.Orbit (20, 10); assert.ok (Math.abs (distance (nav.camera.eye, nav.orbitCenter) - radius) < 1e-8); assert.ok (Math.abs (distance (nav.camera.eye, nav.camera.center) - zoom) < 1e-8);
        }
    });
    it ('Only initializes focus once after a genuine right drag, preserving short context clicks and other gestures', () => {
        const nav = Object.create (Navigation.prototype); const calls = []; let click = true; Object.assign (nav, { enabled : true, canvas : {}, mouse : { Move () {}, GetPosition : () => new Coord2D (0, 0), GetMoveDiff : () => new Coord2D (10, 5), IsButtonDown : () => true, GetButton : () => 3 }, clickDetector : { Move () {}, IsClick : () => click }, onOrbitStart : () => calls.push ('focus'), Orbit : () => calls.push ('orbit'), Update () {} });
        nav.OnMouseMove ({}); assert.deepEqual (calls, []); click = false; nav.OnMouseMove ({}); nav.OnMouseMove ({}); assert.deepEqual (calls, ['focus', 'orbit', 'orbit']); assert.equal (nav.suppressContextMenu, true);
    });
});
