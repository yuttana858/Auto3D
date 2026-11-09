import { ListProductMaterials } from './materials.js';
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
        const dimensions = Element ('section', 'pp_section', undefined, controls); Element ('h3', '', 'Dimensions · H × W × D', dimensions); const row = Element ('div', 'pp_dimension_row', undefined, dimensions); this.inputs = new Map ();
        for (const [key, label] of [['heightMm', 'Height'], ['widthMm', 'Width'], ['depthMm', 'Depth']]) {
            const field = Element ('label', 'pp_field', label, row); const wrap = Element ('span', 'pp_input_wrap', undefined, field); const input = Element ('input', '', undefined, wrap); input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', 'Product ' + label.toLowerCase ()); this.inputs.set (key, input); const unit = Element ('span', 'pp_unit', '', wrap); this.inputs.set (key + 'Unit', unit);
            input.addEventListener ('change', () => this.Change ({ [this.host.inspect ().family !== 'pouch' && key !== 'heightMm' ? 'diameterMm' : key] : input.valueAsNumber * this.Factor () }));
        }
        const surfaces = Element ('section', 'pp_section', undefined, controls); Element ('h3', '', 'Surface', surfaces);
        const materialRow = Element ('div', 'pp_material_row', undefined, surfaces);
        const materialLabel = Element ('label', 'pp_field', 'Material', materialRow); this.material = Element ('select', '', undefined, materialLabel); this.material.setAttribute ('aria-label', 'Product material'); this.material.addEventListener ('change', () => this.Change ({ material : this.material.value }));
        const colorLabel = Element ('label', 'pp_field pp_swatch_field', 'Color', materialRow); this.color = Element ('input', 'pp_color', undefined, colorLabel); this.color.type = 'color'; this.color.title = 'Choose material color'; this.color.setAttribute ('aria-label', 'Product surface color'); this.color.addEventListener ('input', () => this.Change ({ color : this.color.value }));
        const finish = Element ('div', 'pp_surface_row', undefined, surfaces);
        const roughLabel = Element ('label', 'pp_field', 'Roughness', finish); this.roughness = Element ('input', '', undefined, roughLabel); this.roughness.type = 'range'; this.roughness.min = '0'; this.roughness.max = '1'; this.roughness.step = '.01'; this.roughness.setAttribute ('aria-label', 'Product roughness'); this.roughness.addEventListener ('input', () => this.Change ({ roughness : this.roughness.valueAsNumber }));
        const artwork = Element ('section', 'pp_section', undefined, controls); Element ('h3', '', 'Label art', artwork); const zones = Element ('div', 'pp_zone_buttons', undefined, artwork); this.zones = new Map ();
        for (const [zone, label] of [['front', 'Front label'], ['wrap', 'Wrap label'], ['back', 'Back label']]) { const button = Element ('button', '', label, zones); button.type = 'button'; button.addEventListener ('click', () => this.Change ({ labelZone : zone })); this.zones.set (zone, button); }
        this.artImage = Element ('img', 'pp_art_image', undefined, artwork); this.artImage.alt = 'Imported label artwork'; this.artImage.hidden = true;
        this.artName = Element ('p', 'pp_draft_note', 'Import a PNG, JPEG or WebP label (up to 4 MiB).', artwork);
        const importButton = Element ('button', 'pp_art_import', 'Import label image', artwork); importButton.type = 'button'; importButton.addEventListener ('click', () => this.Action (() => host.artworkOpen ()));
        this.artDimensions = Element ('div', 'pp_art_dimensions', undefined, artwork); this.artInputs = new Map ();
        for (const [key, label] of [['widthMm', 'Label width'], ['heightMm', 'Label height']]) { const field = Element ('label', 'pp_field', label, this.artDimensions), input = Element ('input', '', undefined, field); input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', label); input.addEventListener ('change', () => { const current = this.host.inspect ().artwork.find (a => a.zone === this.host.inspect ().labelZone); if (current) { this.Action (() => host.artworkMapping ({ zone : current.zone, widthMm : current.widthMm, heightMm : current.heightMm, [key] : input.valueAsNumber * this.Factor () })); } }); this.artInputs.set (key, input); }
        this.artRemove = Element ('button', 'pp_reset', 'Remove label image', artwork); this.artRemove.type = 'button'; this.artRemove.addEventListener ('click', () => this.Action (() => host.artworkRemove (this.host.inspect ().labelZone)));
        const footer = Element ('div', 'pp_footer', undefined, controls); this.add = Element ('button', 'pp_add', 'Generate', footer); this.add.type = 'button'; this.add.addEventListener ('click', () => this.Action (() => host.generate ()));
        this.load = Element ('button', 'pp_reset', 'Load selected product', footer); this.load.type = 'button'; this.load.addEventListener ('click', () => this.Action (() => host.loadSelected ()));
        this.apply = Element ('button', 'pp_reset', 'Apply to selected product', footer); this.apply.type = 'button'; this.apply.addEventListener ('click', () => this.Action (() => host.update ()));
        Element ('p', 'pp_draft_note', 'Opaque presentation models · clear glass coming next. Generate or Apply to update the model. Applying rebuilds component surfaces from this draft.', footer);
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
    ReportError (message) { this.status.textContent = message; }
    Factor () { return this.host.units () === 'standard' ? 25.4 : 1; }
    Change (changes)
    {
        try { this.host.configure (changes); this.status.textContent = ''; this.Refresh (); }
        catch (error) { this.status.textContent = error.message; this.Refresh (); }
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
        for (const key of ['heightMm', 'widthMm', 'depthMm']) {
            const input = this.inputs.get (key), value = key !== 'heightMm' && draft.family !== 'pouch' ? draft.diameterMm : draft[key];
            input.value = String (Math.round (value / factor * 1000) / 1000); input.disabled = disabled;
            input.min = String ((key === 'heightMm' ? 20 : key === 'depthMm' && draft.family === 'pouch' ? 2 : 10) / factor); input.max = String ((key === 'heightMm' ? 1000 : key === 'depthMm' && draft.family === 'pouch' ? 200 : 500) / factor); this.inputs.get (key + 'Unit').textContent = unit;
            input.title = draft.family === 'pouch' || key === 'heightMm' ? '' : 'Width and depth share the round product diameter.';
        }
        this.material.replaceChildren ();
        for (const item of ListProductMaterials (draft.family)) { const option = Element ('option', '', item.name, this.material); option.value = item.id; option.disabled = item.id === 'glass'; }
        this.material.value = draft.material; this.material.disabled = disabled; this.color.value = draft.color; this.color.disabled = disabled; this.roughness.value = String (draft.roughness); this.roughness.disabled = disabled; this.reset.disabled = disabled;
        const art = draft.artwork?.find (a => a.zone === draft.labelZone), preview = this.host.artworkPreview?.(draft.labelZone);
        this.artImage.hidden = !preview; if (preview) { this.artImage.src = preview; } else { this.artImage.removeAttribute ('src'); }
        this.artName.textContent = art ? art.name + ' · label size in ' + unit : 'Import a PNG, JPEG or WebP label (up to 4 MiB).';
        this.artDimensions.hidden = !art; this.artRemove.hidden = !art;
        if (art) { for (const [key, input] of this.artInputs) { input.value = String (Math.round (art[key] / factor * 1000) / 1000); } }
        for (const [zone, button] of this.zones) { button.hidden = draft.family === 'pouch' && zone === 'wrap'; button.setAttribute ('aria-pressed', String (draft.labelZone === zone)); button.disabled = disabled; }
        this.profileName.textContent = PrimaryFamilies[draft.family].name;
        this.size.textContent = draft.family === 'pouch' ? [draft.heightMm, draft.widthMm, draft.depthMm].map (n => (n / factor).toFixed (factor === 1 ? 0 : 2)).join (' × ') + ' ' + unit : 'Ø ' + (draft.diameterMm / factor).toFixed (factor === 1 ? 0 : 2) + ' × ' + (draft.heightMm / factor).toFixed (factor === 1 ? 0 : 2) + ' ' + unit;
        this.SetDisabled ();
        const bottle = draft.family === 'bottle', pouch = draft.family === 'pouch'; const width = Math.max (70, Math.min (160, (draft.diameterMm || draft.widthMm) / draft.heightMm * 280)), x = 120 - width / 2;
        const body = pouch ? `M${x} 75H${x + width}L${x + width - 8} 180L${x + width} 305H${x}L${x + 8} 180Z` : bottle ? `M102 65H138V90C138 108 ${120 + width / 2} 116 ${120 + width / 2} 143V294Q${120 + width / 2} 305 ${120 + width / 2 - 12} 305H${x + 12}Q${x} 305 ${x} 294V143C${x} 116 102 108 102 90Z` : `M${x} 90Q120 78 ${x + width} 90V294Q120 307 ${x} 294Z`;
        const labelX = draft.labelZone === 'wrap' ? x + 1 : 120 - width * .32, labelW = draft.labelZone === 'wrap' ? width - 2 : width * .64;
        this.drawing.innerHTML = `<svg viewBox="0 0 240 350" role="img" aria-label="${pouch ? 'Pouch' : bottle ? 'Bottle' : 'Can'} profile reference"><ellipse cx="120" cy="319" rx="75" ry="9" fill="currentColor" opacity=".07"/><path d="${body}" fill="${draft.color}" fill-opacity="${draft.material === 'glass' ? '.3' : '1'}" stroke="currentColor" stroke-opacity=".23" stroke-width="1.5"/>${pouch ? `<path d="M${x} 85h${width}M${x} 295h${width}" stroke="currentColor" stroke-opacity=".3"/>` : bottle ? '<rect x="100" y="46" width="40" height="25" rx="5" fill="#859497"/><path d="M105 51v15m5-15v15m5-15v15m5-15v15m5-15v15m5-15v15m5-15v15" stroke="#b7c2c2" stroke-width="1"/>' : `<ellipse cx="120" cy="90" rx="${width / 2}" ry="6" fill="#cbd3d4" stroke="#7a898b"/><ellipse cx="120" cy="91" rx="12" ry="3" fill="#859497"/>`}${preview ? `<image href="${preview}" x="${labelX}" y="174" width="${labelW}" height="79" preserveAspectRatio="xMidYMid meet"/>` : `<rect x="${labelX}" y="174" width="${labelW}" height="79" fill="none" stroke="#458b9b" stroke-dasharray="4 4"/>`}</svg>`;
    }
}
