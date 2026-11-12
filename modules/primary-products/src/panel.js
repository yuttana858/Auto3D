import { ProductDetailPanel } from './detailpanel.js';
import { LabelFinishes } from './surfaces.js';
import { ProductCategories, ListProductDesigns, ProductDesign } from './catalog.js';
import { GetArtworkZones } from './zones.js';
import { ListProductMaterials } from './materials.js';
import { PrimaryFamilies, PrimaryProductsVersion, BottleShape, DefaultProductDraft, ProductSize, DimensionChanges, PouchGussetLimit, PouchSpoutLimit, PouchSpoutHeight, ProductName } from './state.js';
import { StandUpTopSeal, PouchZipperBand, PouchSpoutCenter } from './pouch.js';
function Element (tag, className, text, parent)
{
    const node = document.createElement (tag); if (className) { node.className = className; } if (text !== undefined) { node.textContent = text; } parent?.appendChild (node); return node;
}
const icons = {
    clamshell : '<path d="M3 6h20v12H3Z M3 11h20"/>',
    pouch : '<path d="M6 3h14l-1 8 1 10H6l1-10Z M6 6h14 M6 18h14"/>',
    bottle : '<path d="M10 2h6v5l3 5v10H7V12l3-5Z M10 5h6 M7 14h12 M7 19h12"/>',
    can : '<path d="M7 4q6-3 12 0v16q-6 3-12 0Z M7 5q6 3 12 0 M7 18q6 3 12 0 M11 3h4"/>'
};
function Icon (family) { return '<svg viewBox="0 0 26 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">' + icons[family] + '</svg>'; }
// Front outline of a pouch: x/y is the top-left of the overall height h (including any spout), w the width, in SVG units.
function PouchSvg (d, x, y, w, h)
{
    const sc = h / d.heightMm, shape = d.pouchShape, style = shape?.style || 'pillow', by = y + PouchSpoutHeight (shape?.spout) * sc, bottom = y + h, bh = bottom - by, seal = by + bh * StandUpTopSeal;
    let body, details;
    if (style === 'standup') {
        const fold = bottom - shape.gussetMm * sc;
        body = `M${x + 3} ${by}H${x + w - 3}L${x + w - 1} ${fold}Q${x + w + 2} ${bottom - 3} ${x + w - 2} ${bottom}H${x + 2}Q${x - 2} ${bottom - 3} ${x + 1} ${fold}Z`;
        details = `M${x + 3} ${seal}H${x + w - 3}M${x + 2} ${fold}Q${x + w / 2} ${fold + Math.min (10, bh * .05)} ${x + w - 2} ${fold}`;
    } else if (style === 'flatbottom') {
        const gusset = by + bh * (1 - .62);
        body = `M${x} ${by}H${x + w}V${bottom}H${x}Z`;
        details = `M${x} ${seal}H${x + w}M${x + w * .06} ${gusset}V${bottom}M${x + w * .94} ${gusset}V${bottom}M${x} ${bottom - bh * .03}H${x + w}`;
    } else {
        body = `M${x} ${by}H${x + w}L${x + w - Math.min (8, w * .06)} ${by + bh / 2}L${x + w} ${bottom}H${x}L${x + Math.min (8, w * .06)} ${by + bh / 2}Z`;
        details = `M${x} ${by + bh * .04}H${x + w}M${x} ${bottom - bh * .04}H${x + w}`;
    }
    const band = PouchZipperBand (d), zipper = band ? `<path d="M${x + w * .04} ${bottom - (band.bottomMm + band.topMm) / 2 * sc}H${x + w * .96}" stroke-width="2.2" stroke-opacity=".55" fill="none"/>` : '';
    let spout = '';
    if (shape?.spout) {
        const dia = shape.spout.diameterMm * sc, cx = x + w / 2 + PouchSpoutCenter (d) * sc, neckTop = by - shape.spout.diameterMm * .8 * sc;
        spout = `<rect x="${cx - dia / 2}" y="${neckTop}" width="${dia}" height="${by - neckTop + 2}" fill="#9aa6a8"/><rect x="${cx - dia * .725}" y="${y}" width="${dia * 1.45}" height="${neckTop - y}" rx="${Math.min (2, dia * .2)}" fill="#859497"/>`;
    }
    return { body, details, zipper, spout };
}
function DesignPreview (design)
{
    const d = ProductDesign (design.id), scale = Math.min (78/(d.diameterMm || d.widthMm), 100/d.heightMm);
    const w = (d.diameterMm || d.widthMm)*scale, h = d.heightMm*scale, x = 60-w/2, y = 120-h;
    let shape;
    if (d.family === 'bottle') {
        const p = BottleShape (d), neck = p.neckDiameterMm*scale, cap = y+p.capHeightMm*scale, shoulder = cap+p.neckHeightMm*scale, body = shoulder+p.shoulderHeightMm*scale;
        shape = `<path d="M${60-neck/2} ${y}h${neck}v${shoulder-y}L${x+w} ${body}V120H${x}V${body}L${60-neck/2} ${shoulder}Z"/><path d="M${60-neck/2} ${cap}h${neck}"/>`;
    } else if (d.family === 'can') {
        shape = `<path d="M${x} ${y+3}Q60 ${y-3} ${x+w} ${y+3}V117Q60 123 ${x} 117Z"/><path d="M${x} ${y+3}Q60 ${y+9} ${x+w} ${y+3}"/>`;
    } else if (d.family === 'pouch') {
        const p = PouchSvg (d, x, y, w, h); shape = `<path d="${p.body}"/><path d="${p.details}"/>${p.zipper}${p.spout}`;
    } else {
        const sh = Math.min (45, h*.45), depth = Math.min (45, d.depthMm*scale*.5), top = 100-sh-depth;
        shape = `<path d="M${x} ${top+depth}L${x+12} ${top}H${x+w}l-12 ${depth}Z"/><path d="M${x} ${top+depth}v${sh}h${w-12}l12 -${depth}V${top}M${x+w-12} ${top+depth}v${sh}"/>`;
    }
    const size = ProductSize (d), top = d.family === 'clamshell' ? 100 - Math.min (45, h*.45) - Math.min (45, d.depthMm*scale*.5) : y, right = x + w;
    return `<svg class="pp_design_preview" viewBox="0 0 120 140" fill="${d.color}" fill-opacity=".22" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">${shape}</svg>`;
}
function Format (mm) { return String (Math.round (mm * 10) / 10); }
// A dimension callout: extension ticks at both ends, a dimension line and its value, drawn in SVG user units.
function Bracket (x1, y1, x2, y2, text, side, size = 8)
{
    const dx = x2 - x1, dy = y2 - y1, length = Math.hypot (dx, dy) || 1, nx = -dy / length * 3, ny = dx / length * 3;
    const tick = (x, y) => `M${x - nx} ${y - ny}L${x + nx} ${y + ny}`;
    const label = side === 'below' ? `<text x="${(x1 + x2) / 2}" y="${y1 + size + 1}" text-anchor="middle">${text}</text>` : side === 'right' ? `<text x="${x1 + 4}" y="${(y1 + y2) / 2 + size / 3}">${text}</text>` : `<text x="${x2 + 2}" y="${y2 - 1}">${text}</text>`;
    return `<path d="M${x1} ${y1}L${x2} ${y2}${tick (x1, y1)}${tick (x2, y2)}" fill="none"/>${label.replace ('<text', '<text stroke="none" font-size="' + size + '"')}`;
}
export class PrimaryProductsPanel
{
    constructor (host, parent)
    {
        this.host = host; this.root = Element ('div', 'pp_workspace', undefined, parent);
        for (const type of ['keydown', 'keyup']) { this.root.addEventListener (type, event => { if (event.target.closest?.('input, select, textarea, button, [contenteditable]')) { event.stopPropagation (); } }); }
        const top = Element ('div', 'pp_intro', undefined, this.root); Element ('span', 'pp_kicker', 'PRIMARY PRODUCT DESIGNS', top); Element ('span', 'pp_version', 'v' + PrimaryProductsVersion, top);
        this.layout = Element ('div', 'pp_layout', undefined, this.root);
        const catalog = Element ('section', 'pp_catalog', undefined, this.layout); Element ('h3', '', 'Product', catalog);
        const cards = Element ('div', 'pp_product_cards', undefined, catalog); this.cards = new Map ();
        for (const [family, label] of [['bottle', 'Bottle'], ['can', 'Can'], ['pouch', 'Pouch'], ['clamshell', 'Clamshell']]) {
            const button = Element ('button', 'pp_product_card', undefined, cards); button.type = 'button'; button.setAttribute ('aria-label', 'Choose ' + label.toLowerCase ()); button.innerHTML = Icon (family); Element ('span', '', label, button); Element ('small', '', PrimaryFamilies[family].name, button); button.addEventListener ('click', () => { this.Change ({ family }); this.host.catalog ({ bottle : 'bottles', can : 'cans', pouch : 'pouches', clamshell : 'clamshells' }[family], true); }); this.cards.set (family, button);
        }
        const categories = Element ('div', 'pp_categories', undefined, catalog);
        for (const [id, name] of Object.entries (ProductCategories).filter (([id]) => id === 'beverages')) { const button = Element ('button', '', name, categories); button.type = 'button'; button.addEventListener ('click', ()=>this.host.catalog(id, true)); }
        this.drawer = Element ('section', 'pp_design_drawer', undefined, this.root); this.drawer.setAttribute ('aria-label', 'Product designs'); this.drawer.tabIndex = -1;
        const header = Element ('div', 'pp_drawer_header', undefined, this.drawer);
        const drawerSize = Element ('div', 'pp_drawer_size', undefined, header); drawerSize.setAttribute ('aria-label', 'Size · W × L × H');
        for (const [key, label] of [['widthMm', 'W'], ['lengthMm', 'L'], ['heightMm', 'H']]) {
            const field = Element ('label', 'pp_field', label, drawerSize), wrap = Element ('span', 'pp_input_wrap', undefined, field), input = Element ('input', '', undefined, wrap), unit = Element ('span', 'pp_unit', '', wrap);
            input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', 'Design ' + { W : 'width', L : 'length', H : 'height' }[label]); this.BindDimension (input, key); this.drawerInputs = this.drawerInputs || new Map (); this.drawerInputs.set (key, { input, unit });
        }
        this.drawerStatus = Element ('p', 'pp_status pp_drawer_status', '', header); this.drawerStatus.setAttribute ('role', 'status');
        this.drawerTitle = Element ('h3', '', 'Designs', header);
        const close=Element('button', '', 'Close designs', header); this.drawerClose = close; close.type='button';close.addEventListener('click', ()=>this.host.catalog(this.host.inspect().catalogCategory, false));
        this.drawerGrid=Element('div', 'pp_design_grid', undefined, this.drawer);
        this.drawer.addEventListener ('keydown', event => { if (event.key === 'Escape') { event.stopPropagation (); event.preventDefault (); this.host.catalog (this.host.inspect ().catalogCategory, false); } });
        const note = Element ('p', 'pp_catalog_note', 'Start with a familiar shape. Refine its dimensions and surface.', catalog);
        note.setAttribute ('aria-hidden', 'true');
        this.stage = Element ('section', 'pp_stage', undefined, this.layout); this.stage.setAttribute ('aria-label', 'Product profile reference');
        this.profileName = Element ('span', 'pp_profile_name', '', this.stage); this.drawing = Element ('div', 'pp_drawing', undefined, this.stage);
        this.size = Element ('div', 'pp_size', '', this.stage); const editModel = Element ('button', 'pp_edit_model', 'Edit model', this.stage); editModel.type = 'button'; editModel.addEventListener ('click', () => this.Action (() => this.host.openProfile ()));
        const controls = Element ('div', 'pp_controls', undefined, this.layout);
        const dimensions = Element ('section', 'pp_section', undefined, controls); Element ('h3', '', 'Dimensions · W × L × H', dimensions); const row = Element ('div', 'pp_dimension_row', undefined, dimensions); this.inputs = new Map ();
        for (const [key, label] of [['widthMm', 'Width'], ['lengthMm', 'Length'], ['heightMm', 'Height']]) {
            const field = Element ('label', 'pp_field', label, row); const wrap = Element ('span', 'pp_input_wrap', undefined, field); const input = Element ('input', '', undefined, wrap); input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', 'Product ' + label.toLowerCase ()); const unit = Element ('span', 'pp_unit', '', wrap);
            this.BindDimension (input, key); this.inputs.set (key, [{ input, unit }]);
        }
        Element ('p', 'pp_draft_note', 'Press Enter to resize the selected generated product live; Tab updates only the draft.', dimensions);
        const calloutLabel = Element ('label', 'pp_toggle', undefined, dimensions); this.callouts = Element ('input', '', undefined, calloutLabel); this.callouts.type = 'checkbox'; this.callouts.setAttribute ('aria-label', 'Show W × L × H on model'); Element ('span', '', 'Show W × L × H on model', calloutLabel);
        this.callouts.addEventListener ('change', () => { if (this.host.setCallouts) { this.Action (() => this.host.setCallouts (this.callouts.checked)); } });
        this.detailsPanel = new ProductDetailPanel (host, controls, action => this.Action (action));
        this.shapeSection = Element ('section', 'pp_section', undefined, controls); Element ('h3', '', 'Bottle shape', this.shapeSection); this.shapeInputs = new Map ();
        const sectionLabel = Element ('label', 'pp_field', 'Cross-section', this.shapeSection); this.sectionSelect = Element ('select', '', undefined, sectionLabel); this.sectionSelect.setAttribute ('aria-label', 'Bottle cross-section');
        for (const [value, text] of [['round', 'Round'], ['oval', 'Oval'], ['rectangle', 'Rounded rectangle']]) { Element ('option', '', text, this.sectionSelect).value = value; }
        this.sectionSelect.addEventListener ('change', () => { const draft = this.host.inspect (), shape = this.sectionSelect.value; this.Change ({ bottleSection : shape === 'round' ? null : { shape, depthMm : draft.bottleSection?.depthMm ?? Math.round (draft.diameterMm * .6 * 100) / 100 } }); });
        this.cornerLabel = Element ('label', 'pp_field', 'Corner radius', this.shapeSection); const cornerWrap = Element ('span', 'pp_input_wrap', undefined, this.cornerLabel); this.cornerInput = Element ('input', '', undefined, cornerWrap); this.cornerUnit = Element ('span', 'pp_unit', '', cornerWrap);
        this.cornerInput.type = 'number'; this.cornerInput.step = 'any'; this.cornerInput.setAttribute ('aria-label', 'Corner radius');
        this.cornerInput.addEventListener ('change', () => { const draft = this.host.inspect (); if (draft.bottleSection?.shape === 'rectangle') { this.Change ({ bottleSection : { ...draft.bottleSection, cornerRadiusMm : this.cornerInput.valueAsNumber * this.Factor () } }); } });
        for (const [key, title] of [['neckDiameterMm', 'Neck diameter'], ['shoulderHeightMm', 'Shoulder height'], ['neckHeightMm', 'Neck height'], ['capHeightMm', 'Cap height']]) {
            const label = Element ('label', 'pp_field', title, this.shapeSection), wrap = Element ('span', 'pp_input_wrap', undefined, label), input = Element ('input', '', undefined, wrap), unit = Element ('span', 'pp_unit', '', wrap);
            input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', title); this.shapeInputs.set (key, { input, unit });
            input.addEventListener ('change', () => { const draft = this.host.inspect (); this.Change ({ bottleShape : { ...BottleShape (draft), [key] : input.valueAsNumber*this.Factor () } }); });
        }
        this.pouchSection = Element ('section', 'pp_section', undefined, controls); Element ('h3', '', 'Pouch style', this.pouchSection);
        const styleLabel = Element ('label', 'pp_field', 'Construction', this.pouchSection); this.pouchStyle = Element ('select', '', undefined, styleLabel); this.pouchStyle.setAttribute ('aria-label', 'Pouch construction');
        for (const [value, text] of [['pillow', 'Pillow (flat seals)'], ['standup', 'Stand-up (bottom gusset)'], ['flatbottom', 'Flat-bottom (box)']]) { Element ('option', '', text, this.pouchStyle).value = value; }
        this.pouchStyle.addEventListener ('change', () => this.ChangePouch ({ style : this.pouchStyle.value, gussetMm : undefined }));
        this.gussetLabel = Element ('label', 'pp_field', 'Gusset height', this.pouchSection); const gussetWrap = Element ('span', 'pp_input_wrap', undefined, this.gussetLabel); this.gussetInput = Element ('input', '', undefined, gussetWrap); this.gussetUnit = Element ('span', 'pp_unit', '', gussetWrap);
        this.gussetInput.type = 'number'; this.gussetInput.step = 'any'; this.gussetInput.setAttribute ('aria-label', 'Gusset height');
        this.gussetInput.addEventListener ('change', () => { if (this.host.inspect ().pouchShape?.style === 'standup') { this.ChangePouch ({ gussetMm : this.gussetInput.valueAsNumber * this.Factor () }); } });
        const zipperLabel = Element ('label', 'pp_toggle', undefined, this.pouchSection); this.zipper = Element ('input', '', undefined, zipperLabel); this.zipper.type = 'checkbox'; this.zipper.setAttribute ('aria-label', 'Reclosable zipper'); Element ('span', '', 'Reclosable zipper', zipperLabel);
        this.zipper.addEventListener ('change', () => this.ChangePouch ({ zipper : this.zipper.checked || undefined }));
        this.spoutLabel = Element ('label', 'pp_field', 'Spout', this.pouchSection); this.spoutSelect = Element ('select', '', undefined, this.spoutLabel); this.spoutSelect.setAttribute ('aria-label', 'Pouch spout');
        for (const [value, text] of [['none', 'None'], ['center', 'Center'], ['corner', 'Corner']]) { Element ('option', '', text, this.spoutSelect).value = value; }
        this.spoutSelect.addEventListener ('change', () => { const current = this.host.inspect ().pouchShape?.spout; this.ChangePouch ({ spout : this.spoutSelect.value === 'none' ? undefined : { position : this.spoutSelect.value, ...(current ? { diameterMm : current.diameterMm } : {}) } }); });
        this.spoutSizeLabel = Element ('label', 'pp_field', 'Spout diameter', this.pouchSection); const spoutWrap = Element ('span', 'pp_input_wrap', undefined, this.spoutSizeLabel); this.spoutInput = Element ('input', '', undefined, spoutWrap); this.spoutUnit = Element ('span', 'pp_unit', '', spoutWrap);
        this.spoutInput.type = 'number'; this.spoutInput.step = 'any'; this.spoutInput.setAttribute ('aria-label', 'Spout diameter');
        this.spoutInput.addEventListener ('change', () => { const spout = this.host.inspect ().pouchShape?.spout; if (spout) { this.ChangePouch ({ spout : { position : spout.position, diameterMm : this.spoutInput.valueAsNumber * this.Factor () } }); } });
        Element ('p', 'pp_draft_note', 'Stand-up pouches open into a bottom gusset as deep as L; flat-bottom pouches stand on a W × L box base. Zippers sit below the top seal. Height H includes any spout and cap.', this.pouchSection);
        Element ('p', 'pp_draft_note', 'Overall height includes the cap. The straight body uses the remaining height. Shape edits preserve label size; artwork must still fit.', this.shapeSection);
        const surfaces = Element ('section', 'pp_section', undefined, controls); Element ('h3', '', 'Surface', surfaces);
        const materialRow = Element ('div', 'pp_material_row', undefined, surfaces);
        const materialLabel = Element ('label', 'pp_field', 'Material', materialRow); this.material = Element ('select', '', undefined, materialLabel); this.material.setAttribute ('aria-label', 'Product material'); this.material.addEventListener ('change', () => this.Change ({ material : this.material.value }));
        const colorLabel = Element ('label', 'pp_field pp_swatch_field', 'Color', materialRow); this.color = Element ('input', 'pp_color', undefined, colorLabel); this.color.type = 'color'; this.color.title = 'Choose material color'; this.color.setAttribute ('aria-label', 'Product surface color'); this.color.addEventListener ('input', () => this.Change ({ color : this.color.value }));
        const finish = Element ('div', 'pp_surface_row', undefined, surfaces);
        const roughLabel = Element ('label', 'pp_field', 'Roughness', finish); this.roughness = Element ('input', '', undefined, roughLabel); this.roughness.type = 'range'; this.roughness.min = '0'; this.roughness.max = '1'; this.roughness.step = '.01'; this.roughness.setAttribute ('aria-label', 'Product roughness'); this.roughness.addEventListener ('input', () => this.Change ({ roughness : this.roughness.valueAsNumber }));
        const advanced = Element ('button', 'pp_art_import', 'Advanced material editor', surfaces); Element ('p', 'pp_draft_note', 'Select a generated product to edit its materials and label artwork.', surfaces); advanced.type = 'button'; advanced.addEventListener ('click', () => this.Action (() => host.openMaterials ()));
        const artwork = Element ('section', 'pp_workspace pp_section pp_artwork_editor'); this.artworkRoot = artwork; artwork.setAttribute ('aria-label', 'Product label artwork');
        for (const type of ['keydown', 'keyup']) { artwork.addEventListener (type, event => event.stopPropagation ()); } Element ('h3', '', 'Label art', artwork); const zones = Element ('div', 'pp_zone_buttons', undefined, artwork); this.zones = new Map ();
        for (const [zone, label] of [['front', 'Front label'], ['wrap', 'Wrap label'], ['back', 'Back label']]) { const button = Element ('button', '', label, zones); button.type = 'button'; button.addEventListener ('click', () => this.Change ({ labelZone : zone })); this.zones.set (zone, button); }
        this.artImage = Element ('img', 'pp_art_image', undefined, artwork); this.artImage.alt = 'Imported label artwork'; this.artImage.hidden = true;
        this.artName = Element ('p', 'pp_draft_note', 'Import a PNG, JPEG or WebP label (up to 4 MiB).', artwork);
        const importButton = Element ('button', 'pp_art_import', 'Import label image', artwork); importButton.type = 'button'; importButton.addEventListener ('click', () => this.Action (() => host.artworkOpen ()));
        this.artDimensions = Element ('div', 'pp_art_dimensions', undefined, artwork); this.artInputs = new Map ();
        for (const [key, label] of [['widthMm', 'Label width'], ['heightMm', 'Label height'], ['offsetXmm', 'Label horizontal offset'], ['offsetYmm', 'Label vertical offset']]) { const field = Element ('label', 'pp_field', label, this.artDimensions), input = Element ('input', '', undefined, field); input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', label); input.addEventListener ('change', () => { const current = this.host.inspect ().artwork.find (a => a.zone === this.host.inspect ().labelZone); if (current) { this.Action (() => host.artworkMapping ({ zone : current.zone, widthMm : current.widthMm, heightMm : current.heightMm, [key] : input.valueAsNumber * this.Factor () })); } }); this.artInputs.set (key, input); }
        const finishLabel = Element ('label', 'pp_field', 'Label finish', artwork); this.labelFinish = Element ('select', '', undefined, finishLabel); this.labelFinish.setAttribute ('aria-label', 'Label finish');
        for (const [value, preset] of Object.entries (LabelFinishes)) { Element ('option', '', preset.name, this.labelFinish).value = value; }
        this.labelFinish.addEventListener ('change', () => this.Action (() => host.artworkMapping ({ zone : this.host.inspect ().labelZone, finish : this.labelFinish.value })));
        Element ('p', 'pp_draft_note', 'Clear film uses the image alpha channel. Use surface masks for spot varnish or relief effects.', artwork);
        this.artRemove = Element ('button', 'pp_reset', 'Remove label image', artwork); this.artRemove.type = 'button'; this.artRemove.addEventListener ('click', () => this.Action (() => host.artworkRemove (this.host.inspect ().labelZone)));
        this.artApply = Element ('button', 'pp_art_import', 'Apply label artwork', artwork); this.artApply.type = 'button'; this.artApply.addEventListener ('click', () => this.Action (() => host.applyArtwork ()));
        this.artStatus = Element ('p', 'pp_status', '', artwork); this.artStatus.setAttribute ('role', 'status');
        const footer = Element ('div', 'pp_footer', undefined, controls); this.add = Element ('button', 'pp_add', 'Generate', footer); this.add.type = 'button'; this.add.addEventListener ('click', () => this.Action (() => host.generate ()));
        this.load = Element ('button', 'pp_reset', 'Load selected product', footer); this.load.type = 'button'; this.load.addEventListener ('click', () => this.Action (() => host.loadSelected ()));
        this.apply = Element ('button', 'pp_reset', 'Apply to selected product', footer); this.apply.type = 'button'; this.apply.addEventListener ('click', () => this.Action (() => host.update ()));
        Element ('p', 'pp_draft_note', 'Presentation models with editable physical surfaces. Generate or Apply to update the model. Applying rebuilds component surfaces from this draft.', footer);
        const reset = Element ('button', 'pp_reset', 'Reset draft', footer); reset.type = 'button'; reset.addEventListener ('click', () => { try { host.reset (); this.Refresh (); } catch (error) { this.status.textContent = error.message; } }); this.reset = reset;
        this.availability = Element ('p', 'pp_draft_note', '', controls); this.availability.setAttribute ('role', 'status');
        this.status = Element ('p', 'pp_status', '', controls); this.status.setAttribute ('role', 'status'); this.Refresh ();
    }
    Drawer (open)
    {
        if (this.drawerOpen === open) { return; }
        this.drawerAnimation?.cancel (); const before = this.drawerOpen; this.drawerOpen = open;
        const reduced = typeof matchMedia === 'function' && matchMedia ('(prefers-reduced-motion: reduce)').matches;
        if (open) { this.drawerReturn = document.activeElement; this.drawer.hidden = false; this.drawer.style.pointerEvents = ''; this.drawer.focus ({ preventScroll : true }); }
        if (!open && (!before || reduced)) { this.drawer.hidden = true; if (before) { this.drawerReturn?.focus?.(); } return; }
        if (reduced) { return; }
        this.drawer.style.pointerEvents = open ? '' : 'none';
        this.drawerAnimation = this.drawer.animate ([{ transform : open ? 'translateY(100%)' : 'translateY(0)' }, { transform : open ? 'translateY(0)' : 'translateY(100%)' }], { duration : 220, easing : 'ease-out' });
        this.drawerAnimation.onfinish = () => { if (!this.drawerOpen) { this.drawer.hidden = true; this.drawerReturn?.focus?.(); } };
    }
    async Action (action)
    {
        try { const result = await action (); this.status.textContent = result?.message || 'Product action completed.'; this.drawerStatus.textContent = result?.message || ''; }
        catch (error) { this.status.textContent = error.message; this.drawerStatus.textContent = error.message; }
        finally { this.artStatus.textContent = this.status.textContent; this.Refresh (); }
    }
    ReportError (message) { this.status.textContent = message; this.artStatus.textContent = message; }
    // Enter applies the dimension and rebuilds the selected generated product; Tab or blur only updates the draft.
    BindDimension (input, key)
    {
        input.addEventListener ('keydown', event => { if (event.key !== 'Enter') { return; } event.preventDefault (); event.stopPropagation (); this.enterInput = input; this.SetDimension (key, input.valueAsNumber * this.Factor (), true); });
        input.addEventListener ('change', () => { if (this.enterInput === input) { this.enterInput = null; return; } this.SetDimension (key, input.valueAsNumber * this.Factor (), false); });
        input.addEventListener ('blur', () => { if (this.enterInput === input) { this.enterInput = null; } });
    }
    SetDimension (key, mm, live)
    {
        if (live && this.host.setDimensions) { return this.Action (() => this.host.setDimensions ({ [key] : mm })); }
        try { this.Change (DimensionChanges (this.host.inspect (), { [key] : mm })); } catch (error) { this.status.textContent = error.message; this.Refresh (); }
    }
    Factor () { return this.host.units () === 'standard' ? 25.4 : 1; }
    Change (changes)
    {
        try { this.host.configure (changes); this.status.textContent = ''; this.Refresh (); }
        catch (error) { this.status.textContent = error.message; this.Refresh (); }
    }
    SetDisabled ()
    {
        const draft = this.host.inspect (), disabled = this.host.blocked ();
        for (const input of [...this.root.querySelectorAll ('input, select, button'), ...(this.artworkRoot?.querySelectorAll ('input, select, button') || [])]) { input.disabled = disabled; }
        if (this.drawerClose) { this.drawerClose.disabled = false; }
        this.add.disabled = disabled || !draft.generationAvailable; this.apply.disabled = disabled || !draft.generationAvailable;
        this.add.textContent = draft.generating ? 'Generating…' : 'Generate';
        this.add.title = draft.unavailableReason || 'Generate a product in the session.';
        this.availability.textContent = draft.unavailableReason || '';
        this.detailsPanel?.Refresh ();
        if (this.labelFinish) { this.labelFinish.disabled = disabled || !draft.artwork?.some (a => a.zone === draft.labelZone); }
    }
    // Merge a partial pouch construction into the draft; pillow pouches drop the gusset and spout.
    ChangePouch (patch)
    {
        const current = this.host.inspect ().pouchShape || { style : 'pillow' }, next = { ...current, ...patch };
        for (const key of Object.keys (next)) { if (next[key] === undefined) { delete next[key]; } }
        if (next.style !== 'standup') { delete next.gussetMm; } if (next.style === 'pillow') { delete next.spout; }
        this.Change ({ pouchShape : next });
    }
    Refresh ()
    {
        const draft = this.host.inspect (), factor = this.Factor (), unit = factor === 1 ? 'mm' : 'in', disabled = this.host.blocked ();
        for (const [family, button] of this.cards) { button.setAttribute ('aria-pressed', String (draft.family === family)); button.disabled = disabled; }
        const size = ProductSize (draft), round = !['pouch', 'clamshell'].includes (draft.family);
        for (const key of ['widthMm', 'lengthMm', 'heightMm']) {
            const limits = key === 'heightMm' ? [20, 1000] : key === 'lengthMm' && !round ? [2, 200] : [10, 500];
            for (const { input, unit : suffix } of [...this.inputs.get (key), this.drawerInputs?.get (key)].filter (Boolean)) {
                if (document.activeElement !== input) { input.value = String (Math.round (size[key] / factor * 1000) / 1000); }
                input.disabled = disabled; input.min = String (limits[0] / factor); input.max = String (limits[1] / factor); suffix.textContent = unit;
                input.title = round && !draft.bottleSection && key !== 'heightMm' ? 'Width and length share the round product diameter.' : '';
            }
        }
        this.callouts.checked = draft.callouts !== false; this.callouts.disabled = disabled || !this.host.setCallouts; this.callouts.parentElement.hidden = !this.host.setCallouts;
        this.shapeSection.hidden = draft.family !== 'bottle'; this.pouchSection.hidden = draft.family !== 'pouch';
        if (draft.family === 'pouch') {
            const shape = draft.pouchShape, style = shape?.style || 'pillow';
            this.pouchStyle.value = style; this.pouchStyle.disabled = disabled; this.gussetLabel.hidden = style !== 'standup'; this.gussetUnit.textContent = unit; this.gussetInput.disabled = disabled;
            if (style === 'standup') { this.gussetInput.min = String (3 / factor); this.gussetInput.max = String (PouchGussetLimit (draft) / factor); if (document.activeElement !== this.gussetInput) { this.gussetInput.value = String (Number ((shape.gussetMm / factor).toFixed (6))); } }
            this.zipper.checked = Boolean (shape?.zipper); this.zipper.disabled = disabled;
            this.spoutLabel.hidden = style === 'pillow'; this.spoutSelect.value = shape?.spout?.position || 'none'; this.spoutSelect.disabled = disabled;
            this.spoutSizeLabel.hidden = !shape?.spout; this.spoutUnit.textContent = unit; this.spoutInput.disabled = disabled;
            if (shape?.spout) { this.spoutInput.min = String (5 / factor); this.spoutInput.max = String (PouchSpoutLimit (draft) / factor); if (document.activeElement !== this.spoutInput) { this.spoutInput.value = String (Number ((shape.spout.diameterMm / factor).toFixed (6))); } }
        }
        if (draft.family === 'bottle') {
            this.sectionSelect.value = draft.bottleSection?.shape || 'round'; this.sectionSelect.disabled = disabled; this.cornerLabel.hidden = draft.bottleSection?.shape !== 'rectangle'; this.cornerUnit.textContent = unit;
            if (draft.bottleSection?.shape === 'rectangle' && document.activeElement !== this.cornerInput) { this.cornerInput.value = String (Number ((draft.bottleSection.cornerRadiusMm / factor).toFixed (6))); }
        }
        if (draft.family === 'bottle') { const shape = BottleShape (draft); for (const [key, { input, unit : suffix }] of this.shapeInputs) { input.value = String (Number ((shape[key]/factor).toFixed (6))); input.min = String (.5/factor); input.max = String (1000/factor); suffix.textContent = unit; } }
        this.material.replaceChildren ();
        for (const item of ListProductMaterials (draft.family)) { const option = Element ('option', '', item.name, this.material); option.value = item.id; option.disabled = !item.available; }
        this.material.value = draft.material; this.material.disabled = disabled; this.color.value = draft.color; this.color.disabled = disabled; this.roughness.value = String (draft.roughness); this.roughness.disabled = disabled; this.reset.disabled = disabled;
        const art = draft.artwork?.find (a => a.zone === draft.labelZone), preview = this.host.artworkPreview?.(draft.labelZone);
        this.artImage.hidden = !preview; if (preview) { this.artImage.src = preview; } else { this.artImage.removeAttribute ('src'); }
        this.artName.textContent = art ? art.name + ' · label size in ' + unit : 'Import a PNG, JPEG or WebP label (up to 4 MiB).';
        this.detailsPanel?.Refresh (); this.labelFinish.disabled = !art || disabled; this.labelFinish.value = art?.finish || 'paperMatte';
        this.artDimensions.hidden = !art; this.artRemove.hidden = !art;
        if (art) { for (const [key, input] of this.artInputs) { input.value = String (Math.round ((art[key] || 0) / factor * 1000) / 1000); } }
        for (const [zone, button] of this.zones) { button.hidden = ['pouch', 'clamshell'].includes (draft.family) && zone === 'wrap'; button.textContent = draft.family === 'clamshell' ? (zone === 'front' ? 'Top label' : 'Bottom label') : { front : 'Front label', back : 'Back label', wrap : 'Wrap label' }[zone]; button.setAttribute ('aria-pressed', String (draft.labelZone === zone)); button.disabled = disabled; }
        this.Drawer (draft.catalogOpen === true); this.drawerTitle.textContent = ProductCategories[draft.catalogCategory] || 'Designs';
        const catalogKey = draft.catalogCategory + ':' + unit; if (catalogKey !== this.catalogKey) { this.catalogKey = catalogKey; this.drawerGrid.replaceChildren (); for (const design of ListProductDesigns (draft.catalogCategory)) { const button = Element ('button', 'pp_design_card', undefined, this.drawerGrid); button.type='button'; button.innerHTML=DesignPreview(design); Element('strong', '', design.name, button); const size = ProductSize (ProductDesign (design.id)); Element ('small', 'pp_design_size', [size.widthMm, size.lengthMm, size.heightMm].map (v => Number ((v/factor).toFixed (2))).join (' × ') + ' ' + unit, button); button.title=design.description + ' · ' + design.dimensionsAre; button.setAttribute ('aria-label', 'Generate ' + design.name); button.addEventListener('click', ()=>this.Action(()=>this.host.generateDesign ? this.host.generateDesign(design.id) : this.host.selectDesign(design.id))); } }
        this.profileName.textContent = ProductName (draft);
        this.size.textContent = draft.bottleSection ? [size.widthMm, size.lengthMm, size.heightMm].map (n => (n / factor).toFixed (factor === 1 ? 0 : 2)).join (' × ') + ' ' + unit : ['pouch', 'clamshell'].includes (draft.family) ? [draft.heightMm, draft.widthMm, draft.depthMm].map (n => (n / factor).toFixed (factor === 1 ? 0 : 2)).join (' × ') + ' ' + unit : 'Ø ' + (draft.diameterMm / factor).toFixed (factor === 1 ? 0 : 2) + ' × ' + (draft.heightMm / factor).toFixed (factor === 1 ? 0 : 2) + ' ' + unit;
        this.SetDisabled ();
        if (draft.family === 'clamshell') {
            const scale = Math.min (180/draft.widthMm, 250/draft.depthMm), w = draft.widthMm*scale, d = draft.depthMm*scale;
            const labelW = (art?.widthMm || draft.widthMm*.55)*scale, labelH = (art?.heightMm || draft.depthMm*.55)*scale;
            const label = preview ? `<image href="${preview}" x="${120-labelW/2}" y="${175-labelH/2}" width="${labelW}" height="${labelH}" preserveAspectRatio="xMidYMid meet"/>` : `<rect x="${120-labelW/2}" y="${175-labelH/2}" width="${labelW}" height="${labelH}" fill="none" stroke="#458b9b" stroke-dasharray="4 4"/>`;
            const callouts = Bracket (120-w/2, 175+d/2+14, 120+w/2, 175+d/2+14, 'W ' + Format (size.widthMm / factor) + ' ' + unit, 'below', 11) + Bracket (120+w/2+10, 175-d/2, 120+w/2+10, 175+d/2, 'L ' + Format (size.lengthMm / factor), 'right', 11);
            this.drawing.innerHTML = `<svg viewBox="0 0 240 350" role="img" aria-label="Clamshell top reference"><rect x="${120-w/2}" y="${175-d/2}" width="${w}" height="${d}" rx="${Math.min(w, d)*.1}" fill="${draft.color}" stroke="currentColor" stroke-opacity=".35"/>${label}<g class="pp_callout" fill="currentColor" stroke="currentColor" stroke-width=".8">${callouts}<text x="120" y="${175-d/2-10}" text-anchor="middle" stroke="none" font-size="11">H ${Format (size.heightMm / factor)} ${unit}</text></g></svg>`;
            return;
        }
        const bottle = draft.family === 'bottle', pouch = ['pouch', 'clamshell'].includes (draft.family); const width = Math.max (70, Math.min (160, (draft.diameterMm || draft.widthMm) / draft.heightMm * 280)), x = 120 - width / 2;
        const shape = bottle ? BottleShape (draft) : null, sy = value => 305-value/draft.heightMm*250, neckWidth = bottle ? width*shape.neckDiameterMm/draft.diameterMm : 0, capBottom = bottle ? sy (draft.heightMm-shape.capHeightMm) : 0, neckBottom = bottle ? sy (draft.heightMm-shape.capHeightMm-shape.neckHeightMm) : 0, bodyTop = bottle ? sy (draft.heightMm-shape.capHeightMm-shape.neckHeightMm-shape.shoulderHeightMm) : 0;
        const body = draft.family === 'clamshell' ? `M${x} 75H${x+width}V305H${x}Z` : pouch ? PouchSvg (draft, x, 55, width, 250).body : bottle ? `M${120-neckWidth/2} ${capBottom}H${120+neckWidth/2}V${neckBottom}L${x+width} ${bodyTop}V305H${x}V${bodyTop}L${120-neckWidth/2} ${neckBottom}Z` : `M${x} 90Q120 78 ${x + width} 90V294Q120 307 ${x} 294Z`;
        const zoneDraft = DefaultProductDraft (draft.family); for (const key of Object.keys (zoneDraft)) { zoneDraft[key] = draft[key]; } if (draft.bottleShape) { zoneDraft.bottleShape = draft.bottleShape; } if (draft.bottleSection) { zoneDraft.bottleSection = draft.bottleSection; } if (draft.pouchShape) { zoneDraft.pouchShape = draft.pouchShape; }
        const zone = GetArtworkZones (zoneDraft).find (z => z.id === draft.labelZone), artHeight = art?.heightMm || zone.heightMm*.7, labelY = sy (zone.bottomMm+(zone.heightMm+artHeight)/2), labelHeight = artHeight/draft.heightMm*250;
        const labelX = draft.labelZone === 'wrap' ? x + 1 : 120 - width * .32, labelW = draft.labelZone === 'wrap' ? width - 2 : width * .64;
        this.drawing.innerHTML = `<svg viewBox="0 0 240 350" role="img" aria-label="${draft.family === 'clamshell' ? 'Clamshell' : pouch ? 'Pouch' : bottle ? 'Bottle' : 'Can'} profile reference"><ellipse cx="120" cy="319" rx="75" ry="9" fill="currentColor" opacity=".07"/><path d="${body}" fill="${draft.color}" fill-opacity="${draft.material === 'glass' ? '.3' : '1'}" stroke="currentColor" stroke-opacity=".23" stroke-width="1.5"/>${pouch ? (p => `<g stroke="currentColor"><path d="${p.details}" stroke-opacity=".3" fill="none"/>${p.zipper}</g>${p.spout}`) (PouchSvg (draft, x, 55, width, 250)) : bottle ? `<rect x="${120-neckWidth*.54}" y="55" width="${neckWidth*1.08}" height="${capBottom-55}" fill="#859497"/>` : `<ellipse cx="120" cy="90" rx="${width / 2}" ry="6" fill="#cbd3d4" stroke="#7a898b"/><ellipse cx="120" cy="91" rx="12" ry="3" fill="#859497"/>`}${preview ? `<image href="${preview}" x="${labelX}" y="${labelY}" width="${labelW}" height="${labelHeight}" preserveAspectRatio="xMidYMid meet"/>` : `<rect x="${labelX}" y="${labelY}" width="${labelW}" height="${labelHeight}" fill="none" stroke="#458b9b" stroke-dasharray="4 4"/>`}<g class="pp_callout" fill="currentColor" stroke="currentColor" stroke-width=".8">${Bracket (x, 336, x + width, 336, 'W ' + Format (size.widthMm / factor) + ' ' + unit, 'below', 11)}${Bracket (x + width + 10, bottle || pouch ? 55 : 84, x + width + 10, 305, 'H ' + Format (size.heightMm / factor), 'right', 11)}<text x="${x + width + 4}" y="322" stroke="none" font-size="11">L ${Format (size.lengthMm / factor)}</text></g></svg>`;
    }
}
