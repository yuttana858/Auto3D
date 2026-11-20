import { DropIn } from './dropin.js';
import { SenseCanRim, CanRadiusInSlab, CreateCanCollarPlan, CollarBoards, DefaultCollarOptions, MaxCollarCans, CollarNeckClearanceMm } from '../../modules/packaging/src/cancollar.js';
import { LoadPackagingModule, PackagingUnitMM } from './packagingadapter.js';
import { AddBoardPiece, AccessoryData } from './accessoriesworkspace.js';

const AccessoryKey = '_auto3dAccessory';
const MaxPointsPerCan = 400000;

// Can collar for the selected cans (a group or array of upright cans): senses each can's top rim from its
// geometry, plans a paperboard collar with a tabbed relief hole per can and places it just under the rims,
// grouped with the cans. The collar is a CAD board profile like every other accessory.
export class CanCollarWorkspace
{
    constructor (packaging) { this.packaging = packaging; this.editor = packaging.editor; }
    Options (input = {})
    {
        const allowed = ['boardId', 'tuckMm', 'reliefMm', 'marginMm', 'cornerRadiusMm', 'tabs', 'notchWidthMm'];
        const unknown = Object.keys (input || {}).find (key => !allowed.includes (key)); if (unknown) { throw new Error ('Unknown can collar option: ' + unknown + '.'); }
        const options = { ...DefaultCollarOptions, ...input };
        const board = CollarBoards.find (b => b.id === options.boardId); if (!board) { throw new Error ('Choose a collar board: ' + CollarBoards.map (b => b.id).join (', ') + '.'); }
        if (options.cornerRadiusMm !== null && (typeof options.cornerRadiusMm !== 'number' || !Number.isFinite (options.cornerRadiusMm) || options.cornerRadiusMm < 0)) { throw new Error ('Corner radius must be 0 mm or more (omit it to follow the corner cans).'); }
        if (!Number.isInteger (options.tabs) || options.tabs < 0 || options.tabs > 48) { throw new Error ('Tabs must be 0 (automatic) or 4–48.'); }
        return { ...options, board, automaticTuck : !Object.hasOwn (input, 'tuckMm') };
    }
    // The selected cans, each with its sensed rim in world mm.
    Cans ()
    {
        const editor = this.editor, document = editor.document, primary = editor.selected;
        if (!primary || !document.objects.includes (primary)) { throw new Error ('Select a group or array of cans for the collar.'); }
        const selection = editor.SelectedObjects ? editor.SelectedObjects () : [primary];
        // A pack that already has its collar selects with it: the collar is not a can.
        const objects = (selection.length ? selection : [primary]).filter (object => !AccessoryData (object));
        if (!objects.length) { throw new Error ('Select the cans, rather than an accessory.'); }
        const ids = new Set (objects.map (object => object.id));
        if (document.objects.some (object => AccessoryData (object)?.kind === 'collar' && AccessoryData (object).canIds?.some (id => ids.has (id)))) { throw new Error ('These cans already have a collar. Undo or delete it to make a new one.'); }
        if (objects.some (object => object.visible === false)) { throw new Error ('Show every selected can first.'); }
        if (objects.length > MaxCollarCans) { throw new Error ('A can collar holds up to ' + MaxCollarCans + ' cans.'); }
        if (objects.some (object => object.animationAsset || object.keyframes?.length || object.hiddenParts?.length)) { throw new Error ('The collar needs complete static can models. Remove animation or hidden parts first.'); }
        const factor = PackagingUnitMM[document.model.GetUnit ()]; if (!factor) { throw new Error ('This scene has no units. Set the model units (Auto Pack: Refresh bounds) before adding a collar.'); }
        const cans = objects.map (object => {
            document.ApplyTransform (object);
            const points = []; let count = 0;
            document.CompactModel ([object]).EnumerateTriangleVertices ((...vertices) => {
                for (const p of vertices) { if (++count > MaxPointsPerCan * 3) { throw new Error ('Simplify ' + object.name + ' below ' + (MaxPointsPerCan).toLocaleString () + ' triangles before adding a collar.'); } points.push (p.x * factor, p.y * factor, p.z * factor); }
            });
            try {
                const rim = SenseCanRim (points), triangles = [], low = rim.rimBottomMm - Math.max (...CollarBoards.map (b => b.caliperMm)) - 1 - CollarNeckClearanceMm;
                for (let i = 0; i < points.length; i += 9) { if (Math.min (points[i + 1], points[i + 4], points[i + 7]) <= rim.rimBottomMm && Math.max (points[i + 1], points[i + 4], points[i + 7]) >= low) { triangles.push (...points.slice (i, i + 9)); } }
                return { object, rim, triangles };
            }
            catch (error) { throw new Error (object.name + ': ' + error.message); }
        });
        const rims = cans.map (can => can.rim.rimRadiusMm), bottoms = cans.map (can => can.rim.rimBottomMm);
        if (Math.max (...rims) - Math.min (...rims) > 0.5) { throw new Error ('The cans have different rim sizes. A collar holds cans of one size.'); }
        if (Math.max (...bottoms) - Math.min (...bottoms) > 1) { throw new Error ('The cans stand at different heights. Set them on the same floor first.'); }
        return { document, factor, cans, rimRadiusMm : Math.max (...rims), rimBottomMm : Math.min (...bottoms) };
    }
    Plan (c, options)
    {
        const name = 'Can collar · ' + c.cans.length + (c.cans.length === 1 ? ' can' : ' cans');
        const topMm = c.rimBottomMm - CollarNeckClearanceMm;
        const neckRadiusMm = Math.max (...c.cans.map (can => CanRadiusInSlab (can.triangles, can.rim.center, topMm - options.board.caliperMm, topMm)));
        return { ...CreateCanCollarPlan ({ cans : c.cans.map (can => can.rim.center), rimRadiusMm : c.rimRadiusMm, neckRadiusMm, thickness : options.board.caliperMm, tuckMm : options.automaticTuck ? null : options.tuckMm, reliefMm : options.reliefMm, marginMm : options.marginMm, cornerRadiusMm : options.cornerRadiusMm, tabs : options.tabs, notchWidthMm : options.notchWidthMm, name, grade : options.board.name }), topMm };
    }
    Inspect (input = {})
    {
        const boards = CollarBoards.map (b => ({ ...b }));
        let options, c;
        try { options = this.Options (input); c = this.Cans (); }
        catch (error) { return { available : false, reason : error.message, boards, defaults : { ...DefaultCollarOptions } }; }
        const rim = c.cans[0].rim, result = { available : true, units : 'mm', boards, defaults : { ...DefaultCollarOptions }, cans : c.cans.length, canIds : c.cans.map (can => can.object.id), rim : { radiusMm : c.rimRadiusMm, bottomMm : c.rimBottomMm, heightMm : rim.rimHeightMm, neckRadiusMm : rim.neckRadiusMm, undercutMm : rim.undercutMm, canDiameterMm : rim.diameterMm, canHeightMm : rim.heightMm } };
        try { const { profile, ...plan } = this.Plan (c, options); result.collar = { ...plan, board : options.board.name, profile : profile.name }; }
        catch (error) { result.available = false; result.reason = error.message; }
        return result;
    }
    async Add (input = {})
    {
        this.packaging.Editable (); const editor = this.editor; if (editor.busy) { throw new Error ('Wait for the current operation to finish.'); }
        const options = this.Options (input), c = this.Cans (), plan = this.Plan (c, options), target = c.document;
        if (target.objects.length + 1 > 1000) { throw new Error ('Session is near the 1000 object limit.'); }
        const owner = editor.website.auth?.user?.id, cans = c.cans.map (can => can.object), primary = cans.includes (editor.selected) ? editor.selected : cans[0];
        const unchanged = () => { if (editor.document !== target || editor.website.auth?.user?.id !== owner || editor.website.accountReady === false || editor.readOnly || cans.some (can => !target.objects.includes (can))) { throw new Error ('The session changed while adding the collar.'); } };
        // The collar joins the cans' group (or a new one), so it moves and selects with them.
        const shared = cans.every (can => can.userData?._auto3dGroup && can.userData._auto3dGroup === cans[0].userData._auto3dGroup);
        const group = shared ? { _auto3dGroup : cans[0].userData._auto3dGroup, _auto3dGroupName : cans[0].userData._auto3dGroupName || 'Can pack', _auto3dGroupKind : cans[0].userData._auto3dGroupKind || 'group' } : { _auto3dGroup : crypto.randomUUID (), _auto3dGroupName : cans.length + '-can pack', _auto3dGroupKind : 'group' };
        const before = new Map (cans.map (can => [can, { ...(can.userData || {}) }]));
        const material = { name : options.board.name, caliperMm : options.board.caliperMm };
        const index = target.objects.length; let collar = null, dropIn = { animated : false };
        editor.busy = true; editor.RefreshButtons?.();
        try {
            const module = await LoadPackagingModule (); unchanged ();
            // Keep a small axial gap below the rim; the full board slab and tab chords clear each neck.
            const min = [plan.worldMinMm[0], plan.topMm - plan.thicknessMm, plan.worldMinMm[1]];
            collar = AddBoardPiece (module, target, plan.profile, material, { upright : false, runsAlongX : true, min }, c.factor, plan.profile.name, 'Accessory · can collar');
            collar.userData = { ...group, [AccessoryKey] : JSON.stringify ({ version : 1, kind : 'collar', canIds : cans.map (can => can.id), boardId : options.board.id, boardName : options.board.name, thicknessMm : plan.thicknessMm, rimRadiusMm : plan.rimRadiusMm, holeRadiusMm : plan.holeRadiusMm, reliefRadiusMm : plan.reliefRadiusMm, tuckMm : plan.tuckMm, tabs : plan.tabs }) };
            cans.forEach (can => { can.userData = { ...can.userData, ...group }; });
            unchanged ();
            // Hidden through the rebuild, then lowered onto the cans like the other accessories.
            editor.motionOverride = () => { if (collar.threeObject) { collar.threeObject.visible = false; } };
            try { editor.selected = primary; await editor.Render?.(); editor.busy = true; unchanged (); dropIn = await DropIn (editor, [collar], c.factor, { data : AccessoryData, easing : editor.website.preferences?.motionEasing || 'smooth' }); }
            finally { editor.motionOverride = null; if (collar.threeObject) { collar.threeObject.visible = collar.visible !== false; collar.threeObject.position?.fromArray?.(collar.position); } }
            unchanged ();
            const after = new Map (cans.map (can => [can, { ...can.userData }]));
            const apply = async add => {
                if (editor.document !== target) { throw new Error ('This collar belongs to another session.'); }
                if (add) { target.Restore (collar, index); after.forEach ((data, can) => { can.userData = { ...data }; }); } else { target.Remove (collar); before.forEach ((data, can) => { can.userData = { ...data }; }); }
                editor.selected = primary; await editor.Render?.(); editor.website.packagingPanel?.Refresh?.();
            };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); editor.MarkDirty?.();
        } catch (error) {
            if (collar) { target.Remove (collar); } before.forEach ((data, can) => { can.userData = { ...data }; });
            if (editor.document === target) { editor.selected = primary; try { await editor.Render?.(); } catch { /* Keep the original failure. */ } }
            throw error;
        } finally { editor.busy = false; editor.RefreshButtons?.(); editor.website.packagingPanel?.Refresh?.(); }
        const { profile, ...summary } = plan;
        return { objectId : collar.id, canIds : cans.map (can => can.id), units : 'mm', board : options.board.name, collar : { ...summary, profile : profile.name }, dropIn,
            message : 'Added a ' + cans.length + '-can collar (' + Number (plan.sizeMm.length.toFixed (1)) + ' × ' + Number (plan.sizeMm.width.toFixed (1)) + ' mm, ' + options.board.name + ') with ' + plan.tabs + ' tabs per can and ' + Number (plan.tuckMm.toFixed (3)) + ' mm tuck below the rims. Flat fit clears the necks; tab bending during application is not simulated. Undo removes it.' };
    }
}
