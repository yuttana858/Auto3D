import { DropIn } from './dropin.js';
import { ProgressRecord, ShowProgressPopup, NextFrame } from './progresspopup.js';
import { SenseCanRim, CanRadiusInSlab, CanRadialProfile, SolveTabFold, CreateCanCollarPlan, CollarBoards, CollarStandards, DefaultCollarOptions, MaxCollarCans, CollarNeckClearanceMm } from '../../modules/packaging/src/cancollar.js';
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
        const allowed = ['design', 'boardId', 'tuckMm', 'reliefMm', 'marginMm', 'cornerRadiusMm', 'tabs', 'notchWidthMm'];
        const unknown = Object.keys (input || {}).find (key => !allowed.includes (key)); if (unknown) { throw new Error ('Unknown can collar option: ' + unknown + '.'); }
        const options = { ...DefaultCollarOptions, design : 'auto', ...input };
        if (!['auto', 'custom', ...CollarStandards.map (d => d.id)].includes (options.design)) { throw new Error ('Choose a collar design: auto, custom or ' + CollarStandards.map (d => d.id).join (', ') + '.'); }
        const board = CollarBoards.find (b => b.id === options.boardId); if (!board) { throw new Error ('Choose a collar board: ' + CollarBoards.map (b => b.id).join (', ') + '.'); }
        if (options.cornerRadiusMm !== null && (typeof options.cornerRadiusMm !== 'number' || !Number.isFinite (options.cornerRadiusMm) || options.cornerRadiusMm < 0)) { throw new Error ('Corner radius must be 0 mm or more (omit it to follow the corner cans).'); }
        if (!Number.isInteger (options.tabs) || options.tabs < 0 || options.tabs > 48) { throw new Error ('Tabs must be 0 (automatic) or 4–48.'); }
        return { ...options, board, automaticTuck : !Object.hasOwn (input, 'tuckMm'), explicitFit : ['tuckMm', 'reliefMm', 'tabs', 'notchWidthMm'].some (key => Object.hasOwn (input, key) && input[key] !== DefaultCollarOptions[key]) };
    }
    // The selected cans, each with its sensed rim in world mm.
    // The selected cans (checked), without sensing them yet.
    Selection ()
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
        return { document, factor, objects };
    }
    // One can's rim, from its surface in world mm, and the triangles near the collar slab.
    SenseCan (document, object, factor)
    {
        document.ApplyTransform (object);
        const points = []; let count = 0;
        document.CompactModel ([object]).EnumerateTriangleVertices ((...vertices) => {
            for (const p of vertices) { if (++count > MaxPointsPerCan * 3) { throw new Error ('Simplify ' + object.name + ' below ' + (MaxPointsPerCan).toLocaleString () + ' triangles before adding a collar.'); } points.push (p.x * factor, p.y * factor, p.z * factor); }
        });
        try {
            // Triangles of the top 11 mm under the rim: the neck and shoulder the collar and its folded tabs sit against.
            const rim = SenseCanRim (points), triangles = [], low = rim.rimBottomMm - 11;
            for (let i = 0; i < points.length; i += 9) { if (Math.min (points[i + 1], points[i + 4], points[i + 7]) <= rim.rimBottomMm && Math.max (points[i + 1], points[i + 4], points[i + 7]) >= low) { triangles.push (...points.slice (i, i + 9)); } }
            return { object, rim, triangles, vertices : count };
        }
        catch (error) { throw new Error (object.name + ': ' + error.message); }
    }
    Combine ({ document, factor }, cans)
    {
        const rims = cans.map (can => can.rim.rimRadiusMm), bottoms = cans.map (can => can.rim.rimBottomMm);
        if (Math.max (...rims) - Math.min (...rims) > 0.5) { throw new Error ('The cans have different rim sizes. A collar holds cans of one size.'); }
        if (Math.max (...bottoms) - Math.min (...bottoms) > 1) { throw new Error ('The cans stand at different heights. Set them on the same floor first.'); }
        return { document, factor, cans, rimRadiusMm : Math.max (...rims), rimBottomMm : Math.min (...bottoms) };
    }
    // The selected cans, each with its sensed rim in world mm.
    Cans ()
    {
        const selection = this.Selection ();
        return this.Combine (selection, selection.objects.map (object => this.SenseCan (selection.document, object, selection.factor)));
    }
    // Universal design for these cans: a named standard, or for 'auto' the standard whose rim range fits.
    Design (c, options)
    {
        if (options.design === 'custom') { return null; }
        if (options.design !== 'auto') { return options.design; }
        // Explicit tuck, relief or tab values ask for a custom fit.
        if (options.explicitFit) { return null; }
        return CollarStandards.find (d => 2 * c.rimRadiusMm >= d.rimDiameterMm[0] && 2 * c.rimRadiusMm <= d.rimDiameterMm[1])?.id || null;
    }
    Plan (c, options)
    {
        const standard = this.Design (c, options), design = CollarStandards.find (d => d.id === standard);
        const name = (design ? design.name.split (' · ')[0] + ' collar' : 'Can collar') + ' · ' + c.cans.length + (c.cans.length === 1 ? ' can' : ' cans');
        const flatTopMm = c.rimBottomMm - CollarNeckClearanceMm, thickness = options.board.caliperMm;
        const neckRadiusMm = Math.max (...c.cans.map (can => CanRadiusInSlab (can.triangles, can.rim.center, flatTopMm - thickness, flatTopMm)));
        const common = { cans : c.cans.map (can => can.rim.center), rimRadiusMm : c.rimRadiusMm, neckRadiusMm, thickness, tuckMm : options.automaticTuck ? null : options.tuckMm, reliefMm : options.reliefMm, marginMm : options.marginMm, cornerRadiusMm : options.cornerRadiusMm, tabs : options.tabs, notchWidthMm : options.notchWidthMm, grade : options.board.name, print : { version : 1, ground : options.board.ground } };
        const plan = (id, title) => {
            // A universal design folds its tabs up along the crease to lock under the rims, when the cans allow it:
            // the solver places the sheet and the fold from the cans' real outline. Otherwise the collar lies flat.
            if (id) {
                c.outline ??= CanRadialProfile (c.cans.map (can => ({ triangles : can.triangles, center : can.rim.center })), c.rimBottomMm - 11, c.rimBottomMm + 0.1);
                const base = CreateCanCollarPlan ({ ...common, name : title, standard : id, tabFold : { version : 1, angleDeg : 0 } });
                const fold = SolveTabFold ({ outline : c.outline, rimRadiusMm : c.rimRadiusMm, rimBottomMm : c.rimBottomMm, creaseRadiusMm : base.reliefRadiusMm, tabs : base.tabs, tipRadiusMm : base.holeRadiusMm, notchWidthMm : base.notchWidthMm, thickness });
                if (fold) { return { ...CreateCanCollarPlan ({ ...common, name : title, standard : id, tabFold : { version : 1, angleDeg : fold.angleDeg } }), topMm : fold.sheetTopMm, fold, neckClearanceMm : fold.clearanceMm }; }
            }
            return { ...CreateCanCollarPlan ({ ...common, name : title, standard : id }), topMm : flatTopMm, fold : null };
        };
        // Automatic: the universal design when it fits these cans, otherwise a custom fit (with the reason).
        if (standard && options.design === 'auto') {
            try { return plan (standard, name); }
            catch (error) { return { ...plan (null, 'Can collar · ' + c.cans.length + (c.cans.length === 1 ? ' can' : ' cans')), standardRefused : error.message }; }
        }
        return plan (standard, name);
    }
    // Opens the CAD designer on the collar of the selected cans (or the selected collar), at its Print section.
    EditArtwork ()
    {
        const editor = this.editor, document = editor.document, selected = editor.SelectedObjects ? editor.SelectedObjects () : [editor.selected];
        const ids = new Set (selected.filter (Boolean).map (object => object.id));
        const collar = selected.find (object => AccessoryData (object)?.kind === 'collar') || document.objects.find (object => AccessoryData (object)?.kind === 'collar' && AccessoryData (object).canIds?.some (id => ids.has (id)));
        if (!collar) { throw new Error ('Select a can pack with a collar (or the collar) to edit its artwork.'); }
        editor.Select ? editor.Select (collar, false, false, true) : (editor.selected = collar);
        const result = this.packaging.OpenSelected ();
        return { ...result, objectId : collar.id, message : 'Collar opened in CAD: use Print to set the board top and artwork.' };
    }
    Inspect (input = {})
    {
        const boards = CollarBoards.map (b => ({ ...b })), designs = CollarStandards.map (d => ({ id : d.id, name : d.name, tabs : d.tabs, tipDiameterMm : d.tipDiameterMm, reliefDiameterMm : d.reliefDiameterMm, notchWidthMm : d.notchWidthMm, rimDiameterMm : [...d.rimDiameterMm] }));
        let options, c;
        try { options = this.Options (input); c = this.Cans (); }
        catch (error) { return { available : false, reason : error.message, boards, designs, defaults : { ...DefaultCollarOptions, design : 'auto' } }; }
        const rim = c.cans[0].rim, result = { available : true, units : 'mm', boards, designs, defaults : { ...DefaultCollarOptions, design : 'auto' }, cans : c.cans.length, canIds : c.cans.map (can => can.object.id), rim : { radiusMm : c.rimRadiusMm, bottomMm : c.rimBottomMm, heightMm : rim.rimHeightMm, neckRadiusMm : rim.neckRadiusMm, undercutMm : rim.undercutMm, canDiameterMm : rim.diameterMm, canHeightMm : rim.heightMm } };
        try { const { profile, ...plan } = this.Plan (c, options); result.collar = { ...plan, board : options.board.name, profile : profile.name }; }
        catch (error) { result.available = false; result.reason = error.message; }
        return result;
    }
    async Add (input = {})
    {
        this.packaging.Editable (); const editor = this.editor; if (editor.busy) { throw new Error ('Wait for the current operation to finish.'); }
        const options = this.Options (input), selection = this.Selection (), target = selection.document;
        if (target.objects.length + 1 > 1000) { throw new Error ('Session is near the 1000 object limit.'); }
        // Every step reports to the progress popup and yields so it can paint; weights follow measured step times.
        const record = new ProgressRecord ('Can collar', [
            { id : 'sense', label : 'Sensing can rims', weight : 6 },
            { id : 'plan', label : 'Planning collar and tabs', weight : 2 },
            { id : 'board', label : 'Building board geometry', weight : 50 },
            { id : 'scene', label : 'Placing in the scene', weight : 24 },
            { id : 'drop', label : 'Lowering onto the cans', weight : 18 }
        ]);
        this.lastProgress = record; const popup = ShowProgressPopup (record);
        editor.busy = true; editor.RefreshButtons?.();
        let c, plan;
        try {
            const sensed = [], n = selection.objects.length; record.Step ('sense', { detail : '0 / ' + n + ' cans' }); await NextFrame ();
            for (const object of selection.objects) {
                const can = this.SenseCan (target, object, selection.factor); sensed.push (can);
                record.Step ('sense', { detail : sensed.length + ' / ' + n + ' cans · rim Ø ' + (2 * can.rim.rimRadiusMm).toFixed (1) + ' mm', fraction : sensed.length / n }); await NextFrame ();
            }
            c = this.Combine (selection, sensed);
            record.Step ('plan', { detail : 'neck clearance through the board' }); await NextFrame ();
            plan = this.Plan (c, options);
            record.Step ('plan', { detail : (plan.standard ? plan.standard.name + ' universal' : 'custom fit') + ' · ' + plan.tabs + ' tabs per can', fraction : 1 });
        } catch (error) { record.Fail (error.message); editor.busy = false; editor.RefreshButtons?.(); throw error; }
        const owner = editor.website.auth?.user?.id, cans = c.cans.map (can => can.object), primary = cans.includes (editor.selected) ? editor.selected : cans[0];
        const unchanged = () => { if (editor.document !== target || editor.website.auth?.user?.id !== owner || editor.website.accountReady === false || editor.readOnly || cans.some (can => !target.objects.includes (can))) { throw new Error ('The session changed while adding the collar.'); } };
        // The collar joins the cans' group (or a new one), so it moves and selects with them.
        const shared = cans.every (can => can.userData?._auto3dGroup && can.userData._auto3dGroup === cans[0].userData._auto3dGroup);
        const group = shared ? { _auto3dGroup : cans[0].userData._auto3dGroup, _auto3dGroupName : cans[0].userData._auto3dGroupName || 'Can pack', _auto3dGroupKind : cans[0].userData._auto3dGroupKind || 'group' } : { _auto3dGroup : crypto.randomUUID (), _auto3dGroupName : cans.length + '-can pack', _auto3dGroupKind : 'group' };
        const before = new Map (cans.map (can => [can, { ...(can.userData || {}) }]));
        const material = { name : options.board.name, caliperMm : options.board.caliperMm };
        const index = target.objects.length; let collar = null, dropIn = { animated : false };
        try {
            record.Step ('board', { detail : plan.points + ' dieline points · ' + c.cans.length + ' tabbed holes' }); await NextFrame ();
            const module = await LoadPackagingModule (); unchanged ();
            // Keep a small axial gap below the rim; the full board slab and tab chords clear each neck.
            const min = [plan.worldMinMm[0], plan.topMm - plan.thicknessMm, plan.worldMinMm[1]];
            collar = AddBoardPiece (module, target, plan.profile, material, { upright : false, runsAlongX : true, min }, c.factor, plan.profile.name, 'Accessory · can collar');
            collar.userData = { ...group, [AccessoryKey] : JSON.stringify ({ version : 1, kind : 'collar', canIds : cans.map (can => can.id), design : plan.standard?.id || 'custom', tabFoldDeg : plan.fold?.angleDeg ?? 0, boardId : options.board.id, boardName : options.board.name, thicknessMm : plan.thicknessMm, rimRadiusMm : plan.rimRadiusMm, holeRadiusMm : plan.holeRadiusMm, reliefRadiusMm : plan.reliefRadiusMm, tuckMm : plan.tuckMm, tabs : plan.tabs }) };
            cans.forEach (can => { can.userData = { ...can.userData, ...group }; });
            unchanged (); record.Step ('scene', { detail : 'rendering the collar with the cans' }); await NextFrame ();
            // Hidden through the rebuild, then lowered onto the cans like the other accessories.
            editor.motionOverride = () => { if (collar.threeObject) { collar.threeObject.visible = false; } };
            try { editor.selected = primary; await editor.Render?.(); editor.busy = true; unchanged (); record.Step ('drop', { detail : 'tabs tuck under the rims' }); dropIn = await DropIn (editor, [collar], c.factor, { data : AccessoryData, easing : editor.website.preferences?.motionEasing || 'smooth', onProgress : fraction => record.Step ('drop', { detail : 'tabs tuck under the rims', fraction }) }); }
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
            record.Fail (error.message);
            if (collar) { target.Remove (collar); } before.forEach ((data, can) => { can.userData = { ...data }; });
            if (editor.document === target) { editor.selected = primary; try { await editor.Render?.(); } catch { /* Keep the original failure. */ } }
            throw error;
        } finally { editor.busy = false; editor.RefreshButtons?.(); editor.website.packagingPanel?.Refresh?.(); }
        const { profile, ...summary } = plan;
        const message = 'Added a ' + cans.length + '-can collar (' + Number (plan.sizeMm.length.toFixed (1)) + ' × ' + Number (plan.sizeMm.width.toFixed (1)) + ' mm, ' + options.board.name + ') with ' + plan.tabs + ' tabs per can' + (plan.fold ? ': the tabs fold up ' + plan.fold.angleDeg + '° along the crease ring (Ø ' + Number ((2 * plan.reliefRadiusMm).toFixed (1)) + ' mm) and hook ' + plan.fold.lockMm.toFixed (1) + ' mm under each rim, locking the cans. Undo removes it.' : ' and ' + Number (plan.tuckMm.toFixed (3)) + ' mm tuck below the rims. Flat fit clears the necks; tab bending during application is not simulated. Undo removes it.');
        record.Done (message); void popup;
        return { objectId : collar.id, canIds : cans.map (can => can.id), units : 'mm', board : options.board.name, collar : { ...summary, profile : profile.name }, dropIn, progress : record.Inspect (), message };
    }
}
