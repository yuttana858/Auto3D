import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AxisName, AxisVector, FacingAxes, TurnOnto, WorldFrame } from '../source/website/facingtool.js';
import { Direction } from '../source/engine/geometry/geometry.js';

const close = (vector, expected) => assert.ok (vector.distanceTo (expected) < 1e-9, vector.toArray () + ' vs ' + expected.toArray ());

describe ('Assign facing directions', () => {
    it ('names and parses the six axes', () => {
        for (const name of FacingAxes) { assert.equal (AxisName (AxisVector (name)), name); }
        assert.equal (AxisName (new THREE.Vector3 (0.2, -0.9, 0.1)), '-y'); assert.throws (() => AxisVector ('x'));
    });
    it ('uses the viewer up vector and faces front toward the default camera', () => {
        const y = WorldFrame ({ direction : Direction.Y, isFlipped : false }); close (y.up, new THREE.Vector3 (0, 1, 0)); close (y.front, new THREE.Vector3 (0, 0, 1));
        const z = WorldFrame ({ direction : Direction.Z, isFlipped : false }); close (z.up, new THREE.Vector3 (0, 0, 1)); close (z.front, new THREE.Vector3 (0, -1, 0));
        close (WorldFrame ({ direction : Direction.Y, isFlipped : true }).up, new THREE.Vector3 (0, -1, 0)); close (WorldFrame (null).up, new THREE.Vector3 (0, 1, 0));
    });
    it ('turns any side onto front or up with the smallest rotation, and half-turns about the pivot for the opposite side', () => {
        const { up, front } = WorldFrame (null);
        for (const name of FacingAxes) {
            const side = AxisVector (name);
            close (side.clone ().applyQuaternion (TurnOnto (side, front, up)), front);
            close (side.clone ().applyQuaternion (TurnOnto (side, up, front)), up);
        }
        // A side face made Front keeps up unchanged; the back face turns 180° about up, not upside down.
        close (up.clone ().applyQuaternion (TurnOnto (AxisVector ('+x'), front, up)), up);
        close (up.clone ().applyQuaternion (TurnOnto (AxisVector ('-z'), front, up)), up);
        // Making the current front the Up side tips the model back; the old top then faces away.
        close (up.clone ().applyQuaternion (TurnOnto (AxisVector ('+z'), up, front)), new THREE.Vector3 (0, 0, -1));
    });
});
