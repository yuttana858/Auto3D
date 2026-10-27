// Shared panel chrome only. Module content and styling stay with their owners.
export class ModulePanelState
{
    constructor () { this.modules = new Map (); this.active = { left : 'upload', right : 'data' }; }
    Register (id, side, title, mode = 'closed')
    {
        if (typeof id !== 'string' || !id || id.length > 80 || typeof title !== 'string' || !title || title.length > 80 || this.modules.has (id) || !['left', 'right'].includes (side) || !['minimal', 'extended', 'closed'].includes (mode)) { throw new Error ('Invalid or duplicate module panel.'); }
        this.modules.set (id, { id, side, title, mode, preferred : mode === 'closed' ? 'minimal' : mode }); if (mode !== 'closed') { this.active[side] = id; }
    }
    Set (id, mode)
    {
        const panel = this.modules.get (id); if (!panel || !['minimal', 'extended', 'closed'].includes (mode)) { throw new Error ('Choose an existing module and minimal, extended or closed mode.'); }
        panel.mode = mode; if (mode !== 'closed') { panel.preferred = mode; this.active[panel.side] = id; } return this.Inspect (id);
    }
    Inspect (id)
    {
        const panel = this.modules.get (id); if (!panel) { throw new Error ('Unknown module panel.'); }
        return { id, side : panel.side, title : panel.title, mode : panel.mode, visible : this.active[panel.side] === id && panel.mode !== 'closed' };
    }
}
export class ModulePanels
{
    constructor (website)
    {
        this.website = website; this.lastSide = 'left'; this.state = new ModulePanelState (); this.entries = new Map (); this.headers = new Map ();
        for (const [side, toggleId] of [['left', 'upload_panel_toggle'], ['right', 'data_panel_toggle']]) {
            const toggle = document.getElementById (toggleId); const header = toggle.parentElement; header.classList.add ('module_panel_header');
            const controls = document.createElement ('div'); controls.className = 'module_panel_controls'; header.appendChild (controls); const buttons = new Map ();
            for (const [mode, title, path] of [['extended', 'Extended', 'M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5'], ['minimal', 'Minimal', 'M4 12h16'], ['closed', 'Close', 'm6 6 12 12M18 6 6 18']]) {
                const button = document.createElement ('button'); button.type = 'button'; button.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="' + path + '"/></svg>';
                button.addEventListener ('click', () => website.sessionEditor.Run (() => this.Set (this.state.active[side], mode)));
                buttons.set (mode, { button, title }); controls.appendChild (button);
            }
            toggle.addEventListener ('click', () => { const id = this.state.active[side]; const panel = this.state.modules.get (id); website.sessionEditor.Run (() => this.Set (id, panel.mode === 'closed' ? panel.preferred : 'closed')); });
            this.headers.set (side, { toggle, controls, buttons });
        }
        this.Register ('upload', { side : 'left', title : 'Model upload', body : document.getElementById ('upload_panel_content'), mode : 'minimal' });
        this.Register ('data', { side : 'right', title : 'Model data', body : document.getElementById ('data_panel_content'), onOpen : () => website.sessionEditor.UpdateDetails () });
        window.addEventListener ('resize', () => {
            const left = this.state.modules.get (this.state.active.left), right = this.state.modules.get (this.state.active.right);
            if (left.mode !== 'closed' && right.mode !== 'closed' && (window.innerWidth < 800 || window.innerWidth < 1100 && [left.mode, right.mode].includes ('extended'))) { this.state.Set (this.state.active[this.lastSide === 'left' ? 'right' : 'left'], 'closed'); }
            this.Render ();
        });
    }
    Register (id, { side = 'right', title, body, mode = 'closed', onOpen, onMode })
    {
        this.state.Register (id, side, title, mode); body.id ||= 'module_panel_' + id; body.hidden = mode === 'closed'; body.dataset.module = id; body.classList.add ('module_panel_body'); this.entries.set (id, { body, onOpen, onMode });
    }
    Inspect () { return [...this.state.modules.keys ()].map (id => this.state.Inspect (id)); }
    async Open (id) { const panel = this.state.modules.get (id); if (!panel) { throw new Error ('Unknown module panel.'); } return this.Set (id, panel.mode === 'closed' ? panel.preferred : panel.mode); }
    async Set (id, mode)
    {
        const result = this.state.Set (id, mode); const panel = this.state.modules.get (id); if (mode !== 'closed') { this.lastSide = panel.side; }
        const other = this.state.active[panel.side === 'left' ? 'right' : 'left'];
        if (mode !== 'closed' && (window.innerWidth < 800 || mode === 'extended' && (window.innerWidth < 1100 || this.state.modules.get (other).mode === 'extended'))) { this.state.Set (other, 'closed'); }
        this.Render (); if (mode !== 'closed') { await this.entries.get (id).onOpen?.(); } return { ...this.state.Inspect (id), opened : this.state.Inspect (id).visible, side : result.side };
    }
    Render ()
    {
        for (const [id, entry] of this.entries) { const panel = this.state.Inspect (id); entry.body.hidden = !panel.visible; entry.body.dataset.mode = panel.mode; this.website.sessionEditor?.buttons?.get (id)?.setAttribute ('aria-pressed', String (panel.visible)); entry.onMode?.(panel); }
        for (const side of ['left', 'right']) {
            const panel = this.state.modules.get (this.state.active[side]); const container = side === 'left' ? this.website.parameters.leftContainerDiv : this.website.parameters.rightContainerDiv; const { toggle, controls, buttons } = this.headers.get (side);
            container.classList.toggle ('collapsed', panel.mode === 'closed'); container.dataset.panelMode = panel.mode; container.dataset.activeModule = panel.id;
            toggle.querySelector ('span:first-child').textContent = panel.title; toggle.setAttribute ('aria-expanded', String (panel.mode !== 'closed')); toggle.setAttribute ('aria-label', (panel.mode === 'closed' ? 'Open ' : 'Collapse ') + panel.title + ' panel'); toggle.setAttribute ('aria-controls', this.entries.get (panel.id).body.id);
            toggle.querySelector ('.panel_chevron').textContent = panel.mode === 'closed' ? (side === 'left' ? '›' : '‹') : (side === 'left' ? '‹' : '›');
            controls.hidden = panel.mode === 'closed'; controls.setAttribute ('role', 'group'); controls.setAttribute ('aria-label', panel.title + ' panel modes'); for (const [mode, { button, title }] of buttons) { button.setAttribute ('aria-label', title + ' ' + panel.title + ' panel'); button.title = title; button.setAttribute ('aria-pressed', String (panel.mode === mode)); }
        }
        this.website.layouter.Resize ();
    }
}
