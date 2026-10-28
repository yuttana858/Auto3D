import { BoardFlutes, DefaultBoardDatabase } from './boarddatabase.js';
import { OpenBoardDatabaseEditor } from './boarddatabasepanel.js';
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
        this.host = workspace; this.fields = new Map (); this.cards = new Map (); this.controls = []; this.dimensionFields = new Map (); this.draftDirty = new Set (['length', 'width', 'height']);
        const root = Element ('section', parent, undefined, 'fefco_catalog'); this.root = root;
        const dimensionsPanel = Element ('section', root, undefined, 'fefco_selected_dimensions'); this.dimensionsPanel = dimensionsPanel; dimensionsPanel.setAttribute ('aria-label', 'Selected box dimensions');
        const modeLabel = Element ('label', dimensionsPanel, 'Measure', 'fefco_field'); this.dimensionMode = Element ('select', modeLabel); this.dimensionMode.setAttribute ('aria-label', 'Box dimension basis'); this.dimensionMode.add (new Option ('Inside (ID)', 'inside')); this.dimensionMode.add (new Option ('Outside (OD)', 'outside')); this.dimensionMode.addEventListener ('change', () => workspace.dimensionMode (this.dimensionMode.value));
        const sizeFields = Element ('div', dimensionsPanel, undefined, 'fefco_dimension_row');
        for (const [key, label] of [['width', 'Width (W)'], ['length', 'Length (L)'], ['height', 'Height (H)'], ['tolerance', 'Tolerance ±']]) {
            const field = Element ('label', key === 'tolerance' ? dimensionsPanel : sizeFields, label, 'fefco_field'); const input = Element ('input', field); input.type = 'number'; input.step = 'any'; input.min = key === 'tolerance' ? '0' : '0.001'; input.setAttribute ('aria-label', 'Box ' + label); this.dimensionFields.set (key, input);
            input.addEventListener ('input', () => { clearTimeout (this.dimensionTimer); const objectId = workspace.dimensions ()?.objectId; const value = input.valueAsNumber; if (!Number.isFinite (value)) { return; } this.dimensionChanges = { ...this.dimensionChanges, [key] : value * workspace.factor (), basis : this.dimensionMode.value }; this.dimensionTimer = setTimeout (() => { this.dimensionTimer = null; const changes = this.dimensionChanges; this.dimensionChanges = null; this.dimensionWork = (this.dimensionWork || Promise.resolve ()).then (() => { if (workspace.dimensions ()?.objectId === objectId) { return workspace.run (() => workspace.updateDimensions (changes)); } }); }, 250); });
            input.addEventListener ('blur', () => { if (!this.dimensionTimer) { this.RefreshDimensions (); } });
        }
        this.selectedBoardSelect = this.CreateBoardSelector (dimensionsPanel, 'Selected board', 'selected');
        Element ('strong', root, 'FEFCO catalog');
        const family = Element ('label', root, 'Box family', 'fefco_field'); const select = Element ('select', family); select.setAttribute ('aria-label', 'FEFCO box family');
        for (const item of FefcoFamilies) { const option = new Option (item.id + ' · ' + item.name + (item.available ? '' : ' · coming later'), item.id); option.disabled = !item.available; select.add (option); } select.value = '02';
        Element ('strong', root, 'Box Dimensions');
        const basisLabel = Element ('label', root, 'Dimension basis', 'fefco_field'); this.generationBasis = Element ('select', basisLabel); this.generationBasis.setAttribute ('aria-label', 'New box dimension basis'); this.generationBasis.add (new Option ('Inside (ID)', 'inside')); this.generationBasis.add (new Option ('Outside (OD)', 'outside')); this.generationBasis.add (new Option ('Score / CAD', 'score')); this.controls.push (this.generationBasis);
        this.draftBasis = workspace.generationBasis?.() || 'inside';
        this.generationBasis.addEventListener ('change', () => {
            const to = this.generationBasis.value, from = this.draftBasis; let message = 'Enter the desired ' + to + ' dimensions. Inside/outside values require applicable converter allowances.';
            if (this.host.convertGenerationBasis) { try { const values = Object.fromEntries (['length', 'width', 'height'].map (key => [key, this.fields.get (key).input.valueAsNumber * this.host.factor ()])); const converted = this.host.convertGenerationBasis ({ from, to, ...values }); for (const [key, value] of Object.entries (converted.dimensions)) { this.fields.get (key).input.value = String (Number ((value / this.host.factor ()).toFixed (6))); } message = 'Converted using the current style and board allowances.'; } catch { message = 'Enter the desired ' + to + ' dimensions. Conversion needs applicable converter allowances.'; } }
            this.draftBasis = to; this.host.setGenerationBasis?.(to); this.draftDirty.add ('basis'); this.generationStatus.textContent = message;
        });
        const dimensions = Element ('div', root, undefined, 'fefco_dimension_row');
        for (const [key, text, value] of [['width', 'Width (W)', '300'], ['length', 'Length (L)', '400'], ['height', 'Height (H)', '250'], ['overlap', 'Flap overlap', '25']]) {
            const label = Element ('label', key === 'overlap' ? root : dimensions, text, 'fefco_field'); const input = Element ('input', label); input.type = 'number'; input.step = 'any'; input.value = String (Number ((Number (value) / workspace.factor ()).toFixed (6))); input.required = true; input.setAttribute ('aria-label', 'FEFCO ' + text); this.fields.set (key, { label, input }); this.controls.push (input);
            input.addEventListener ('input', () => this.draftDirty.add (key));
        }
        this.newBoardSelect = this.CreateBoardSelector (root, 'Board', 'generation');
        this.closureLabel = Element ('label', root, undefined, 'fefco_field'); this.closure = Element ('select', this.closureLabel); this.closure.setAttribute ('aria-label', 'FEFCO top flaps'); this.closure.add (new Option ('Open · show inside', 'open')); this.closure.add (new Option ('Closed · shipping box', 'closed')); this.controls.push (this.closure);
        this.closure.addEventListener ('change', () => this.draftDirty.add ('closure'));
        const grid = Element ('div', root, undefined, 'fefco_cards');
        for (const style of FefcoStyles) {
            const button = Element ('button', grid, undefined, 'fefco_card'); button.type = 'button'; button.setAttribute ('aria-label', 'FEFCO ' + style.code + ' ' + style.acronym); button.title = style.description;
            const image = Element ('img', button); image.alt = ''; image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent (FefcoThumbnail (style.code)); image.width = 176; image.height = 140;
            Element ('strong', button, style.code + ' · ' + style.acronym); Element ('span', button, style.name);
            button.addEventListener ('click', () => this.RunGeneration (async () => {
                const changes = this.DraftParameters ();
                let result;
                if (workspace.preset) { result = await workspace.preset (style.code, changes); } else { const { basis, ...fields } = changes; if (basis !== 'score') { throw new Error ('This host requires a dimensional preset service to generate ID/OD targets. Select score or update the host.'); } await workspace.configure (FefcoPreset (fields, style.code)); result = await workspace.generate (); }
                this.Refresh (); return result;
            })); this.cards.set (style.code, button); this.controls.push (button);
        }
        this.generationStatus = Element ('p', root, '', 'section_hint'); this.generationStatus.setAttribute ('role', 'status'); this.generationStatus.setAttribute ('aria-live', 'polite');
        this.appearanceControls = new Map ();
        const appearance = Element ('details', root, undefined, 'board_appearance'); Element ('summary', appearance, 'Realistic board surface');
        Element ('p', appearance, 'Visual bowing, soft scores and compressed cut edges. CAD dimensions stay exact.', 'section_hint');
        for (const [key, title, max] of [['enabled', 'Enable board surface', 1], ['panelBow', 'Panel bow', 1], ['foldSoftness', 'Fold softness', 2], ['cutCompression', 'Cut compression', 1], ['paperGrain', 'Paper grain', 1]]) {
            const label = Element ('label', appearance, title, 'fefco_field'), input = Element ('input', label); input.type = key === 'enabled' ? 'checkbox' : 'range'; input.min = '0'; input.max = String (max); input.step = '.01'; input.setAttribute ('aria-label', title); this.appearanceControls.set (key, input);
            input.addEventListener ('change', async () => { input.disabled = true; try { await workspace.run (() => workspace.updateAppearance ({ [key] : key === 'enabled' ? input.checked : Number (input.value) })); } catch (error) { this.generationStatus.textContent = error.message; } finally { this.RefreshAppearance (); } });
        }
        const scrubLabel = Element ('label', root, 'Fold / unfold', 'fold_scrub'); this.foldScrub = Element ('input', scrubLabel); this.foldScrub.type = 'range'; this.foldScrub.min = '0'; this.foldScrub.max = '1'; this.foldScrub.step = '0.005'; this.foldScrub.value = '1'; this.foldScrub.setAttribute ('aria-label', 'Fold / unfold position'); this.controls.push (this.foldScrub);
        const scrub = commit => { if (!workspace.scrub) { return; } Promise.resolve (workspace.scrub (Number (this.foldScrub.value), commit)).catch (error => { this.foldStatus.textContent = error.message; }); };
        this.foldScrub.addEventListener ('input', () => scrub (false)); this.foldScrub.addEventListener ('change', () => scrub (true));
        this.animate = Element ('button', root, 'Unfold', 'fefco_animate'); this.animate.type = 'button'; this.controls.push (this.animate); this.animate.addEventListener ('click', () => { const state = workspace.playback?.().state; const action = workspace.toggleFold ? () => workspace.toggleFold () : () => state === 'playing' ? workspace.control ('pause') : state === 'paused' ? workspace.control ('resume') : workspace.run (() => workspace.animate ()); Promise.resolve ().then (action).catch (error => { this.generationStatus.textContent = 'Cannot fold: ' + error.message; }).finally (() => this.SetDisabled ()); });
        if (workspace.designer) { this.designer = Element ('button', root, 'View dieline in CAD', 'fefco_animate'); this.designer.type = 'button'; this.controls.push (this.designer); this.designer.addEventListener ('click', () => workspace.run (() => workspace.designer ())); }
        const playback = Element ('div', root, undefined, 'fefco_playback'); this.playback = playback;
        this.foldStatus = Element ('p', playback, 'Select a box or dieline to animate.', 'section_hint'); this.foldStatus.setAttribute ('role', 'status');
        this.foldProgress = Element ('progress', playback); this.foldProgress.max = 1; this.foldProgress.value = 0; this.foldProgress.setAttribute ('aria-label', 'Box folding progress');
        this.cancel = Element ('button', playback, 'Cancel folding'); this.cancel.type = 'button'; this.cancel.addEventListener ('click', () => { try { workspace.control ('cancel'); } catch (error) { this.foldStatus.textContent = error.message; } });
        const source = Element ('a', root, 'FEFCO reference · 12th edition', 'fefco_reference'); source.href = FefcoSource; source.target = '_blank'; source.rel = 'noopener noreferrer'; this.Refresh ();
    }
    BoardRecords () { return this.host.boards?.().records || this.localBoardRecords || DefaultBoardDatabase (); }
    CreateBoardSelector (parent, title, target)
    {
        const row = Element ('div', parent, undefined, 'fefco_board_row'); const label = Element ('label', row, title, 'fefco_field'); const select = Element ('select', label); select.setAttribute ('aria-label', title);
        select.addEventListener ('change', () => { if (select.value === '__current__') { return; } this.host.run (async () => { try { const record = this.BoardRecords ().find (item => item.id === select.value); if (this.host.selectBoard) { await this.host.selectBoard (select.value, target); } else if (target === 'generation') { this.localGenerationBoardId = record.id; this.host.configure ({ thickness : record.caliperMm }); } else { await this.host.updateDimensions ({ thickness : record.caliperMm }); } } finally { this.Refresh (); } }); });
        const gear = Element ('button', row, '⚙'); gear.type = 'button'; gear.setAttribute ('aria-label', 'Edit board database' + (target === 'selected' ? ' for selected box' : '')); gear.addEventListener ('click', () => this.host.run (() => this.host.boardEditor ? this.host.boardEditor () : OpenBoardDatabaseEditor ({ records : this.BoardRecords (), save : records => { this.localBoardRecords = records; const active = records.find (item => item.id === this.localGenerationBoardId); if (active) { this.host.configure ({ thickness : active.caliperMm }); } this.Refresh (); } }))); this.controls.push (gear); if (target === 'generation') { this.controls.push (select); } return select;
    }
    RefreshBoardSelector (select, preferred, thickness, material = null)
    {
        if (!select) { return; } const records = this.BoardRecords (); let active = records.find (record => record.id === preferred && record.caliperMm === thickness && (!material || Object.keys (record).every (key => material[key] === record[key])));
        if (!preferred && !material) { active = records.find (record => record.caliperMm === thickness); }
        select.replaceChildren ();
        if (!active) { const current = new Option ('Current board · ' + (thickness ?? this.host.inspect ().thickness) + ' mm', '__current__'); select.add (current); }
        for (const flute of BoardFlutes) { const group = document.createElement ('optgroup'); group.label = flute + ' flute'; for (const record of records.filter (item => item.flute === flute)) { group.appendChild (new Option (record.name + ' · ' + record.caliperMm + ' mm', record.id)); } select.appendChild (group); }
        select.value = active?.id || '__current__';
    }
    async RunGeneration (action)
    {
        if (this.generating || this.host.blocked ()) { return; }
        this.generating = true; this.generationStatus.textContent = 'Generating box…'; this.SetDisabled ();
        try {
            return await this.host.run (async () => {
                try { const result = await action (); this.generationStatus.textContent = 'Box added to scene.'; return result; }
                catch (error) { this.generationStatus.textContent = 'Cannot generate box: ' + error.message; throw error; }
            });
        } finally { this.generating = false; this.SetDisabled (); }
    }
    DraftParameters () { const changes = { closure : this.closure.value, basis : this.generationBasis.value }; for (const [key, field] of this.fields) { changes[key] = field.input.valueAsNumber * this.host.factor (); } const board = this.BoardRecords ().find (record => record.id === this.newBoardSelect.value); changes.thickness = board?.caliperMm ?? this.host.inspect ().thickness; return changes; }
    Refresh ()
    {
        const data = this.host.inspect (); const factor = this.host.factor (); const style = FefcoStyles.find (item => item.code === data.code);
        if (this.host.generationBasis) { this.generationBasis.value = this.host.generationBasis (); this.draftBasis = this.generationBasis.value; }
        this.root.title = 'Dimensions use ' + (factor === 25.4 ? 'inches' : 'mm') + ' · selected inside or outside basis';
        for (const [key, field] of this.fields) { if (!this.draftDirty.has (key)) { field.input.value = String (Number ((data[key] / factor).toFixed (6))); } else if (this.draftFactor && this.draftFactor !== factor && Number.isFinite (field.input.valueAsNumber)) { field.input.value = String (Number ((field.input.valueAsNumber * this.draftFactor / factor).toFixed (6))); } field.input.min = String ((key === 'thickness' ? 0.5 : key === 'overlap' ? 0 : 20) / factor); field.input.max = String ((key === 'thickness' ? 15 : 10000) / factor); }
        this.fields.get ('overlap').label.hidden = data.code !== '0202'; this.closureLabel.hidden = data.code === '0200'; if (!this.draftDirty.has ('closure')) { this.closure.value = data.closure; } this.draftFactor = factor;
        for (const [code, button] of this.cards) { button.setAttribute ('aria-pressed', String (code === data.code)); }
        this.RefreshBoardSelector (this.newBoardSelect, this.host.generationBoard?.() || this.localGenerationBoardId, data.thickness);
        this.RefreshDimensions (); this.SetDisabled ();
    }
    RefreshDimensions ()
    {
        const data = this.host.dimensions?.(); const factor = this.host.factor (); const changed = this.dimensionObjectId !== data?.objectId; this.dimensionObjectId = data?.objectId;
        this.dimensionsPanel.hidden = !data;
        if (changed) { clearTimeout (this.dimensionTimer); this.dimensionTimer = null; this.dimensionChanges = null; }
        this.dimensionMode.value = data?.basis || 'inside';
        this.RefreshBoardSelector (this.selectedBoardSelect, data?.materialId, data?.thickness, data?.material); this.selectedBoardSelect.disabled = !data || data.editable === false || this.host.dimensionsBlocked ();
        for (const [key, input] of this.dimensionFields) { input.disabled = !data || data.editable === false || this.host.dimensionsBlocked (); if (changed || document.activeElement !== input) { const value = data ? data[data.basis][key] ?? data[key] : null; input.value = value === null || value === undefined ? '' : String (Number ((value / factor).toFixed (6))); if (key === 'tolerance') { input.placeholder = data?.tolerance === null ? 'Mixed · edit per axis' : ''; input.title = 'Set the same score tolerance for every axis; Measurement layer shows total material/process uncertainty.'; } } }
        this.dimensionMode.disabled = !data || this.host.dimensionsBlocked ();
    }
    RefreshAppearance () { const state = this.host.appearance?.(); for (const [key, input] of this.appearanceControls || []) { input.disabled = this.generating || this.host.blocked () || !state?.available || !this.host.updateAppearance; if (key === 'enabled') { input.checked = state?.settings.enabled ?? true; } else { input.value = String (state?.settings[key] ?? 0); } } }
    RefreshPlayback ()
    {
        this.RefreshAppearance (); const scrub = this.host.scrubInspect?.();
        if (this.foldScrub) { this.foldScrub.disabled = this.generating || this.host.blocked () || !this.host.scrub || !scrub?.available; if (document.activeElement !== this.foldScrub) { this.foldScrub.value = String (scrub?.progress ?? 1); } }
        const state = this.host.playback?.() || { state : 'idle', progress : 0 }; const active = ['playing', 'paused'].includes (state.state); const preparing = ['preparing', 'finishing', 'cancelling', 'restoring'].includes (state.state);
        this.playback.hidden = !active && !preparing; this.cancel.disabled = !active; this.foldProgress.value = state.progress || 0;
        this.foldStatus.textContent = active || preparing ? state.state + ' · ' + (state.stage || 'folding') + ' · ' + Math.round ((state.progress || 0) * 100) + '%' : '';
        const action = this.host.animation?.()?.action; this.animate.textContent = state.state === 'playing' ? 'Pause' : state.state === 'paused' ? 'Resume' : preparing ? 'Preparing…' : action === 'fold' ? 'Fold' : 'Unfold';
        this.animate.disabled = this.generating || (active ? !!this.host.playbackBlocked?.() : this.host.blocked () || !this.host.canAnimate?.()) || preparing;
        this.animate.title = active ? (state.state === 'paused' ? 'Resume folding animation' : 'Pause folding animation') : this.host.animation?.()?.stages.join (' → ') || 'Select a box to fold or unfold';
    }
    SetDisabled () { const blocked = this.generating || this.host.blocked (); for (const control of this.controls) { control.disabled = blocked; } this.animate.disabled = blocked || !this.host.canAnimate?.(); if (this.designer) { this.designer.disabled = blocked || !this.host.canAnimate?.(); } this.animate.title = this.host.animation?.()?.stages.join (' → ') || 'Animate selected box or dieline'; this.RefreshDimensions (); this.RefreshPlayback (); }
}
