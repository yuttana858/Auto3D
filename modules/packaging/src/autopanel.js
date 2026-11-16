function Element (tag, parent, text, className)
{
    const node = document.createElement (tag); if (text !== undefined) { node.textContent = text; } if (className) { node.className = className; } parent.appendChild (node); return node;
}
// Only consumes neutral measurements and host actions; scene access belongs to the host.
export class AutoPackPanel
{
    constructor (host, parent)
    {
        this.host = host; this.pending = false;
        this.root = Element ('section', parent, undefined, 'packaging_auto_pack'); this.root.setAttribute ('aria-label', 'Auto Pack');
        Element ('h3', this.root, 'Auto Pack');
        Element ('p', this.root, 'Fit an RSC around the selected product.', 'section_hint');
        this.objectName = Element ('strong', this.root);
        this.product = this.Size ('Selected object · bounding box');
        this.inside = this.Size ('RSC inside size');
        this.board = Element ('p', this.root, '', 'section_hint');
        Element ('p', this.root, 'Clearance: 0.001″ (0.0254 mm) on each face. The box inside size includes clearance on both sides of each dimension and one board thickness along its longer side for the internal glue tab.', 'section_hint');
        Element ('p', this.root, 'The blank starts below the product. A bottom flap stays underneath as the carton folds around it.', 'section_hint');
        this.refresh = Element ('button', this.root, 'Refresh bounds'); this.refresh.type = 'button'; this.refresh.addEventListener ('click', () => { this.status.textContent = ''; this.Refresh (); });
        this.create = Element ('button', this.root, 'Auto Pack', 'packaging_auto_create'); this.create.type = 'button'; this.create.addEventListener ('click', () => this.Create ());
        this.playback = Element ('section', this.root, undefined, 'packaging_auto_playback'); this.playback.setAttribute ('aria-label', 'Auto Pack folding');
        this.playbackStatus = Element ('p', this.playback, '', 'section_hint'); this.playbackStatus.setAttribute ('role', 'status');
        this.progress = Element ('progress', this.playback); this.progress.max = 1; this.progress.setAttribute ('aria-label', 'Auto Pack folding progress');
        const buttons = Element ('div', this.playback, undefined, 'packaging_auto_playback_buttons');
        this.pause = Element ('button', buttons, 'Pause folding'); this.pause.type = 'button'; this.pause.addEventListener ('click', () => this.Control (this.host.playback?.().state === 'paused' ? 'resume' : 'pause'));
        this.cancel = Element ('button', buttons, 'Cancel folding'); this.cancel.type = 'button'; this.cancel.addEventListener ('click', () => this.Control ('cancel'));
        this.fold = Element ('button', this.root, 'Fold carton'); this.fold.type = 'button'; this.fold.addEventListener ('click', () => this.ToggleFold ());
        this.reason = Element ('p', this.root, '', 'section_hint');
        this.status = Element ('p', this.root, '', 'section_hint'); this.status.setAttribute ('role', 'status'); this.status.setAttribute ('aria-live', 'polite');
        this.Refresh ();
    }
    Size (title)
    {
        const section = Element ('section', this.root, undefined, 'packaging_auto_size'); section.setAttribute ('aria-label', title); Element ('h4', section, title);
        const row = Element ('dl', section); const fields = new Map ();
        for (const [key, label] of [['width', 'W'], ['length', 'L'], ['height', 'H']]) { const cell = Element ('div', row); Element ('dt', cell, label); fields.set (key, Element ('dd', cell, '—')); }
        return { section, fields };
    }
    Refresh ()
    {
        let data;
        try { data = this.host.autoInspect?.() || { available : false, reason : 'Select a product in Auto3D to use Auto Pack.' }; }
        catch (error) { data = { available : false, reason : error.message }; }
        this.state = data; const factor = this.host.factor (), unit = Math.abs (factor - 25.4) < 1e-9 ? 'in' : 'mm';
        this.objectName.textContent = data.objectName || 'No product selected';
        for (const [row, size] of [[this.product, data.productMm], [this.inside, data.insideMm]]) {
            for (const [key, field] of row.fields) { field.textContent = Number.isFinite (size?.[key]) ? Number ((size[key] / factor).toFixed (6)) + ' ' + unit : '—'; }
        }
        this.inside.section.hidden = !data.insideMm;
        this.board.textContent = Number.isFinite (data.thicknessMm) ? 'Board caliper: ' + (data.boardName ? data.boardName + ' · ' : '') + Number ((data.thicknessMm / factor).toFixed (6)) + ' ' + unit : '';
        this.reason.textContent = data.reason || '';
        this.refresh.disabled = this.pending || this.host.blocked ();
        this.create.disabled = this.pending || this.host.blocked () || !data.available || !this.host.autoPack;
        this.RefreshPlayback ();
    }
    RefreshPlayback ()
    {
        const state = this.host.playback?.() || { state : 'idle', progress : 0 };
        this.playback.hidden = state.state === 'idle'; this.progress.value = Number.isFinite (state.progress) ? state.progress : 0;
        this.playbackStatus.textContent = [state.state, state.stage, Math.round (this.progress.value * 100) + '%'].filter (Boolean).join (' · ');
        const controllable = ['playing', 'paused'].includes (state.state) && !this.host.playbackBlocked?.() && Boolean (this.host.control);
        this.pause.textContent = state.state === 'paused' ? 'Resume folding' : 'Pause folding'; this.pause.disabled = !controllable; this.cancel.disabled = !controllable;
        const canFold = Boolean (this.host.canAnimate?.() && this.host.toggleFold); this.fold.hidden = !canFold;
        this.fold.textContent = this.host.animation?.()?.action === 'unfold' ? 'Unfold carton' : 'Fold carton';
        this.fold.disabled = this.pending || this.host.blocked () || !canFold;
    }
    async ToggleFold ()
    {
        if (this.pending || this.fold.disabled) { return; }
        this.pending = true; this.RefreshPlayback ();
        try { await this.host.toggleFold (); } catch (error) { this.status.textContent = error.message; } finally { this.pending = false; this.RefreshPlayback (); }
    }
    async Control (action)
    {
        try { await this.host.control (action); } catch (error) { this.status.textContent = error.message; } finally { this.RefreshPlayback (); }
    }
    async Create ()
    {
        if (this.pending || this.create.disabled) { return; }
        this.pending = true; this.status.textContent = 'Checking fit and preparing Auto Pack…'; this.Refresh ();
        try {
            const action = async () => {
                try { const result = await this.host.autoPack (); this.status.textContent = result?.message || 'Auto Pack complete.'; return result; }
                catch (error) { this.status.textContent = error.message; throw error; }
            };
            await (this.host.run ? this.host.run (action) : action ());
        } catch (error) { this.status.textContent = error.message; }
        finally { this.pending = false; this.Refresh (); }
    }
}
