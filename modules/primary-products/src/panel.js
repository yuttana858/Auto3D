import { PrimaryFamilies, PrimaryProductsVersion } from './state.js';
function Element (tag, className, text, parent)
{
    const node = document.createElement (tag); if (className) { node.className = className; } if (text !== undefined) { node.textContent = text; } parent?.appendChild (node); return node;
}
const icons = {
    pouch : '<path d="M6 3h14l-1 8 1 10H6l1-10Z M6 6h14 M6 18h14"/>',
    bottle : '<path d="M10 2h6v5l3 5v10H7V12l3-5Z M10 5h6 M7 14h12 M7 19h12"/>',
    can : '<path d="M7 4q6-3 12 0v16q-6 3-12 0Z M7 5q6 3 12 0 M7 18q6 3 12 0 M11 3h4"/>'
};
function Icon (family) { return '<svg viewBox="0 0 26 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">' + icons[family] + '</svg>'; }
export class PrimaryProductsPanel
{
    constructor (host, parent)
    {
        this.host = host; this.root = Element ('div', 'pp_workspace', undefined, parent);
        for (const type of ['keydown', 'keyup']) { this.root.addEventListener (type, event => { if (event.target.closest?.('input, select, textarea, button, [contenteditable]')) { event.stopPropagation (); } }); }
        const top = Element ('div', 'pp_intro', undefined, this.root); Element ('span', 'pp_kicker', 'BOTTLES · CANS · POUCHES', top); Element ('span', 'pp_version', 'v' + PrimaryProductsVersion, top);
        this.layout = Element ('div', 'pp_layout', undefined, this.root);
        const catalog = Element ('section', 'pp_catalog', undefined, this.layout); Element ('h3', '', 'Product', catalog);
        const cards = Element ('div', 'pp_product_cards', undefined, catalog); this.cards = new Map ();
        for (const [family, label] of [['bottle', 'Bottle'], ['can', 'Can'], ['pouch', 'Pouch']]) {
            const button = Element ('button', 'pp_product_card', undefined, cards); button.type = 'button'; button.setAttribute ('aria-label', 'Choose ' + label.toLowerCase ()); button.innerHTML = Icon (family); Element ('span', '', label, button); Element ('small', '', PrimaryFamilies[family].name, button); button.addEventListener ('click', () => this.Change ({ family })); this.cards.set (family, button);
        }
        const note = Element ('p', 'pp_catalog_note', 'Start with a familiar shape. Refine its dimensions and surface.', catalog);
        note.setAttribute ('aria-hidden', 'true');
        this.stage = Element ('section', 'pp_stage', undefined, this.layout); this.stage.setAttribute ('aria-label', 'Product profile reference');
        this.profileName = Element ('span', 'pp_profile_name', '', this.stage); this.drawing = Element ('div', 'pp_drawing', undefined, this.stage);
        this.size = Element ('div', 'pp_size', '', this.stage); Element ('span', 'pp_profile_note', 'Illustrative profile', this.stage);
        const controls = Element ('div', 'pp_controls', undefined, this.layout);
        const dimensions = Element ('section', 'pp_section', undefined, controls); Element ('h3', '', 'Dimensions', dimensions); const row = Element ('div', 'pp_dimension_row', undefined, dimensions); this.inputs = new Map ();
        for (const [key, label] of [['heightMm', 'Height'], ['diameterMm', 'Diameter'], ['widthMm', 'Width'], ['depthMm', 'Filled depth']]) {
            const field = Element ('label', 'pp_field', label, row); const wrap = Element ('span', 'pp_input_wrap', undefined, field); const input = Element ('input', '', undefined, wrap); input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', 'Product ' + label.toLowerCase ()); this.inputs.set (key, input); const unit = Element ('span', 'pp_unit', '', wrap); this.inputs.set (key + 'Unit', unit);
            input.addEventListener ('change', () => this.Change ({ [key] : input.valueAsNumber * this.Factor () }));
        }
        const surfaces = Element ('section', 'pp_section', undefined, controls); Element ('h3', '', 'Surface', surfaces);
        const materialLabel = Element ('label', 'pp_field', 'Material', surfaces); this.material = Element ('select', '', undefined, materialLabel); this.material.setAttribute ('aria-label', 'Product material'); this.material.addEventListener ('change', () => this.Change ({ material : this.material.value }));
        const finish = Element ('div', 'pp_surface_row', undefined, surfaces); const colorLabel = Element ('label', 'pp_field', 'Color', finish); this.color = Element ('input', 'pp_color', undefined, colorLabel); this.color.type = 'color'; this.color.setAttribute ('aria-label', 'Product surface color'); this.color.addEventListener ('input', () => this.Change ({ color : this.color.value }));
        const roughLabel = Element ('label', 'pp_field', 'Roughness', finish); this.roughness = Element ('input', '', undefined, roughLabel); this.roughness.type = 'range'; this.roughness.min = '0'; this.roughness.max = '1'; this.roughness.step = '.01'; this.roughness.setAttribute ('aria-label', 'Product roughness'); this.roughness.addEventListener ('input', () => this.Change ({ roughness : this.roughness.valueAsNumber }));
        const artwork = Element ('section', 'pp_section', undefined, controls); Element ('h3', '', 'Label art', artwork); const zones = Element ('div', 'pp_zone_buttons', undefined, artwork); this.zones = new Map ();
        for (const [zone, label] of [['front', 'Front label'], ['wrap', 'Wrap label'], ['back', 'Back label']]) { const button = Element ('button', '', label, zones); button.type = 'button'; button.addEventListener ('click', () => this.Change ({ labelZone : zone })); this.zones.set (zone, button); }
        const art = Element ('div', 'pp_art_placeholder', undefined, artwork); art.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m4 17 5-5 4 4 3-3 4 4M8 8h.01"/></svg>'; Element ('span', '', 'Your artwork goes here', art); Element ('small', '', 'Artwork import and mapping are coming next.', art);
        const footer = Element ('div', 'pp_footer', undefined, controls); this.add = Element ('button', 'pp_add', 'Generate', footer); this.add.type = 'button'; this.add.addEventListener ('click', () => this.Action (() => host.generate ()));
        this.load = Element ('button', 'pp_reset', 'Load selected product', footer); this.load.type = 'button'; this.load.addEventListener ('click', () => this.Action (() => host.loadSelected ()));
        this.apply = Element ('button', 'pp_reset', 'Apply to selected product', footer); this.apply.type = 'button'; this.apply.addEventListener ('click', () => this.Action (() => host.update ()));
        Element ('p', 'pp_draft_note', 'Opaque presentation models · glass and artwork coming next. Applying rebuilds component surfaces from this draft.', footer);
        const reset = Element ('button', 'pp_reset', 'Reset draft', footer); reset.type = 'button'; reset.addEventListener ('click', () => { try { host.reset (); this.Refresh (); } catch (error) { this.status.textContent = error.message; } }); this.reset = reset;
        this.availability = Element ('p', 'pp_draft_note', '', controls); this.availability.setAttribute ('role', 'status');
        this.status = Element ('p', 'pp_status', '', controls); this.status.setAttribute ('role', 'status'); this.Refresh ();
    }
    async Action (action)
    {
        try { await action (); this.status.textContent = 'Product action completed.'; }
        catch (error) { this.status.textContent = error.message; }
        finally { this.Refresh (); }
    }
    Factor () { return this.host.units () === 'standard' ? 25.4 : 1; }
    Change (changes)
    {
        try { this.host.configure (changes); this.status.textContent = ''; this.Refresh (); }
        catch (error) { this.status.textContent = error.message; }
    }
    SetDisabled ()
    {
        const draft = this.host.inspect (), disabled = this.host.blocked ();
        for (const input of this.root.querySelectorAll ('input, select, button')) { input.disabled = disabled; }
        this.add.disabled = disabled || !draft.generationAvailable; this.apply.disabled = disabled || !draft.generationAvailable;
        this.add.textContent = draft.generating ? 'Generating…' : 'Generate';
        this.add.title = draft.unavailableReason || 'Generate an opaque product in the session.';
        this.availability.textContent = draft.unavailableReason || '';
    }
    Refresh ()
    {
        const draft = this.host.inspect (), factor = this.Factor (), unit = factor === 1 ? 'mm' : 'in', disabled = this.host.blocked ();
        for (const [family, button] of this.cards) { button.setAttribute ('aria-pressed', String (draft.family === family)); button.disabled = disabled; }
        for (const key of ['heightMm', 'diameterMm', 'widthMm', 'depthMm']) {
            const input = this.inputs.get (key), active = Object.hasOwn (draft, key); input.closest ('label').hidden = !active;
            if (!active) { continue; }
            input.value = String (Math.round (draft[key] / factor * 1000) / 1000); input.disabled = disabled;
            input.min = String ((key === 'heightMm' ? 20 : key === 'depthMm' ? 2 : 10) / factor); input.max = String ((key === 'heightMm' ? 1000 : key === 'depthMm' ? 200 : 500) / factor); this.inputs.get (key + 'Unit').textContent = unit;
        }
        const names = { plastic : 'Opaque plastic', glass : 'Glass (draft only)', aluminum : 'Aluminum', steel : 'Steel' }; this.material.replaceChildren ();
        for (const key of draft.family === 'bottle' ? ['plastic', 'glass'] : draft.family === 'pouch' ? ['plastic'] : ['aluminum', 'steel']) { const option = Element ('option', '', names[key], this.material); option.value = key; }
        this.material.value = draft.material; this.material.disabled = disabled; this.color.value = draft.color; this.color.disabled = disabled; this.roughness.value = String (draft.roughness); this.roughness.disabled = disabled; this.reset.disabled = disabled;
        for (const [zone, button] of this.zones) { button.hidden = draft.family === 'pouch' ? zone === 'wrap' : zone === 'back'; button.setAttribute ('aria-pressed', String (draft.labelZone === zone)); button.disabled = disabled; }
        this.profileName.textContent = PrimaryFamilies[draft.family].name;
        this.size.textContent = draft.family === 'pouch' ? [draft.widthMm, draft.heightMm, draft.depthMm].map (n => (n / factor).toFixed (factor === 1 ? 0 : 2)).join (' × ') + ' ' + unit : 'Ø ' + (draft.diameterMm / factor).toFixed (factor === 1 ? 0 : 2) + ' × ' + (draft.heightMm / factor).toFixed (factor === 1 ? 0 : 2) + ' ' + unit;
        this.SetDisabled ();
        const bottle = draft.family === 'bottle', pouch = draft.family === 'pouch'; const width = Math.max (70, Math.min (160, (draft.diameterMm || draft.widthMm) / draft.heightMm * 280)), x = 120 - width / 2;
        const body = pouch ? `M${x} 75H${x + width}L${x + width - 8} 180L${x + width} 305H${x}L${x + 8} 180Z` : bottle ? `M102 65H138V90C138 108 ${120 + width / 2} 116 ${120 + width / 2} 143V294Q${120 + width / 2} 305 ${120 + width / 2 - 12} 305H${x + 12}Q${x} 305 ${x} 294V143C${x} 116 102 108 102 90Z` : `M${x} 90Q120 78 ${x + width} 90V294Q120 307 ${x} 294Z`;
        const labelX = draft.labelZone === 'wrap' ? x + 1 : 120 - width * .32, labelW = draft.labelZone === 'wrap' ? width - 2 : width * .64;
        this.drawing.innerHTML = `<svg viewBox="0 0 240 350" role="img" aria-label="${pouch ? 'Pouch' : bottle ? 'Bottle' : 'Can'} profile reference"><ellipse cx="120" cy="319" rx="75" ry="9" fill="currentColor" opacity=".07"/><path d="${body}" fill="${draft.color}" fill-opacity="${draft.material === 'glass' ? '.3' : '1'}" stroke="currentColor" stroke-opacity=".23" stroke-width="1.5"/>${pouch ? `<path d="M${x} 85h${width}M${x} 295h${width}" stroke="currentColor" stroke-opacity=".3"/>` : bottle ? '<rect x="100" y="46" width="40" height="25" rx="5" fill="#859497"/><path d="M105 51v15m5-15v15m5-15v15m5-15v15m5-15v15m5-15v15m5-15v15" stroke="#b7c2c2" stroke-width="1"/>' : `<ellipse cx="120" cy="90" rx="${width / 2}" ry="6" fill="#cbd3d4" stroke="#7a898b"/><ellipse cx="120" cy="91" rx="12" ry="3" fill="#859497"/>`}<rect x="${labelX}" y="174" width="${labelW}" height="79" rx="${draft.labelZone === 'wrap' ? 0 : 4}" fill="#458b9b"/><path d="M${120 - labelW * .25} 202h${labelW * .5}M${120 - labelW * .18} 214h${labelW * .36}M${120 - labelW * .12} 228h${labelW * .24}" stroke="white" stroke-opacity=".75" stroke-width="3" stroke-linecap="round"/></svg>`;
    }
}
