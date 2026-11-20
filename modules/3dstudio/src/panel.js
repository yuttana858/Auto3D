import { StudioVersion, StudioPrimitives, CreatePrimitiveDefinition } from './definition.js';
import { MergeStudioPatch, StudioEditQueue } from './liveedit.js';

function Element (tag, className, text, parent)
{
    const node = document.createElement (tag); if (className) { node.className = className; } if (text !== undefined) { node.textContent = text; } parent?.appendChild (node); return node;
}
const Operations = { union : 'Add / union', subtract : 'Subtract', intersect : 'Intersect' };
const Clone = value => JSON.parse (JSON.stringify (value));
const PrimitiveIcons = {
    box : '<path d="M8 14 24 6 40 14 24 23Z M8 14v20l16 9 16-9V14 M24 23v20"/>',
    sphere : '<circle cx="24" cy="24" r="17"/><ellipse cx="24" cy="24" rx="8" ry="17"/><ellipse cx="24" cy="24" rx="17" ry="7"/>',
    cylinder : '<ellipse cx="24" cy="10" rx="13" ry="5"/><path d="M11 10v28c0 7 26 7 26 0V10"/><path d="M11 36c0 7 26 7 26 0"/>',
    tube : '<ellipse cx="24" cy="10" rx="15" ry="6"/><ellipse cx="24" cy="10" rx="9" ry="3"/><path d="M9 10v27c0 8 30 8 30 0V10"/>',
    cone : '<path d="M24 5 7 36c0 9 34 9 34 0Z"/><path d="M7 36c0-8 34-8 34 0"/>',
    torus : '<ellipse cx="24" cy="25" rx="20" ry="13"/><ellipse cx="24" cy="23" rx="10" ry="5"/><path d="M5 28c6 10 32 10 38 0"/>',
    capsule : '<path d="M12 16C12 1 36 1 36 16v16c0 15-24 15-24 0Z"/><path d="M12 17c0 6 24 6 24 0M12 31c0 6 24 6 24 0"/>'
};

