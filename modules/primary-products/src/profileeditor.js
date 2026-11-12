import { ProfileOptions } from './profileoptions.js';
import { ProductMaterials } from './materials.js';
import { BottleShape, ProductSize, ProductName } from './state.js';
import { ProfileProjection } from './profile.js';
const ns = 'http://www.w3.org/2000/svg';
const node = (tag, parent, text) => { const n = document.createElement (tag); if (text) { n.textContent = text; } parent.appendChild (n); return n; };
export class ProductProfileEditor
{
    constructor (host, root)
    {
        this.host = host; this.root = root; root.className = 'pp_profile_editor'; root.setAttribute ('aria-label', 'Live product profile'); this.inputs = new Map ();
        const header = node ('header', root); const titles = node ('div', header); node ('strong', titles, 'Edit model'); this.name = node ('small', titles);
        const close = node ('button', header, '×'); close.type = 'button'; close.setAttribute ('aria-label', 'Close model editor'); close.addEventListener ('click', () => host.close ());
        const row = node ('label', root, 'Cross-section'); row.className = 'pp_profile_section'; this.sectionLabel = row; this.section = node ('select', row); this.section.setAttribute ('aria-label', 'Profile cross-section');
        for (const [value, title] of [['round', 'Round'], ['oval', 'Oval'], ['rectangle', 'Rounded rectangle']]) { const option = node ('option', this.section, title); option.value = value; }
        this.section.addEventListener ('change', () => this.Commit ({ crossSection : this.section.value }));
        this.scroll = node ('div', root); this.scroll.className = 'pp_profile_scroll'; this.board = node ('div', this.scroll); this.board.className = 'pp_profile_board';
        this.svg = document.createElementNS (ns, 'svg'); this.svg.setAttribute ('viewBox', '0 0 500 610'); this.svg.setAttribute ('role', 'img'); this.svg.setAttribute ('aria-label', 'Product front and cross-section with editable dimension callouts'); this.board.appendChild (this.svg);
        for (const [key, title, x, y] of [['heightMm', 'Overall height', 12, 230], ['neckDiameterMm', 'Neck diameter', 12, 70], ['capHeightMm', 'Cap height', 358, 70], ['neckHeightMm', 'Neck height', 358, 155], ['shoulderHeightMm', 'Shoulder height', 358, 240], ['widthMm', 'Width', 12, 425], ['wallMm', 'Wall thickness', 358, 425], ['lengthMm', 'Depth', 358, 525], ['cornerRadiusMm', 'Corner radius', 12, 525]]) {
            const label = node ('label', this.board, title); label.className = 'pp_profile_callout'; label.style.left = x / 5 + '%'; label.style.top = y / 6.1 + '%';
            const wrap = node ('span', label); const input = node ('input', wrap); input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', 'Profile ' + title.toLowerCase ()); const unit = node ('span', wrap); unit.className = 'pp_profile_unit';
            input.addEventListener ('input', () => { input.removeAttribute ('aria-invalid'); this.status.textContent = 'Press Enter to update the 3D model.'; });
            input.addEventListener ('keydown', event => { if (event.key === 'Enter') { event.preventDefault (); event.stopPropagation (); this.Commit ({ [key] : input.valueAsNumber * this.factor }); } });
            input.addEventListener ('focus', () => this.Highlight (key)); input.addEventListener ('blur', () => this.Highlight (null)); this.inputs.set (key, { label, input, unit });
        }
        this.options = new ProfileOptions (this.scroll, changes => this.Commit (changes)); this.labelsRoot = this.options.labelsRoot;
        this.note = node ('p', root, 'Enter a dimension, then press Enter. The 3D model updates immediately.'); this.note.className = 'pp_profile_help';
        this.status = node ('p', root); this.status.className = 'pp_profile_status'; this.status.setAttribute ('role', 'status'); this.status.setAttribute ('aria-live', 'polite');
        for (const type of ['keydown', 'keyup', 'pointerdown', 'wheel']) { root.addEventListener (type, event => event.stopPropagation ()); }
    }
    async Commit (changes)
    {
        if (this.pending) { return; } this.pending = true; this.status.textContent = 'Updating model…'; this.SetDisabled (true);
        try { const result = await this.host.update (changes, this.state.objectId); this.Refresh (this.host.inspect (), true); this.status.textContent = result.message || 'Model updated.'; }
        catch (error) { this.status.textContent = error.message; for (const key of Object.keys (changes)) { this.inputs.get (key)?.input.setAttribute ('aria-invalid', 'true'); } }
        finally { this.pending = false; this.SetDisabled (this.host.blocked ()); }
    }
    SetDisabled (disabled) { for (const input of this.root.querySelectorAll ('input, select, textarea, button')) { if (input.getAttribute ('aria-label') !== 'Close model editor') { input.disabled = disabled; } } if (!disabled) { this.host.refreshLabels?.(); } }
    Refresh (state, force = false)
    {
        if (!state?.draft) { return; } this.state = state;
        const key = JSON.stringify ([state.objectId, state.draft, state.units]);
        this.SetDisabled (this.pending || this.host.blocked ());
        if (!force && key === this.key) { return; } this.key = key;
        const d = state.draft, size = ProductSize (d), shape = d.family === 'bottle' ? BottleShape (d) : {}, values = { ...shape, ...size, cornerRadiusMm : d.bottleSection?.cornerRadiusMm, wallMm : d.details?.wallMm ?? ProductMaterials[d.material].wallMm ?? 0 };
        this.factor = state.units === 'standard' ? 25.4 : 1; const unit = this.factor === 1 ? 'mm' : 'in'; this.name.textContent = state.name || ProductName (d);
        this.sectionLabel.hidden = d.family !== 'bottle'; this.section.value = d.bottleSection?.shape || 'round';
        for (const [key, field] of this.inputs) { field.label.hidden = values[key] === undefined; field.input.value = values[key] === undefined ? '' : String (Math.round (values[key] / this.factor * 1000000) / 1000000); field.unit.textContent = unit; field.input.removeAttribute ('aria-invalid'); }
        this.note.textContent = 'Enter a dimension, then press Enter. The 3D model updates immediately.' + (state.scaled ? ' Object scale is applied after these dimensions.' : '');
        this.options.Refresh (d, this.factor); this.Draw (d, size, shape); this.status.textContent = '';
    }
    Draw (d, size, shape)
    {
        this.svg.replaceChildren (); const make = (tag, attrs, parent = this.svg) => { const n = document.createElementNS (ns, tag); for (const [key, value] of Object.entries (attrs)) { n.setAttribute (key, value); } parent.appendChild (n); return n; };
        const s = Math.min (360 / size.heightMm, 150 / size.widthMm), x = n => 250 + n*s, y = n => 435 - n*s;
        const front = make ('g', { transform : `translate(250 435) scale(${s} ${-s})` });
        for (const part of ProfileProjection (d)) { make ('path', { d : part.path, fill : part.role === 'contents' ? d.contents.color : part.role === 'body' ? d.optics?.color || d.color : '#859497', 'fill-opacity' : part.role === 'body' ? '.85' : '1' }, front); }
        this.highlights = new Map ();
        const cap = size.heightMm - (shape.capHeightMm || 0), neck = cap - (shape.neckHeightMm || 0), shoulder = neck - (shape.shoulderHeightMm || 0);
        for (const [key, low, high] of [['capHeightMm', cap, size.heightMm], ['neckHeightMm', neck, cap], ['shoulderHeightMm', shoulder, neck], ['neckDiameterMm', neck, cap]]) { if (d.family === 'bottle') { this.highlights.set (key, make ('rect', { x : x(-size.widthMm/2)-3, y : y(high), width : size.widthMm*s+6, height : Math.max (3, (high-low)*s), fill : '#458b9b', opacity : '0' })); } }
        const lines = make ('g', { stroke : '#458b9b', 'stroke-width' : '1.2', fill : 'none' });
        const line = (x1, y1, x2, y2) => make ('path', { d : `M${x1},${y1}L${x2},${y2}` }, lines);
        const vertical = (xx, a, b, endX, endY) => { line(xx, a, xx, b); for (const yy of [a, b]) { line(xx-4, yy, xx+4, yy); } line(xx, (a+b)/2, endX, endY); };
        vertical (160, y(size.heightMm), 435, 142, 256); line(x(-size.widthMm/2), 450, x(size.widthMm/2), 450); for (const xx of [x(-size.widthMm/2), x(size.widthMm/2)]) { line(xx, 445, xx, 455); } line(x(-size.widthMm/2), 450, 142, 451);
        const wall = d.details?.wallMm || ProductMaterials[d.material].wallMm || 0;
        line (x(size.widthMm/2-wall), 425, x(size.widthMm/2), 425); line (x(size.widthMm/2), 425, 358, 451);
        if (d.family === 'bottle') {
            vertical (340, y(size.heightMm), y(cap), 358, 96); vertical (340, y(cap), y(neck), 358, 181); vertical (340, y(neck), y(shoulder), 358, 266);
            const nw = shape.neckDiameterMm*s/2, yy = y((cap+neck)/2); line(250-nw, yy, 250+nw, yy); line(250-nw, yy, 142, 96);
        }
        const ts = Math.min (130/size.widthMm, 90/size.lengthMm); const top = make ('g', { transform : `translate(250 550) scale(${ts} ${ts})` });
        for (const part of ProfileProjection (d, 'top')) { make ('path', { d : part.path, fill : part.role === 'contents' ? d.contents.color : part.role === 'body' ? d.optics?.color || d.color : '#859497' }, top); }
        vertical (332, 550-size.lengthMm*ts/2, 550+size.lengthMm*ts/2, 358, 551);
        if (d.bottleSection?.shape === 'rectangle') { line(250-size.widthMm*ts/2+5, 550-size.lengthMm*ts/2+5, 142, 551); }
        const text = make ('text', { x : 250, y : 494, 'text-anchor' : 'middle', fill : 'currentColor', 'font-size' : 12 }); text.textContent = 'TOP / CROSS-SECTION';
        const frontText = make ('text', { x : 250, y : 35, 'text-anchor' : 'middle', fill : 'currentColor', 'font-size' : 12 }); frontText.textContent = 'FRONT PROFILE';
    }
    Highlight (key) { for (const [id, n] of this.highlights || []) { n.setAttribute ('opacity', id === key ? '.25' : '0'); } }
}
