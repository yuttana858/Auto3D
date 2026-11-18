import { AutoPalletPanel } from './palletpanel.js';

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
        Element ('p', this.root, 'Fit a box from the Packaging generator around the selected product.', 'section_hint');
        // Styles are the Packaging generator's catalog, so new generator styles appear here automatically.
        const style = Element ('div', this.root, undefined, 'packaging_accessory_options');
        this.style = this.Select (style, 'Box style', false); this.style.addEventListener ('change', () => { try { this.host.autoStyle?.(this.style.value); } catch (error) { this.status.textContent = error.message; } this.Refresh (); });
        this.objectName = Element ('strong', this.root);
        this.product = this.Size ('Selected object · bounding box');
        this.inside = this.Size ('Inside size');
        this.score = this.Size ('Score size');
        this.board = Element ('p', this.root, '', 'section_hint');
        Element ('p', this.root, 'Clearance: 0.001″ (0.0254 mm) on each face. The inside size adds clearance on both sides of each dimension and one board thickness along the longer side for the internal glue tab. It is generated like Generate with the inside basis: the selected board record and its allowance factors convert the inside size to score dimensions, and the carton keeps that CAD measurement layer.', 'section_hint');
        Element ('p', this.root, 'The blank starts below the product. A bottom flap stays underneath as the carton folds around it.', 'section_hint');
        // Packed contents: nested partitions between the products and pads around them, fitted with them.
        const contents = Element ('section', this.root, undefined, 'packaging_auto_contents'); contents.setAttribute ('aria-label', 'Packed contents'); Element ('h4', contents, 'Packed contents');
        Element ('p', contents, 'Partitions nest between the products: the layout is read from the products, gaps too narrow for the board are opened, and one interlocking set goes in each layer. Pads wrap the products and partitions. The carton is fitted around everything and folds with the contents in place.', 'section_hint');
        const choices = Element ('div', contents, undefined, 'packaging_accessory_options');
        this.partitions = this.Check (choices, 'Partitions between products');
        this.pads = new Map (['top', 'bottom', 'front', 'back'].map (position => [position, this.Check (choices, position[0].toUpperCase () + position.slice (1) + ' pad')]));
        const board = Element ('div', contents, undefined, 'packaging_accessory_options');
        this.contentsBoard = this.Select (board, 'Contents flute'); this.contentsGrade = this.Select (board, 'Contents grade');
        this.contents = Element ('p', contents, '', 'section_hint'); this.contents.setAttribute ('aria-live', 'polite');
        // A scene with no units (STL, OBJ, many older or CAD exports) cannot be measured in mm; Refresh bounds assigns the
        // chosen model units to it (one Undo step) and re-measures.
        this.unitsRow = Element ('div', this.root, undefined, 'packaging_accessory_options'); this.units = this.Select (this.unitsRow, 'Model units');
        this.Fill (this.units, [['mm', 'Millimetres (mm)'], ['cm', 'Centimetres (cm)'], ['m', 'Metres (m)'], ['in', 'Inches (in)'], ['ft', 'Feet (ft)']].map (([value, label]) => ({ value, label })), 'mm');
        this.refresh = Element ('button', this.root, 'Refresh bounds'); this.refresh.type = 'button'; this.refresh.addEventListener ('click', () => this.RefreshBounds ());
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
        this.palletPanel = new AutoPalletPanel (host, this.root);
    }
    Check (parent, title)
    {
        const label = Element ('label', parent, undefined, 'packaging_accessory_check'); const input = Element ('input', label); input.type = 'checkbox'; input.setAttribute ('aria-label', title);
        label.appendChild (document.createTextNode (' ' + title)); input.addEventListener ('change', () => this.Refresh ()); return input;
    }
    Select (parent, title, refresh = true)
    {
        const label = Element ('label', parent, title); const select = Element ('select', label); select.setAttribute ('aria-label', title); if (refresh) { select.addEventListener ('change', () => this.Refresh ()); } return select;
    }
    Fill (select, items, fallback)
    {
        const keys = items.map (item => item.value).join ('|');
        if (select.dataset.keys !== keys) { const current = select.value; select.replaceChildren (...items.map (item => { const option = document.createElement ('option'); option.value = item.value; option.textContent = item.label; return option; })); select.dataset.keys = keys; select.value = items.some (item => item.value === current) ? current : fallback; }
    }
    ContentOptions ()
    {
        if (!this.pads) { return null; }
        const pads = [...this.pads].filter (([, input]) => input.checked).map (([id]) => id), partitions = this.partitions.checked;
        if (!pads.length && !partitions) { return null; }
        const options = { pads, partitions }; if (this.contentsBoard.value) { options.boardId = this.contentsBoard.value; } if (this.contentsGrade.value) { options.grade = this.contentsGrade.value; } return options;
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
        if (this.contentsBoard) {
            const boards = this.host.accessoryBoards?.() || { records : [], grades : [] };
            this.Fill (this.contentsBoard, boards.records.map (r => ({ value : r.id, label : r.flute + ' flute · ' + r.caliperMm + ' mm' })), boards.records.find (r => r.flute === 'B')?.id || boards.records[0]?.id || '');
            this.Fill (this.contentsGrade, boards.grades.map (g => ({ value : g, label : g })), boards.grades[0] || '');
        }
        try { data = this.host.autoInspect?.(this.ContentOptions ()) || { available : false, reason : 'Select a product in Auto3D to use Auto Pack.' }; }
        catch (error) { data = { available : false, reason : error.message }; }
        this.state = data; const factor = this.host.factor (), unit = Math.abs (factor - 25.4) < 1e-9 ? 'in' : 'mm';
        const styles = this.host.autoStyles?.() || [];
        this.Fill (this.style, styles.map (s => ({ value : s.code, label : s.code + ' · ' + s.acronym + ' · ' + s.name })), styles.find (s => s.selected)?.code || '0201');
        if (styles.length) { this.style.value = styles.find (s => s.selected)?.code || this.style.value; }
        this.unitsRow.hidden = !data.unitsUnknown; this.refresh.textContent = data.unitsUnknown ? 'Assign units and refresh bounds' : 'Refresh bounds';
        this.objectName.textContent = data.objectName || 'No product selected';
        for (const [row, size] of [[this.product, data.productMm], [this.inside, data.insideMm], [this.score, data.scoreMm]]) {
            for (const [key, field] of row.fields) { field.textContent = Number.isFinite (size?.[key]) ? Number ((size[key] / factor).toFixed (6)) + ' ' + unit : '—'; }
        }
        this.inside.section.hidden = !data.insideMm; this.score.section.hidden = !data.scoreMm;
        this.board.textContent = Number.isFinite (data.thicknessMm) ? 'Board caliper: ' + (data.boardName ? data.boardName + ' · ' : '') + Number ((data.thicknessMm / factor).toFixed (6)) + ' ' + unit : '';
        this.reason.textContent = data.reason || '';
        if (this.contents) {
            const c = data.contents, mm = value => Number ((value / factor).toFixed (unit === 'in' ? 3 : 1)) + ' ' + unit;
            this.contents.textContent = !c ? '' : c.reason ? c.reason : [c.partitions && c.partitions.layout.columns + ' × ' + c.partitions.layout.rows + ' × ' + c.partitions.layout.layers + ' products (columns × rows × layers) · ' + c.partitions.strips + ' partition strips' + (c.partitions.moves ? ' · gaps opened by ' + mm (c.partitions.growthMm.length) + ' × ' + mm (c.partitions.growthMm.width) : ' · gaps already fit'), c.pads.length && c.pads.length + ' pads', c.board + ' (' + mm (c.thicknessMm) + ')', 'carton inside ' + ['width', 'length', 'height'].map (k => mm (c.insideMm[k])).join (' × ')].filter (Boolean).join (' · ');
        }
        this.refresh.disabled = this.pending || this.host.blocked ();
        this.create.disabled = this.pending || this.host.blocked () || !data.available || !this.host.autoPack;
        this.RefreshPlayback ();
        this.palletPanel?.Refresh ();
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
    async RefreshBounds ()
    {
        if (this.pending) { return; }
        this.status.textContent = '';
        if (!this.host.autoRefresh) { this.Refresh (); return; }
        this.pending = true;
        try { const result = await this.host.autoRefresh (this.state?.unitsUnknown ? { units : this.units.value } : {}); this.status.textContent = result?.message || ''; }
        catch (error) { this.status.textContent = error.message; }
        finally { this.pending = false; this.Refresh (); }
    }
    async Create ()
    {
        if (this.pending || this.create.disabled) { return; }
        this.pending = true; this.status.textContent = 'Checking fit and preparing Auto Pack…'; this.Refresh ();
        try {
            const action = async () => {
                try { const result = await this.host.autoPack (this.ContentOptions () || {}); this.status.textContent = result?.message || 'Auto Pack complete.'; return result; }
                catch (error) { this.status.textContent = error.message; throw error; }
            };
            await (this.host.run ? this.host.run (action) : action ());
        } catch (error) { this.status.textContent = error.message; }
        finally { this.pending = false; this.Refresh (); }
    }
}
