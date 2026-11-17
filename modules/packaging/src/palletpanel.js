import { DefaultPalletMaxHeightMm, PalletColors, PalletPresets } from './palletplan.js';

function Element (tag, parent, text, className)
{
    const node = document.createElement (tag); if (text !== undefined) { node.textContent = text; } if (className) { node.className = className; } parent.appendChild (node); return node;
}
// Neutral Auto pallet controls. The host measures the selected box and edits the scene.
export class AutoPalletPanel
{
    constructor (host, parent)
    {
        this.host = host; this.pending = false; this.maxHeightMm = DefaultPalletMaxHeightMm; this.color = 'blue';
        this.root = Element ('section', parent, undefined, 'packaging_auto_pallet'); this.root.setAttribute ('aria-label', 'Auto pallet');
        Element ('h3', this.root, 'Auto pallet');
        const pallet = PalletPresets['gma-40x48'];
        Element ('p', this.root, 'Column-stack the selected box on a ' + pallet.name + ' (5 in high). Boxes stay upright and may turn 90° within a layer; every layer uses the same pattern, with no overhang.', 'section_hint');
        this.objectName = Element ('strong', this.root);
        this.box = this.Rows ('Selected box · outside size', [['width', 'W'], ['length', 'L'], ['height', 'H']]);
        const options = Element ('div', this.root, undefined, 'packaging_auto_pallet_options');
        const colorLabel = Element ('label', options, 'Pallet'); this.colorSelect = Element ('select', colorLabel); this.colorSelect.setAttribute ('aria-label', 'Pallet colour');
        for (const finish of Object.values (PalletColors)) { const option = Element ('option', this.colorSelect, finish.name); option.value = finish.id; }
        this.colorSelect.addEventListener ('change', () => { this.color = this.colorSelect.value; });
        const heightLabel = Element ('label', options, 'Max overall height'); this.heightInput = Element ('input', heightLabel); this.heightInput.setAttribute ('aria-label', 'Max overall height'); this.heightInput.type = 'number'; this.heightInput.min = '0'; this.heightInput.step = 'any';
        this.heightUnit = Element ('span', heightLabel, '', 'packaging_auto_pallet_unit');
        this.heightInput.addEventListener ('change', () => {
            const value = this.heightInput.valueAsNumber * this.host.factor ();
            if (Number.isFinite (value) && value > 0) { this.maxHeightMm = value; } this.Refresh ();
        });
        this.result = this.Rows ('Pallet load', [['perLayer', 'Per layer'], ['layers', 'Layers'], ['total', 'Boxes'], ['height', 'Overall height']]);
        this.pattern = Element ('p', this.root, '', 'section_hint');
        this.create = Element ('button', this.root, 'Auto pallet', 'packaging_auto_create'); this.create.type = 'button'; this.create.addEventListener ('click', () => this.Create ());
        this.reason = Element ('p', this.root, '', 'section_hint');
        this.status = Element ('p', this.root, '', 'section_hint'); this.status.setAttribute ('role', 'status'); this.status.setAttribute ('aria-live', 'polite');
        this.Refresh ();
    }
    Rows (title, keys)
    {
        const section = Element ('section', this.root, undefined, 'packaging_auto_size'); section.setAttribute ('aria-label', title); Element ('h4', section, title);
        const row = Element ('dl', section); const fields = new Map ();
        for (const [key, label] of keys) { const cell = Element ('div', row); Element ('dt', cell, label); fields.set (key, Element ('dd', cell, '—')); }
        return { section, fields };
    }
    Options () { return { maxHeightMm : this.maxHeightMm, color : this.color }; }
    Refresh ()
    {
        const factor = this.host.factor (), unit = Math.abs (factor - 25.4) < 1e-9 ? 'in' : 'mm', show = mm => Number.isFinite (mm) ? Number ((mm / factor).toFixed (unit === 'in' ? 2 : 1)) + ' ' + unit : '—';
        if (document.activeElement !== this.heightInput) { this.heightInput.value = String (Number ((this.maxHeightMm / factor).toFixed (unit === 'in' ? 2 : 1))); }
        this.heightUnit.textContent = unit; this.colorSelect.value = this.color;
        let data;
        try { data = this.host.palletInspect?.(this.Options ()) || { available : false, reason : 'Select a box in Auto3D to use Auto pallet.' }; }
        catch (error) { data = { available : false, reason : error.message }; }
        this.state = data; this.objectName.textContent = data.objectName || 'No box selected';
        for (const [key, field] of this.box.fields) { field.textContent = show (data.boxMm?.[key]); }
        const plan = data.plan;
        this.result.fields.get ('perLayer').textContent = plan ? String (plan.perLayer) : '—';
        this.result.fields.get ('layers').textContent = plan ? String (plan.layers) : '—';
        this.result.fields.get ('total').textContent = plan ? String (plan.total) : '—';
        this.result.fields.get ('height').textContent = plan ? show (plan.overallHeightMm) : '—';
        this.pattern.textContent = plan ? 'Pattern: ' + plan.pattern + ' · ' + Math.round (plan.footprintUse * 100) + '% of the deck covered · load ' + show (plan.loadMm.width) + ' × ' + show (plan.loadMm.length) : '';
        this.reason.textContent = data.reason || '';
        this.create.disabled = this.pending || this.host.blocked () || !data.available || !plan || !this.host.autoPallet;
    }
    async Create ()
    {
        if (this.pending || this.create.disabled) { return; }
        this.pending = true; this.status.textContent = 'Building the pallet load…'; this.Refresh ();
        try {
            const action = async () => {
                try { const result = await this.host.autoPallet (this.Options ()); this.status.textContent = result?.message || 'Auto pallet complete.'; return result; }
                catch (error) { this.status.textContent = error.message; throw error; }
            };
            await (this.host.run ? this.host.run (action) : action ());
        } catch (error) { this.status.textContent = error.message; }
        finally { this.pending = false; this.Refresh (); }
    }
}
