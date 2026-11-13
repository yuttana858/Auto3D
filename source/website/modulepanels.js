// Shared panel chrome only. Module content and styling stay with their owners.
export class ModulePanelState
{
    constructor () { this.modules = new Map (); this.active = { left : 'upload', right : 'data' }; }
    Register (id, side, title, mode = 'closed')
    {
        if (typeof id !== 'string' || !id || id.length > 80 || typeof title !== 'string' || !title || title.length > 80 || this.modules.has (id) || !['left', 'right'].includes (side) || !['minimal', 'extended', 'closed'].includes (mode) || (side === 'left' && mode === 'extended')) { throw new Error ('Invalid or duplicate module panel.'); }
        this.modules.set (id, { id, side, title, mode, preferred : mode === 'closed' ? 'minimal' : mode }); if (mode !== 'closed') { this.active[side] = id; }
    }
    Set (id, mode)
    {
        const panel = this.modules.get (id); if (!panel || !['minimal', 'extended', 'closed'].includes (mode)) { throw new Error ('Choose an existing module and minimal, extended or closed mode.'); } if (panel.side === 'left' && mode === 'extended') { throw new Error ('Extended mode is unavailable for left-side panels.'); }
        panel.mode = mode; if (mode !== 'closed') { panel.preferred = mode; this.active[panel.side] = id; } return this.Inspect (id);
    }
    Inspect (id)
    {
        const panel = this.modules.get (id); if (!panel) { throw new Error ('Unknown module panel.'); }
        return { id, side : panel.side, title : panel.title, mode : panel.mode, visible : this.active[panel.side] === id && panel.mode !== 'closed' };
    }
}
const DefaultRightPanel = 'data';

