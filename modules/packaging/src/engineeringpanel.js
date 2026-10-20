const node = (tag, parent, text, cls) => { const e = document.createElement (tag); if (text !== undefined) { e.textContent = text; } if (cls) { e.className = cls; } parent.appendChild (e); return e; };
const numberText = value => String (Number (value.toFixed (6)));
export class EngineeringPanel
{
    constructor (host, parent)
    {
        this.host = host; this.root = node ('section', parent, undefined, 'packaging_engineering'); this.root.setAttribute ('aria-label', 'Measurement layer'); this.Refresh ();
    }
    Refresh ()
    {
        const report = this.host.inspect (); const { state, material } = report; const factor = this.host.factor?.() || 1; const unit = factor === 25.4 ? 'in' : 'mm';
        this.root.replaceChildren (); node ('h3', this.root, 'Measurement layer'); node ('p', this.root, 'CAD coordinates are authoritative. The 3D crease appearance never changes these numbers.', 'section_hint');
        const form = (parent = this.root) => { const f = node ('form', parent); f.addEventListener ('submit', e => e.preventDefault ()); return f; };
        const input = (parent, title, value, type = 'number') => { const l = node ('label', parent, title); const i = node ('input', l); i.type = type; i.setAttribute ('aria-label', title); i.value = String (value); if (type === 'number') { i.step = 'any'; } return i; };
        const select = (parent, title, entries, value) => { const l = node ('label', parent, title); const s = node ('select', l); s.setAttribute ('aria-label', title); for (const [id, text] of entries) { s.add (new Option (text, id)); } s.value = value; return s; };
        const action = (parent, title, fn) => { const b = node ('button', parent, title); b.type = 'button'; b.disabled = this.host.blocked?.() || false; b.addEventListener ('click', () => this.host.run (async () => { await fn (); this.Refresh (); })); return b; };
        const visibility = node ('label', this.root, 'Show measurements on CAD'); const visible = node ('input', visibility); visible.type = 'checkbox'; visible.checked = state.visible; visible.setAttribute ('aria-label', 'Show measurement layer'); visible.disabled = this.host.blocked?.() || false; visible.addEventListener ('change', () => this.host.run (async () => { await this.host.update ({ visible : visible.checked }); this.Refresh (); }));
        const materials = node ('details', this.root); materials.open = true; node ('summary', materials, 'Material database · ' + material.name);
        const active = select (materials, 'Active board record', state.materials.map (m => [m.id, m.name]), material.id); active.disabled = this.host.blocked?.() || false; active.addEventListener ('change', () => this.host.run (async () => { await this.host.update ({ activateMaterialId : active.value }); this.Refresh (); }));
        node ('p', materials, 'Records travel with this design and its saved session. Paper calipers describe the components; measured board caliper controls compensation.', 'section_hint');
        const fields = {}; const materialForm = form (materials); const grid = node ('div', materialForm, undefined, 'packaging_engineering_grid');
        for (const [key, title] of [['name', 'Board name'], ['flute', 'Flute / construction'], ['provenance', 'Calibration source / process'], ['outsideLinerGrade', 'Outside liner grade / fibre'], ['insideLinerGrade', 'Inside liner grade / fibre'], ['mediumGrade', 'Medium grade / fibre'], ['scoreProcess', 'Score tooling / process'], ['conditioning', 'Moisture / conditioning']]) { fields[key] = input (grid, title, material[key], 'text'); fields[key].maxLength = 120; }
        for (const [key, title] of [['caliperMm', 'Measured board caliper'], ['caliperToleranceMm', 'Caliper tolerance ±'], ['outsideLinerMm', 'Outside liner caliper'], ['mediumPaperMm', 'Medium paper caliper'], ['insideLinerMm', 'Inside liner caliper'], ['flutePitchMm', 'Flute pitch'], ['scoreWidthMm', 'Visual crease width'], ['scoreToleranceMm', 'Default score tolerance ±'], ['processToleranceMm', 'Residual process tolerance ±']]) { fields[key] = input (grid, title + ' (' + unit + ')', material[key] / factor); fields[key].min = '0'; }
        for (const [key, title] of [['outsideLinerGsm', 'Outside liner (g/m²; 0 unknown)'], ['insideLinerGsm', 'Inside liner (g/m²; 0 unknown)'], ['mediumGsm', 'Medium (g/m²; 0 unknown)'], ['fluteDirectionDegrees', 'Flute direction (° from sheet X)']]) { fields[key] = input (grid, title, material[key]); fields[key].dataset.scalar = 'true'; }
        const factors = {};
        for (const [key, title] of [['insideFactors', 'Inside loss'], ['outsideFactors', 'Outside gain']]) { factors[key] = ['L', 'W', 'H'].map ((axis, i) => input (grid, title + ' ' + axis + ' (× caliper)', material[key][i])); }
        const calibrated = node ('label', materialForm, 'Converter-calibrated values'); const check = node ('input', calibrated); check.type = 'checkbox'; check.checked = material.calibrated; check.setAttribute ('aria-label', 'Converter-calibrated values');
        action (materialForm, 'Apply material specifications', () => { const patch = {}; for (const [key, field] of Object.entries (fields)) { patch[key] = field.type === 'number' ? field.valueAsNumber * (field.dataset.scalar ? 1 : factor) : field.value; } for (const [key, list] of Object.entries (factors)) { patch[key] = list.map (f => f.valueAsNumber); } patch.calibrated = check.checked; return this.host.update ({ material : patch }); });
        const duplicate = input (materials, 'New material record ID', '', 'text'); action (materials, 'Duplicate board record', () => this.host.update ({ duplicateMaterialId : duplicate.value.trim () }));
        node ('p', this.root, report.physicalQualification + '. Zero outside gain means no calibrated exterior correction has been entered.', 'section_hint');
        for (const d of report.dimensions) {
            const card = form (); card.className = 'packaging_dimension_card'; card.dataset.dimension = d.id;
            node ('strong', card, d.id + ' · ' + numberText (d.valueMm / factor) + ' ' + unit);
            const grid = node ('div', card, undefined, 'packaging_engineering_grid');
            const mode = select (grid, d.id + ' mode', [['auto', 'Auto · measure CAD'], ['parametric', 'Parametric · hold target'], ['manual', 'Manual · drive once']], d.mode);
            const basis = select (grid, d.id + ' basis', [['score', 'Score / CAD distance'], ['inside', 'Inside dimension'], ['outside', 'Outside dimension']], d.basis);
            const value = input (grid, d.id + ' dimension (' + unit + ')', (d.mode === 'auto' ? d.valueMm : d.targetMm ?? d.valueMm) / factor); value.disabled = d.mode === 'auto'; value.min = '0.001'; mode.addEventListener ('change', () => { value.disabled = mode.value === 'auto'; });
            const tol = input (grid, d.id + ' score tolerance ± (' + unit + ')', (state.dimensions.find (s => s.id === d.id).toleranceMm ?? material.scoreToleranceMm) / factor);
            // Report tolerance is propagated; the editable field is the score component.
            tol.value = numberText ((state.dimensions.find (s => s.id === d.id).toleranceMm ?? material.scoreToleranceMm) / factor); tol.min = '0';
            node ('p', card, d.formula + ' = ' + numberText (d.valueMm / factor) + ' ' + unit + ' · S=' + numberText (d.scoreMm / factor) + ', t=' + numberText (material.caliperMm / factor), 'packaging_formula');
            const range = node ('div', card, undefined, 'packaging_tolerance_band'); range.setAttribute ('role', 'img'); range.setAttribute ('aria-label', 'Worst-case interval ' + d.minimumMm + ' to ' + d.maximumMm + ' mm');
            node ('span', range, numberText (d.minimumMm / factor)); node ('span', range, '← ±' + numberText (d.toleranceMm / factor) + ' ' + unit + ' →'); node ('span', range, numberText (d.maximumMm / factor));
            if (!d.targetMet) { node ('p', card, 'Target differs after a subsequent edit. Apply again or use Parametric to hold it.', 'section_hint'); }
            action (card, 'Apply ' + d.id, () => this.host.update ({ dimension : { id : d.id, mode : mode.value, basis : basis.value, targetMm : mode.value === 'auto' ? null : value.valueAsNumber * factor, toleranceMm : tol.valueAsNumber * factor } }));
        }
        if (!report.dimensions.length) { node ('p', this.root, 'Draw a CAD path to measure it. New profiles initialize measurements from their segments.'); }
        node ('p', this.root, 'Worst-case tolerance = score tolerance + |allowance factor| × caliper tolerance + residual process tolerance. Parametric holds its target as material specifications change. Manual drives CAD once; Auto follows CAD.', 'section_hint');
    }
}
