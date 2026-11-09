import assert from 'node:assert/strict';
import { Navigation } from '../source/engine/viewer/navigation.js';
import { Camera } from '../source/engine/viewer/camera.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';

function Fixture ()
{
    const frames = [];
    globalThis.requestAnimationFrame = callback => { frames.push (callback); return frames.length; };
    const navigation = Object.create (Navigation.prototype);
    navigation.camera = new Camera (new Coord3D (0, 0, 10), new Coord3D (0, 0, 0), new Coord3D (0, 1, 0), 45);
    navigation.Update = () => {};
    const target = new Camera (new Coord3D (5, 0, 10), new Coord3D (5, 0, 0), new Coord3D (0, 1, 0), 45);
    const flush = () => { while (frames.length) { frames.shift () (); } };
    return { navigation, target, frames, flush };
}
describe ('Settled camera moves for agent view commands', () => {
    let saved;
    beforeEach (() => { saved = globalThis.requestAnimationFrame; });
    afterEach (() => { globalThis.requestAnimationFrame = saved; });
    it ('resolves an animated move only after its last frame', async () => {
        const { navigation, target, flush } = Fixture (); let done = false;
        navigation.MoveCamera (target, 5); const waiting = navigation.WaitForCameraMovement ().then (() => { done = true; });
        await Promise.resolve (); assert.equal (done, false); assert.equal (navigation.camera.center.x, 0);
        flush (); await waiting; assert.equal (done, true); assert.equal (navigation.camera.center.x, 5);
    });
    it ('resolves when superseded and can jump to the destination when frames are paused', async () => {
        const { navigation, target } = Fixture ();
        navigation.MoveCamera (target, 5); const first = navigation.WaitForCameraMovement ();
        navigation.StopCameraMovement (); await first;
        navigation.MoveCamera (target, 5); navigation.FinishCameraMovement ();
        await navigation.WaitForCameraMovement (); assert.equal (navigation.camera.center.x, 5);
    });
    it ('makes view.focus return after the camera reaches the focused object', async () => {
        const { navigation, target, flush } = Fixture ();
        const editor = { document : { objects : [] }, selected : null, Focus () { navigation.MoveCamera (target, 5); return { focused : true, objectIds : [] }; } };
        const registry = CreateAgentCommands ({ sessionEditor : editor, viewer : { navigation } });
        const pending = registry.Invoke ('view.focus', {}); let settled = false; pending.then (() => { settled = true; });
        await new Promise (resolve => setTimeout (resolve, 5)); assert.equal (settled, false);
        flush (); await pending; assert.equal (navigation.camera.center.x, 5);
    });
});
