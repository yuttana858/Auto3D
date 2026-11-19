import { MoldedPulpVersion, PulpTypes, PulpLimits, PulpDetail, PulpClamshellModes } from './state.js';
// Neutral Molded Pulp panel. It owns its controls and layout and reaches the host only through callbacks:
// inspect, configure (changes, { live }), sense, generateSheet, setFormDepth, formTray, reset, units, blocked.
// Number fields report every keystroke as a live change (the host debounces and updates the current sheet or tray in the
// viewer); selects and toggles apply at once. No Auto3D imports.
function Element (tag, className, text, parent)
{
    const node = document.createElement (tag); if (className) { node.className = className; } if (text !== undefined) { node.textContent = text; } parent?.appendChild (node); return node;
}
const r1 = v => String (Math.round (v * 10) / 10);
export class MoldedPulpPanel
{
    constructor (host, parent)
    {
        this.host = host; this.root = Element ('div', 'mp_workspace', undefined, parent); this.fields = {}; this.selects = {};
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
            card.addEventListener ('click', () => this.Change ({ pulpType : id }, true));
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

        const structure = this.Section ('5 · Ribs and denest lugs');
        const ribRow = Element ('div', 'mp_row', undefined, structure);
        this.Select (ribRow, 'ribs', 'Ribs', { auto : 'Auto', off : 'Off' });
        this.Field (ribRow, 'ribDepthMm', 'Rib depth', PulpLimits.ribDepthMm, 0.5, true, null, true);
        this.Field (ribRow, 'ribWidthMm', 'Rib width', PulpLimits.ribWidthMm, 0.5, true, null, true);
        const lugRow = Element ('div', 'mp_row', undefined, structure);
        this.Select (lugRow, 'lugs', 'Denest lugs', { auto : 'Auto', off : 'Off' });
        this.Field (lugRow, 'lugStandoffMm', 'Lug stand-off', PulpLimits.lugStandoffMm, 0.1);
        Element ('p', 'mp_help', 'Leave rib depth and width empty for the knowledge-base defaults. Placement follows the rule base below (8 mm land, ≤100 mm panels, 3–4 symmetric lugs).', structure);

        const shell = this.Section ('6 · Clamshell');
        const shellRow = Element ('div', 'mp_row', undefined, shell);
        this.Select (shellRow, 'clamshell', 'Encapsulation', PulpClamshellModes);
        this.Field (shellRow, 'partingFraction', 'Parting plane', [10, 90], 1, true, '%');
        const hinge = Element ('label', 'mp_check_field', undefined, shell); this.hinge = Element ('input', null, undefined, hinge); this.hinge.type = 'checkbox'; Element ('span', null, 'Living hinge on the long flange edge', hinge);
        this.hinge.addEventListener ('change', () => this.Change ({ hinge : this.hinge.checked }, true));

        const detail = this.Section ('7 · Mesh detail');
        const detailRow = Element ('div', 'mp_row', undefined, detail);
        this.Select (detailRow, 'detail', 'Detail', Object.fromEntries (Object.entries (PulpDetail).map (([id, d]) => [id, `${d.name} · ${d.cellMm} mm`])));
        Element ('p', 'mp_help', 'Fine and Ultra form in the background: a draft preview appears first and is replaced when the detailed shape is ready. The viewer stays usable meanwhile.', detail);
        this.progress = Element ('progress', 'mp_progress', undefined, detail); this.progress.max = 1; this.progress.hidden = true;
        this.trayButton = this.Button (this.root, 'Form tray', () => this.host.formTray (), 'mp_primary mp_form_tray');

        const results = this.Section ('Review');
        this.resultText = Element ('p', 'mp_readout', '', results);
        this.checks = Element ('ul', 'mp_checks', undefined, results);
        this.why = Element ('details', 'mp_why', undefined, results); Element ('summary', null, 'Why: rule base decisions', this.why); this.trace = Element ('ol', 'mp_trace', undefined, this.why);
        // Output: the review mesh above stays the internal model; tooling gets a closed B-rep STEP (mm) built on it, and
        // customers a GLB with the pulp material (m).
        const output = this.Section ('Output');
        Element ('p', 'mp_help', 'STEP: a closed solid per shell in millimetres, for tooling and CAD. GLB: the formed shape with its pulp material, for customer review.', output);
        const outputRow = Element ('div', 'mp_row', undefined, output);
        this.stepButton = this.Button (outputRow, 'Export STEP', () => this.host.exportOutput ('step'));
        this.glbButton = this.Button (outputRow, 'Export GLB', () => this.host.exportOutput ('glb'));
        this.surfaceButton = this.Button (output, 'Export smooth surface (STEP)', () => this.host.exportOutput ('surface-step'));
        // Phase 2 (experimental): smooth lofted walls, checked against the review surface. The outer skirt is optional.
        const skirt = Element ('label', 'mp_check_field', undefined, output); this.skirtWall = Element ('input', null, undefined, skirt); this.skirtWall.type = 'checkbox';
        Element ('span', null, 'Outer skirt wall (experimental)', skirt); this.skirtWall.setAttribute ('aria-label', 'Outer skirt wall (experimental)');
        this.skirtWall.addEventListener ('change', () => this.Change ({ skirtWall : this.skirtWall.checked }));
        this.loftButton = this.Button (output, 'Check smooth walls', () => this.host.checkLoft ());
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
    Select (parent, key, label, options)
    {
        const wrap = Element ('label', 'mp_field', label, parent), select = Element ('select', 'mp_select', undefined, wrap); select.setAttribute ('aria-label', label);
        for (const [value, text] of Object.entries (options)) { const option = Element ('option', null, text, select); option.value = value; }
        select.addEventListener ('change', () => this.Change ({ [key] : select.value }, true)); this.selects[key] = select;
    }
    Factor () { return this.host.units () === 'standard' ? 25.4 : 1; }
    Unit (angle) { return angle ? '°' : this.Factor () === 1 ? 'mm' : 'in'; }
    // Number field. live: every keystroke is sent as a live change; nullable: empty means automatic (null).
    Field (parent, key, label, limits, step, live = true, unit = null, nullable = false)
    {
        const wrap = Element ('label', 'mp_field', label, parent), box = Element ('span', 'mp_input_wrap', undefined, wrap), input = Element ('input', null, undefined, box);
        input.type = 'number'; input.step = String (step); input.min = String (limits[0]); input.max = String (limits[1]); input.setAttribute ('aria-label', label); if (nullable) { input.placeholder = 'auto'; }
        const suffix = Element ('span', 'mp_unit', '', box), field = { input, suffix, unit, dirty : false, nullable }; this.fields[key] = field;
        // A typed value stays in place until it is committed (change event or its action button), even if a refresh runs first.
        input.addEventListener ('input', () => {
            field.dirty = true;
            if (live && (Number.isFinite (input.valueAsNumber) || nullable && input.value === '')) { this.Change ({ [key] : this.Read (key) }, true, true); }
        });
        // Fields without live updates (form depth) stay dirty until their action button commits them.
        input.addEventListener ('change', () => { if (!live) { return; } field.dirty = false; if (Number.isFinite (input.valueAsNumber) || nullable && input.value === '') { this.Change ({ [key] : this.Read (key) }, true); } });
        input.addEventListener ('keydown', event => { if (event.key === 'Enter') { input.dispatchEvent (new Event ('change')); if (key === 'formDepthMm') { this.depthButton.click (); } } });
    }
    Read (key)
    {
        const f = this.fields[key]; if (f.nullable && f.input.value === '') { return null; }
        return f.unit === '%' ? f.input.valueAsNumber / 100 : f.unit === '°' ? f.input.valueAsNumber : f.input.valueAsNumber * this.Factor ();
    }
    // typing: true while the user is still typing (the host shows the change live but keeps the field's text as typed).
    Change (changes, live = false, typing = false)
    {
        try { this.host.configure (changes, { live }); if (!typing) { this.status.textContent = ''; } }
        catch (error) { this.status.textContent = error.message; }
        if (!typing) { this.Refresh (); }
    }
    Drawing (state)
    {
        const d = state.draft, footprint = state.sensed?.footprint, height = footprint?.heightMm || Math.max (60, d.formDepthMm * 2), length = footprint ? footprint.lengthMm + d.extraLengthMm : 200;
        const scale = Math.min (180 / length, 90 / (height + d.thicknessMm + 4)), w = length * scale, x = 110 - w / 2, base = 112, depth = Math.min (height, d.formDepthMm) * scale, t = Math.max (1.2, d.thicknessMm * scale);
        const product = footprint ? `<rect x="${110 - footprint.lengthMm * scale / 2}" y="${base - height * scale}" width="${footprint.lengthMm * scale}" height="${height * scale}" rx="2" fill="currentColor" fill-opacity=".08" stroke="currentColor" stroke-opacity=".45" stroke-dasharray="3 2"/>` : '';
        const run = d.draftDeg > 0 ? depth * Math.tan (d.draftDeg * Math.PI / 180) : 0, px = footprint ? footprint.lengthMm * scale / 2 + d.clearanceMm * scale : w / 3;
        const formed = state.stage === 'tray' ? `M${x} ${base} L${x + Math.min (run, w / 4)} ${base - depth} L${110 - px - run} ${base - depth} L${110 - px} ${base} L${110 + px} ${base} L${110 + px + run} ${base - depth} L${x + w - Math.min (run, w / 4)} ${base - depth} L${x + w} ${base}` : `M${x} ${base} H${x + w}`;
        const lid = d.clamshell === 'top-bottom' && footprint ? `<path d="M${x} ${base - height * scale} H${x + w}" stroke="var(--mp-accent)" stroke-width="${t}" stroke-dasharray="5 3"/>` : '';
        this.drawing.innerHTML = `<svg viewBox="0 0 220 130" fill="none" stroke-linejoin="round">${product}${lid}<path d="${formed}" stroke="var(--mp-accent)" stroke-width="${t}"/><path d="M${x - 4} ${base - depth} H${x + w + 4}" stroke="currentColor" stroke-opacity=".5" stroke-dasharray="4 3"/><text x="${x + w + 6}" y="${base - depth + 3}" font-size="8" fill="currentColor">${r1 (d.formDepthMm / this.Factor ())} ${this.Unit ()}</text><text x="${x}" y="${base + 12}" font-size="8" fill="currentColor" fill-opacity=".6">${state.stage === 'tray' ? 'Formed tray (section)' : 'Flat sheet (section)'}</text></svg>`;
    }
    Refresh ()
    {
        let state; try { state = this.host.inspect (); } catch (error) { this.status.textContent = error.message; return; }
        const d = state.draft, f = this.Factor (), u = this.Unit (), type = PulpTypes[d.pulpType], blocked = this.host.blocked () || Boolean (this.busyText);
        for (const card of this.typeCards.children) { card.setAttribute ('aria-pressed', String (card.dataset.type === d.pulpType)); card.disabled = blocked; }
        for (const [key, field] of Object.entries (this.fields)) {
            if (document.activeElement !== field.input && !field.dirty) { const v = d[key]; field.input.value = v === null ? '' : r1 (field.unit === '%' ? v * 100 : field.unit === '°' ? v : v / f); }
            field.suffix.textContent = field.unit || u; field.input.disabled = blocked;
        }
        for (const [key, select] of Object.entries (this.selects)) { select.value = d[key]; select.disabled = blocked; }
        this.hinge.checked = d.hinge; this.hinge.disabled = blocked || d.clamshell === 'none'; this.skirtWall.checked = d.skirtWall === true; this.skirtWall.disabled = blocked;
        this.fields.partingFraction.input.disabled = blocked || d.clamshell === 'none';
        for (const key of ['ribDepthMm', 'ribWidthMm']) { this.fields[key].input.disabled = blocked || d.ribs === 'off'; }
        this.fields.lugStandoffMm.input.disabled = blocked || d.lugs === 'off';
        this.thicknessHint.textContent = `${type.name}: ${r1 (type.rangeMm[0] / f)}–${r1 (type.rangeMm[1] / f)} ${u} reported; tolerance about ±${r1 (type.toleranceMm / f)} ${u}. ${type.surface}.`;
        const fp = state.sensed?.footprint;
        this.productText.textContent = state.sensed ? `${state.sensed.count} product${state.sensed.count === 1 ? '' : 's'} sensed${state.sensed.primaryName ? ' · primary: ' + state.sensed.primaryName : ''} · ${r1 (fp.lengthMm / f)} × ${r1 (fp.widthMm / f)} × ${r1 (fp.heightMm / f)} ${u} (L × W × H)` : 'No products sensed yet.';
        this.sheetText.textContent = fp ? `Sheet: ${r1 ((fp.lengthMm + d.extraLengthMm) / f)} × ${r1 ((fp.widthMm + d.extraWidthMm) / f)} × ${r1 (d.thicknessMm / f)} ${u} (exact footprint + ${r1 (d.extraLengthMm / f)} × ${r1 (d.extraWidthMm / f)} ${u}). Changes show live in the viewer.` : 'Sense products to size the sheet.';
        const m = state.result?.metrics, refining = state.refining;
        this.progress.hidden = !refining; if (refining) { this.progress.value = refining.progress || 0; }
        const detail = m?.detail ? ` · ${PulpDetail[m.detail]?.name || m.detail} detail, ${(m.triangles || 0).toLocaleString ('en-US')} triangles` : '';
        this.resultText.textContent = m ? (state.result.stage === 'tray' ? `${state.result.clamshell && state.result.clamshell !== 'none' ? 'Clamshell' : 'Tray'} ${r1 (m.lengthMm / f)} × ${r1 (m.widthMm / f)} ${u}, depth ${r1 (m.achievedDepthMm / f)} ${u}, ${m.pocketCount} pocket${m.pocketCount === 1 ? '' : 's'}${m.ribCount ? `, ${m.ribCount} rib${m.ribCount === 1 ? '' : 's'}` : ''}${m.lugCount ? `, ${m.lugCount} lugs` : ''}${m.nestingPitchMm ? `, nesting pitch ≈ ${r1 (m.nestingPitchMm / f)} ${u}` : ''}. Estimated ${r1 (m.estimatedMassG)} g (indicative density)${detail}.` : `Sheet ${r1 (m.lengthMm / f)} × ${r1 (m.widthMm / f)} ${u}. Estimated ${r1 (m.estimatedMassG)} g (indicative density).`) : 'Generate a sheet, then form the tray.';
        this.checks.replaceChildren (...(state.result?.checks || []).map (c => { const li = Element ('li', 'mp_check mp_' + c.severity); li.textContent = c.message; li.title = c.id + ' · ' + c.basis; return li; }));
        const trace = state.result?.trace || []; this.why.hidden = !trace.length;
        this.trace.replaceChildren (...trace.map (t => { const li = Element ('li', 'mp_trace_item'); Element ('strong', null, t.rule + ' · ' + t.title, li); Element ('span', null, t.decision, li); li.title = t.basis; return li; }));
        const acting = blocked || state.generating; this.senseButton.disabled = acting; this.sheetButton.disabled = acting || !state.sensed; this.depthButton.disabled = acting; this.trayButton.disabled = acting || !state.sensed; this.surfaceButton.disabled = acting || Boolean (refining) || state.stage !== 'tray' || !state.pulpObjectId || !this.host.exportOutput; this.stepButton.disabled = this.glbButton.disabled = acting || Boolean (refining) || !state.pulpObjectId || !this.host.exportOutput; this.loftButton.disabled = acting || Boolean (refining) || !state.pulpObjectId || !this.host.checkLoft; this.resetButton.disabled = acting;
        if (this.busyText) { this.status.textContent = this.busyText; } else if (refining) { this.status.textContent = `Refining ${PulpDetail[refining.detail]?.name || ''} shape · ${refining.phase || 'starting'} ${Math.round ((refining.progress || 0) * 100)}%`; } else if (state.unavailableReason && !this.status.textContent) { this.status.textContent = state.unavailableReason; }
        this.Drawing (state);
    }
}
