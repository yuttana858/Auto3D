import assert from 'node:assert/strict';
import { SessionEditor } from '../source/website/sessioneditor.js';
import { PackagingWorkspace } from '../source/website/packagingworkspace.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';

describe ('Duplicate by dragging', () => {
    it ('Keeps the original in place, selects the moved copy and undoes atomically', async () => {
        const website = { preferences : { units : 'metric' }, auth : { user : { id : 'owner' } }, accountReady : true }, editor = { website, document : new SceneDocument (), history : new SceneHistory (), Render : async () => {}, Status () {} }; editor.packaging = new PackagingWorkspace (editor); website.sessionEditor = editor;
        await editor.packaging.GenerateFefco ({ length : 100, width : 80, height : 60 }); const original = editor.selected; editor.selectedIds = new Set ([original.id]); const before = { position : [...original.position], rotation : [...original.rotation], scale : [...original.scale] };
        const result = await SessionEditor.prototype.DuplicateTransformed.call (editor, [{ object : original, before, after : { ...before, position : [25, 10, 5] } }]);
        assert.equal (editor.document.objects.length, 2); assert.deepEqual (original.position, before.position); assert.deepEqual (editor.selected.position, [25, 10, 5]); assert.equal (editor.selected.id, result.objectIds[0]);
        await editor.history.Undo (); assert.equal (editor.document.objects.length, 1); assert.equal (editor.selected, original); await editor.history.Redo (); assert.equal (editor.document.objects.length, 2); assert.deepEqual (editor.selected.position, [25, 10, 5]);
    });
});
