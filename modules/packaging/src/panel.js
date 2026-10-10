import { FefcoPreset } from './fefco.js';
import { FefcoFamilies, FefcoStyles, FefcoSource, FefcoThumbnail } from './catalog.js';

function Element (tag, parent, text, className)
{
    const node = document.createElement (tag); if (text !== undefined) { node.textContent = text; } if (className) { node.className = className; } parent.appendChild (node); return node;
}
export class FefcoPanel
{
    constructor (workspace, parent)
    {
        this.host = workspace; this.fields = new Map (); this.cards = new Map (); this.controls = []; this.dimensionFields = new Map (); this.draftDirty = new Set ();
        const root = Element ('section', parent, undefined, 'fefco_catalog');
        const dimensionsPanel = Element ('section', root, undefined, 'fefco_selected_dimensions'); this.dimensionsPanel = dimensionsPanel; dimensionsPanel.setAttribute ('aria-label', 'Selected box dimensions'); Element ('strong', dimensionsPanel, 'Box dimensions');
        this.dimensionName = Element ('p', dimensionsPanel, 'Generate or select a box.', 'section_hint');
        const modeLabel = Element ('label', dimensionsPanel, 'Measure', 'fefco_field'); this.dimensionMode = Element ('select', modeLabel); this.dimensionMode.setAttribute ('aria-label', 'Box dimension basis'); this.dimensionMode.add (new Option ('Inside · minimum usable', 'inside')); this.dimensionMode.add (new Option ('Outside · maximum envelope', 'outside')); this.dimensionMode.addEventListener ('change', () => workspace.dimensionMode (this.dimensionMode.value));
        const sizeFields = Element ('div', dimensionsPanel, undefined, 'fefco_dimensions');
        for (const [key, label] of [['length', 'Length (L)'], ['width', 'Width (W)'], ['height', 'Height (H)'], ['thickness', 'Board caliper'], ['tolerance', 'Tolerance ±']]) {
            const field = Element ('label', sizeFields, label, 'fefco_field'); const input = Element ('input', field); input.type = 'number'; input.step = 'any'; input.min = key === 'tolerance' ? '0' : '0.001'; input.setAttribute ('aria-label', 'Box ' + label); this.dimensionFields.set (key, input);
            input.addEventListener ('input', () => { clearTimeout (this.dimensionTimer); const objectId = workspace.dimensions ()?.objectId; const value = input.valueAsNumber; if (!Number.isFinite (value)) { return; } this.dimensionChanges = { ...this.dimensionChanges, [key] : value * workspace.factor (), basis : this.dimensionMode.value }; this.dimensionTimer = setTimeout (() => { this.dimensionTimer = null; const changes = this.dimensionChanges; this.dimensionChanges = null; this.dimensionWork = (this.dimensionWork || Promise.resolve ()).then (() => { if (workspace.dimensions ()?.objectId === objectId) { return workspace.run (() => workspace.updateDimensions (changes)); } }); }, 250); });
            input.addEventListener ('blur', () => { if (!this.dimensionTimer) { this.RefreshDimensions (); } });
        }
        this.dimensionSummary = Element ('p', dimensionsPanel, undefined, 'section_hint');
        Element ('p', dimensionsPanel, 'Tolerance reserves ± per overall dimension: Inside gives the minimum usable size; Outside gives the maximum assembled envelope. Open flaps are excluded. Confirm production allowances with your converter.', 'section_hint');
        Element ('strong', root, 'FEFCO catalog');
        const family = Element ('label', root, 'Box family', 'fefco_field'); const select = Element ('select', family); select.setAttribute ('aria-label', 'FEFCO box family');
        for (const item of FefcoFamilies) { const option = new Option (item.id + ' · ' + item.name + (item.available ? '' : ' · coming later'), item.id); option.disabled = !item.available; select.add (option); } select.value = '02';
        Element ('p', root, '0200 series · first set', 'section_hint');
        Element ('strong', root, 'New box dimensions');
        Element ('p', root, 'Enter dimensions, then click a box below to generate it.', 'section_hint');
        const dimensions = Element ('div', root, undefined, 'fefco_dimensions');
        for (const [key, text, value] of [['length', 'Length (L)', '400'], ['width', 'Width (W)', '300'], ['height', 'Height (H)', '250'], ['thickness', 'Board caliper', '3'], ['overlap', 'Flap overlap', '25']]) {
            const label = Element ('label', dimensions, text, 'fefco_field'); const input = Element ('input', label); input.type = 'number'; input.step = 'any'; input.value = value; input.required = true; input.setAttribute ('aria-label', 'FEFCO ' + text); this.fields.set (key, { label, input }); this.controls.push (input);
            input.addEventListener ('input', () => this.draftDirty.add (key));
        }
        this.units = Element ('p', root, undefined, 'section_hint');
        this.closureLabel = Element ('label', root, 'Top flaps', 'fefco_field'); this.closure = Element ('select', this.closureLabel); this.closure.setAttribute ('aria-label', 'FEFCO top flaps'); this.closure.add (new Option ('Open · show inside', 'open')); this.closure.add (new Option ('Closed · shipping box', 'closed')); this.controls.push (this.closure);
        this.closure.addEventListener ('change', () => this.draftDirty.add ('closure'));
        const grid = Element ('div', root, undefined, 'fefco_cards');
        for (const style of FefcoStyles) {
            const button = Element ('button', grid, undefined, 'fefco_card'); button.type = 'button'; button.setAttribute ('aria-label', 'FEFCO ' + style.code + ' ' + style.acronym); button.title = style.description;
            const image = Element ('img', button); image.alt = ''; image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent (FefcoThumbnail (style.code)); image.width = 176; image.height = 140;
            Element ('strong', button, style.code + ' · ' + style.acronym); Element ('span', button, style.name); Element ('small', button, style.category + (style.priority ? ' · Priority' : ''));
            button.addEventListener ('click', () => workspace.run (async () => {
                const changes = this.DraftParameters ();
                let result;
                if (workspace.preset) { result = await workspace.preset (style.code, changes); } else { await workspace.configure (FefcoPreset (changes, style.code)); result = await workspace.generate (); }
                this.draftDirty.clear (); this.Refresh (); return result;
            })); this.cards.set (style.code, button); this.controls.push (button);
        }
        this.description = Element ('p', root, undefined, 'section_hint');
        this.generate = Element ('button', root, 'Generate 3D box', 'workspace_primary fefco_generate'); this.generate.type = 'button'; this.controls.push (this.generate);
        this.generate.addEventListener ('click', () => workspace.run (async () => { const changes = this.DraftParameters (); let result; if (workspace.preset) { result = await workspace.generate (changes); } else { await workspace.configure (changes); result = await workspace.generate (); } this.draftDirty.clear (); this.Refresh (); return result; }));
        this.animate = Element ('button', root, 'Animate', 'fefco_animate'); this.animate.type = 'button'; this.controls.push (this.animate); this.animate.addEventListener ('click', () => workspace.run (() => workspace.animate ()));
        if (workspace.designer) { this.designer = Element ('button', root, 'View dieline in CAD', 'fefco_animate'); this.designer.type = 'button'; this.controls.push (this.designer); this.designer.addEventListener ('click', () => workspace.run (() => workspace.designer ())); }
        Element ('p', root, 'Animate unfolds the selected box to its saved CAD dieline. Click again to assemble it. Board surfaces are checked before playback; overlapping flaps fold in separate layers.', 'section_hint');
        const playback = Element ('div', root, undefined, 'fefco_playback');
        this.foldStatus = Element ('p', playback, 'Select a box or dieline to animate.', 'section_hint'); this.foldStatus.setAttribute ('role', 'status');
        this.foldProgress = Element ('progress', playback); this.foldProgress.max = 1; this.foldProgress.value = 0; this.foldProgress.setAttribute ('aria-label', 'Box folding progress');
        this.pause = Element ('button', playback, 'Pause folding'); this.pause.type = 'button'; this.pause.addEventListener ('click', () => { try { workspace.control (workspace.playback ().state === 'paused' ? 'resume' : 'pause'); } catch (error) { this.foldStatus.textContent = error.message; } });
        this.cancel = Element ('button', playback, 'Cancel folding'); this.cancel.type = 'button'; this.cancel.addEventListener ('click', () => { try { workspace.control ('cancel'); } catch (error) { this.foldStatus.textContent = error.message; } });
        Element ('p', root, 'Kraft board, folded flaps and exposed corrugated edges. The generated profile replaces the current drawing. Dielines are design previews; verify production allowances with your converter.', 'section_hint');
        const source = Element ('a', root, 'FEFCO reference · 12th edition', 'fefco_reference'); source.href = FefcoSource; source.target = '_blank'; source.rel = 'noopener noreferrer'; this.Refresh ();
    }
    DraftParameters () { const changes = { closure : this.closure.value }; for (const [key, field] of this.fields) { changes[key] = field.input.valueAsNumber * this.host.factor (); } return changes; }
    Refresh ()
    {
        const data = this.host.inspect (); const factor = this.host.factor (); const style = FefcoStyles.find (item => item.code === data.code);
        this.description.textContent = style.description; this.units.textContent = 'Internal L × W × H in ' + (factor === 25.4 ? 'inches' : 'mm') + ' · W=X, L=Z, H=Y';
        for (const [key, field] of this.fields) { if (!this.draftDirty.has (key)) { field.input.value = String (Number ((data[key] / factor).toFixed (6))); } else if (this.draftFactor && this.draftFactor !== factor && Number.isFinite (field.input.valueAsNumber)) { field.input.value = String (Number ((field.input.valueAsNumber * this.draftFactor / factor).toFixed (6))); } field.input.min = String ((key === 'thickness' ? 0.5 : key === 'overlap' ? 0 : 20) / factor); field.input.max = String ((key === 'thickness' ? 15 : 10000) / factor); }
        this.fields.get ('overlap').label.hidden = data.code !== '0202'; this.closureLabel.hidden = data.code === '0200'; if (!this.draftDirty.has ('closure')) { this.closure.value = data.closure; } this.draftFactor = factor;
        for (const [code, button] of this.cards) { button.setAttribute ('aria-pressed', String (code === data.code)); }
        this.generate.textContent = 'Generate ' + style.acronym + ' · 3D box'; this.RefreshDimensions (); this.SetDisabled ();
    }
    RefreshDimensions ()
    {
        const data = this.host.dimensions?.(); const factor = this.host.factor (); const changed = this.dimensionObjectId !== data?.objectId; this.dimensionObjectId = data?.objectId;
        this.dimensionsPanel.hidden = !data;
        if (changed) { clearTimeout (this.dimensionTimer); this.dimensionTimer = null; this.dimensionChanges = null; }
        this.dimensionName.textContent = data ? data.name + ' · FEFCO ' + data.code + ' · ' + (factor === 25.4 ? 'inches' : 'mm') + (data.editable === false ? ' · reset object scaling to edit' : '') : 'Generate or select a box.'; this.dimensionMode.value = data?.basis || 'inside';
        const format = size => ['length', 'width', 'height'].map (key => Number ((size[key] / factor).toFixed (3))).join (' × ');
        this.dimensionSummary.textContent = data ? 'Inside ' + format (data.inside) + ' · Outside ' + format (data.outside) + ' · flap layers ' + data.allowance.baseLayers + ' base / ' + data.allowance.topLayers + ' top' : '';
        for (const [key, input] of this.dimensionFields) { input.disabled = !data || data.editable === false || this.host.dimensionsBlocked (); if (changed || document.activeElement !== input) { input.value = data ? String (Number (((data[data.basis][key] ?? data[key]) / factor).toFixed (6))) : ''; } }
        this.dimensionMode.disabled = !data || this.host.dimensionsBlocked ();
    }
    RefreshPlayback () { const state = this.host.playback?.() || { state : 'idle', progress : 0 }; const active = ['playing', 'paused'].includes (state.state); this.pause.disabled = this.cancel.disabled = !active; this.pause.textContent = state.state === 'paused' ? 'Resume folding' : 'Pause folding'; this.foldProgress.value = state.progress || 0; this.foldStatus.textContent = state.state === 'idle' ? 'Select a box or dieline to animate.' : state.state + ' · ' + (state.stage || 'folding') + ' · ' + Math.round ((state.progress || 0) * 100) + '%'; }
    SetDisabled () { const blocked = this.host.blocked (); for (const control of this.controls) { control.disabled = blocked; } this.animate.disabled = blocked || !this.host.canAnimate?.(); if (this.designer) { this.designer.disabled = blocked || !this.host.canAnimate?.(); } this.animate.title = this.host.animation?.()?.stages.join (' → ') || 'Animate selected box or dieline'; this.RefreshDimensions (); this.RefreshPlayback (); }
}
