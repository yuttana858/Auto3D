import { ListProductMaterials, ProductMaterials } from './materials.js';
import { ContentPresets, ValidateContents } from './contents.js';
const add = (tag, parent, text) => { const n = document.createElement (tag); if (text) { n.textContent = text; } parent.appendChild (n); return n; };
export class ProfileOptions
{
    constructor (parent, commit)
    {
        this.commit = commit; this.fields = new Map ();
        const section = title => { const box = add ('details', parent); box.className = 'pp_profile_options'; box.open = true; add ('summary', box, title); return box; };
        this.surface = section ('Material & glass'); this.material = this.Select (this.surface, 'Product material', value => commit ({ material : value }));
        this.Field (this.surface, 'color', 'Surface color', 'color', value => commit ({ color : value }));
        this.Field (this.surface, 'roughness', 'Roughness (%)', 'number', value => commit ({ roughness : value / 100 }));
        this.glass = add ('div', this.surface); this.glass.className = 'pp_profile_glass';
        for (const [id, title, type] of [['glassColor', 'Glass tint', 'color'], ['glassOpacity', 'Glass opacity (%)', 'number'], ['ior', 'Glass IOR', 'number'], ['tintDistance', 'Tint depth', 'number']]) {
            this.Field (this.glass, id, title, type, value => {
                const key = { glassColor : 'color', glassOpacity : 'opacity', ior : 'ior', tintDistance : 'tintDistanceMm' }[id];
                commit ({ optics : { ...this.optics, [key] : id === 'glassOpacity' ? value / 100 : id === 'tintDistance' ? value * this.factor : value } });
            });
        }
        add ('p', this.glass, 'Lower tint depth gives stronger color through thick glass. IOR controls refraction.').className = 'pp_draft_note';
        this.contents = section ('Bottle contents'); this.type = this.Select (this.contents, 'Contents type', value => commit ({ contents : value === 'none' ? null : ValidateContents ({ type : value, fillPercent : this.draft.contents?.fillPercent ?? 70 }) }));
        for (const [value, label] of [['none', 'Empty bottle'], ...Object.entries (ContentPresets).map (([id, p]) => [id, p.name])]) { const o = add ('option', this.type, label); o.value = value; }
        this.fillFields = add ('div', this.contents);
        for (const [id, title, type] of [['fillPercent', 'Fill height (%)', 'number'], ['fillColor', 'Contents color', 'color'], ['fillOpacity', 'Contents opacity (%)', 'number'], ['viscosity', 'Viscosity (mPa·s)', 'number']]) {
            this.Field (this.fillFields, id, title, type, value => commit ({ contents : { ...this.draft.contents, [{ fillColor : 'color', fillOpacity : 'opacity' }[id] || id] : id === 'fillOpacity' ? value / 100 : value } }));
        }
        this.fillNote = add ('p', this.contents); this.fillNote.className = 'pp_draft_note';
        this.labels = section ('Label art'); this.labelsRoot = add ('div', this.labels);
    }
    Select (root, title, change)
    {
        const label = add ('label', root, title); label.className = 'pp_field'; const input = add ('select', label); input.setAttribute ('aria-label', title); input.addEventListener ('change', () => change (input.value)); return input;
    }
    Field (root, id, title, type, change)
    {
        const label = add ('label', root, title); label.className = 'pp_field'; const input = add ('input', label); input.type = type; input.setAttribute ('aria-label', title);
        if (type === 'number') { input.step = 'any'; input.addEventListener ('keydown', event => { if (event.key === 'Enter') { event.preventDefault (); change (input.valueAsNumber); } }); }
        else { input.addEventListener ('change', () => change (input.value)); }
        this.fields.set (id, { input, label });
    }
    Refresh (draft, factor)
    {
        this.draft = draft; this.factor = factor; const preset = ProductMaterials[draft.material];
        if (this.family !== draft.family) { this.family = draft.family; this.material.replaceChildren (); for (const m of ListProductMaterials (draft.family)) { const o = add ('option', this.material, m.name); o.value = m.id; } }
        this.material.value = draft.material; this.contents.hidden = draft.family !== 'bottle'; this.type.value = draft.contents?.type || 'none'; this.fillFields.hidden = !draft.contents;
        this.glass.hidden = draft.family !== 'bottle' || !preset.transmission; this.fields.get ('color').label.hidden = !this.glass.hidden;
        this.optics = draft.optics || { color : draft.color, opacity : 1 - (preset.transmission || 0), ior : preset.ior || 1.5, tintDistanceMm : 25 };
        const values = { color : draft.color, roughness : draft.roughness * 100, glassColor : this.optics.color, glassOpacity : this.optics.opacity * 100, ior : this.optics.ior, tintDistance : this.optics.tintDistanceMm / factor, fillPercent : draft.contents?.fillPercent ?? 70, fillColor : draft.contents?.color || '#c9e9ef', fillOpacity : (draft.contents?.opacity ?? .18) * 100, viscosity : draft.contents?.viscosity ?? 1 };
        for (const [id, field] of this.fields) { field.input.value = values[id]; }
        const tintLabel = 'Tint depth (' + (factor === 1 ? 'mm' : 'in') + ')';
        this.fields.get ('tintDistance').input.setAttribute ('aria-label', tintLabel); this.fields.get ('tintDistance').label.firstChild.textContent = tintLabel;
        this.fillNote.textContent = 'Static, upright fill by cavity height. Viscosity is saved for reference; no fluid motion is simulated.' + (!preset.transmission ? ' Choose a clear bottle material to see contents.' : '');
    }
}
