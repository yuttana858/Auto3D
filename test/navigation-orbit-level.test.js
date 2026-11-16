import assert from 'node:assert/strict';
import { Navigation } from '../source/engine/viewer/navigation.js';
import { Coord2D } from '../source/engine/geometry/coord2d.js';
import { Coord3D, CoordDistance3D, CrossVector3D, DotVector3D, SubCoord3D, VectorAngle3D } from '../source/engine/geometry/coord3d.js';
import { NavigationMode } from '../source/engine/viewer/camera.js';

// Right-drag orbit is a level turntable: no camera roll or sideways tilt, only horizontal and vertical orbiting.
function Nav ({ eye = new Coord3D (6, 4, 8), center = new Coord3D (0, 0, 0), up = new Coord3D (0, 1, 0), worldUp = new Coord3D (0, 1, 0), mode = NavigationMode.FixedUpVector } = {})
{
    const nav = Object.create (Navigation.prototype);
    Object.assign (nav, { camera : { eye, center, up }, worldUp, navigationMode : mode, orbitCenter : null, heldOrbitAxes : [] });
    return nav;
}
const view = nav => SubCoord3D (nav.camera.center, nav.camera.eye).Normalize ();
// Roll = how far the camera's right vector leaves the horizontal plane; 0 for a level camera.
const roll = nav => Math.abs (DotVector3D (CrossVector3D (view (nav), nav.camera.up).Normalize (), nav.worldUp));
const close = (a, b, epsilon = 1e-6) => assert.ok (Math.abs (a - b) < epsilon, a + ' ≈ ' + b);

describe ('Level right-drag orbit', () => {
    it ('turns around the world up axis without rolling, keeping distance and height', () => {
        const nav = Nav (); const height = nav.camera.eye.y, distance = CoordDistance3D (nav.camera.eye, nav.camera.center);
        for (let i = 0; i < 40; i++) { nav.OrbitLevel (17, 0); assert.ok (roll (nav) < 1e-9); }
        close (nav.camera.eye.y, height); close (CoordDistance3D (nav.camera.eye, nav.camera.center), distance); assert.deepEqual ([nav.camera.up.x, nav.camera.up.y, nav.camera.up.z], [0, 1, 0]);
    });
    it ('raises and lowers the view without tilting and stops before it flips over the top or bottom', () => {
        const nav = Nav (); const distance = CoordDistance3D (nav.camera.eye, nav.camera.center);
        for (let i = 0; i < 200; i++) { nav.OrbitLevel (3, 5); assert.ok (roll (nav) < 1e-9); }
        const fromUp = VectorAngle3D (view (nav), nav.worldUp); assert.ok (fromUp >= Math.PI / 180 - 1e-9 && fromUp <= Math.PI - Math.PI / 180 + 1e-9);
        assert.ok (nav.camera.eye.y > 0, 'looking down from above at the top limit');
        for (let i = 0; i < 200; i++) { nav.OrbitLevel (0, -5); assert.ok (roll (nav) < 1e-9); }
        const fromUpLow = VectorAngle3D (view (nav), nav.worldUp); assert.ok (fromUpLow >= Math.PI / 180 - 1e-9 && fromUpLow <= Math.PI - Math.PI / 180 + 1e-9);
        assert.ok (nav.camera.eye.y < 0, 'looking up from below at the bottom limit'); close (CoordDistance3D (nav.camera.eye, nav.camera.center), distance);
    });
    it ('levels a camera that was already tilted instead of orbiting around the tilted axis', () => {
        const tilted = new Coord3D (0.4, 1, 0.1).Normalize (); const nav = Nav ({ up : tilted });
        nav.OrbitLevel (30, 10); assert.deepEqual ([nav.camera.up.x, nav.camera.up.y, nav.camera.up.z], [0, 1, 0]); assert.ok (roll (nav) < 1e-9);
    });
    it ('orbits a selected object\'s center while keeping the framing, also in Free orbit mode', () => {
        const pivot = new Coord3D (5, 0, -3); const nav = Nav ({ center : new Coord3D (1, 1, 1), mode : NavigationMode.FreeOrbit }); nav.orbitCenter = pivot;
        const offset = SubCoord3D (nav.camera.center, nav.camera.eye), eyeToPivot = CoordDistance3D (nav.camera.eye, pivot), centerToPivot = CoordDistance3D (nav.camera.center, pivot);
        nav.OrbitLevel (40, -15); nav.OrbitLevel (-70, 25);
        close (CoordDistance3D (nav.camera.eye, pivot), eyeToPivot); close (CoordDistance3D (nav.camera.center, pivot), centerToPivot);
        close (CoordDistance3D (nav.camera.eye, nav.camera.center), offset.Length ()); assert.ok (roll (nav) < 1e-9);
    });
    it ('uses the scene\'s up axis, including Z-up and flipped scenes', () => {
        for (const worldUp of [new Coord3D (0, 0, 1), new Coord3D (0, -1, 0)]) {
            const nav = Nav ({ eye : new Coord3D (7, 5, 3), up : worldUp.Clone (), worldUp }); const along = DotVector3D (nav.camera.eye, worldUp);
            nav.OrbitLevel (55, 0); close (DotVector3D (nav.camera.eye, worldUp), along); nav.OrbitLevel (10, 20); assert.ok (roll (nav) < 1e-9);
        }
    });
    it ('routes right-drag to the level orbit, but keeps held X/Y/Z axis rotation and left/middle behavior', () => {
        const calls = [];
        const nav = Object.assign (Object.create (Navigation.prototype), {
            enabled : true, canvas : {}, camera : {}, heldOrbitAxes : [], rightOrbitStarted : true, rightDragPansHorizontally : false,
            mouse : { Move () {}, GetPosition : () => new Coord2D (0, 0), GetMoveDiff : () => new Coord2D (10, -4), IsButtonDown : () => true, GetButton : () => 3 },
            clickDetector : { Move () {}, IsClick : () => false }, OrbitLevel : (x, y) => calls.push (['level', x, y]), Orbit : (x, y) => calls.push (['orbit', x, y]), Update () {}
        });
        nav.OnMouseMove ({}); assert.deepEqual (calls.pop (), ['level', 5, -2]);
        nav.heldOrbitAxes = ['x']; nav.OnMouseMove ({}); assert.deepEqual (calls.pop (), ['orbit', 5, -2]);
    });
});
