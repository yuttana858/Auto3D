import { UpdateProductDraft } from '../../modules/primary-products/src/state.js';
import { ValidateProductArtwork } from '../../modules/primary-products/src/artwork.js';

// Serializes edits to one selected product. While geometry is rebuilding, newer edits replace
// the pending draft rather than starting another generation or losing the user's last input.
export class PrimaryProductLiveUpdates
{
    constructor (panel) { this.panel = panel; this.active = false; this.pending = null; this.context = null; }
    Target ()
    {
        try { const selected = this.panel.products.Selected (); return selected.definition.draft.family === this.panel.draft.family ? selected : null; } catch { return null; }
    }
    Blocked ()
    {
        const website = this.panel.website, editor = website.sessionEditor;
        return !website.auth?.user || website.accountReady === false || editor.readOnly || (editor.busy || this.panel.products.active) && !this.active;
    }
    AssertContext (context)
    {
        const website = this.panel.website, editor = website.sessionEditor;
        if (context.cancelled || editor.document !== context.document || website.auth?.user?.id !== context.owner || website.accountReady === false || editor.readOnly || editor.selected?.id !== context.objectId || !context.document.objects.includes (editor.selected)) {
            throw new Error ('The product, account or session changed. Edit the current selection.');
        }
    }
    Cancel ()
    {
        if (this.context) { this.context.cancelled = true; }
        if (this.pending) { for (const waiter of this.pending.waiters) { waiter.reject (new Error ('The selected product changed before the edit was applied.')); } this.pending = null; }
    }
    Apply (changes, objectId)
    {
        if (this.Blocked ()) { return Promise.reject (new Error ('Open an editable, idle session to edit a product.')); }
        if (!this.active) { this.panel.SyncSelected?.(); }
        const selected = this.Target ();
        if (objectId !== undefined && selected?.object.id !== objectId) { return Promise.reject (new Error ('The selected product changed. Edit the current selection.')); }
        if (!selected || changes.family && changes.family !== selected.definition.draft.family) {
            if (this.active) { return Promise.reject (new Error ('Wait for the product update before changing product family.')); }
            try { return Promise.resolve ({ ...this.panel.Configure (changes), updated : false, objectId : null }); } catch (error) { return Promise.reject (error); }
        }
        try {
            if (this.context) { this.AssertContext (this.context); }
            if (changes.details && this.panel.DetailChanges) { changes = { ...changes, details : this.panel.DetailChanges (changes.details) }; }
            const next = UpdateProductDraft (this.panel.draft, changes);
            ValidateProductArtwork (next, this.panel.artwork.Inspect ());
            const context = this.context || { document : this.panel.website.sessionEditor.document, owner : this.panel.website.auth.user.id, objectId : selected.object.id };
            this.context = context;
            const promise = new Promise ((resolve, reject) => {
                this.pending = { draft : next, changes : { ...this.pending?.changes, ...changes }, waiters : [...(this.pending?.waiters || []), { resolve, reject }] };
            });
            this.panel.draft = next;
            if (!this.active) { this.active = true; this.Drain (context); }
            return promise;
        } catch (error) { return Promise.reject (error); }
    }
    async Drain (context)
    {
        const editor = this.panel.website.sessionEditor; let completed = 0;
        try {
            while (this.pending) {
                const job = this.pending; this.pending = null;
                try {
                    this.AssertContext (context); this.panel.draft = job.draft;
                    const result = await this.panel.products.Generate (true, true, job.changes, { guard : () => this.AssertContext (context) });
                    completed++;
                    for (const waiter of job.waiters) { waiter.resolve ({ ...result, message : 'Selected product updated.' }); }
                } catch (error) {
                    for (const waiter of job.waiters) { waiter.reject (error); }
                    if (this.pending) { for (const waiter of this.pending.waiters) { waiter.reject (error); } this.pending = null; }
                    break;
                }
            }
        } finally {
            // Rapid edits accepted during a rebuild form one coherent undoable interaction.
            if (editor.document === context.document && completed > 1) { editor.history.Group?.(Math.max (0, editor.history.undo.length - completed)); }
            this.active = false; this.context = null;
            this.panel.SyncSelected?.(true); this.panel.Refresh ();
        }
    }
}
