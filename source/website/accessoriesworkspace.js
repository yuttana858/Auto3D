import { DropIn } from './dropin.js';
import * as THREE from 'three';
import { CreatePadPlan, CreatePartitionPlan, PadPositions, BoardGrades } from '../../modules/packaging/src/accessories.js';
import { DefaultBoardDatabase } from '../../modules/packaging/src/boarddatabase.js';
import { DefaultBoardSpecification } from '../../modules/packaging/src/engineering.js';
import { AutoPackDefinition } from './autopackfold.js';
import { DefaultEngineering } from '../../modules/packaging/src/engineering.js';
import { ValidatePackaging } from '../../modules/packaging/src/profile.js';
import { LoadPackagingModule, PackagingModel, PackagingUnitMM } from './packagingadapter.js';
import { MeasureWorldBoundsMm } from './autopackworkspace.js';

const AccessoryKey = '_auto3dAccessory';
const turned = value => { const r = ((value % 360) + 360) % 360; return Math.min (r, 360 - r); };
export function AccessoryData (object) { try { return object?.userData?.[AccessoryKey] ? JSON.parse (object.userData[AccessoryKey]) : null; } catch { return null; } }

// Pads and partitions for the selected generated carton. Sizes come from the carton's engineering inside
// dimensions (the same numbers as the dimensions panel); every piece is a CAD board profile in the carton's
// board record, grouped with the carton.
export class AccessoriesWorkspace
{
    constructor (packaging) { this.packaging = packaging; this.editor = packaging.editor; }
    Carton ()
    {
        const editor = this.editor, carton = editor.selected, document = editor.document;
        if (!carton || !document.objects.includes (carton) || !carton.userData?._auto3dFefco) { throw new Error ('Select a generated carton to add accessories.'); }
        if (AccessoryData (carton)) { throw new Error ('Select the carton, rather than one of its accessories.'); }
        if (carton.userData._auto3dPackagingState === 'flat') { throw new Error ('Fold the carton before adding accessories.'); }
        if (turned (carton.rotation[0]) > 1e-6 || turned (carton.rotation[2]) > 1e-6 || turned (carton.rotation[1]) % 90 > 1e-6) { throw new Error ('Accessories need an upright carton turned in 90° steps.'); }
        if (carton.scale.some (v => Math.abs (v - 1) > 1e-6)) { throw new Error ('Reset the carton scale before adding accessories.'); }
        const factor = PackagingUnitMM[document.model.GetUnit ()]; if (!factor) { throw new Error ('Set known scene units before adding accessories.'); }
        const dimensions = this.packaging.DimensionsInspect (); if (!dimensions?.inside) { throw new Error ('The carton has no inside dimensions.'); }
        const parameters = JSON.parse (carton.userData._auto3dFefco), profile = carton.packagingProfile;
        const material = dimensions.material || { caliperMm : parameters.thickness, name : profile?.grade || 'Carton board' };
        const bounds = MeasureWorldBoundsMm (document, carton, factor, 'carton');
        // The carton's RSC length runs along the longer horizontal world axis (or X when square).
        const lengthAxis = Math.abs (bounds.size[0] - bounds.size[2]) < 1e-6 ? 0 : (bounds.size[0] > bounds.size[2]) === (parameters.length >= parameters.width) ? 0 : 2;
        const inside = { ...dimensions.inside };
        // The inside space is centred in the carton; the height allowance splits equally between top and bottom.
        const floor = bounds.min[1] + (bounds.size[1] - inside.height) / 2;
        const existing = document.objects.filter (object => AccessoryData (object)?.cartonId === carton.id);
        // Thickness of each pad already in the carton (0 when absent).
        const pads = Object.fromEntries (PadPositions.map (position => [position, existing.map (AccessoryData).find (d => d.kind === 'pad' && d.position === position)?.thicknessMm || 0]));
        const partitions = existing.some (o => AccessoryData (o).kind === 'partition');
        return { carton, document, factor, material, thickness : material.caliperMm, inside, bounds, lengthAxis, floor, center : [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[2] + bounds.max[2]) / 2], existing, pads, partitions };
    }
    // The space left for partitions after any pads already in the carton: above the bottom pad,
    // under the top pad and between the front and back pads.
    PartitionSpace (c)
    {
        const p = c.pads;
        return { floor : c.floor + p.bottom, widthStart : p.front, inside : { ...c.inside, height : c.inside.height - p.bottom - p.top, width : c.inside.width - p.front - p.back } };
    }
    // Board choices for pads: the account board catalog (nominal records until it is saved) and grades.
    Boards ()
    {
        if (!this.loading && !this.packaging.boardDatabase) { this.loading = this.packaging.BoardStore ().then (() => this.editor.website.packagingPanel?.Refresh?.()).catch (() => {}); }
        const records = this.packaging.boardDatabase?.records?.length ? this.packaging.boardDatabase.records : DefaultBoardDatabase ();
        return { records : records.map (r => ({ id : r.id, name : r.name, flute : r.flute, caliperMm : r.caliperMm })), grades : [...BoardGrades] };
    }
    PadMaterial ({ boardId, grade }, c)
    {
        if (boardId === undefined && grade === undefined) { return c.material; }
        const records = this.packaging.boardDatabase?.records?.length ? this.packaging.boardDatabase.records : DefaultBoardDatabase ();
        const record = records.find (r => r.id === boardId); if (!record) { throw new Error ('Choose a board from the board catalog.'); }
        if (grade !== undefined && !BoardGrades.includes (grade)) { throw new Error ('Choose a listed board grade.'); }
        const name = record.flute + ' flute · ' + (grade || 'grade not specified');
        return { ...DefaultBoardSpecification (record.caliperMm), ...record, id : record.id + (grade ? '-' + grade.replace (/[^A-Za-z0-9]+/g, '-').toLowerCase () : ''), name, outsideLinerGrade : grade || record.outsideLinerGrade, insideLinerGrade : grade || record.insideLinerGrade };
    }
    PadOptions ({ positions = ['bottom'], boardId, grade, keepBox = false } = {})
    {
        if (typeof keepBox !== 'boolean') { throw new Error ('keepBox must be true or false.'); }
        return { positions, boardId, grade, keepBox };
    }
    // Pads for the carton as it is, or for the carton grown so the product space stays the same.
    PlanPads (c, options)
    {
        const material = this.PadMaterial (options, c), t = material.caliperMm;
        if (options.positions.some (position => c.pads[position])) { throw new Error ('This carton already has a ' + options.positions.find (position => c.pads[position]) + ' pad.'); }
        const growth = CreatePadPlan ({ insideMm : c.inside, thickness : t, positions : options.positions }).growthMm;
        const insideMm = options.keepBox ? c.inside : { length : c.inside.length + growth.length, width : c.inside.width + growth.width, height : c.inside.height + growth.height };
        return { material, insideMm, growthMm : options.keepBox ? { length : 0, width : 0, height : 0 } : growth, plan : CreatePadPlan ({ insideMm, thickness : t, positions : options.positions }) };
    }
    Inspect ({ pads = {}, partitions = { columns : 3, rows : 2 } } = {})
    {
        let c;
        try { c = this.Carton (); } catch (error) { return { available : false, reason : error.message, cartonId : this.editor.selected?.id, cartonName : this.editor.selected?.name }; }
        const result = { available : true, cartonId : c.carton.id, cartonName : c.carton.name, units : 'mm', insideMm : c.inside, thicknessMm : c.thickness, boardName : c.material.name, existing : { pads : c.pads, partitions : c.partitions, pieces : c.existing.length } };
        result.boards = this.Boards ();
        try {
            if (c.partitions) { throw new Error ('Add pads before partitions.'); }
            const options = this.PadOptions (pads), planned = this.PlanPads (c, options);
            if (!options.keepBox && AutoPackDefinition (c.carton)) { throw new Error ('Auto Pack cartons keep their fitted size. Tick Do not affect box ID, or run Auto Pack again.'); }
            result.pads = { ...Summary (planned.plan), boardName : planned.material.name, keepBox : options.keepBox, boxInsideMm : planned.insideMm, growthMm : planned.growthMm };
        } catch (error) { result.padReason = error.message; }
        try { if (c.partitions) { throw new Error ('This carton already has partitions.'); } const space = this.PartitionSpace (c); result.partitions = Summary (CreatePartitionPlan ({ insideMm : space.inside, thickness : c.thickness, columns : partitions.columns, rows : partitions.rows })); } catch (error) { result.partitionReason = error.message; }
        return result;
    }
    async AddPads (input = {})
    {
        const options = this.PadOptions (input); let c = this.Begin ();
        if (c.partitions) { throw new Error ('Add pads before partitions, so the partitions fit between them.'); }
        let planned = this.PlanPads (c, options), resized = null;
        if (!options.keepBox) {
            if (AutoPackDefinition (c.carton)) { throw new Error ('Auto Pack cartons keep their fitted size. Tick Do not affect box ID, or run Auto Pack again.'); }
            if (c.existing.length) { throw new Error ('Changing the box inside size would move the accessories already in it. Tick Do not affect box ID, or undo them first.'); }
            // Grow the carton through the standard engineering dimension path (inside basis), then pad the new inside.
            const before = { ...c.inside };
            await this.packaging.UpdateDimensions ({ basis : 'inside', ...planned.insideMm }, c.carton.id);
            c = this.Carton (); planned = this.PlanPads (c, { ...options, keepBox : true }); resized = { before, after : { ...c.inside } };
        }
        const t = planned.material.caliperMm, inside = c.inside, below = planned.plan.pads.some (p => p.position === 'bottom') ? t : 0, clear = planned.plan.clearanceMm;
        const pieces = planned.plan.pads.map (pad => ({ profile : pad.profile, name : pad.profile.name + ' · ' + c.carton.name, material : planned.material,
            data : { kind : 'pad', position : pad.position, orientation : pad.orientation, lengthMm : pad.lengthMm, acrossMm : pad.widthMm ?? pad.heightMm, thicknessMm : t, keepBox : options.keepBox },
            place : pad.orientation === 'horizontal'
                ? { upright : false, along : 'length', min : { length : clear, width : clear, y : pad.position === 'bottom' ? c.floor : c.floor + inside.height - t } }
                : { upright : true, along : 'length', min : { length : clear, width : pad.position === 'front' ? 0 : inside.width - t, y : c.floor + below + clear } } }));
        let result;
        try { result = await this.Build (c, pieces); }
        catch (error) { if (resized) { await this.editor.history.Undo?.(); } throw error; }
        const sizes = planned.plan.pads.map (p => p.position + ' ' + Number (p.lengthMm.toFixed (1)) + ' × ' + Number ((p.widthMm ?? p.heightMm).toFixed (1))).join (', ');
        return { ...result, kind : 'pads', pads : Summary (planned.plan), boardName : planned.material.name, thicknessMm : t, keepBox : options.keepBox, box : resized,
            message : 'Added ' + pieces.length + (pieces.length > 1 ? ' pads' : ' pad') + ' (' + sizes + ' mm) in ' + planned.material.name + ', ' + t + ' mm.' + (resized ? ' Box inside grew to ' + ['length', 'width', 'height'].map (k => Number (resized.after[k].toFixed (2))).join (' × ') + ' mm to keep the product space; Undo twice restores it.' : ' Box size unchanged.') };
    }
    async AddPartitions ({ columns = 3, rows = 2 } = {})
    {
        const c = this.Begin ();
        if (c.partitions) { throw new Error ('This carton already has partitions. Undo them to change the cells.'); }
        const space = this.PartitionSpace (c), plan = CreatePartitionPlan ({ insideMm : space.inside, thickness : c.thickness, columns, rows });
        const pieces = plan.strips.map (strip => ({ profile : strip.profile, name : strip.profile.name + ' · ' + c.carton.name, data : { kind : 'partition', strip : strip.id, columns, rows, slots : strip.slots },
            place : { upright : true, along : strip.axis, min : strip.axis === 'length' ? { length : plan.clearanceMm, width : space.widthStart + strip.offsetMm - plan.thicknessMm / 2, y : space.floor + plan.clearanceMm } : { length : strip.offsetMm - plan.thicknessMm / 2, width : space.widthStart + plan.clearanceMm, y : space.floor + plan.clearanceMm } } }));
        const result = await this.Build (c, pieces);
        return { ...result, kind : 'partitions', partitions : Summary (plan), message : 'Added ' + plan.cells + '-cell partitions (' + columns + ' × ' + rows + ') · ' + plan.strips.length + ' strips. Undo removes them.' };
    }
    Begin ()
    {
        this.packaging.Editable (); const editor = this.editor; if (editor.busy) { throw new Error ('Wait for the current operation to finish.'); }
        const c = this.Carton (); if (c.document.objects.length + 20 > 1000) { throw new Error ('Session is near the 1000 object limit.'); } return c;
    }
    async Build (c, pieces)
    {
        const editor = this.editor, target = c.document, carton = c.carton, owner = editor.website.auth?.user?.id, f = c.factor, t = c.thickness;
        const unchanged = () => { if (editor.document !== target || editor.website.auth?.user?.id !== owner || editor.readOnly || !target.objects.includes (carton)) { throw new Error ('The session changed while adding accessories.'); } };
        const before = { ...(carton.userData || {}) }, groupId = carton.userData._auto3dGroup || crypto.randomUUID ();
        const group = { _auto3dGroup : groupId, _auto3dGroupName : carton.userData._auto3dGroupName || 'Carton set · ' + carton.name, _auto3dGroupKind : carton.userData._auto3dGroupKind || 'group' };
        // World axes for the carton's length and width; the carton's inside corner in world mm.
        const axis = { length : c.lengthAxis, width : c.lengthAxis === 0 ? 2 : 0 };
        const corner = [c.center[0] - (axis.length === 0 ? c.inside.length : c.inside.width) / 2, 0, c.center[1] - (axis.length === 2 ? c.inside.length : c.inside.width) / 2];
        const added = []; const firstIndex = target.objects.length; let dropIn = { animated : false }; editor.busy = true; editor.RefreshButtons?.();
        try {
            const module = await LoadPackagingModule (); unchanged ();
            for (const piece of pieces) {
                const material = piece.material || c.material, want = [0, 0, 0];
                want[axis.length] = corner[axis.length] + piece.place.min.length; want[axis.width] = corner[axis.width] + piece.place.min.width; want[1] = piece.place.min.y;
                const object = AddBoardPiece (module, target, piece.profile, material, { upright : piece.place.upright, runsAlongX : axis[piece.place.along] === 0, min : want }, f, piece.name, 'Accessory · ' + piece.data.kind); added.push (object);
                object.userData = { ...group, [AccessoryKey] : JSON.stringify ({ version : 1, cartonId : carton.id, thicknessMm : (piece.material || c.material).caliperMm, boardName : (piece.material || c.material).name, ...piece.data }) };
                unchanged ();
            }
            carton.userData = { ...carton.userData, ...group };
            // The new pieces stay hidden through the rebuild, then lower in from above instead of appearing in place.
            editor.motionOverride = () => added.forEach (object => { if (object.threeObject) { object.threeObject.visible = false; } });
            try { editor.selected = carton; await editor.Render?.(); editor.busy = true; unchanged (); dropIn = await DropIn (editor, added, f, { data : AccessoryData, easing : editor.website.preferences?.motionEasing || 'smooth' }); }
            finally { editor.motionOverride = null; added.forEach (object => { if (object.threeObject) { object.threeObject.visible = object.visible !== false; object.threeObject.position?.fromArray?.(object.position); } }); }
            unchanged ();
            const after = { ...carton.userData };
            const apply = async add => {
                if (editor.document !== target) { throw new Error ('These accessories belong to another session.'); }
                if (add) { added.forEach ((object, i) => target.Restore (object, firstIndex + i)); carton.userData = { ...after }; } else { added.forEach (object => target.Remove (object)); carton.userData = { ...before }; }
                editor.selected = carton; await editor.Render?.(); editor.website.packagingPanel?.Refresh?.();
            };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); editor.MarkDirty?.();
        } catch (error) {
            added.forEach (object => target.Remove (object)); carton.userData = { ...before };
            if (editor.document === target) { editor.selected = carton; try { await editor.Render?.(); } catch { /* Keep the original failure. */ } }
            throw error;
        } finally { editor.busy = false; editor.RefreshButtons?.(); editor.website.packagingPanel?.Refresh?.(); }
        return { cartonId : carton.id, objectIds : added.map (object => object.id), pieces : added.length, units : 'mm', thicknessMm : t, boardName : c.material.name, dropIn };
    }
}

