import { MoldedPulpVersion, PulpTypes, PulpLimits } from './state.js';
// Neutral Molded Pulp panel. It owns its controls and layout and reaches the host only through callbacks:
// inspect, configure, sense, generateSheet, setFormDepth, formTray, reset, units, blocked. No Auto3D imports.
function Element (tag, className, text, parent)
{
    const node = document.createElement (tag); if (className) { node.className = className; } if (text !== undefined) { node.textContent = text; } parent?.appendChild (node); return node;
}
const r1 = v => String (Math.round (v * 10) / 10);
export class MoldedPulpPanel
{
    constructor (host, parent)
    {
        this.host = host; this.root = Element ('div', 'mp_workspace', undefined, parent); this.fields = {};
        for (const type of ['keydown', 'keyup']) { this.root.addEventListener (type, event => { if (event.target.closest?.('input, select, textarea, button')) { event.stopPropagation (); } }); }
        const top = Element ('div', 'mp_intro', undefined, this.root); Element ('span', 'mp_kicker', 'MOLDED PULP TRAYS', top); Element ('span', 'mp_version', 'v' + MoldedPulpVersion, top);

        const products = this.Section ('1 · Products');
        this.productText = Element ('p', 'mp_readout', '', products);
        Element ('p', 'mp_help', 'Select the products (or a group). The first selected object is the primary product; the sheet is placed directly under the group.', products);
        this.senseButton = this.Button (products, 'Sense selection', () => this.host.sense (), 'mp_primary');

        const types = this.Section ('2 · Pulp type');
        this.typeCards = Element ('div', 'mp_type_cards', undefined, types);
        for (const [id, type] of Object.entries (PulpTypes)) {
            const card = Element ('button', 'mp_type_card', undefined, this.typeCards); card.type = 'button'; card.dataset.type = id;
            Element ('strong', null, type.short, card); Element ('small', null, type.rangeMm.join ('–') + ' mm · ' + type.draftDeg + '° draft', card); card.title = type.name + '\n' + type.surface + '\n' + type.use;
            card.addEventListener ('click', () => this.Change ({ pulpType : id }));
        }

        const sheet = this.Section ('3 · Sheet');
        const row = Element ('div', 'mp_row', undefined, sheet);
        this.Field (row, 'thicknessMm', 'Pulp thickness', PulpLimits.thicknessMm, 0.1);
        this.Field (row, 'extraLengthMm', 'Additional length', PulpLimits.extraMm, 1);
        this.Field (row, 'extraWidthMm', 'Additional width', PulpLimits.extraMm, 1);
        this.thicknessHint = Element ('p', 'mp_help', '', sheet);
        this.sheetText = Element ('p', 'mp_readout', '', sheet);
        this.sheetButton = this.Button (sheet, 'Generate sheet', () => this.host.generateSheet (), 'mp_primary');

        const form = this.Section ('4 · Forming');
        const depthRow = Element ('div', 'mp_depth_row', undefined, form);
        this.Field (depthRow, 'formDepthMm', 'Form depth', PulpLimits.formDepthMm, 1, false);
        this.depthButton = this.Button (depthRow, 'Form depth', async () => { const result = await this.host.setFormDepth (this.Read ('formDepthMm')); this.fields.formDepthMm.dirty = false; return result; });
        const formRow = Element ('div', 'mp_row', undefined, form);
        this.Field (formRow, 'clearanceMm', 'Clearance', PulpLimits.clearanceMm, 0.1);
        this.Field (formRow, 'draftDeg', 'Draft', PulpLimits.draftDeg, 0.5, true, '°');
        this.drawing = Element ('div', 'mp_drawing', undefined, form); this.drawing.setAttribute ('aria-hidden', 'true');
        this.trayButton = this.Button (form, 'Form tray', () => this.host.formTray (), 'mp_primary');

        const results = this.Section ('Review');
        this.resultText = Element ('p', 'mp_readout', '', results);
        this.checks = Element ('ul', 'mp_checks', undefined, results);
        const footer = Element ('div', 'mp_footer', undefined, this.root);
        this.resetButton = this.Button (footer, 'Reset draft', () => this.host.reset ());
        this.status = Element ('p', 'mp_status', '', this.root); this.status.setAttribute ('role', 'status');
        this.Refresh ();
    }
    Section (title) { const section = Element ('section', 'mp_section', undefined, this.root); Element ('h3', null, title, section); return section; }
    Button (parent, text, action, className = '')
    {
        const button = Element ('button', 'mp_button ' + className, text, parent); button.type = 'button';
        button.addEventListener ('click', async () => {
            this.status.textContent = ''; this.busyText = text + '…'; this.Refresh ();
            try { const result = await action (); this.status.textContent = result?.message || ''; }
            catch (error) { this.status.textContent = error.message; }
            finally { this.busyText = null; this.Refresh (); }
        });
        return button;
    }
    Factor () { return this.host.units () === 'standard' ? 25.4 : 1; }
    Unit (angle) { return angle ? '°' : this.Factor () === 1 ? 'mm' : 'in'; }
    Field (parent, key, label, limits, step, change = true, unit = null)
    {
        const wrap = Element ('label', 'mp_field', label, parent), box = Element ('span', 'mp_input_wrap', undefined, wrap), input = Element ('input', null, undefined, box);
        input.type = 'number'; input.step = String (step); input.min = String (limits[0]); input.max = String (limits[1]); input.setAttribute ('aria-label', label);
        const suffix = Element ('span', 'mp_unit', '', box), field = { input, suffix, angle : unit === '°', dirty : false }; this.fields[key] = field;
        // A typed value stays in place until it is committed (change event or its action button), even if a refresh runs first.
        input.addEventListener ('input', () => { field.dirty = true; });
        if (change) { input.addEventListener ('change', () => { field.dirty = false; if (Number.isFinite (input.valueAsNumber)) { this.Change ({ [key] : this.Read (key) }); } }); }
        input.addEventListener ('keydown', event => { if (event.key === 'Enter') { input.dispatchEvent (new Event ('change')); if (key === 'formDepthMm') { this.depthButton.click (); } } });
    }
    Read (key) { const f = this.fields[key]; return f.angle ? f.input.valueAsNumber : f.input.valueAsNumber * this.Factor (); }
    Change (changes)
    {
        try { this.host.configure (changes); this.status.textContent = ''; }
        catch (error) { this.status.textContent = error.message; }
        this.Refresh ();
    }
    Drawing (state)
    {
        const d = state.draft, footprint = state.sensed?.footprint, height = footprint?.heightMm || Math.max (60, d.formDepthMm * 2), length = footprint ? footprint.lengthMm + d.extraLengthMm : 200;
        const scale = Math.min (180 / length, 90 / (height + d.thicknessMm + 4)), w = length * scale, x = 110 - w / 2, base = 112, depth = Math.min (height, d.formDepthMm) * scale, t = Math.max (1.2, d.thicknessMm * scale);
        const product = footprint ? `<rect x="${110 - footprint.lengthMm * scale / 2}" y="${base - height * scale}" width="${footprint.lengthMm * scale}" height="${height * scale}" rx="2" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-opacity=".45" stroke-dasharray="3 2"/>` : '';
        const run = d.draftDeg > 0 ? depth * Math.tan (d.draftDeg * Math.PI / 180) : 0, px = footprint ? footprint.lengthMm * scale / 2 + d.clearanceMm * scale : w / 3;
        const formed = state.stage === 'tray' ? `M${x} ${base} L${x + Math.min (run, w / 4)} ${base - depth} L${110 - px - run} ${base - depth} L${110 - px} ${base} L${110 + px} ${base} L${110 + px + run} ${base - depth} L${x + w - Math.min (run, w / 4)} ${base - depth} L${x + w} ${base}` : `M${x} ${base} H${x + w}`;
        this.drawing.innerHTML = `<svg viewBox="0 0 220 130" fill="none" stroke-linejoin="round">${product}<path d="${formed}" stroke="var(--mp-accent)" stroke-width="${t}"/><path d="M${x - 4} ${base - depth} H${x + w + 4}" stroke="currentColor" stroke-opacity=".5" stroke-dasharray="4 3"/><text x="${x + w + 6}" y="${base - depth + 3}" font-size="8" fill="currentColor">${r1 (d.formDepthMm / this.Factor ())} ${this.Unit ()}</text><text x="${x}" y="${base + 12}" font-size="8" fill="currentColor" fill-opacity=".6">${state.stage === 'tray' ? 'Formed tray (section)' : 'Flat sheet (section)'}</text></svg>`;
    }
    Refresh ()
    {
        let state; try { state = this.host.inspect (); } catch (error) { this.status.textContent = error.message; return; }
        const d = state.draft, f = this.Factor (), u = this.Unit (), type = PulpTypes[d.pulpType], blocked = this.host.blocked () || Boolean (this.busyText);
        for (const card of this.typeCards.children) { card.setAttribute ('aria-pressed', String (card.dataset.type === d.pulpType)); card.disabled = blocked; }
        for (const [key, field] of Object.entries (this.fields)) {
            if (document.activeElement !== field.input && !field.dirty) { field.input.value = r1 (field.angle ? d[key] : d[key] / f); }
            field.suffix.textContent = field.angle ? '°' : u; field.input.disabled = blocked;
        }
        this.thicknessHint.textContent = `${type.name}: ${r1 (type.rangeMm[0] / f)}–${r1 (type.rangeMm[1] / f)} ${u} reported; tolerance about ±${r1 (type.toleranceMm / f)} ${u}. ${type.surface}.`;
        const fp = state.sensed?.footprint;
        this.productText.textContent = state.sensed ? `${state.sensed.count} product${state.sensed.count === 1 ? '' : 's'} sensed${state.sensed.primaryName ? ' · primary: ' + state.sensed.primaryName : ''} · ${r1 (fp.lengthMm / f)} × ${r1 (fp.widthMm / f)} × ${r1 (fp.heightMm / f)} ${u} (L × W × H)` : 'No products sensed yet.';
        this.sheetText.textContent = fp ? `Sheet: ${r1 ((fp.lengthMm + d.extraLengthMm) / f)} × ${r1 ((fp.widthMm + d.extraWidthMm) / f)} × ${r1 (d.thicknessMm / f)} ${u} (exact footprint + ${r1 (d.extraLengthMm / f)} × ${r1 (d.extraWidthMm / f)} ${u}).` : 'Sense products to size the sheet.';
        const m = state.result?.metrics;
        this.resultText.textContent = m ? (state.stage === 'tray' ? `Tray ${r1 (m.lengthMm / f)} × ${r1 (m.widthMm / f)} ${u}, depth ${r1 (m.achievedDepthMm / f)} ${u}, ${m.pocketCount} pocket${m.pocketCount === 1 ? '' : 's'}${m.minRibMm !== null ? ', narrowest rib ' + r1 (m.minRibMm / f) + ' ' + u : ''}. Estimated ${r1 (m.estimatedMassG)} g (indicative density).` : `Sheet ${r1 (m.lengthMm / f)} × ${r1 (m.widthMm / f)} ${u}. Estimated ${r1 (m.estimatedMassG)} g (indicative density).`) : 'Generate a sheet, then form the tray.';
        this.checks.replaceChildren (...(state.result?.checks || []).map (c => { const li = Element ('li', 'mp_check mp_' + c.severity); li.textContent = c.message; li.title = c.id + ' · ' + c.basis; return li; }));
        this.senseButton.disabled = blocked; this.sheetButton.disabled = blocked || !state.sensed; this.depthButton.disabled = blocked; this.trayButton.disabled = blocked || !state.sensed; this.resetButton.disabled = blocked;
        if (this.busyText) { this.status.textContent = this.busyText; } else if (state.unavailableReason && !this.status.textContent) { this.status.textContent = state.unavailableReason; }
        this.Drawing (state);
    }
}
