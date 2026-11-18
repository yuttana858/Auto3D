import { CreatePalletPlan, DefaultPalletMaxHeightMm, PalletColors, PalletPresets } from '../../modules/packaging/src/palletplan.js';
import { LoadPackagingModule, PackagingModel, PackagingUnitMM } from './packagingadapter.js';
import { MeasureWorldBoundsMm } from './autopackworkspace.js';

const Pallet = PalletPresets['gma-40x48'];
const ObjectLimit = 1000;

function Options ({ maxHeightMm = DefaultPalletMaxHeightMm, color = 'blue' } = {})
{
    if (typeof maxHeightMm !== 'number' || !Number.isFinite (maxHeightMm) || maxHeightMm <= 0 || maxHeightMm > 10000) { throw new Error ('Maximum overall height must be 0–10,000 mm.'); }
    if (!Object.hasOwn (PalletColors, color)) { throw new Error ('Choose a blue, brown or black pallet.'); }
    return { maxHeightMm, color };
}

// Column-stacks copies of the selected box on a procedural 40 × 48 × 5 in pallet.
// The selected box is the first box of the load; copies share its geometry and materials.
export class AutoPalletWorkspace
{
    constructor (packaging) { this.packaging = packaging; this.editor = packaging.editor; }
    Measure (options)
    {
        const editor = this.editor, object = editor.selected, document = editor.document;
        if (!object || !document.objects.includes (object) || object.visible === false) { throw new Error ('Select one visible box to palletize.'); }
        if (object.userData?._auto3dPallet) { throw new Error ('Select the box, rather than the pallet.'); }
        if (object.animationAsset || object.keyframes?.length || object.hiddenParts?.length) { throw new Error ('Auto pallet requires a complete static box. Remove animation or hidden parts first.'); }
        if (object.userData?._auto3dPackagingState === 'flat') { throw new Error ('Fold the box before palletizing it.'); }
        const turned = value => Math.abs (((value % 360) + 360) % 360) > 1e-9 && Math.abs (((value % 360) + 360) % 360 - 360) > 1e-9;
        if (turned (object.rotation[0]) || turned (object.rotation[2])) { throw new Error ('Reset the box X and Z rotation so it stands upright before palletizing.'); }
        const factor = PackagingUnitMM[document.model.GetUnit ()]; if (!factor) { throw new Error ('Set known scene units before using Auto pallet.'); }
        const { min, max, size } = MeasureWorldBoundsMm (document, object, factor, 'box');
        const boxMm = { width : size[0], length : size[2], height : size[1] };
        const plan = CreatePalletPlan ({ box : boxMm, pallet : Pallet, maxHeightMm : options.maxHeightMm });
        return { object, document, factor, min, max, boxMm, plan };
    }
    Inspect (options = {})
    {
        let checked;
        try { checked = Options (options); } catch (error) { return { available : false, reason : error.message }; }
        try {
            const m = this.Measure (checked);
            return { available : true, objectId : m.object.id, objectName : m.object.name, units : 'mm', color : checked.color, palletMm : { width : Pallet.widthMm, length : Pallet.lengthMm, height : Pallet.heightMm }, boxMm : m.boxMm, plan : m.plan };
        } catch (error) {
            const object = this.editor.selected;
            return { available : false, reason : error.message, objectId : object?.id, objectName : object?.name };
        }
    }
    async Generate (options = {})
    {
        this.packaging.Editable ();
        const checked = Options (options), editor = this.editor, m = this.Measure (checked), target = m.document, source = m.object, plan = m.plan;
        if (editor.busy) { throw new Error ('Wait for the current operation to finish.'); }
        if (target.objects.length + plan.total > ObjectLimit) { throw new Error ('This load needs ' + plan.total + ' boxes and a pallet, which exceeds the ' + ObjectLimit + '-object session limit. Use a larger box or a lower height.'); }
        const owner = editor.website.auth?.user?.id;
        const unchanged = () => { if (editor.document !== target || editor.website.auth?.user?.id !== owner || editor.website.accountReady === false || editor.readOnly || !target.objects.includes (source)) { throw new Error ('The session changed while building the pallet load.'); } };
        const before = { position : [...source.position], rotation : [...source.rotation], scale : [...source.scale], userData : { ...(source.userData || {}), }, name : source.name };
        const added = []; let pallet = null; const firstIndex = target.objects.length;
        editor.busy = true; editor.RefreshButtons?.();
        try {
            const module = await LoadPackagingModule (); unchanged ();
            const f = m.factor, center = [(m.min[0] + m.max[0]) / 2, (m.min[2] + m.max[2]) / 2], floor = m.min[1];
            // Offset from the object's pivot to its world bounds (mm); rotating the box 90° about Y turns this offset too.
            const offset = [center[0] - source.position[0] * f, m.min[1] - source.position[1] * f, center[1] - source.position[2] * f];
            const palletName = Pallet.name.replace (' pallet', '') + ' × 5 in pallet · ' + PalletColors[checked.color].name;
            pallet = target.AddImported (PackagingModel (module.CreatePallet ({ pallet : Pallet, color : checked.color }), target.model.GetUnit ()), palletName);
            pallet.source = 'Auto pallet'; pallet.position = [center[0] / f, floor / f, center[1] / f]; pallet.rotation = [0, 0, 0]; pallet.scale = [1, 1, 1];
            target.ApplyTransform (pallet);
            const groupId = crypto.randomUUID (), group = { _auto3dGroup : groupId, _auto3dGroupName : 'Pallet load · ' + plan.total + ' × ' + before.name, _auto3dGroupKind : 'group' };
            pallet.userData = { ...group, _auto3dPallet : JSON.stringify ({ version : 1, pallet : Pallet.id, color : checked.color, maxHeightMm : checked.maxHeightMm, perLayer : plan.perLayer, layers : plan.layers, total : plan.total }) };
            let index = 0;
            for (let layer = 0; layer < plan.layers; layer++) {
                for (const place of plan.placements) {
                    unchanged ();
                    const object = index === 0 ? source : target.Instance (source); if (index > 0) { added.push (object); }
                    const [dx, dy, dz] = offset, turnedOffset = place.rotated ? [dz, dy, -dx] : [dx, dy, dz];
                    const bottom = floor + Pallet.heightMm + layer * plan.boxMm.height;
                    object.position = [(center[0] + place.x - turnedOffset[0]) / f, (bottom - turnedOffset[1]) / f, (center[1] + place.z - turnedOffset[2]) / f];
                    object.rotation = [before.rotation[0], before.rotation[1] + (place.rotated ? 90 : 0), before.rotation[2]];
                    object.scale = [...before.scale]; object.userData = { ...before.userData, ...group };
                    object.name = index === 0 ? before.name : before.name + ' [pallet ' + (layer + 1) + '.' + (index % plan.perLayer + 1) + ']';
                    target.ApplyTransform (object); index++;
                    if (index % 40 === 0) { editor.Status?.('Auto pallet · placing ' + index + ' / ' + plan.total + ' boxes'); await new Promise (resolve => setTimeout (resolve, 0)); }
                }
            }
            unchanged (); editor.selected = source; await editor.Render?.(); editor.busy = true; unchanged ();
            const after = { position : [...source.position], rotation : [...source.rotation], userData : { ...source.userData }, name : source.name };
            const apply = async add => {
                if (editor.document !== target) { throw new Error ('This pallet load belongs to another session.'); }
                if (add) { target.Restore (pallet, firstIndex); added.forEach ((object, i) => target.Restore (object, firstIndex + 1 + i)); Object.assign (source, { ...after, position : [...after.position], rotation : [...after.rotation], userData : { ...after.userData } }); }
                else { [pallet, ...added].forEach (object => target.Remove (object)); Object.assign (source, { position : [...before.position], rotation : [...before.rotation], userData : { ...before.userData }, name : before.name }); }
                target.ApplyTransform (source); editor.selected = source; await editor.Render?.();
            };
            // AddImported/Instance appended in order, so the pallet sits at firstIndex and copies follow it.
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); editor.MarkDirty?.();
        } catch (error) {
            [pallet, ...added].filter (Boolean).forEach (object => target.Remove (object));
            Object.assign (source, { position : [...before.position], rotation : [...before.rotation], userData : { ...before.userData }, name : before.name }); target.ApplyTransform (source);
            if (editor.document === target) { editor.selected = source; try { await editor.Render?.(); } catch { /* Keep the original failure. */ } }
            throw error;
        } finally { editor.busy = false; editor.RefreshButtons?.(); editor.website.packagingPanel?.Refresh?.(); }
        editor.website.FitModelToWindow?.(false);
        const inches = mm => Number ((mm / 25.4).toFixed (2));
        const result = {
            palletId : pallet.id, boxId : source.id, boxes : plan.total, perLayer : plan.perLayer, layers : plan.layers, pattern : plan.pattern,
            overallHeightMm : plan.overallHeightMm, loadMm : plan.loadMm, color : checked.color, units : 'mm',
            message : 'Auto pallet · ' + plan.perLayer + ' per layer × ' + plan.layers + ' layers = ' + plan.total + ' boxes · ' + inches (plan.overallHeightMm) + ' in overall. Undo removes the load.'
        };
        editor.Status?.(result.message); return result;
    }
}
