import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { ModelExtensions, SupportedFormatsText } from '../source/website/importformats.js';
function editor () {
    const instance = Object.create (SessionEditor.prototype);
    const source = { name : 'Model', position : [0, 0, 0], threeObject : new THREE.Mesh (new THREE.BoxGeometry (2, 3, 4)) };
    instance.selected = source; instance.busy = false; instance.readOnly = false; const messages = [];
    instance.document = { objects : [source], Duplicate () { const copy = { position : [...source.position] }; this.objects.push (copy); return copy; }, ApplyTransform () {}, Remove (object) { this.objects.splice (this.objects.indexOf (object), 1); }, Restore (object, index) { this.objects.splice (index, 0, object); } };
    instance.Status = (message) => messages.push (message); instance.RefreshButtons = () => {};
    instance.history = { entries : [], Push (entry) { this.entries.push (entry); } }; instance.Render = async () => {};
    return { instance, messages };
}
describe ('Workspace operation feedback', () => {
    it ('announces array work before duplication, yields, reports copy counts and keeps undo', async () => {
        const { instance, messages } = editor ();
        const operation = instance.CreateArray (3, 1, 1);
        assert.match (messages[0], /^Creating an array/); assert.equal (instance.busy, true); assert.equal (instance.document.objects.length, 1);
        const added = await operation;
        assert.equal (added.length, 2); assert.deepEqual (added.map ((copy) => copy.position), [[2, 0, 0], [4, 0, 0]]);
        assert.ok (messages.includes ('Creating an array… 2 / 2 copies')); assert.match (messages.at (-1), /^Created/); assert.equal (instance.busy, false);
        await instance.history.entries[0].undo (); assert.equal (instance.document.objects.length, 1);
        await instance.history.entries[0].redo (); assert.equal (instance.document.objects.length, 3);
    });
    it ('restores the original scene and clears busy after a failed copy', async () => {
        const { instance, messages } = editor (); let copies = 0; const duplicate = instance.document.Duplicate;
        instance.document.Duplicate = function () { if (++copies === 2) { throw new Error ('copy failed'); } return duplicate.call (this); };
        await assert.rejects (() => instance.CreateArray (3, 1, 1), /copy failed/);
        assert.equal (instance.document.objects.length, 1); assert.equal (instance.busy, false); assert.equal (instance.history.entries.length, 0); assert.match (messages.at (-1), /Could not create the array/);
    });
    it ('does not begin array work for read-only or busy sessions', async () => {
        const { instance, messages } = editor (); instance.readOnly = true;
        await assert.rejects (() => instance.CreateArray (2, 1, 1), /cannot be edited/); instance.readOnly = false; instance.busy = true;
        await assert.rejects (() => instance.CreateArray (2, 1, 1), /cannot be edited/); assert.equal (messages.length, 0);
    });
    it ('lists model formats plus archive/session formats in error guidance', () => {
        for (const extension of [...ModelExtensions, 'zip', 'auto3d']) { assert.ok (SupportedFormatsText.includes (extension.toUpperCase ())); }
    });
});
