import { DefaultProductDetails, WallLimit } from './details.js';
export class ProductDetailPanel
{
    constructor (host, parent, action)
    {
        this.host = host; this.action = action; const make = (tag, parent, text) => { const n = document.createElement (tag); if (text) { n.textContent = text; } parent.appendChild (n); return n; };
        this.root = make ('section', parent); this.root.className = 'pp_section'; make ('h3', this.root, 'Product construction');
        const enable = make ('label', this.root, 'Realistic detail'); this.enabled = make ('input', enable); this.enabled.type = 'checkbox'; this.enabled.setAttribute ('aria-label', 'Realistic product detail'); this.enabled.addEventListener ('change', () => action (() => host.setDetails (this.enabled.checked ? {} : null)));
        this.fields = new Map ();
        for (const [key, title, options] of [['wallMm', 'Wall thickness (mm)'], ['textureStrength', 'Surface detail'], ['textureScaleMm', 'Texture scale (mm)'], ['shoulder', 'Shoulder style', ['rounded', 'sloped']], ['closure', 'Closure style', ['ribbed', 'smooth', 'fliptop']], ['canStyle', 'Can construction', ['beverage', 'food', 'tin']], ['shellStyle', 'Clamshell construction', ['retail', 'food']]]) {
            const label = make ('label', this.root, title); label.className = 'pp_field'; const input = make (options ? 'select' : 'input', label); input.setAttribute ('aria-label', title);
            if (options) { for (const value of options) { const option = make ('option', input, value); option.value = value; } } else { input.type = key === 'textureStrength' ? 'range' : 'number'; input.step = key === 'textureStrength' ? '.01' : '.001'; input.min = key === 'textureStrength' ? '0' : '.001'; input.max = key === 'textureStrength' ? '1' : '100'; }
            input.addEventListener ('change', () => action (() => host.setDetails ({ [key] : options ? input.value : input.valueAsNumber }))); this.fields.set (key, { label, input });
        }
        const note = make ('p', this.root, 'Apply to selected product to rebuild construction. Walls, closures and folds are presentation geometry.'); note.className = 'pp_draft_note';
        const scale = make ('label', this.root, 'Uniform scale (%)'); scale.className = 'pp_field'; this.scale = make ('input', scale); this.scale.type = 'number'; this.scale.min = '10'; this.scale.max = '1000'; this.scale.value = '100'; this.scale.setAttribute ('aria-label', 'Product scale percent');
        const label = make ('label', this.root, 'Scale label artwork too'); this.scaleArt = make ('input', label); this.scaleArt.type = 'checkbox'; this.scaleArt.checked = true; this.scaleArt.setAttribute ('aria-label', 'Scale label artwork too');
        const apply = make ('button', this.root, 'Apply scale'); apply.type = 'button'; apply.addEventListener ('click', () => action (() => host.scaleProduct ({ factor : this.scale.valueAsNumber / 100, scaleArtwork : this.scaleArt.checked })));
    }
    Refresh ()
    {
        const d = this.host.inspect (), details = d.details || DefaultProductDetails (d); this.enabled.checked = Boolean (d.details);
        for (const [key, { label, input }] of this.fields) { label.hidden = details[key] === undefined; input.disabled = !d.details || this.host.blocked (); if (document.activeElement !== input) { input.value = details[key] ?? ''; } if (key === 'wallMm') { input.max = WallLimit (d); } }
    }
}