// All app, account, scene and worker behavior stays behind these neutral host
// callbacks. This panel can also be mounted in the module's independent preview.
export class StudioPanel
{
    constructor (host, parent)
    {
        this.host = host; this.fields = []; this.newType = 'box'; this.newMode = false; this.nodeId = null;
        this.draft = this.DefaultNode (this.newType); this.root = Element ('div', 'studio_workspace', undefined, parent);
        this.queue = new StudioEditQueue (() => this.Context (), args => this.host.updateNode (args), () => this.Refresh ());
        this.root.addEventListener ('keydown', event => { if (event.target.closest?.('input, select, textarea, button')) { event.stopPropagation (); } });
        this.root.addEventListener ('keyup', event => { if (event.target.closest?.('input, select, textarea, button')) { event.stopPropagation (); } });
        const header = Element ('div', 'studio_intro', undefined, this.root); Element ('span', 'studio_kicker', '3DSTUDIO · SOLID MODELING', header); Element ('span', 'studio_version', 'v' + StudioVersion, header);
        this.contextText = Element ('p', 'studio_context', '', this.root);
        const create = this.Section ('Primitive'); this.cards = Element ('div', 'studio_cards', undefined, create); this.typeButtons = new Map ();
        for (const [type, descriptor] of Object.entries (StudioPrimitives)) {
            const button = this.Button (this.cards, descriptor.label, () => this.NewPrimitive (type), 'studio_card'); button.dataset.primitive = type; this.typeButtons.set (type, button);
            const icon = document.createElementNS ('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute ('viewBox', '0 0 48 48'); icon.setAttribute ('aria-hidden', 'true'); icon.innerHTML = PrimitiveIcons[type] || ''; button.prepend (icon);
        }
        Element ('p', 'studio_help', 'Choose a shape to start a new model. Select an existing 3Dstudio model to edit its saved construction.', create);
        const params = this.Section ('Dimensions'); this.parameterTitle = params.querySelector ('h3'); this.parameterFields = Element ('div', 'studio_fields', undefined, params);
        this.parameterHint = Element ('p', 'studio_help', '', params);
        this.positionSection = this.Section ('Primitive placement'); this.positionFields = Element ('div', 'studio_transform_fields', undefined, this.positionSection);
        const material = this.Section ('Material'); this.materialSection = material; this.materialFields = Element ('div', 'studio_fields studio_material_fields', undefined, material);
        const colorLabel = Element ('label', 'studio_field studio_color_field', 'Color', this.materialFields); this.color = Element ('input', null, undefined, colorLabel); this.color.type = 'color'; this.color.setAttribute ('aria-label', 'Studio material color');
        this.color.addEventListener ('input', () => this.Change ({ material : { color : this.color.value } }).catch (error => this.Report (error)));
        this.MaterialField ('roughness', 'Roughness'); this.MaterialField ('metalness', 'Metalness'); this.MaterialField ('opacity', 'Opacity');
        this.generateButton = this.Button (this.root, 'Generate', () => this.Generate (), 'studio_primary');

        const history = this.Section ('Editable history'); this.historySection = history;
        this.historyState = Element ('p', 'studio_readout', '', history); this.historyList = Element ('ol', 'studio_history', undefined, history);
        const historyActions = Element ('div', 'studio_actions', undefined, history);
        this.tipButton = this.Button (historyActions, 'Show through this step', () => this.SetTip (this.nodeId));
        this.resumeButton = this.Button (historyActions, 'Resume full model', () => this.SetTip (null));
        this.fitButton = this.Button (historyActions, 'Fit model', () => this.host.fit ());
        Element ('p', 'studio_help', 'Earlier steps remain editable. Show an earlier result, change its dimensions, then resume the full model to replay later operations.', history);

        const node = this.Section ('Operation'); this.operationSection = node;
        this.nodeOperation = this.Select (node, 'History operation', Operations, value => this.Change ({ operation : value }));
        const enabled = Element ('label', 'studio_check', undefined, node); this.enabled = Element ('input', null, undefined, enabled); this.enabled.type = 'checkbox'; this.enabled.setAttribute ('aria-label', 'Enable history operation'); Element ('span', null, 'Enable this operation', enabled);
        this.enabled.addEventListener ('change', () => this.Change ({ enabled : this.enabled.checked }).catch (error => this.Report (error)));
        this.matrixSection = this.Section ('Operand placement'); this.matrixReadout = Element ('p', 'studio_readout', '', this.matrixSection);
        Element ('p', 'studio_help', 'This step preserves the tool’s placement when the Boolean was created. Edit the primitive’s position, rotation and scale above to adjust its geometry inside that placement.', this.matrixSection);

        const boolean = this.Section ('Boolean'); this.booleanSection = boolean;
        this.target = this.Select (boolean, 'Boolean target', {}, () => {});
        this.tool = this.Select (boolean, 'Boolean tool', {}, () => {});
        this.operation = this.Select (boolean, 'Boolean operation', Operations, () => {});
        const keep = Element ('label', 'studio_check', undefined, boolean); this.keepOperands = Element ('input', null, undefined, keep); this.keepOperands.type = 'checkbox'; this.keepOperands.setAttribute ('aria-label', 'Keep Boolean operands visible'); Element ('span', null, 'Keep operands visible', keep);
        this.booleanButton = this.Button (boolean, 'Apply Boolean', () => this.Boolean (), 'studio_primary');
        Element ('p', 'studio_help', 'Target − Tool removes the tool from the target. Operand definitions are saved inside the result so its construction remains editable.', boolean);

        this.progress = Element ('p', 'studio_progress', '', this.root); this.progress.setAttribute ('role', 'status');
        this.cancelButton = this.Button (this.root, 'Cancel modeling operation', () => { this.CancelEdits (); return this.host.cancel (); });
        this.status = Element ('p', 'studio_status', '', this.root); this.status.setAttribute ('role', 'status'); this.status.setAttribute ('aria-live', 'polite');
        this.Refresh ();
    }
    DefaultNode (type) { const definition = CreatePrimitiveDefinition (type); return Clone (definition.nodes.find (node => node.id === definition.rootId)); }
    Section (title) { const section = Element ('section', 'studio_section', undefined, this.root); Element ('h3', null, title, section); return section; }
    Button (parent, text, action, className = '')
    {
        const button = Element ('button', 'studio_button ' + className, text, parent); button.type = 'button';
        button.addEventListener ('click', () => { this.Run (action); }); return button;
    }
    Select (parent, title, choices, change)
    {
        const label = Element ('label', 'studio_field', title, parent), input = Element ('select', null, undefined, label); input.setAttribute ('aria-label', title);
        for (const [value, text] of Object.entries (choices)) { Element ('option', null, text, input).value = value; }
        input.addEventListener ('change', () => { Promise.resolve ().then (() => change (input.value)).catch (error => this.Report (error)); }); return input;
    }
    Factor () { return this.host.units () === 'standard' ? 25.4 : 1; }
    Context () { const state = this.host.inspect (); return JSON.stringify ([state.editContext, state.objectId || null, this.newMode, this.newMode ? this.newType : this.nodeId, this.host.units ()]); }
    Report (error) { if (this.status) { this.status.textContent = error.message || String (error); } }
    async Run (action)
    {
        if (this.disposed) { return; }
        const context = this.Context (); this.localBusy = true; this.Refresh ();
        try { const result = await action (); if (!this.disposed && context === this.Context ()) { this.status.textContent = result?.message || ''; } return result; }
        catch (error) { if (!this.disposed && context === this.Context ()) { this.Report (error); } return false; }
        finally { this.localBusy = false; if (!this.disposed) { this.Refresh (); } }
    }
    CurrentNode ()
    {
        const state = this.host.inspect (), original = this.newMode || !state.available ? this.draft : state.definition?.nodes.find (node => node.id === this.nodeId);
        return original ? MergeStudioPatch (original, this.queue.Patch ()) : null;
    }
    async Change (patch)
    {
        const state = this.host.inspect ();
        if (this.newMode || !state.available) {
            const next = MergeStudioPatch (this.draft, patch);
            this.draft = CreatePrimitiveDefinition (next.type, next.parameters, { material : next.material, transform : next.transform }).nodes[0];
            this.Refresh (); return true;
        }
        const context = this.Context ();
        try {
            const result = await this.queue.Push (state.objectId, this.nodeId, patch);
            if (!this.disposed && result !== false && context === this.Context ()) { this.status.textContent = result?.message || 'Selected model updated.'; } return result;
        } catch (error) { if (this.disposed || context !== this.Context ()) { return false; } throw error; }
    }
    NewPrimitive (type)
    {
        this.queue.Cancel (); this.newMode = true; this.newType = type; this.nodeId = null; this.draft = this.DefaultNode (type); this.Refresh (); return { message : 'Set dimensions, then Generate.' };
    }
    Generate ()
    {
        const node = this.CurrentNode (); if (node?.kind !== 'primitive') { throw new Error ('Choose a primitive before generating a new model.'); }
        return this.host.create ({ type : node.type, parameters : Clone (node.parameters), material : Clone (node.material), transform : Clone (node.transform) });
    }
    SetTip (nodeId) { const state = this.host.inspect (); return this.host.setTip ({ objectId : state.objectId, nodeId }); }
    Boolean ()
    {
        if (!this.target.value || !this.tool.value || this.target.value === this.tool.value) { throw new Error ('Choose two different 3Dstudio models.'); }
        return this.host.boolean ({ operation : this.operation.value, targetId : this.target.value, toolId : this.tool.value, keepOperands : this.keepOperands.checked });
    }
    Number (parent, key, label, options, value, commit)
    {
        const wrap = Element ('label', 'studio_field', label, parent), box = Element ('span', 'studio_input', undefined, wrap), input = Element ('input', null, undefined, box), suffix = Element ('span', 'studio_unit', '', box);
        input.type = 'number'; input.step = 'any'; input.setAttribute ('aria-label', 'Studio ' + label);
        let timer = null, pending = null, version = 0;
        const cancel = () => { clearTimeout (timer); timer = null; pending = null; version++; };
        const flush = async () => {
            clearTimeout (timer); timer = null; if (!pending) { return; } const edit = pending; pending = null;
            if (edit.context !== this.Context () || input.disabled || !input.isConnected || !input.value.trim () || !Number.isFinite (Number (input.value))) { return; }
            try {
                const n = Number (input.value), result = await commit (options.unit === 'mm' ? n * this.Factor () : n);
                if (edit.version !== version || edit.context !== this.Context ()) { return; }
                if (result === false) { input.setAttribute ('aria-invalid', 'true'); return; }
                delete input.dataset.dirty; input.removeAttribute ('aria-invalid');
            } catch (error) { if (edit.version === version && edit.context === this.Context ()) { input.setAttribute ('aria-invalid', 'true'); this.Report (error); } }
        };
        input.addEventListener ('input', () => { clearTimeout (timer); input.dataset.dirty = 'true'; input.removeAttribute ('aria-invalid'); pending = { context : this.Context (), version : ++version }; timer = setTimeout (flush, 250); });
        for (const event of ['change', 'blur']) { input.addEventListener (event, flush); }
        input.addEventListener ('keydown', event => { if (event.key === 'Enter') { event.preventDefault (); flush (); } if (event.key === 'Escape') { cancel (); delete input.dataset.dirty; input.removeAttribute ('aria-invalid'); this.Refresh (); } });
        const field = { input, suffix, key, options, value, cancel, reset : () => { cancel (); delete input.dataset.dirty; input.removeAttribute ('aria-invalid'); } }; this.fields.push (field); return field;
    }
    MaterialField (key, label) { return this.Number (this.materialFields, 'material.' + key, label, { min : 0, max : 1 }, node => node?.material?.[key], value => this.Change ({ material : { [key] : value } })); }
    BuildParameters (node)
    {
        const key = node?.kind === 'primitive' ? node.type : node?.kind || 'none'; if (key === this.parameterKey) { return; } this.parameterKey = key;
        for (const field of this.fields.filter (field => !field.key.startsWith ('material.'))) { field.cancel (); }
        this.fields = this.fields.filter (field => field.key.startsWith ('material.')); this.parameterFields.replaceChildren (); this.positionFields.replaceChildren ();
        if (node?.kind !== 'primitive') { return; }
        const descriptor = StudioPrimitives[node.type], parameters = descriptor.parameters;
        const keys = [...['heightMm', 'widthMm', 'depthMm'].filter (key => Object.hasOwn (parameters, key)), ...Object.keys (parameters).filter (key => !['heightMm', 'widthMm', 'depthMm'].includes (key))];
        for (const key of keys) { const info = parameters[key]; this.Number (this.parameterFields, key, info.label, info, node => node?.parameters?.[key], value => this.Change ({ parameters : { [key] : value } })); }
        if (node.type === 'tube') {
            this.Number (this.parameterFields, 'tubeWallMm', 'Wall thickness', { unit : 'mm', min : .01, max : 5000 }, node => (node.parameters.outerDiameterMm - node.parameters.innerDiameterMm) / 2, value => this.Change ({ parameters : { innerDiameterMm : this.CurrentNode ().parameters.outerDiameterMm - value * 2 } }));
        }
        for (const [kind, title, unit, min, max] of [['position', 'Position', 'mm', -1000000, 1000000], ['rotation', 'Rotation', '°', -36000, 36000], ['scale', 'Scale', '', -1000, 1000]]) {
            const row = Element ('div', 'studio_vector', undefined, this.positionFields); Element ('strong', null, title, row);
            for (let axis = 0; axis < 3; axis++) {
                this.Number (row, 'transform.' + kind + '.' + axis, title + ' ' + ['X', 'Y', 'Z'][axis], { unit, min, max }, node => node?.transform?.[kind]?.[axis], value => {
                    const values = [...this.CurrentNode ().transform[kind]]; values[axis] = value; return this.Change ({ transform : { [kind] : values } });
                });
            }
        }
    }
    ObjectOptions (select, objects, preferred)
    {
        const key = JSON.stringify (objects.map (object => [object.objectId, object.name]));
        if (select.dataset.options !== key) {
            const before = select.value; select.replaceChildren (); Element ('option', null, 'Choose a model', select).value = '';
            for (const object of objects) { Element ('option', null, object.name, select).value = object.objectId; }
            select.dataset.options = key; select.value = objects.some (object => object.objectId === before) ? before : preferred || '';
        }
    }
    Refresh ()
    {
        if (this.disposed || !this.status) { return; }
        let state; try { state = this.host.inspect (); } catch (error) { this.Report (error); return; }
        const objectKey = JSON.stringify ([state.editContext, state.objectId || null]), objectChanged = objectKey !== this.objectKey;
        if (objectChanged) {
            this.objectKey = objectKey; this.queue.Cancel (); this.newMode = !state.available; this.nodeId = state.definition?.rootId || null;
        }
        if (!this.newMode && state.available && !state.definition.nodes.some (node => node.id === this.nodeId)) { this.nodeId = state.definition.rootId; }
        const context = this.Context (), changed = context !== this.fieldContext; this.fieldContext = context;
        if (changed) { for (const field of this.fields) { field.reset (); } }
        const node = this.CurrentNode (); this.BuildParameters (node);
        const busy = this.host.blocked () || this.localBusy || state.busy, ownLive = this.queue.active?.context === context;
        const editing = !this.newMode && state.available, primitive = node?.kind === 'primitive';
        this.contextText.textContent = editing ? 'Editing ' + state.name : 'New ' + (StudioPrimitives[this.newType]?.label || 'primitive');
        this.parameterTitle.textContent = primitive ? StudioPrimitives[node.type].label + ' dimensions' : 'Select a primitive step to edit its dimensions';
        this.parameterHint.textContent = primitive ? editing ? 'Valid changes update this model automatically. Enter applies immediately.' : 'Dimensions use ' + (this.Factor () === 1 ? 'millimeters' : 'inches') + '.' : '';
        this.positionSection.hidden = this.materialSection.hidden = !primitive;
        for (const [type, button] of this.typeButtons) { button.setAttribute ('aria-pressed', String (primitive && node.type === type)); button.disabled = Boolean (busy); }
        for (const field of this.fields) {
            const v = field.value (node), factor = field.options.unit === 'mm' ? this.Factor () : 1;
            if (changed || field.input.dataset.dirty !== 'true') { field.input.value = v === undefined ? '' : String (Number ((v / factor).toFixed (6))); }
            field.suffix.textContent = field.options.unit === 'mm' ? factor === 1 ? 'mm' : 'in' : field.options.unit === '°' ? '°' : '';
            if (field.options.min !== undefined) { field.input.min = String (field.options.min / factor); } if (field.options.max !== undefined) { field.input.max = String (field.options.max / factor); }
            field.input.step = field.options.unit === 'count' ? '1' : 'any'; field.input.disabled = !primitive || Boolean (busy && !ownLive);
        }
        if (primitive && (changed || document.activeElement !== this.color)) { this.color.value = node.material.color; } this.color.disabled = !primitive || Boolean (busy && !ownLive);
        this.generateButton.textContent = editing ? 'Generate new' : 'Generate'; this.generateButton.disabled = !primitive || Boolean (busy || this.queue.active);
        this.historySection.hidden = !state.available; this.historyList.replaceChildren ();
        const definition = state.definition;
        if (state.available) {
            this.historyState.textContent = definition.rootId === definition.tipId ? 'Full model · ' + definition.nodes.length + ' saved steps' : 'Showing an earlier step · later construction is retained';
            for (const [index, step] of definition.nodes.entries ()) {
                const row = Element ('li', 'studio_history_item', undefined, this.historyList), name = step.name || (step.kind === 'primitive' ? StudioPrimitives[step.type].label : step.kind === 'boolean' ? Operations[step.operation] : 'Operand placement');
                const button = this.Button (row, (index + 1) + ' · ' + name, () => { this.queue.Cancel (); this.newMode = false; this.nodeId = step.id; this.Refresh (); });
                button.dataset.nodeId = step.id; button.setAttribute ('aria-pressed', String (!this.newMode && step.id === this.nodeId)); button.disabled = Boolean (busy || this.queue.active);
                if (step.id === definition.rootId) { Element ('span', 'studio_history_marker', 'Shown', row); } else if (step.id === definition.tipId) { Element ('span', 'studio_history_marker', 'Full result', row); }
                if (step.kind === 'boolean' && !step.enabled) { Element ('span', 'studio_history_marker', 'Off', row); }
            }
        }
        this.tipButton.disabled = !editing || Boolean (busy || this.queue.active) || node?.id === definition?.rootId; this.resumeButton.disabled = !state.available || Boolean (busy || this.queue.active) || definition.rootId === definition.tipId; this.fitButton.disabled = !state.available || Boolean (busy);
        this.operationSection.hidden = node?.kind !== 'boolean'; this.nodeOperation.value = node?.operation || 'union'; this.nodeOperation.disabled = this.enabled.disabled = Boolean (busy && !ownLive); this.enabled.checked = node?.enabled !== false;
        this.matrixSection.hidden = node?.kind !== 'transform'; this.matrixReadout.textContent = node?.kind === 'transform' ? 'Position: ' + [node.matrix[12], node.matrix[13], node.matrix[14]].map (value => Number ((value / this.Factor ()).toFixed (3))).join (' × ') + ' ' + (this.Factor () === 1 ? 'mm' : 'in') : '';
        const objects = state.objects || []; this.ObjectOptions (this.target, objects, state.objectId);
        if (objectChanged) { this.target.value = state.objectId || ''; }
        const preferredTool = objects.find (object => object.objectId !== this.target.value && state.selectedIds?.includes (object.objectId))?.objectId || objects.find (object => object.objectId !== this.target.value)?.objectId;
        this.ObjectOptions (this.tool, objects, preferredTool); if (objectChanged) { this.tool.value = preferredTool || ''; }
        for (const input of [this.target, this.tool, this.operation, this.keepOperands]) { input.disabled = Boolean (busy || this.queue.active); }
        this.booleanButton.disabled = objects.length < 2 || Boolean (busy || this.queue.active);
        this.progress.textContent = state.busy || this.queue.active ? 'Computing solid…' : ''; this.cancelButton.hidden = !(state.busy || this.queue.active); this.cancelButton.disabled = false;
    }
    CancelEdits () { this.queue.Cancel (); for (const field of this.fields) { field.reset (); } this.Refresh (); }
    Dispose () { this.disposed = true; this.queue.Dispose (); for (const field of this.fields) { field.cancel (); } }
}
