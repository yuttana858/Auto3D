// Display-only quality policy. Geometry, textures and render targets are never
// changed here; PNG/export jobs use their own targets at the requested size.
export class ViewportQuality
{
    constructor ({ deviceRatio = () => globalThis.devicePixelRatio || 1, requestDraw = () => {}, schedule = (callback, delay) => setTimeout (callback, delay), cancel = timer => clearTimeout (timer) } = {})
    {
        this.deviceRatio = deviceRatio; this.requestDraw = requestDraw;
        this.schedule = schedule; this.cancel = cancel;
        this.mode = 'auto'; this.interacting = false; this.timer = null;
    }
    SetMode (mode)
    {
        if (!['auto', 'fast', 'quality'].includes (mode)) { throw new Error ('Invalid viewport quality.'); }
        this.mode = mode; this.Stop (); this.requestDraw (); return this.Inspect ();
    }
    Interact ()
    {
        if (this.mode !== 'auto') { return; }
        this.interacting = true; if (this.timer !== null) { this.cancel (this.timer); }
        this.timer = this.schedule (() => { this.timer = null; this.interacting = false; this.requestDraw (); }, 250);
    }
    Ratio ()
    {
        const value = this.deviceRatio (); const native = Number.isFinite (value) && value > 0 ? value : 1;
        return this.mode === 'quality' ? native : Math.min (native, this.mode === 'fast' || this.interacting ? 1 : 2);
    }
    Inspect () { return { mode : this.mode, interacting : this.interacting, pixelRatio : this.Ratio (), originalGeometry : true }; }
    Stop () { if (this.timer !== null) { this.cancel (this.timer); this.timer = null; } this.interacting = false; }
}
