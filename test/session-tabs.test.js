import assert from 'node:assert/strict';
import { SessionTabs } from '../source/website/sessiontabs.js';
import { SceneDocument, SceneHistory } from '../source/website/scenedocument.js';

describe ('In-app sessions', () => {
    it ('retains separate documents, history and unsaved state while switching', async () => {
        const originalDocument = globalThis.document;
        const node = () => ({ children : [], setAttribute () {}, appendChild (child) { this.children.push (child); }, replaceChildren () { this.children = []; } });
        globalThis.document = { createElement : node };
        try {
            const editor = { document : new SceneDocument (), history : new SceneHistory (() => {}), selected : null, selectedIds : new Set (), dirty : true, readOnly : false, busy : false, recoveryRevision : 0, recoveryWriter : { Cancel () {} }, timeline : { Load () {} }, cameras : { Load () {} }, website : { auth : { user : { id : 'one' }, Subscribe () {} }, accountReady : true, settings : {}, parameters : { fileNameDiv : {} }, UpdateViewport () {}, viewModes : { mode : 'default', Set () {} }, lightingPanel : { async Restore () {} }, viewer : {} }, CaptureView () { return {}; }, async Render () {}, RefreshUI () {}, MarkDirty () { this.dirty = true; } };
            const tabs = new SessionTabs (editor, node ()); const first = tabs.active; const oldDoc = editor.document; oldDoc.name = 'Original';
            await tabs.New (); assert.notEqual (editor.document, oldDoc); editor.document.name = 'Second'; editor.dirty = true;
            await tabs.Switch (first); assert.equal (editor.document, oldDoc); assert.equal (editor.document.name, 'Original'); assert.equal (tabs.HasDirty (), true);
            await assert.rejects (tabs.Close (first), /unsaved/); await tabs.Close (first, true); assert.equal (editor.document.name, 'Second'); assert.equal (tabs.Inspect ().tabs.length, 1);
        } finally { globalThis.document = originalDocument; }
    });
});
