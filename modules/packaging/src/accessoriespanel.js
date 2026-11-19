function Element (tag, parent, text, className)
{
    const node = document.createElement (tag); if (text !== undefined) { node.textContent = text; } if (className) { node.className = className; } parent.appendChild (node); return node;
}
// Neutral Accessories tab. The host reads the selected carton's engineering inside size and edits the scene.
export class AccessoriesPanel
{
    constructor (host, parent)
    {
        this.host = host; this.pending = false; this.columns = 3; this.rows = 2;
        this.root = Element ('section', parent, undefined, 'packaging_accessories'); this.root.setAttribute ('aria-label', 'Accessories');
        Element ('h3', this.root, 'Accessories');
        Element ('p', this.root, 'Pads and partitions for the selected carton, and collars for selected cans. Pads and partitions are sized from the carton engineering inside dimensions and made from its board. Each piece is a CAD profile you can open, measure and export.', 'section_hint');
        this.cartonName = Element ('strong', this.root);
        this.inside = this.Rows ('Carton inside size', [['length', 'L'], ['width', 'W'], ['height', 'H']]);
        this.boardLine = Element ('p', this.root, '', 'section_hint');

        const pads = Element ('section', this.root, undefined, 'packaging_accessory_group'); pads.setAttribute ('aria-label', 'Pads'); Element ('h4', pads, 'Pads');
        Element ('p', pads, 'Top and bottom pads lie horizontal across the inside length × width; front and back pads stand vertical against the long walls, between them. Sizes are calculated to fit, 1 mm clear of each edge.', 'section_hint');
        const padChoices = Element ('div', pads, undefined, 'packaging_accessory_options'); padChoices.setAttribute ('aria-label', 'Pad positions');
        this.positions = new Map ([['top', this.Check (padChoices, 'Top pad', false)], ['bottom', this.Check (padChoices, 'Bottom pad', true)], ['front', this.Check (padChoices, 'Front pad', false)], ['back', this.Check (padChoices, 'Back pad', false)]]);
        const material = Element ('div', pads, undefined, 'packaging_accessory_options');
        this.board = this.Select (material, 'Flute'); this.grade = this.Select (material, 'Board grade');
        this.keepBox = this.Check (pads, 'Do not affect box ID', false);
        Element ('p', pads, 'Unticked, the carton inside grows by the pad thickness (height for top and bottom, width for front and back) so the product space stays the same. Ticked, the carton keeps its size and the pads show in place.', 'section_hint');
        this.padSize = Element ('p', pads, '', 'section_hint');
        this.addPads = Element ('button', pads, 'Add pads', 'packaging_auto_create'); this.addPads.type = 'button'; this.addPads.addEventListener ('click', () => this.Create ('pads'));

        const partitions = Element ('section', this.root, undefined, 'packaging_accessory_group'); partitions.setAttribute ('aria-label', 'Partitions'); Element ('h4', partitions, 'Partitions');
        Element ('p', partitions, 'Interlocking slotted dividers. Strips along the length are slotted from the top, strips across from the bottom, so they nest at half height.', 'section_hint');
        const grid = Element ('div', partitions, undefined, 'packaging_accessory_options');
        this.columnsInput = this.Number (grid, 'Cells along length', this.columns, value => { this.columns = value; });
        this.rowsInput = this.Number (grid, 'Cells across width', this.rows, value => { this.rows = value; });
        this.cellSize = Element ('p', partitions, '', 'section_hint');
        this.addPartitions = Element ('button', partitions, 'Add partitions', 'packaging_auto_create'); this.addPartitions.type = 'button'; this.addPartitions.addEventListener ('click', () => this.Create ('partitions'));

        this.BuildCollar ();

        this.reason = Element ('p', this.root, '', 'section_hint');
        this.status = Element ('p', this.root, '', 'section_hint'); this.status.setAttribute ('role', 'status'); this.status.setAttribute ('aria-live', 'polite');
        this.Refresh ();
    }
    // Can collar: a paperboard carrier for a selected group or array of cans, held under their top rims.
    BuildCollar ()
    {
        const collar = Element ('section', this.root, undefined, 'packaging_accessory_group'); collar.setAttribute ('aria-label', 'Can collar'); Element ('h4', collar, 'Can collar');
        Element ('p', collar, 'Select a group or array of upright cans (for a six-pack, array one can 3 × 2). Each can gets a round hole split into tabs by relief slits; the tabs tuck under the can rim and the slits let them flex over it. Corners are rounded; sizes come from the rims sensed on the selected cans.', 'section_hint');
        const fields = Element ('div', collar, undefined, 'packaging_accessory_options');
        this.collarBoard = this.Select (fields, 'Collar board');
        const number = (title, value, min, max, step = 'any') => { const label = Element ('label', fields, title); const input = Element ('input', label); input.type = 'number'; input.min = String (min); input.max = String (max); input.step = step; input.value = value; input.setAttribute ('aria-label', title); input.addEventListener ('change', () => this.Refresh ()); return input; };
        this.collarTuck = number ('Tuck under rim (mm)', '1.5', 0.3, 10, '0.1');
        this.collarRelief = number ('Reliefs past rim (mm)', '3', 0.5, 20, '0.5');
        this.collarMargin = number ('Edge margin (mm)', '5', 1, 50, '0.5');
        this.collarCorner = number ('Corner radius (mm, blank follows cans)', '', 0, 500, '0.5');
        this.collarTabs = number ('Tabs per can (0 automatic)', '0', 0, 48, '1');
        this.collarSize = Element ('p', collar, '', 'section_hint');
        this.addCollar = Element ('button', collar, 'Add can collar', 'packaging_auto_create'); this.addCollar.type = 'button'; this.addCollar.addEventListener ('click', () => this.CreateCollar ());
        this.collarStatus = Element ('p', collar, '', 'section_hint'); this.collarStatus.setAttribute ('role', 'status'); this.collarStatus.setAttribute ('aria-live', 'polite');
    }
    CollarOptions ()
    {
        const value = input => input.value === '' ? undefined : input.valueAsNumber, options = {};
        if (this.collarBoard.value) { options.boardId = this.collarBoard.value; }
        for (const [key, input] of [['tuckMm', this.collarTuck], ['reliefMm', this.collarRelief], ['marginMm', this.collarMargin], ['cornerRadiusMm', this.collarCorner], ['tabs', this.collarTabs]]) { const v = value (input); if (Number.isFinite (v)) { options[key] = v; } }
        return options;
    }
    RefreshCollar ()
    {
        if (!this.addCollar) { return; }
        let data;
        try { data = this.host.collarInspect?.(this.CollarOptions ()) || { available : false, reason : 'Can collars are not available here.' }; }
        catch (error) { data = { available : false, reason : error.message }; }
        if (data.boards) { this.Fill (this.collarBoard, data.boards.map (b => ({ value : b.id, label : b.name + ' · ' + b.caliperMm + ' mm' })), data.defaults?.boardId || data.boards[0]?.id || ''); }
        this.collarState = data;
        const mm = v => Number (v.toFixed (1)) + ' mm', c = data.collar;
        this.collarSize.textContent = c ? data.cans + ' cans · rim Ø ' + mm (2 * data.rim.radiusMm) + ' · collar ' + mm (c.sizeMm.length) + ' × ' + mm (c.sizeMm.width) + ' · ' + c.tabs + ' tabs per can, tips Ø ' + mm (2 * c.holeRadiusMm) + ', reliefs to Ø ' + mm (2 * c.reliefRadiusMm) + ' · corners ' + mm (c.cornerRadiusMm) : data.reason || '';
        this.addCollar.disabled = this.pending || this.host.blocked () || !data.available || !this.host.addCollar;
    }
    async CreateCollar ()
    {
        if (this.pending || this.addCollar.disabled) { return; }
        this.pending = true; this.collarStatus.textContent = 'Adding can collar…'; this.Refresh ();
        try {
            const options = this.CollarOptions ();
            const action = async () => {
                try { const result = await this.host.addCollar (options); this.collarStatus.textContent = result?.message || 'Can collar added.'; return result; }
                catch (error) { this.collarStatus.textContent = error.message; throw error; }
            };
            await (this.host.run ? this.host.run (action) : action ());
        } catch (error) { this.collarStatus.textContent = error.message; }
        finally { this.pending = false; this.Refresh (); }
    }
    Rows (title, keys)
    {
        const section = Element ('section', this.root, undefined, 'packaging_auto_size'); section.setAttribute ('aria-label', title); Element ('h4', section, title);
        const row = Element ('dl', section); const fields = new Map ();
        for (const [key, label] of keys) { const cell = Element ('div', row); Element ('dt', cell, label); fields.set (key, Element ('dd', cell, '—')); }
        return { section, fields };
    }
    Check (parent, title, checked)
    {
        const label = Element ('label', parent, undefined, 'packaging_accessory_check'); const input = Element ('input', label); input.type = 'checkbox'; input.checked = checked; input.setAttribute ('aria-label', title);
        label.appendChild (document.createTextNode (' ' + title)); input.addEventListener ('change', () => this.Refresh ()); return input;
    }
    Select (parent, title)
    {
        const label = Element ('label', parent, title); const select = Element ('select', label); select.setAttribute ('aria-label', title); select.addEventListener ('change', () => this.Refresh ()); return select;
    }
    Fill (select, items, fallback)
    {
        const keys = items.map (item => item.value).join ('|');
        if (select.dataset.keys !== keys) { const current = select.value; select.replaceChildren (...items.map (item => { const option = document.createElement ('option'); option.value = item.value; option.textContent = item.label; return option; })); select.dataset.keys = keys; select.value = items.some (item => item.value === current) ? current : fallback; }
    }
    Number (parent, title, value, set)
    {
        const label = Element ('label', parent, title); const input = Element ('input', label); input.type = 'number'; input.min = '1'; input.max = '12'; input.step = '1'; input.value = String (value); input.setAttribute ('aria-label', title);
        input.addEventListener ('change', () => { const next = input.valueAsNumber; if (Number.isInteger (next) && next >= 1 && next <= 12) { set (next); } input.value = String (title.includes ('length') ? this.columns : this.rows); this.Refresh (); });
        return input;
    }
    Options ()
    {
        const pads = { positions : [...this.positions].filter (([, input]) => input.checked).map (([id]) => id), keepBox : this.keepBox.checked };
        if (this.board.value) { pads.boardId = this.board.value; } if (this.grade.value) { pads.grade = this.grade.value; }
        return { pads, partitions : { columns : this.columns, rows : this.rows } };
    }
    Refresh ()
    {
        const factor = this.host.factor (), unit = Math.abs (factor - 25.4) < 1e-9 ? 'in' : 'mm', show = mm => Number.isFinite (mm) ? Number ((mm / factor).toFixed (unit === 'in' ? 3 : 1)) + ' ' + unit : '—';
        const boards = this.host.accessoryBoards?.() || { records : [], grades : [] };
        this.Fill (this.board, boards.records.map (r => ({ value : r.id, label : r.flute + ' flute · ' + Number ((r.caliperMm / factor).toFixed (unit === 'in' ? 3 : 2)) + ' ' + unit })), boards.records.find (r => r.flute === 'B')?.id || boards.records[0]?.id || '');
        this.Fill (this.grade, boards.grades.map (g => ({ value : g, label : g })), boards.grades[0] || '');
        let data;
        try { data = this.host.accessoriesInspect?.(this.Options ()) || { available : false, reason : 'Select a folded carton in Auto3D to add accessories.' }; }
        catch (error) { data = { available : false, reason : error.message }; }
        this.state = data; this.cartonName.textContent = data.cartonName || 'No carton selected';
        for (const [key, field] of this.inside.fields) { field.textContent = show (data.insideMm?.[key]); }
        this.boardLine.textContent = Number.isFinite (data.thicknessMm) ? 'Carton board: ' + (data.boardName ? data.boardName + ' · ' : '') + show (data.thicknessMm) : '';
        const pads = data.pads;
        this.padSize.textContent = pads ? pads.pads.map (p => p.position[0].toUpperCase () + p.position.slice (1) + ' ' + show (p.lengthMm) + ' × ' + show (p.widthMm ?? p.heightMm)).join (' · ') + ' · ' + show (pads.thicknessMm) + ' thick' + (pads.keepBox ? ' · box size unchanged' : ' · box inside becomes ' + ['length', 'width', 'height'].map (k => show (pads.boxInsideMm[k])).join (' × ')) : data.padReason || '';
        this.cellSize.textContent = data.partitions ? data.partitions.cells + ' cells, each ' + show (data.partitions.cellMm.length) + ' × ' + show (data.partitions.cellMm.width) + ' × ' + show (data.partitions.cellMm.height) + ' · ' + data.partitions.strips.length + ' strips' : data.partitionReason || '';
        this.reason.textContent = data.available ? '' : data.reason || '';
        const blocked = this.pending || this.host.blocked () || !data.available;
        this.addPads.disabled = blocked || !data.pads || !this.host.addPads;
        this.addPartitions.disabled = blocked || !data.partitions || !this.host.addPartitions;
        this.RefreshCollar ();
    }
    async Create (kind)
    {
        const button = kind === 'pads' ? this.addPads : this.addPartitions; if (this.pending || button.disabled) { return; }
        this.pending = true; this.status.textContent = kind === 'pads' ? 'Adding pads…' : 'Adding partitions…'; this.Refresh ();
        try {
            const options = this.Options ()[kind];
            const action = async () => {
                try { const result = await (kind === 'pads' ? this.host.addPads (options) : this.host.addPartitions (options)); this.status.textContent = result?.message || 'Accessories added.'; return result; }
                catch (error) { this.status.textContent = error.message; throw error; }
            };
            await (this.host.run ? this.host.run (action) : action ());
        } catch (error) { this.status.textContent = error.message; }
        finally { this.pending = false; this.Refresh (); }
    }
}
