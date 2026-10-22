import assert from 'node:assert/strict';
import { Navigation } from '../source/engine/viewer/navigation.js';
import { Coord2D } from '../source/engine/geometry/coord2d.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
describe ('Space left-drag pan', () => {
    function fixture () {
        const nav = Object.create (Navigation.prototype); const events = [];
        Object.assign (nav, { enabled : true, spacePan : false, panGesture : false, canvas : { matches : () => true }, camera : { eye : new Coord3D (0, 0, 10), center : new Coord3D (0, 0, 0) },
            mouse : { buttons : [1], Move () {}, GetPosition : () => new Coord2D (0, 0), GetMoveDiff : () => new Coord2D (10, 20), IsButtonDown : () => true, GetButton : () => 1, Up () {} },
            clickDetector : { Move () {}, IsClick : () => true, End () {}, Cancel () {} }, Pan : (...args) => events.push (['pan', ...args]), Orbit : () => events.push ('orbit'), Click : () => events.push ('click'), Update () {} });
        return { nav, events };
    }
    it ('pans rather than orbiting or selecting, even if Space is released during the drag', () => {
        const { nav, events } = fixture ();
        nav.OnPanKeyDown ({ code : 'Space', target : {}, preventDefault () {} }); nav.panGesture = true;
        nav.SetSpacePan (false); nav.OnMouseMove ({}); nav.OnMouseUp ({});
        assert.deepEqual (events, [['pan', 0.1, 0.2]]); assert.equal (nav.panGesture, false);
    });
    it ('ignores editable/control targets and modified shortcuts', () => {
        for (const args of [{ target : { closest : () => true } }, { ctrlKey : true }, { metaKey : true }, { altKey : true }]) {
            const { nav } = fixture (); nav.OnPanKeyDown ({ code : 'Space', ...args }); assert.equal (nav.spacePan, false);
        }
    });
    it ('clears held state and pressed buttons on focus loss', () => {
        const { nav } = fixture (); nav.spacePan = true; nav.panGesture = true; nav.CancelPan ();
        assert.equal (nav.spacePan, false); assert.equal (nav.panGesture, false); assert.deepEqual (nav.mouse.buttons, []);
    });
});
