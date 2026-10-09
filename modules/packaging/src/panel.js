import { FefcoFamilies, FefcoStyles, FefcoSource, FefcoThumbnail } from './catalog.js';

function Element (tag, parent, text, className)
{
    const node = document.createElement (tag); if (text !== undefined) { node.textContent = text; } if (className) { node.className = className; } parent.appendChild (node); return node;
}
export class FefcoPanel
{
    constructor (workspace, parent)
    {
        this.host = workspace; this.fields = new Map (); this.cards = new Map (); this.controls = [];
        const root = Element ('section', parent, undefined, 'fefco_catalog'); Element ('strong', root, 'FEFCO catalog');
        const family = Element ('label', root, 'Box family', 'fefco_field'); const select = Element ('select', family); select.setAttribute ('aria-label', 'FEFCO box family');
        for (const item of FefcoFamilies) { const option = new Option (item.id + ' · ' + item.name + (item.available ? '' : ' · coming later'), item.id); option.disabled = !item.available; select.add (option); } select.value = '02';
        Element ('p', root, '0200 series · first set', 'section_hint');
        for (const category of [...new Set (FefcoStyles.map (item => item.category))]) {
            const group = Element ('div', root, undefined, 'fefco_group'); Element ('strong', group, category); const grid = Element ('div', group, undefined, 'fefco_cards');
            for (const style of FefcoStyles.filter (item => item.category === category)) {
                const button = Element ('button', grid, undefined, 'fefco_card'); button.type = 'button'; button.setAttribute ('aria-label', 'FEFCO ' + style.code + ' ' + style.acronym); button.title = style.description;
                const image = Element ('img', button); image.alt = ''; image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent (FefcoThumbnail (style.code)); image.width = 176; image.height = 140;
                Element ('strong', button, style.code + ' · ' + style.acronym); Element ('span', button, style.name); if (style.priority) { Element ('small', button, 'Priority'); }
                button.addEventListener ('click', () => workspace.run (() => {
                    const data = workspace.inspect (); const changes = { code : style.code };
                    if (style.code === '0202' && (data.overlap <= 0 || data.overlap >= data.width)) { changes.overlap = Math.min (25, data.width / 4); }
                    return workspace.configure (changes);
                })); this.cards.set (style.code, button); this.controls.push (button);
            }
        }
        this.description = Element ('p', root, undefined, 'section_hint');
        const dimensions = Element ('div', root, undefined, 'fefco_dimensions');
        for (const [key, text, value] of [['length', 'Length (L)', '400'], ['width', 'Width (W)', '300'], ['height', 'Height (H)', '250'], ['thickness', 'Board caliper', '3'], ['overlap', 'Flap overlap', '25']]) {
            const label = Element ('label', dimensions, text, 'fefco_field'); const input = Element ('input', label); input.type = 'number'; input.step = 'any'; input.value = value; input.required = true; input.setAttribute ('aria-label', 'FEFCO ' + text); this.fields.set (key, { label, input }); this.controls.push (input);
            input.addEventListener ('change', () => workspace.run (() => { try { return workspace.configure ({ [key] : input.valueAsNumber * workspace.factor () }); } finally { this.Refresh (); } }));
        }
        this.units = Element ('p', root, undefined, 'section_hint');
        this.closureLabel = Element ('label', root, 'Top flaps', 'fefco_field'); this.closure = Element ('select', this.closureLabel); this.closure.setAttribute ('aria-label', 'FEFCO top flaps'); this.closure.add (new Option ('Open · show inside', 'open')); this.closure.add (new Option ('Closed · shipping box', 'closed')); this.controls.push (this.closure);
        this.closure.addEventListener ('change', () => workspace.run (() => workspace.configure ({ closure : this.closure.value })));
        this.generate = Element ('button', root, 'Generate 3D box', 'workspace_primary fefco_generate'); this.generate.type = 'button'; this.controls.push (this.generate);
        this.generate.addEventListener ('click', () => workspace.run (() => workspace.generate ()));
        this.unfold = Element ('button', root, 'Unfold selected box', 'fefco_unfold'); this.unfold.type = 'button'; this.controls.push (this.unfold); this.unfold.addEventListener ('click', () => workspace.run (() => workspace.unfold ()));
        Element ('p', root, 'Kraft board, folded flaps and exposed corrugated edges. The generated profile replaces the current drawing. Dielines are design previews; verify production allowances with your converter.', 'section_hint');
        const source = Element ('a', root, 'FEFCO reference · 12th edition', 'fefco_reference'); source.href = FefcoSource; source.target = '_blank'; source.rel = 'noopener noreferrer'; this.Refresh ();
    }
    Refresh ()
    {
        const data = this.host.inspect (); const factor = this.host.factor (); const style = FefcoStyles.find (item => item.code === data.code);
        this.description.textContent = style.description; this.units.textContent = 'Internal L × W × H in ' + (factor === 25.4 ? 'inches' : 'mm') + ' · W=X, L=Z, H=Y';
        for (const [key, field] of this.fields) { field.input.value = String (Number ((data[key] / factor).toFixed (6))); field.input.min = String ((key === 'thickness' ? 0.5 : key === 'overlap' ? 0 : 20) / factor); field.input.max = String ((key === 'thickness' ? 15 : 10000) / factor); }
        this.fields.get ('overlap').label.hidden = data.code !== '0202'; this.closureLabel.hidden = data.code === '0200'; this.closure.value = data.closure;
        for (const [code, button] of this.cards) { button.setAttribute ('aria-pressed', String (code === data.code)); }
        this.generate.textContent = 'Generate ' + style.acronym + ' · 3D box'; this.SetDisabled ();
    }
    SetDisabled () { const blocked = this.host.blocked (); for (const control of this.controls) { control.disabled = blocked; } this.unfold.disabled = blocked || !this.host.canUnfold (); }
}
