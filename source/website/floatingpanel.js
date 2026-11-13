// Lets an absolutely positioned panel be dragged inside its parent by a handle.
// The position is kept inside the parent, remembered per device, and reset by double-clicking the handle or pressing Home.
const Step = 10, LargeStep = 50;

function Read (key)
{
    try { const value = JSON.parse (localStorage.getItem (key)); return Number.isFinite (value?.x) && Number.isFinite (value?.y) ? value : null; } catch { return null; }
}
function Write (key, value)
{
    try { if (value) { localStorage.setItem (key, JSON.stringify (value)); } else { localStorage.removeItem (key); } } catch { /* Storage is optional. */ }
}

export class FloatingPanel
{
    constructor (panel, handle, storageKey, label)
    {
        this.panel = panel; this.handle = handle; this.storageKey = storageKey; this.position = Read (storageKey);
        handle.classList.add ('floating_panel_handle'); handle.tabIndex = 0; handle.setAttribute ('role', 'button');
        handle.setAttribute ('aria-label', 'Move ' + label + '. Drag, or use arrow keys; double-click or Home resets.'); handle.title = 'Drag to move · double-click to reset';
        handle.addEventListener ('pointerdown', event => this.Start (event));
        handle.addEventListener ('dblclick', () => this.Reset ());
        handle.addEventListener ('keydown', event => this.Key (event));
        window.addEventListener ('resize', () => this.Apply ());
        this.Apply ();
    }
    Bounds ()
    {
        const parent = this.panel.offsetParent || this.panel.parentElement;
        return { width : Math.max (0, (parent?.clientWidth || 0) - this.panel.offsetWidth), height : Math.max (0, (parent?.clientHeight || 0) - this.panel.offsetHeight) };
    }
    // Keeps the remembered position on screen; call after the panel is shown or its parent resizes.
    Apply ()
    {
        if (!this.position) { this.panel.style.left = ''; this.panel.style.top = ''; this.panel.style.right = ''; this.panel.classList.remove ('floating_panel_moved'); return; }
        if (this.panel.hidden || !this.panel.offsetWidth) { return; }
        const bounds = this.Bounds ();
        const x = Math.round (Math.min (Math.max (this.position.x, 0), bounds.width)), y = Math.round (Math.min (Math.max (this.position.y, 0), bounds.height));
        this.panel.style.left = x + 'px'; this.panel.style.top = y + 'px'; this.panel.style.right = 'auto'; this.panel.classList.add ('floating_panel_moved');
    }
    MoveTo (x, y, save = true)
    {
        if (!Number.isFinite (x) || !Number.isFinite (y)) { throw new Error ('Panel position must be finite numbers.'); }
        const bounds = this.Bounds (); this.position = { x : Math.min (Math.max (x, 0), bounds.width), y : Math.min (Math.max (y, 0), bounds.height) };
        this.Apply (); if (save) { Write (this.storageKey, this.position); }
        return this.State ();
    }
    Reset () { this.position = null; Write (this.storageKey, null); this.Apply (); return this.State (); }
    State () { return { moved : Boolean (this.position), x : this.position ? Math.round (this.position.x) : null, y : this.position ? Math.round (this.position.y) : null, visible : !this.panel.hidden }; }
    Start (event)
    {
        if (event.button !== 0) { return; }
        event.preventDefault (); this.handle.setPointerCapture?.(event.pointerId);
        const startX = event.clientX, startY = event.clientY, originX = this.panel.offsetLeft, originY = this.panel.offsetTop;
        this.panel.classList.add ('floating_panel_dragging');
        const move = moveEvent => this.MoveTo (originX + moveEvent.clientX - startX, originY + moveEvent.clientY - startY, false);
        const end = () => { this.handle.removeEventListener ('pointermove', move); this.handle.removeEventListener ('pointerup', end); this.handle.removeEventListener ('pointercancel', end); this.panel.classList.remove ('floating_panel_dragging'); if (this.position) { Write (this.storageKey, this.position); } };
        this.handle.addEventListener ('pointermove', move); this.handle.addEventListener ('pointerup', end); this.handle.addEventListener ('pointercancel', end);
    }
    Key (event)
    {
        if (event.key === 'Home') { event.preventDefault (); this.Reset (); return; }
        const delta = { ArrowLeft : [-1, 0], ArrowRight : [1, 0], ArrowUp : [0, -1], ArrowDown : [0, 1] }[event.key]; if (!delta) { return; }
        event.preventDefault (); event.stopPropagation (); const step = event.shiftKey ? LargeStep : Step;
        this.MoveTo (this.panel.offsetLeft + delta[0] * step, this.panel.offsetTop + delta[1] * step);
    }
}
