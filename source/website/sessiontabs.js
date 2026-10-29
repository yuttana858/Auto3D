import { SceneDocument, SceneHistory } from './scenedocument.js';
import { OpenSessionArchive } from './sessionarchive.js';
import { ApplyCameraState } from './sessiontimeline.js';

// Each open document and its history stay in memory until explicitly closed.
export class SessionTabs
{
    constructor (editor, parent)
    {
        this.editor = editor; this.tabs = [{ id : crypto.randomUUID (), document : editor.document, history : editor.history, dirty : false }]; this.active = this.tabs[0].id; this.clipboard = null;
        this.root = document.createElement ('div'); this.root.className = 'session_tabs'; this.root.setAttribute ('aria-label', 'Open sessions'); parent.appendChild (this.root);
        this.editor.website.auth?.Subscribe?.(user => { if (!user || this.owner && this.owner !== user.id) { this.clipboard = null; } if (user) { this.owner = user.id; } }); this.Refresh ();
    }
    AssertEditable () { if (this.editor.readOnly || this.editor.busy || !this.editor.website.auth?.user || this.editor.website.accountReady === false || this.editor.website.rendering?.running || this.editor.packaging?.foldOperation || this.editor.arrayOperation) { throw new Error ('Sign in and finish the current operation before switching sessions.'); } }
    Current () { return this.tabs.find (tab => tab.id === this.active); }
    Inspect () { return { activeId : this.active, tabs : this.tabs.map (tab => ({ id : tab.id, name : (tab.id === this.active ? this.editor.document : tab.document).name, active : tab.id === this.active, dirty : tab.id === this.active ? this.editor.dirty : tab.dirty })), clipboardAvailable : Boolean (this.clipboard && this.clipboard.owner === this.editor.website.auth?.user?.id) }; }
    Capture ()
    {
        const editor = this.editor, tab = this.Current (); if (!tab) { return; }
        Object.assign (tab, { document : editor.document, history : editor.history, selected : editor.selected, selectedIds : new Set (editor.selectedIds), view : editor.CaptureView (), viewMode : editor.website.viewModes?.mode || 'default', dirty : editor.dirty });
    }
    HasDirty () { return this.editor.dirty || this.tabs.some (tab => tab.id !== this.active && tab.dirty); }
    Refresh ()
    {
        this.root.replaceChildren (); for (const tab of this.Inspect ().tabs) {
            const row = document.createElement ('span'); row.className = 'session_tab'; const button = document.createElement ('button'); button.type = 'button'; button.textContent = tab.name + (tab.dirty ? ' •' : ''); button.setAttribute ('aria-label', 'Switch to session ' + tab.name); button.setAttribute ('aria-pressed', String (tab.active)); button.onclick = () => this.Switch (tab.id).catch (error => this.editor.Status (error.message)); row.appendChild (button);
            if (this.tabs.length > 1) { const close = document.createElement ('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute ('aria-label', 'Close session ' + tab.name); close.onclick = () => { if (tab.dirty && !window.confirm ('Close this unsaved session? Save it first if you want to keep it.')) { return; } this.Close (tab.id, tab.dirty).catch (error => this.editor.Status (error.message)); }; row.appendChild (close); }
            this.root.appendChild (row);
        }
        const add = document.createElement ('button'); add.type = 'button'; add.textContent = '+'; add.title = 'New session · save each open session before leaving'; add.setAttribute ('aria-label', 'New session'); add.onclick = () => this.New ().catch (error => this.editor.Status (error.message)); this.root.appendChild (add);
        for (const [label, action] of [['Copy model', () => this.Copy ()], ['Paste model', () => this.Paste ()]]) { const button = document.createElement ('button'); button.type = 'button'; button.textContent = label; button.onclick = () => Promise.resolve ().then (action).catch (error => this.editor.Status (error.message)); this.root.appendChild (button); }
    }
    async Apply (tab)
    {
        const editor = this.editor, website = editor.website; editor.recoveryRevision++; editor.recoveryWriter.Cancel (); if (editor.recoveryTimer) { clearTimeout (editor.recoveryTimer); editor.recoveryTimer = null; }
        editor.document = tab.document; editor.history = tab.history; editor.selected = tab.selected || null; editor.selectedIds = new Set (tab.selectedIds || []); editor.timeline.Load (tab.view?.timeline); editor.cameras.Load (tab.view?.cameraViews); editor.dirty = Boolean (tab.dirty);
        await editor.Render (false);
        if (tab.view) {
            if (['standard', 'dark', 'light', 'sunset', 'outdoor', 'custom'].includes (tab.view.backgroundPreset)) { website.settings.backgroundPreset = tab.view.backgroundPreset; }
            for (const key of ['horizonGradient', 'showGroundGrid']) { if (typeof tab.view[key] === 'boolean') { website.settings[key] = tab.view[key]; } } website.UpdateViewport ();
            if (tab.view.lighting) { await website.lightingPanel.Restore (tab.view.lighting); } if (tab.view.cameraState) { ApplyCameraState (website.viewer, tab.view.cameraState); }
        }
        if (website.viewModes) { website.viewModes.Set (tab.viewMode || 'default'); }
        website.parameters.fileNameDiv.textContent = tab.document.name; editor.RefreshUI (); this.Refresh ();
    }
    async Switch (id)
    {
        this.AssertEditable (); if (this.switching) { throw new Error ('Wait for the session to finish opening.'); } const target = this.tabs.find (tab => tab.id === id); if (!target) { throw new Error ('Session not found.'); } if (id === this.active) { return this.Inspect (); }
        const owner = this.editor.website.auth.user.id, previous = this.Current (); this.Capture (); this.active = id;
        this.switching = true;
        try { await this.Apply (target); if (this.editor.website.auth?.user?.id !== owner || this.editor.website.accountReady === false) { throw new Error ('Account changed while switching sessions.'); } }
        catch (error) { this.active = previous.id; if (this.editor.website.auth?.user?.id === owner) { try { await this.Apply (previous); } catch { /* Preserve the original error. */ } } throw error; }
        finally { this.switching = false; }
        return this.Inspect ();
    }
    async New ()
    {
        this.AssertEditable (); if (this.tabs.length >= 20) { throw new Error ('Close a session before opening more than 20.'); }
        const document = new SceneDocument (), tab = { id : crypto.randomUUID (), document, history : new SceneHistory (() => this.editor.MarkDirty ()), dirty : false, selectedIds : new Set () }; this.tabs.push (tab);
        try { await this.Switch (tab.id); } catch (error) { this.tabs = this.tabs.filter (item => item !== tab); this.Refresh (); throw error; } return this.Inspect ();
    }
    async Close (id, discard = false)
    {
        this.AssertEditable (); const target = this.tabs.find (tab => tab.id === id); if (!target) { throw new Error ('Session not found.'); }
        if ((id === this.active ? this.editor.dirty : target.dirty) && !discard) { throw new Error ('Save the session or explicitly discard its unsaved changes before closing.'); }
        if (this.tabs.length === 1) { throw new Error ('Keep at least one session open.'); }
        if (id === this.active) { await this.Switch (this.tabs.find (tab => tab.id !== id).id); } this.tabs = this.tabs.filter (tab => tab.id !== id); this.Refresh (); return this.Inspect ();
    }
    Copy ()
    {
        this.AssertEditable (); const objects = this.editor.SelectedObjects (); if (!objects.length) { throw new Error ('Select a model to copy.'); }
        this.clipboard = { owner : this.editor.website.auth.user.id, bytes : this.editor.Archive (objects, 'model', objects[0].name) }; return { copied : objects.length };
    }
    async Paste ()
    {
        this.AssertEditable (); if (!this.clipboard || this.clipboard.owner !== this.editor.website.auth.user.id) { throw new Error ('Copy a model in this account first.'); }
        return this.editor.AppendArchive (OpenSessionArchive (this.clipboard.bytes));
    }
}
