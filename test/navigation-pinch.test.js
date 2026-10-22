import assert from 'node:assert/strict';
import { Navigation } from '../source/engine/viewer/navigation.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
describe ('Half-speed multi-touch zoom', () => {
    it ('halves trackpad pinch wheel steps in both directions while preserving normal wheel steps', () => {
        const nav = Object.create (Navigation.prototype); const zooms = []; nav.enabled = true; nav.Zoom = value => zooms.push (value); nav.Update = () => {};
        for (const ctrlKey of [false, true]) { for (const deltaY of [-4, 4]) { nav.OnMouseWheel ({ ctrlKey, deltaY, preventDefault () {} }); } }
        nav.OnMouseWheel ({ ctrlKey : true, deltaY : 0, preventDefault () {} });
        assert.deepEqual (zooms, [0.1, -0.1, 0.05, -0.05]);
    });
    it ('halves touch pinch distance without slowing two-finger panning', () => {
        const nav = Object.create (Navigation.prototype); const zooms = [], pans = [];
        Object.assign (nav, { enabled : true, canvas : {}, camera : { eye : new Coord3D (0, 0, 10), center : new Coord3D (0, 0, 0) },
            touch : { Move () {}, GetPosition : () => ({}), IsFingerDown : () => true, GetMoveDiff : () => ({ x : 10, y : 20 }), GetDistanceDiff : () => 20, GetFingerCount : () => 2 },
            clickDetector : { Move () {} }, Zoom : value => zooms.push (value), Pan : (...args) => pans.push (args), Update () {} });
        nav.OnTouchMove ({ preventDefault () {} }); assert.deepEqual (zooms, [0.05]); assert.deepEqual (pans, [[0.1, 0.2]]);
    });
});
