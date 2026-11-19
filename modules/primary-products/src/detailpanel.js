import { DefaultProductDetails, WallLimit } from './details.js';
import { BottleCap, BottleCapWallLimit, BottleBaseLimit, BottleWall, CapMaterials, GlassBottle, GlassThicknessPresets } from './bottleconstruction.js';
import { BindLiveNumber, RefreshLiveInput } from './liveinput.js';
import { LiveProductScale } from './livescale.js';
export class ProductDetailPanel
{
    constructor (host, parent, action)
    {
        this.host = host; this.action = action; this.liveFields = []; const make = (tag, parent, text) => { const n = document.createElement (tag); if (text) { n.textContent = text; } parent.appendChild (n); return n; };
        this.root = make ('section', parent); this.root.className = 'pp_section pp_construction'; make ('h3', this.root, 'Product construction');
        const enable = make ('label', this.root, 'Realistic detail'); this.enabled = make ('input', enable); this.enabled.type = 'checkbox'; this.enabled.setAttribute ('aria-label', 'Realistic product detail'); this.enabled.addEventListener ('change', () => action (() => host.setDetails (this.enabled.checked ? {} : null)));
        this.fields = new Map ();
        const options = { glassPreset : [...Object.entries (GlassThicknessPresets).map (([id, p]) => [id, p.name]), ['custom', 'Custom']], shoulder : ['rounded', 'sloped'], closure : ['ribbed', 'smooth', 'fliptop'], capMaterial : Object.entries (CapMaterials).map (([id, p]) => [id, p.name]), canStyle : ['beverage', 'food', 'tin'], shellStyle : ['retail', 'food'] };
        for (const [key, title, type] of [['glassPreset', 'Glass thickness', 'select'], ['wallMm', 'Wall thickness', 'number'], ['baseMm', 'Glass base thickness', 'number'], ['capWallMm', 'Cap thickness', 'number'], ['capMaterial', 'Cap material', 'select'], ['capColor', 'Cap color', 'color'], ['closure', 'Cap style', 'select'], ['textureStrength', 'Surface detail', 'range'], ['textureScaleMm', 'Texture scale', 'number'], ['shoulder', 'Shoulder style', 'select'], ['canStyle', 'Can construction', 'select'], ['shellStyle', 'Clamshell construction', 'select']]) {
            const label = make ('label', this.root, title); label.className = 'pp_field'; const input = make (type === 'select' ? 'select' : 'input', label); input.setAttribute ('aria-label', title);
            if (type === 'select') { for (const option of options[key]) { const [value, title] = Array.isArray (option) ? option : [option, option]; make ('option', input, title).value = value; } }
            else { input.type = type; input.step = type === 'range' ? '.01' : 'any'; if (type === 'color') { input.className = 'pp_color'; } else { input.min = type === 'range' ? '0' : '.001'; input.max = type === 'range' ? '1' : '100'; } }
            const commit = value => action (() => host.setDetails ({ [key] : type === 'number' ? value * this.factor : value }));
            if (type === 'number') { this.liveFields.push (BindLiveNumber (input, commit, { context : () => this.Context () })); }
            else { input.addEventListener (type === 'select' ? 'change' : 'input', () => commit (type === 'range' ? input.valueAsNumber : input.value)); }
            this.fields.set (key, { label, input, title, type });
        }
        const note = make ('p', this.root, 'Construction changes update the selected product automatically. Glass presets set wall and base thickness; smaller bottles limit them to fit.'); note.className = 'pp_draft_note';
        const scale = make ('label', this.root, 'Uniform scale (%)'); scale.className = 'pp_field'; this.scale = make ('input', scale); this.scale.type = 'number'; this.scale.min = '10'; this.scale.max = '1000'; this.scale.step = 'any'; this.scale.value = '100'; this.scale.setAttribute ('aria-label', 'Product scale percent');
        const label = make ('label', this.root, 'Scale label artwork too'); this.scaleArt = make ('input', label); this.scaleArt.type = 'checkbox'; this.scaleArt.checked = true; this.scaleArt.setAttribute ('aria-label', 'Scale label artwork too');
        this.liveScale = new LiveProductScale (host, args => host.scaleProduct (args));
        this.scaleField = BindLiveNumber (this.scale, value => action (() => this.liveScale.Commit (value, this.scaleArt.checked)), { context : () => this.Context () });
        this.liveFields.push (this.scaleField);
        make ('p', this.root, 'Scale updates automatically. Manual dimension edits reset this percentage to 100%.').className = 'pp_draft_note';
    }
    Context () { const d = this.host.inspect (); return JSON.stringify ([d.editContext, d.liveObjectId || null, d.family, this.host.units ()]); }
    Dispose () { this.liveScale.Dispose (); for (const field of this.liveFields) { field.cancel (); } }
    Refresh ()
    {
        const d = this.host.inspect (), details = d.details || DefaultProductDetails (d), bottle = d.family === 'bottle', glass = GlassBottle (d), disabled = this.host.liveBlocked ? this.host.liveBlocked () : this.host.blocked ();
        const context = this.Context (), changed = this.context !== undefined && this.context !== context; if (changed) { for (const field of this.liveFields) { field.reset (); } } this.context = context;
        const scaleReset = this.liveScale.Refresh (); if (scaleReset) { this.scaleField.reset (); } RefreshLiveInput (this.scale, this.liveScale.percent, scaleReset); this.scale.disabled = this.host.scaleBlocked ? this.host.scaleBlocked () : disabled; this.scaleArt.disabled = this.scale.disabled;
        this.factor = this.host.units () === 'standard' ? 25.4 : 1; const unit = this.factor === 1 ? 'mm' : 'in'; this.enabled.checked = Boolean (d.details);
        const cap = bottle ? BottleCap (d) : {}, wall = glass ? BottleWall (d) : {};
        const glassPreset = d.details?.glassPreset || Object.keys (GlassThicknessPresets).find (key => GlassThicknessPresets[key].wallMm === wall.wallMm && GlassThicknessPresets[key].baseMm === wall.baseMm) || 'custom';
        const values = { ...details, ...(glass ? { ...wall, glassPreset } : {}), ...(bottle ? { capWallMm : cap.wallMm, capMaterial : cap.material, capColor : cap.color, closure : cap.style } : {}) };
        for (const [key, { label, input, title, type }] of this.fields) {
            label.hidden = ['glassPreset', 'baseMm'].includes (key) ? !glass : ['capWallMm', 'capMaterial', 'capColor', 'closure'].includes (key) ? !bottle : values[key] === undefined;
            input.disabled = disabled || (!d.details && !bottle); const value = values[key];
            if (type === 'number') { RefreshLiveInput (input, value === undefined ? '' : Number ((value / this.factor).toFixed (6)), changed); label.firstChild.textContent = title + ' (' + unit + ')'; }
            else if (document.activeElement !== input || changed) { input.value = value ?? ''; }
            if (key === 'wallMm') { input.max = WallLimit (d) / this.factor; }
            if (key === 'baseMm' && bottle) { input.max = BottleBaseLimit (d) / this.factor; }
            if (key === 'capWallMm' && bottle) { input.max = BottleCapWallLimit (d) / this.factor; }
        }
    }
}