// Adds one board piece: the CAD profile in the given board record, extruded and placed so its world
// bounds start at `min` (mm). Boards extrude flat (profile X → world X, profile Y → world −Z, caliper up);
// upright pieces stand on edge, then turn so they run along X or Z. Shared by Accessories and Auto Pack.
export function AddBoardPiece (module, target, sourceProfile, material, { upright = false, runsAlongX = true, min }, factor, name, source)
{
    const profile = ValidatePackaging ({ ...sourceProfile, grade : material.name || sourceProfile.grade, ...(material.id ? { engineering : Engineering (sourceProfile, material) } : {}) });
    const object = target.AddImported (PackagingModel (module.CreateBoard (profile, { textured : true }), target.model.GetUnit ()), name);
    object.source = source; object.packagingProfile = profile;
    const rotation = new THREE.Quaternion ();
    if (upright) { rotation.setFromAxisAngle (new THREE.Vector3 (1, 0, 0), Math.PI / 2); }
    if (!runsAlongX) { rotation.premultiply (new THREE.Quaternion ().setFromAxisAngle (new THREE.Vector3 (0, 1, 0), Math.PI / 2)); }
    const euler = new THREE.Euler ().setFromQuaternion (rotation, 'XYZ');
    object.rotation = [euler.x, euler.y, euler.z].map (v => Math.abs (THREE.MathUtils.radToDeg (v)) < 1e-9 ? 0 : THREE.MathUtils.radToDeg (v)); object.position = [0, 0, 0]; object.scale = [1, 1, 1];
    target.ApplyTransform (object);
    const now = MeasureWorldBoundsMm (target, object, factor, 'accessory');
    object.position = min.map ((value, i) => (value - now.min[i]) / factor); target.ApplyTransform (object);
    return object;
}
// The carton's board record becomes the accessory's measurement-layer material.
function Engineering (profile, material)
{
    const engineering = DefaultEngineering (profile, null); engineering.materials[0] = { ...engineering.materials[0], ...material }; engineering.activeMaterialId = material.id; return engineering;
}
function Summary (plan)
{
    const { strips, pads, ...rest } = plan, named = items => items.map (({ profile, ...item }) => ({ ...item, profile : profile.name }));
    return { ...rest, ...(strips ? { strips : named (strips) } : {}), ...(pads ? { pads : named (pads) } : {}) };
}
