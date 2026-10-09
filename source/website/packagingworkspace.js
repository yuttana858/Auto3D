import { WorkspaceDialog } from './modellibrary.js';
import { BoardCalipers, NewPackagingDesign, ValidatePackaging, CreatePackagingModel, PackagingBounds, ExportPackagingSVG, ExportPackagingDXF } from './packagingcore.js';
import { Unit } from '../engine/model/unit.js';
import { DisplayUnitLabel } from './preferences.js';

function Element (tag, parent, text, className)
{
    const node = document.createElement (tag); if (text !== undefined) { node.textContent = text; } if (className) { node.className = className; } parent?.appendChild (node); return node;
}
export class PackagingWorkspace
{
    constructor (editor) { this.editor = editor; this.dialog = null; this.refreshing = false; this.draft = []; this.active = null; this.draftType = 'cut'; this.gridSnapMM = 5; this.displayFactor = 1; this.view = { x : -20, y : -220, width : 340, height : 240 }; }
    Design () { return this.editor.document.packaging || NewPackagingDesign (); }
    Factor () { return this.editor.website.preferences.units === 'standard' ? 25.4 : 1; }
    Editable () { if (this.editor.readOnly || this.editor.busy || !this.editor.website.auth?.user || this.editor.website.accountReady === false) { throw new Error ('Sign in to an editable, idle workspace.'); } }
    Inspect () { return { ...ValidatePackaging (this.Design ()), units : 'mm', displayUnits : DisplayUnitLabel (this.editor.website.preferences.units), selectedPathId : this.active, draftType : this.draftType, gridSnapMM : this.gridSnapMM, draftPoints : this.draft.map ((point) => [...point]) }; }
    Change (next)
    {
        this.Editable (); const before = this.editor.document.packaging ? ValidatePackaging (this.editor.document.packaging) : null; const after = ValidatePackaging (next); const target = this.editor.document;
        const apply = (value) => { target.packaging = value ? ValidatePackaging (value) : null; this.Refresh (); };
        apply (after); this.editor.history.Push ({ undo : () => apply (before), redo : () => apply (after) }); return this.Inspect ();
    }
    AddPath (points, type = 'cut', closed = false, units = 'display')
    {
        const factor = units === 'mm' ? 1 : this.Factor (); const design = ValidatePackaging (this.Design ()); const path = { id : crypto.randomUUID (), type, closed, points : points.map ((point) => point.map ((value) => value * factor)) }; design.paths.push (path); const result = this.Change (design); this.active = path.id; this.Refresh (); return { pathId : path.id, design : result };
    }
    EditPath (id, changes, units = 'display')
    {
        const design = ValidatePackaging (this.Design ()); const path = design.paths.find ((item) => item.id === id); if (!path) { throw new Error ('Choose an existing path.'); }
        const factor = units === 'mm' ? 1 : this.Factor (); if (changes.points) { path.points = changes.points.map ((point) => point.map ((value) => value * factor)); } if (changes.type !== undefined) { path.type = changes.type; } if (changes.closed !== undefined) { path.closed = changes.closed; } return this.Change (design);
    }
    DeletePath (id) { const design = ValidatePackaging (this.Design ()); if (!design.paths.some ((path) => path.id === id)) { throw new Error ('Choose an existing path.'); } design.paths = design.paths.filter ((path) => path.id !== id); return this.Change (design); }
    SetBoard (thickness, grade = 'Custom', units = 'display') { const design = ValidatePackaging (this.Design ()); design.thickness = thickness * (units === 'mm' ? 1 : this.Factor ()); design.grade = grade; return this.Change (design); }
    SetName (name) { const design = ValidatePackaging (this.Design ()); design.name = name; return this.Change (design); }
    Export (format)
    {
        const design = this.Design (); const text = format === 'svg' ? ExportPackagingSVG (design) : format === 'dxf' ? ExportPackagingDXF (design) : null; if (text === null) { throw new Error ('Choose SVG or DXF.'); }
        return { filename : (design.name || 'Packaging profile').replace (/[<>:"/\\|?*]/g, '_') + '.' + format, mime : format === 'svg' ? 'image/svg+xml' : 'application/dxf', text, units : 'mm' };
    }
    Download (format) { const file = this.Export (format); this.editor.Download (file.text, file.filename, file.mime); return { filename : file.filename, units : file.units }; }
    Thumbnail ()
    {
        const canvas = document.createElement ('canvas'); canvas.width = 320; canvas.height = 200; const context = canvas.getContext ('2d'); context.fillStyle = '#292b2d'; context.fillRect (0, 0, 320, 200);
        const design = this.Design (); const box = PackagingBounds (design); const scale = Math.min (288 / Math.max (box.maxX - box.minX, 1), 168 / Math.max (box.maxY - box.minY, 1));
        const centerX = (box.minX + box.maxX) / 2; const centerY = (box.minY + box.maxY) / 2;
        for (const path of design.paths) { context.beginPath (); context.strokeStyle = path.type === 'cut' ? '#e34b4b' : '#318cdd'; context.setLineDash (path.type === 'score' ? [5, 3] : []); context.lineWidth = 2; path.points.forEach ((point, index) => context[index ? 'lineTo' : 'moveTo'] (160 + (point[0] - centerX) * scale, 100 - (point[1] - centerY) * scale)); if (path.closed) { context.closePath (); } context.stroke (); }
        return canvas.toDataURL ('image/png');
    }
    async Extrude ()
    {
        this.Editable (); if (this.editor.document.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); } const design = ValidatePackaging (this.Design ()); const editor = this.editor; const model = CreatePackagingModel (design, editor.document.objects.length ? editor.document.model.GetUnit () : Unit.Millimeter);
        const object = editor.document.AddImported (model, design.name); object.source = 'Packaging profile'; object.packagingProfile = design; const index = editor.document.objects.indexOf (object);
        const apply = async (add) => { if (add) { editor.document.Restore (object, index); editor.selected = object; } else { editor.document.Remove (object); editor.selected = null; } await editor.Render (); };
        try { editor.selected = object; await editor.Render (true); }
        catch (error) { editor.document.Remove (object); editor.selected = null; await editor.Render (); throw error; }
        editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); editor.Status ('Added board · ' + design.thickness + ' mm · ' + design.grade); return { objectId : object.id, thicknessMM : design.thickness, grade : design.grade };
    }
    LoadSelected ()
    {
        const profile = this.editor.selected?.packagingProfile; if (!profile) { throw new Error ('Select a board created from a packaging profile.'); } this.draft = []; return this.Change (profile);
    }
    Run (action) { return Promise.resolve ().then (action).catch ((error) => this.Message (error.message)); }
    Message (message) { if (this.status) { this.status.textContent = message; } this.editor.Status (message); }
    Fit ()
    {
        const box = PackagingBounds (this.Design ()); const margin = Math.max (box.maxX - box.minX, box.maxY - box.minY, 20) * 0.08; const width = Math.max (box.maxX - box.minX, 20) + margin * 2; const height = Math.max (box.maxY - box.minY, 20) + margin * 2;
        this.view = { x : box.minX - margin, y : -box.maxY - margin, width, height }; this.Draw ();
    }
    SetDraftType (type) { this.Editable (); if (!['cut', 'score'].includes (type)) { throw new Error ('Choose cut or score.'); } this.draftType = type; if (this.type) { this.type.value = type; } this.Draw (); return { type }; }
    SetGridSnap (value, units = 'display') { const mm = value * (units === 'mm' ? 1 : this.Factor ()); if (!Number.isFinite (mm) || mm < 0 || mm > 100000) { throw new Error ('Use a grid snap between 0 and 100000 mm.'); } this.gridSnapMM = mm; if (this.snap) { this.snap.value = String (mm / this.Factor ()); } this.Draw (); return { gridSnapMM : mm }; }
    AddDraftPoint (point, units = 'display')
    {
        this.Editable (); const converted = point.map ((value) => value * (units === 'mm' ? 1 : this.Factor ()));
        if (converted.length !== 2 || !converted.every ((value) => Number.isFinite (value) && Math.abs (value) <= 100000) || this.draft.length >= 2000) { throw new Error ('Use finite point coordinates within design limits.'); }
        this.draft.push (converted); this.Draw (); return { points : this.draft.length };
    }
    RemoveDraftPoint () { this.Editable (); this.draft.pop (); this.Draw (); return { points : this.draft.length }; }
    CancelDraft () { this.draft = []; this.Draw (); return { canceled : true }; }
    SelectPath (id) { if (!this.Design ().paths.some ((path) => path.id === id)) { throw new Error ('Choose an existing path.'); } this.active = id; this.Refresh (); return { selectedPathId : id }; }
    Finish (closed)
    {
        this.Editable (); const result = this.AddPath (this.draft, this.draftType, closed, 'mm'); this.draft = []; this.Refresh (); this.Message ((closed ? 'Closed outline' : 'Open path') + ' added · ' + result.pathId.slice (0, 8)); return result;
    }
    Open ()
    {
        if (this.dialog?.isConnected) { return { opened : true }; } this.Editable (); this.draft = []; this.active = null; this.displayFactor = this.Factor ();
        const dialog = WorkspaceDialog ('Packaging'); this.dialog = dialog; dialog.classList.add ('packaging_dialog');
        const body = Element ('div', dialog, undefined, 'packaging_body'); const tools = Element ('div', body, undefined, 'packaging_controls');
        const field = (title, tag = 'input') => { const label = Element ('label', tools, title); const input = Element (tag, label); input.setAttribute ('aria-label', title); return input; };
        const action = (title, fn, parent = tools) => { const button = Element ('button', parent, title); button.type = 'button'; button.addEventListener ('click', () => this.Run (fn)); return button; };
        this.name = field ('Profile name'); this.name.maxLength = 100; this.name.addEventListener ('change', () => this.Run (() => this.SetName (this.name.value)));
        this.type = field ('New path type', 'select'); this.type.add (new Option ('Cut · red', 'cut')); this.type.add (new Option ('Score · blue dashed', 'score')); this.type.value = this.draftType; this.type.addEventListener ('change', () => { this.Run (() => this.SetDraftType (this.type.value)); });
        const hint = Element ('p', tools, 'Click points on the drawing or enter exact X/Y coordinates. Finish an open line or close an outline. Red = cut; blue dashed = score.', 'section_hint');
        this.x = field ('Point X'); this.y = field ('Point Y'); for (const input of [this.x, this.y]) { input.type = 'number'; input.step = 'any'; input.value = '0'; }
        action ('Add point', () => this.AddDraftPoint ([this.x.valueAsNumber, this.y.valueAsNumber]));
        const finish = Element ('div', tools, undefined, 'packaging_actions'); action ('Finish open path', () => this.Finish (false), finish); action ('Close outline', () => this.Finish (true), finish);
        action ('Remove last point', () => this.RemoveDraftPoint ()); action ('Cancel current path', () => this.CancelDraft ());
        this.snap = field ('Grid snap'); this.snap.type = 'number'; this.snap.step = 'any'; this.snap.min = '0'; this.snap.value = String (this.gridSnapMM / this.Factor ());
        this.paths = field ('Selected path', 'select'); this.paths.addEventListener ('change', () => { this.SelectPath (this.paths.value); });
        const assign = Element ('div', tools, undefined, 'packaging_actions'); action ('Assign cut', () => this.EditPath (this.active, { type : 'cut' }), assign); action ('Assign score', () => this.EditPath (this.active, { type : 'score' }), assign); action ('Delete path', () => this.DeletePath (this.active));
        this.points = Element ('details', tools); Element ('summary', this.points, 'Edit selected path points'); this.pointFields = Element ('div', this.points, undefined, 'packaging_vertices');
        this.grade = field ('Board caliper preset', 'select'); for (const grade of Object.keys (BoardCalipers)) { this.grade.add (new Option (grade, grade)); }
        this.grade.addEventListener ('change', () => this.Run (() => this.SetBoard (BoardCalipers[this.grade.value] ?? this.thickness.valueAsNumber * this.Factor (), this.grade.value, 'mm')));
        this.thickness = field ('Board thickness'); this.thickness.type = 'number'; this.thickness.min = '0.0001'; this.thickness.step = 'any'; this.thickness.addEventListener ('change', () => this.Run (() => this.SetBoard (this.thickness.valueAsNumber, 'Custom')));
        Element ('p', tools, 'Use measured caliper for your board grade. Score paths export as creases; they do not cut or fold the solid.', 'section_hint');
        action ('Extrude board into scene', async () => { if (this.draft.length) { throw new Error ('Finish or cancel the current path first.'); } const result = await this.Extrude (); dialog.close (); return result; }).classList.add ('workspace_primary');
        action ('Load selected board profile', () => { this.LoadSelected (); this.Fit (); });
        action ('Save profile and session…', () => { if (this.draft.length) { throw new Error ('Finish or cancel the current path before saving.'); } dialog.close (); return this.editor.library.SaveDialog (); });
        const exports = Element ('div', tools, undefined, 'packaging_actions'); for (const format of ['svg', 'dxf']) { action ('Download ' + format.toUpperCase (), () => { if (this.draft.length) { throw new Error ('Finish or cancel the current path before exporting.'); } return this.Download (format); }, exports); }
        action ('Undo edit', () => this.editor.Undo ()); action ('Redo edit', () => this.editor.Redo ());
        const drawing = Element ('div', body, undefined, 'packaging_drawing'); const top = Element ('div', drawing, undefined, 'packaging_drawing_header'); this.units = Element ('span', top); action ('Fit drawing', () => this.Fit (), top);
        this.svg = document.createElementNS ('http://www.w3.org/2000/svg', 'svg'); this.svg.classList.add ('packaging_canvas'); this.svg.setAttribute ('role', 'img'); this.svg.setAttribute ('aria-label', 'Packaging point-to-point drawing'); this.svg.setAttribute ('tabindex', '0'); drawing.appendChild (this.svg);
        const coordinate = (event) => { const point = this.svg.createSVGPoint (); point.x = event.clientX; point.y = event.clientY; const converted = point.matrixTransform (this.svg.getScreenCTM ().inverse ()); return [converted.x, -converted.y]; };
        this.svg.addEventListener ('click', (event) => this.Run (() => {
            if (event.button !== 0) { return; } this.Editable (); const pathNode = event.target.closest ('[data-path]'); if (pathNode && !this.draft.length) { this.SelectPath (pathNode.getAttribute ('data-path')); return; }
            let point = coordinate (event); const snap = this.gridSnapMM; if (Number.isFinite (snap) && snap > 0) { point = point.map ((value) => Math.round (value / snap) * snap); }
            if (!point.every ((value) => Number.isFinite (value) && Math.abs (value) <= 100000) || this.draft.length >= 2000) { throw new Error ('Point or draft exceeds design limits.'); }
            this.AddDraftPoint (point, 'mm'); this.x.value = String (point[0] / this.Factor ()); this.y.value = String (point[1] / this.Factor ()); this.Draw ();
        }));
        this.svg.addEventListener ('wheel', (event) => { event.preventDefault (); const anchor = coordinate (event); const scale = event.deltaY > 0 ? 1.15 : 1 / 1.15; if (this.view.width * scale < 0.1 || this.view.width * scale > 200000) { return; } this.view.x = anchor[0] + (this.view.x - anchor[0]) * scale; this.view.y = -anchor[1] + (this.view.y + anchor[1]) * scale; this.view.width *= scale; this.view.height *= scale; this.Draw (); }, { passive : false });
        this.svg.addEventListener ('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault (); this.Run (() => this.Finish (event.shiftKey)); } if (event.key === 'Escape' && this.draft.length) { event.preventDefault (); event.stopPropagation (); this.CancelDraft (); } });
        this.status = Element ('p', drawing, 'Ready to draw', 'packaging_status'); this.status.setAttribute ('role', 'status');
        dialog.addEventListener ('cancel', (event) => { if (this.draft.length) { event.preventDefault (); this.CancelDraft (); } });
        dialog.addEventListener ('close', () => { this.draft = []; this.dialog = null; this.status = null; }); this.snap.addEventListener ('change', () => this.Run (() => this.SetGridSnap (this.snap.valueAsNumber)));
        hint.title = 'Enter finishes an open path; Shift+Enter closes it. Escape cancels the current draft. Scroll to zoom.'; this.Refresh (); this.Fit (); return { opened : true };
    }
    Refresh ()
    {
        if (!this.dialog?.isConnected || this.refreshing) { return; } this.refreshing = true; try { this.RenderControls (); } finally { this.refreshing = false; }
    }
    RenderControls ()
    {
        const factor = this.Factor (); if (factor !== this.displayFactor) { for (const input of [this.x, this.y]) { if (Number.isFinite (input.valueAsNumber)) { input.value = String (Number ((input.valueAsNumber * this.displayFactor / factor).toFixed (6))); } } this.displayFactor = factor; } this.snap.value = String (Number ((this.gridSnapMM / factor).toFixed (6)));
        const design = this.Design (); this.name.value = design.name; this.thickness.value = String (Number ((design.thickness / this.Factor ()).toFixed (6))); this.grade.value = Object.hasOwn (BoardCalipers, design.grade) ? design.grade : 'Custom';
        this.units.textContent = 'X/Y and thickness in ' + DisplayUnitLabel (this.editor.website.preferences.units) + ' · scroll to zoom · Enter to finish · Shift+Enter to close';
        if (!design.paths.some ((path) => path.id === this.active)) { this.active = design.paths[0]?.id || null; } this.paths.replaceChildren ();
        design.paths.forEach ((path, index) => this.paths.add (new Option ((index + 1) + ' · ' + path.type + ' · ' + (path.closed ? 'closed' : 'open') + ' · ' + path.points.length + ' points', path.id))); this.paths.value = this.active || '';
        this.pointFields.replaceChildren (); const selected = design.paths.find ((path) => path.id === this.active);
        selected?.points.forEach ((point, index) => {
            const row = Element ('div', this.pointFields, undefined, 'packaging_vertex'); Element ('span', row, String (index + 1));
            point.forEach ((value, axis) => { const input = Element ('input', row); input.type = 'number'; input.step = 'any'; input.value = String (Number ((value / this.Factor ()).toFixed (6))); input.setAttribute ('aria-label', 'Path point ' + (index + 1) + ' ' + (axis ? 'Y' : 'X')); input.addEventListener ('change', () => { if (this.refreshing) { return; } this.Run (() => { const points = selected.points.map ((item) => [...item]); points[index][axis] = input.valueAsNumber * this.Factor (); this.EditPath (selected.id, { points }, 'mm'); }); }); });
        }); this.Draw ();
    }
    Draw ()
    {
        if (!this.svg || !this.dialog?.isConnected) { return; } const design = this.Design (); const svg = this.svg; svg.replaceChildren (); svg.setAttribute ('viewBox', [this.view.x, this.view.y, this.view.width, this.view.height].join (' '));
        const make = (tag, attributes, parent = svg) => { const node = document.createElementNS (svg.namespaceURI, tag); for (const [key, value] of Object.entries (attributes)) { node.setAttribute (key, String (value)); } parent.appendChild (node); return node; };
        const snap = this.gridSnapMM; const grid = Number.isFinite (snap) && snap > 0 ? Math.max (snap, this.view.width / 100) : this.view.width / 20;
        const pattern = make ('pattern', { id : 'packaging_grid', width : grid, height : grid, patternUnits : 'userSpaceOnUse' }, make ('defs', {})); make ('path', { d : 'M' + grid + ' 0H0V' + grid, fill : 'none', stroke : 'var(--ov_border_color)', 'stroke-width' : this.view.width / 1200 }, pattern);
        make ('rect', { x : this.view.x, y : this.view.y, width : this.view.width, height : this.view.height, fill : 'url(#packaging_grid)' });
        make ('path', { d : 'M' + this.view.x + ' 0h' + this.view.width + 'M0 ' + this.view.y + 'v' + this.view.height, stroke : '#888', 'stroke-width' : this.view.width / 700 });
        for (const path of [...design.paths, ...(this.draft.length ? [{ id : 'draft', type : this.draftType, closed : false, points : this.draft }] : [])]) {
            const selected = path.id === this.active; make ('path', { d : path.points.map ((point, index) => (index ? 'L' : 'M') + point[0] + ' ' + -point[1]).join (' ') + (path.closed ? 'Z' : ''), fill : path.closed && path.type === 'cut' ? '#b8926112' : 'none', stroke : path.type === 'cut' ? '#e34b4b' : '#318cdd', 'stroke-width' : selected ? 3 : 2, 'vector-effect' : 'non-scaling-stroke', 'stroke-dasharray' : path.type === 'score' ? '7 5' : 'none', 'data-path' : path.id, 'pointer-events' : 'stroke' });
            if (selected || path.id === 'draft') { path.points.forEach ((point) => make ('circle', { cx : point[0], cy : -point[1], r : this.view.width / 240, fill : path.type === 'cut' ? '#e34b4b' : '#318cdd', 'pointer-events' : 'none' })); }
        }
        if (this.status) { const selected = design.paths.find ((path) => path.id === this.active); const length = selected ? selected.points.reduce ((sum, point, index) => index ? sum + Math.hypot (point[0] - selected.points[index - 1][0], point[1] - selected.points[index - 1][1]) : sum, 0) + (selected.closed ? Math.hypot (selected.points[0][0] - selected.points.at (-1)[0], selected.points[0][1] - selected.points.at (-1)[1]) : 0) : 0; this.status.textContent = this.draft.length + ' draft points · ' + design.paths.length + ' paths · selected length ' + (length / this.Factor ()).toFixed (3) + ' ' + DisplayUnitLabel (this.editor.website.preferences.units); }
    }
}
