import assert from 'node:assert/strict';
import { ArrayRevealSample, ArrayRevealPlayer } from '../source/website/arrayreveal.js';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { CreateAgentCommands } from '../source/website/agentcommands.js';
import * as THREE from 'three';
import { ArrayObjectBounds } from '../source/website/arraylayout.js';
describe ('Sequential accelerating array reveal', () => {
    it ('Uses original coordinate precision and excludes decorative fold skins from array spacing', () => {
        const root = new THREE.Group (); root.position.set (10, 20, 30);
        const panel = new THREE.Mesh (new THREE.BoxGeometry (1, 1, 1)); panel.userData.originalMeshInstance = { GetMesh : () => ({ GetName : () => 'Panel', vertices : [{ x : 0, y : 0, z : 0 }, { x : 100.123456789, y : 3, z : 20 }] }) }; root.add (panel);
        const skin = new THREE.Mesh (new THREE.BoxGeometry (1000, 1000, 1000)); skin.name = 'Visual crease · decorative'; root.add (skin);
        const bounds = ArrayObjectBounds (root); assert.equal (bounds.max.x, 110.123456789); assert.equal (bounds.min.x, 10); assert.equal (bounds.getSize (new THREE.Vector3 ()).y, 3);
    });
    it ('Schedules in creation order with shrinking intervals and exact nonpenetrating endpoints', () => {
        const starts = Array.from ({ length : 100 }, (_, i) => ArrayRevealSample (i, 100, 0).start);
        assert.ok (starts.every ((v, i) => i === 0 || v > starts[i - 1]));
        assert.ok (starts[1] - starts[0] > 5 * (starts[99] - starts[98]));
        for (let i = 0; i < 100; i++) {
            assert.equal (ArrayRevealSample (i, 100, 0).visible, false); assert.equal (ArrayRevealSample (i, 100, 1).offset, 0); assert.equal (ArrayRevealSample (i, 100, 1).settled, true);
            let previous = 1; for (let p = 0; p <= 1; p += .01) { const sample = ArrayRevealSample (i, 100, p); assert.ok (sample.offset >= 0 && sample.offset <= previous + 1e-10); previous = sample.offset; }
        }
    });
    it ('Pauses, resumes and cancels without wall-clock jumps', async () => {
        let time = 0, next; const values = []; const player = new ArrayRevealPlayer (p => values.push (p), 4, { now : () => time, request : f => { next = f; return 1; }, cancel : () => {} });
        const completion = player.Start (); time = 1000; next (); assert.equal (player.progress, .25); player.Pause (); time = 10000; next (); assert.equal (player.progress, .25); player.Resume (); assert.equal (player.progress, .25); player.Stop (); assert.deepEqual (await completion, { completed : false });
        const done = new ArrayRevealPlayer (() => {}, 1, { now : () => time, request : f => { next = f; }, cancel : () => {} }); const finished = done.Start (); time += 1000; next (); assert.deepEqual (await finished, { completed : true });
    });
    it ('Blocks saves/opens of temporary reveal states and exposes controls outside the mutation queue', async () => {
        const editor = { arrayOperation : {}, website : { auth : { user : { id : 'test' } } } };
        await assert.rejects (() => SessionEditor.prototype.ArchiveAsync.call (editor), /array animation/); assert.throws (() => SessionEditor.prototype.Archive.call (editor), /array animation/); await assert.rejects (() => SessionEditor.prototype.OpenArchive.call (editor), /array animation/);
        let finish; let cancelled = false; editor.busy = false; editor.document = { objects : [{ id : 'box' }] }; editor.selected = editor.document.objects[0]; editor.Select = () => {};
        editor.CreateArray = async () => { editor.busy = true; await new Promise (resolve => { finish = resolve; }); return []; };
        editor.ArrayControl = action => { cancelled = action === 'cancel'; editor.busy = false; finish (); return { state : 'cancelled' }; };
        const registry = CreateAgentCommands ({ sessionEditor : editor }); const creation = registry.Execute ('object.array', { width : 2, length : 1, height : 1 });
        await new Promise (resolve => setImmediate (resolve)); const cancel = await registry.Execute ('object.array.playback', { action : 'cancel' }); assert.equal (cancel.ok, true); assert.equal (cancelled, true); assert.equal ((await creation).ok, true);
    });
});