export class ModulePanels
{
    constructor (website)
    {
        this.website = website; this.extended = null; this.lastSide = 'left'; this.state = new ModulePanelState (); this.entries = new Map (); this.headers = new Map (); this.transitionGeneration = 0; this.motion = [];
        for (const [side, toggleId] of [['left', 'upload_panel_toggle'], ['right', 'data_panel_toggle']]) {
            const toggle = document.getElementById (toggleId); const header = toggle.parentElement; header.classList.add ('module_panel_header');
            const controls = document.createElement ('div'); controls.className = 'module_panel_controls'; header.appendChild (controls); const buttons = new Map ();
            for (const [mode, title, path] of [['extended', 'Extended', 'M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5'], ['minimal', 'Minimal', 'M4 12h16'], ['closed', 'Close', 'm6 6 12 12M18 6 6 18']]) {
                if (side === 'left' && mode === 'extended') { continue; }
                const button = document.createElement ('button'); button.type = 'button'; button.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="' + path + '"/></svg>';
                button.addEventListener ('click', () => website.sessionEditor.Run (() => this.Set (this.state.active[side], mode)));
                buttons.set (mode, { button, title }); controls.appendChild (button);
            }
            toggle.addEventListener ('click', () => { const id = this.state.active[side]; const panel = this.state.modules.get (id); website.sessionEditor.Run (() => this.Set (id, panel.mode === 'closed' ? panel.preferred : 'closed')); });
            this.headers.set (side, { toggle, controls, buttons });
        }
        this.overlay = document.createElement ('dialog'); this.overlay.className = 'module_extended_view workspace_panel'; this.overlay.setAttribute ('aria-label', 'Extended module'); document.body.appendChild (this.overlay);
        this.overlay.addEventListener ('cancel', event => { event.preventDefault (); if (this.extended) { website.sessionEditor.Run (() => this.Set (this.extended.id, 'minimal')); } });
        // Native modal inertness blocks background pointer/focus; stop bubbled scene shortcuts as well.
        for (const type of ['keydown', 'keyup', 'wheel', 'pointerdown', 'pointerup', 'click', 'contextmenu']) { this.overlay.addEventListener (type, event => event.stopPropagation ()); }
        this.Register ('upload', { side : 'left', title : 'Model upload', body : document.getElementById ('upload_panel_content'), mode : 'minimal' });
        // Model spec is the default right panel: open at start when both docks fit, and shown again when another right module closes.
        this.Register ('data', { side : 'right', title : 'Model spec', body : document.getElementById ('data_panel_content'), mode : window.innerWidth >= 1100 ? 'minimal' : 'closed', onOpen : () => website.sessionEditor.UpdateDetails () });
        window.addEventListener ('resize', () => {
            const left = this.state.modules.get (this.state.active.left), right = this.state.modules.get (this.state.active.right);
            if (left.mode !== 'closed' && right.mode !== 'closed' && (window.innerWidth < 800 || window.innerWidth < 1100 && [left.mode, right.mode].includes ('extended'))) { this.state.Set (this.state.active[this.lastSide === 'left' ? 'right' : 'left'], 'closed'); }
            this.Render ();
        });
    }
    Register (id, { side = 'right', title, body, mode = 'closed', onOpen, onMode, onExtended, animated = false })
    {
        this.state.Register (id, side, title, mode); body.id ||= 'module_panel_' + id; body.hidden = mode === 'closed'; body.dataset.module = id; body.classList.add ('module_panel_body'); this.entries.set (id, { body, onOpen, onMode, onExtended, animated });
    }
    Inspect () { return [...this.state.modules.keys ()].map (id => this.state.Inspect (id)); }
    // Module icons toggle: open the module, or close it when it is already showing (which returns to Model spec).
    async Toggle (id, open = () => this.Open (id)) { if (this.state.modules.get (id) && this.state.Inspect (id).visible) { return this.Set (id, 'closed'); } return open (); }
    async Open (id) { const panel = this.state.modules.get (id); if (!panel) { throw new Error ('Unknown module panel.'); } return this.Set (id, panel.mode === 'closed' ? panel.preferred : panel.mode); }
    async Animate (id, entering, extended)
    {
        const entry = this.entries.get (id);
        if (!entry?.animated || window.matchMedia ('(prefers-reduced-motion: reduce)').matches) { return; }
        const elements = [entry.body]; if (extended) { elements.push (this.headers.get (this.state.modules.get (id).side).toggle.parentElement); }
        const offset = extended ? -40 : 22;
        const start = { opacity : 0, transform : 'translateX(' + offset + 'px)' }, end = { opacity : 1, transform : 'translateX(0)' };
        const animations = elements.filter (element => element.animate).map (element => element.animate (entering ? [start, end] : [end, start], { duration : entering ? 220 : 160, easing : entering ? 'cubic-bezier(.2,.8,.2,1)' : 'ease-in' }));
        this.motion = animations; await Promise.allSettled (animations.map (animation => animation.finished));
        if (this.motion === animations) { this.motion = []; }
    }
    // returnToDefault: an explicit close of a right module shows Model spec; layout code that clears panels temporarily passes false.
    async Set (id, mode, { returnToDefault = true } = {})
    {
        const panel = this.state.modules.get (id);
        if (!panel || !['minimal', 'extended', 'closed'].includes (mode) || panel.side === 'left' && mode === 'extended') { throw new Error ('Choose a supported mode for an existing module panel.'); }
        if (mode === 'extended' && this.entries.get (id).onExtended) { return this.entries.get (id).onExtended (); }
        const generation = ++this.transitionGeneration; this.motion.forEach (animation => animation.cancel ()); this.motion = [];
        const outgoing = this.Inspect ().find (entry => entry.visible && entry.side === panel.side);
        if (outgoing && (outgoing.id !== id || outgoing.mode !== mode)) { await this.Animate (outgoing.id, false, outgoing.mode === 'extended'); }
        const result = () => { const state = this.state.Inspect (id); return { ...state, opened : state.visible }; };
        if (generation !== this.transitionGeneration) { return result (); }
        this.state.Set (id, mode); if (mode !== 'closed') { this.lastSide = panel.side; }
        const other = this.state.active[panel.side === 'left' ? 'right' : 'left'];
        if (mode !== 'closed' && (window.innerWidth < 800 || mode === 'extended' || this.state.modules.get (other).mode === 'extended')) { this.state.Set (other, 'closed'); }
        this.Render (); if (mode !== 'closed') { await this.entries.get (id).onOpen?.(); }
        if (returnToDefault && mode === 'closed' && panel.side === 'right' && id !== DefaultRightPanel && this.state.modules.has (DefaultRightPanel) && !this.Inspect ().some (entry => entry.side === 'right' && entry.visible) && window.innerWidth >= 800) {
            await this.Set (DefaultRightPanel, 'minimal'); return result ();
        }
        if (generation === this.transitionGeneration && this.state.Inspect (id).visible && (outgoing?.id !== id || outgoing?.mode !== mode)) { await this.Animate (id, true, mode === 'extended'); }
        return result ();
    }
    SyncExtended ()
    {
        const active = this.Inspect ().find (panel => panel.visible && panel.mode === 'extended');
        if (this.extended?.id === active?.id) { return; }
        if (this.extended) {
            const { body, marker, header, headerMarker, appHeader, appHeaderMarker } = this.extended;
            marker.replaceWith (body); headerMarker.replaceWith (header); appHeaderMarker.replaceWith (appHeader); this.extended = null; this.overlay.close ();
        }
        if (!active) { return; }
        const body = this.entries.get (active.id).body; const header = this.headers.get (active.side).toggle.parentElement;
        const appHeader = this.website.parameters.headerDiv;
        const marker = document.createComment ('module body'); const headerMarker = document.createComment ('module header'); const appHeaderMarker = document.createComment ('application header');
        body.before (marker); header.before (headerMarker); appHeader.before (appHeaderMarker); this.overlay.append (appHeader, header, body);
        this.extended = { id : active.id, body, marker, header, headerMarker, appHeader, appHeaderMarker }; this.overlay.dataset.module = active.id;
        this.overlay.setAttribute ('aria-label', active.title + ' extended workspace'); this.website.viewer?.navigation?.CancelPan?.(); this.overlay.showModal ();
    }
    Render ()
    {
        this.SyncExtended ();
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
