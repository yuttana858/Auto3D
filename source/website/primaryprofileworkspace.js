export class PrimaryProfileWorkspace
{
    constructor (panel) { this.panel = panel; this.website = panel.website; this.open = false; this.committing = false; }
    Inspect ()
    {
        let selected; try { selected = this.panel.products.Selected (); } catch { return { open : this.open, available : false }; }
        return { open : this.open, available : true, objectId : selected.object.id, name : selected.object.name, draft : selected.definition.draft, units : this.website.preferences.units, scaled : selected.object.scale.some (value => Math.abs (value - 1) > 1e-8) };
    }
    async Open ()
    {
        if (this.opening) { return this.opening; }
        this.opening = this.OpenWorkspace ();
        try { return await this.opening; } finally { this.opening = null; }
    }
    async OpenWorkspace ()
    {
        if (this.panel.Blocked ()) { throw new Error ('Open an editable, idle session to edit a product.'); }
        if (this.open) { this.Sync (); return this.Inspect (); }
        const editor = this.website.sessionEditor, document = editor.document, owner = this.website.auth.user.id, selected = editor.selected;
        await this.panel.Ensure ();
        if (document !== editor.document || selected !== editor.selected || owner !== this.website.auth?.user?.id || this.panel.Blocked ()) { throw new Error ('The session or selection changed before the model editor opened.'); }
        if (!this.Inspect ().available) { await this.panel.products.Generate (); }
        this.panel.products.LoadSelected (); this.document = editor.document; this.owner = owner;
        const panels = this.website.modulePanels; this.restore = panels.Inspect ().filter (p => p.visible).map (p => ({ id : p.id, side : p.side, mode : p.mode === 'extended' ? 'minimal' : p.mode }));
        this.panel.catalogOpen = false;
        for (const p of this.restore) { await panels.Set (p.id, 'closed'); }
        if (document !== editor.document || owner !== this.website.auth?.user?.id || this.panel.Blocked ()) { throw new Error ('The session changed before the model editor opened.'); }
        const viewer = this.website.parameters.viewerDiv; this.wrapper = globalThis.document.createElement ('div'); this.wrapper.className = 'pp_viewport_split'; viewer.parentNode.insertBefore (this.wrapper, viewer);
        this.root = globalThis.document.createElement ('section'); this.wrapper.append (this.root, viewer);
        this.ui = new this.panel.module.ProductProfileEditor ({ inspect : () => this.Inspect (), blocked : () => this.panel.Blocked (), update : (changes, objectId) => this.panel.UpdateProfile (changes, objectId), close : () => this.Close () }, this.root);
        this.open = true; this.website.layouter.primaryProfile = this; this.Sync (); this.website.layouter.Resize (); editor.Focus ();
        this.website.viewer.navigation.FinishCameraMovement ();
        return this.Inspect ();
    }
    Layout (width, height)
    {
        if (!this.open) { return { width, height }; }
        const vertical = width < 720; this.wrapper.classList.toggle ('pp_vertical', vertical); this.wrapper.style.width = width + 'px'; this.wrapper.style.height = height + 'px';
        const profileWidth = vertical ? width : Math.floor (width / 2), profileHeight = vertical ? Math.max (180, Math.floor (height * .55)) : height;
        this.root.style.width = profileWidth + 'px'; this.root.style.height = profileHeight + 'px';
        return { width : vertical ? width : width - profileWidth, height : vertical ? Math.max (1, height - profileHeight) : height };
    }
    Sync ()
    {
        if (!this.open) { return; }
        if (this.document !== this.website.sessionEditor.document || this.owner !== this.website.auth?.user?.id) { this.Close (false); return; }
        if (this.committing || this.website.sessionEditor.busy || this.panel.products.active) { this.ui.SetDisabled (true); return; }
        const state = this.Inspect ();
        if (!state.available) { this.Close (false); return; }
        this.ui.Refresh (state);
    }
    async Close (restore = true)
    {
        if (!this.open) { return { open : false }; }
        this.open = false; this.website.layouter.primaryProfile = null;
        const viewer = this.website.parameters.viewerDiv; this.wrapper.before (viewer); this.wrapper.remove (); this.ui = null; this.website.layouter.Resize ();
        if (restore && this.owner === this.website.auth?.user?.id && this.document === this.website.sessionEditor.document) {
            for (const p of this.restore || []) { const active = this.website.modulePanels.Inspect ().find (m => m.side === p.side && m.visible); if (!active) { await this.website.modulePanels.Set (p.id, p.mode); } }
        }
        this.panel.Refresh (); return { open : false };
    }
}
