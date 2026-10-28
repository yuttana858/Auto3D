import { AccountBoardDatabase } from './boarddatabase.js';
import { ValidateBoardAppearance } from '../../modules/packaging/src/appearancesettings.js';
import { FoldPresentation, BaseFoldPose } from './foldpresentation.js';
import { WorkspaceDialog } from './modellibrary.js';
import { BoardCalipers, NewPackagingDesign, ValidatePackaging, PackagingBounds, ExportPackagingSVG, ExportPackagingDXF } from './packagingcore.js';
import { Unit } from '../engine/model/unit.js';
import { DisplayUnitLabel } from './preferences.js';
import { DefaultFefco, ValidateFefco, FefcoProfile, FefcoPreset, FefcoAnimationPlan } from '../../modules/packaging/src/fefco.js';
import { EngineeringAxes, DefaultEngineering, EngineeringMeasurements, EditEngineering, ScoreForTarget, DrivePathDimension } from '../../modules/packaging/src/engineering.js';
import { FefcoDimensions, ResolveFefcoDimensions } from '../../modules/packaging/src/dimensions.js';
import { Box3, Sphere } from 'three';
import { LoadPackagingModule, PackagingModel, FefcoSurfaces, ApplyFefcoFoldPose, BoardAppearanceMaterialChanges, PreparePackagingPresentations, ApplyPackagingPresentation } from './packagingadapter.js';
import { FoldMotionProgress, FoldCameraFrame, CameraBottomInset } from './foldcamera.js';
import { ApplyCameraState } from './sessiontimeline.js';


function Element (tag, parent, text, className)
{
    const node = document.createElement (tag); if (text !== undefined) { node.textContent = text; } if (className) { node.className = className; } parent?.appendChild (node); return node;
}
export class PackagingWorkspace
{
    constructor (editor) { this.editor = editor; this.presentation = new FoldPresentation (editor); this.dialog = null; this.refreshing = false; this.draft = []; this.active = null; this.selectedPaths = new Set (); this.cadTool = 'select'; this.creaseProcess = { kind : 'crease' }; this.linkedObjectId = null; this.draftType = 'cut'; this.gridSnapMM = 5; this.displayFactor = 1; this.view = { x : -20, y : -220, width : 340, height : 240 }; }
    Design () { return this.editor.document.packaging || NewPackagingDesign (); }
    PanelHost () { return { boards : () => this.BoardInspect (), generationBoard : () => this.generationBoard?.id || null, generationBasis : () => this.generationBasis || 'inside', setGenerationBasis : basis => this.SetGenerationBasis (basis), convertGenerationBasis : changes => this.ConvertGenerationBasis (changes), selectBoard : (id, target) => this.SelectBoard (id, target), boardEditor : () => this.OpenBoardDatabase (), appearance : () => this.AppearanceInspect (), updateAppearance : changes => this.UpdateAppearance (changes), dimensions : () => this.DimensionsInspect (), dimensionMode : basis => this.DimensionMode (basis), updateDimensions : changes => this.UpdateDimensions (changes), dimensionsBlocked : () => this.editor.readOnly || !this.editor.website.auth?.user || this.editor.website.accountReady === false || this.editor.busy && !this.dimensionUpdating, inspect : () => this.FefcoInspect (), configure : changes => this.ConfigureFefco (changes), generate : changes => this.GenerateFefco (changes), preset : (code, changes) => this.GeneratePreset (code, changes), designer : () => this.OpenSelected (), measurements : () => { this.OpenSelected (); return this.OpenMeasurements (); }, unfold : () => this.UnfoldSelected (), scrub : (progress, commit) => this.SetFoldScrub (progress, commit), scrubInspect : () => this.FoldScrubInspect (), animate : () => this.AnimateFold (), toggleFold : () => this.ToggleFold (), playbackBlocked : () => this.editor.readOnly || !this.editor.website.auth?.user || this.editor.website.accountReady === false, animation : () => this.AnimationInspect (), playback : () => this.FoldInspect (), control : action => this.FoldControl (action), canAnimate : () => Boolean (this.editor.selected?.userData?._auto3dFefco), factor : () => this.Factor (), run : action => this.editor.Run (action), blocked : () => this.editor.busy || this.editor.readOnly || !this.editor.website.auth?.user || this.editor.website.accountReady === false, canUnfold : () => this.CanUnfold () }; }
    AppearanceInspect ()
    {
        const object = this.editor.selected; const profile = object?.packagingProfile;
        return { available : Boolean (profile), objectId : profile ? object.id : null, settings : ValidateBoardAppearance (profile?.appearance), visualOnly : true };
    }
    async UpdateAppearance (changes)
    {
        this.Editable (); const editor = this.editor, target = editor.document, object = editor.selected, owner = editor.website.auth.user.id;
        if (!object?.packagingProfile) { throw new Error ('Select a packaging model to adjust its board surface.'); }
        ValidateBoardAppearance (changes); if (!Object.keys (changes).length) { return this.AppearanceInspect (); }
        const before = object.packagingProfile, next = ValidatePackaging ({ ...before, appearance : ValidateBoardAppearance ({ ...ValidateBoardAppearance (before.appearance), ...changes }) }), beforeDesign = target.packaging;
        if (JSON.stringify (ValidateBoardAppearance (before.appearance)) === JSON.stringify (next.appearance)) { return this.AppearanceInspect (); }
        const inPlace = Boolean (object.threeObject) && changes.paperGrain === undefined;
        const check = () => { if (editor.document !== target || !target.objects.includes (object) || editor.website.auth.user?.id !== owner || editor.website.accountReady === false || editor.readOnly) { throw new Error ('The selected packaging or account changed.'); } };
        let materials = [], module;
        const refreshDisplay = async () => {
            if (!inPlace) { await editor.Render (); return; }
            await PreparePackagingPresentations ([object], target.model.materials, target.model.GetUnit ()); check ();
            const record = this.presentation.records.get (object.id);
            if (record?.root === object.threeObject) {
                // Appearance never changes the rigid panels: reuse the audited
                // pose and refresh only this preview's display buffers.
                record.rig = module.CreateFefcoFoldRig (JSON.parse (object.userData._auto3dFefco), object.packagingProfile);
                ApplyPackagingPresentation (record.preview, record.rig, record.unit, target.model.materials, true);
                if (record.pose !== undefined) { this.presentation.SetPose (record, record.pose); }
            }
            editor.UpdateSelectionBox?.(); editor.website.sceneEffects?.Refresh (); editor.website.viewer.RequestRender (); editor.website.materialPanel?.Update ();
        };
        const apply = async forward => { object.packagingProfile = forward ? next : before; target.packaging = forward ? next : beforeDesign; materials.forEach (entry => Object.assign (entry.material, forward ? entry.after : entry.before)); await refreshDisplay (); this.Refresh (); };
        editor.busy = true; editor.RefreshButtons?.();
        try {
            editor.Status?.('Updating board surface…'); await new Promise (resolve => setTimeout (resolve, 0));
            module = await LoadPackagingModule (); check (); if (object.packagingProfile !== before) { throw new Error ('The board surface changed while preparing the update.'); }
            // Geometry controls do not require image regeneration or a complete
            // scene conversion. Paper grain retains the existing material path.
            if (!inPlace) { const data = object.userData?._auto3dFefco ? module.CreateFefcoFoldRig (JSON.parse (object.userData._auto3dFefco), next) : module.CreateBoard (next, { textured : true }); materials = BoardAppearanceMaterialChanges (target, object, data.materials); }
            try { await apply (true); check (); }
            catch (error) { object.packagingProfile = before; target.packaging = beforeDesign; materials.forEach (entry => Object.assign (entry.material, entry.before)); if (editor.document === target) { try { await refreshDisplay (); } catch { /* Preserve the original update error. */ } } throw error; }
            const historyApply = async forward => { check (); if (editor.busy) { throw new Error ('Wait for the current update before changing history.'); } editor.busy = true; editor.RefreshButtons?.(); try { await apply (forward); } finally { editor.busy = false; editor.RefreshButtons?.(); this.Refresh (); } };
            editor.history.Push ({ undo : () => historyApply (false), redo : () => historyApply (true) }); editor.MarkDirty?.(); editor.Status?.('Board surface updated.');
            return { available : true, objectId : object.id, settings : ValidateBoardAppearance (next.appearance), visualOnly : true };
        } finally { editor.busy = false; editor.RefreshButtons?.(); this.Refresh (); }
    }
    DimensionsInspect ()
    {
        const object = this.editor.selected; if (!object?.userData?._auto3dFefco) { return null; }
        try { if (object.packagingProfile?.engineering) { const e = EngineeringMeasurements (object.packagingProfile); const dimensions = key => Object.fromEntries (e.dimensions.map (d => [d.id, d[key]])); return { ...FefcoDimensions (JSON.parse (object.userData._auto3dFefco)), inside : dimensions ('insideMm'), outside : dimensions ('outsideMm'), tolerance : new Set (e.state.dimensions.map (dimension => dimension.toleranceMm ?? e.material.scoreToleranceMm)).size === 1 ? (e.state.dimensions[0]?.toleranceMm ?? e.material.scoreToleranceMm) : null, objectId : object.id, name : object.name, code : JSON.parse (object.userData._auto3dFefco).code, basis : this.dimensionBasis || 'inside', editable : object.scale.every (v => Math.abs (v - 1) < 1e-6), materialId : e.material.id, material : e.material }; } const p = ValidateFefco (JSON.parse (object.userData._auto3dFefco)); const tolerance = Number (object.userData._auto3dFitTolerance || 0); return { ...FefcoDimensions (p, tolerance), objectId : object.id, name : object.name, code : p.code, basis : this.dimensionBasis || 'inside', editable : object.scale.every (v => Math.abs (v - 1) < 1e-6) }; } catch { return null; }
    }
    DimensionMode (basis) { if (!['inside', 'outside'].includes (basis)) { throw new Error ('Choose inside or outside dimensions.'); } this.dimensionBasis = basis; this.editor.website.packagingPanel?.fefcoPanel?.RefreshDimensions (); return this.DimensionsInspect (); }
    async UpdateDimensions (changes, objectId = null)
    {
        this.Editable (); const editor = this.editor; const target = editor.document; const source = objectId ? target.objects.find (item => item.id === objectId) : editor.selected;
        if (source?.packagingProfile?.engineering) {
            if (source !== editor.selected || source.scale.some (value => Math.abs (value - 1) > 1e-6) || JSON.stringify (this.Design ()) !== JSON.stringify (source.packagingProfile)) { throw new Error ('Select an unscaled box and load its CAD before editing dimensions.'); }
            if (!changes || Object.keys (changes).some (key => !['basis', 'length', 'width', 'height', 'tolerance'].includes (key)) || !['inside', 'outside', 'score'].includes (changes.basis || this.dimensionBasis || 'inside')) { throw new Error ('Use the board selector for caliper and valid box dimension fields.'); }
            const dimensions = this.EngineeringInspect ().dimensions; const patches = dimensions.filter (dimension => ['length', 'width', 'height'].includes (dimension.id) && (changes[dimension.id] !== undefined || changes.tolerance !== undefined)).map (dimension => ({ id : dimension.id, mode : changes[dimension.id] === undefined ? dimension.mode : dimension.mode === 'parametric' ? 'parametric' : 'manual', ...(changes[dimension.id] !== undefined ? { targetMm : changes[dimension.id], basis : changes.basis || this.dimensionBasis || 'inside' } : {}), ...(changes.tolerance !== undefined ? { toleranceMm : changes.tolerance } : {}) }));
            await this.UpdateEngineering ({ dimensions : patches }); return { objectId : editor.selected.id, dimensions : this.DimensionsInspect (), state : editor.selected.userData._auto3dPackagingState || 'folded' };
        }
        if (!source?.userData?._auto3dFefco || source.scale.some (v => Math.abs (v - 1) > 1e-6)) { throw new Error ('Select an unscaled generated box or its dieline to edit dimensions.'); }
        if (!changes || Object.keys (changes).some (key => !['basis', 'length', 'width', 'height', 'thickness', 'tolerance'].includes (key))) { throw new Error ('Invalid box dimension fields.'); }
        const p = ValidateFefco (JSON.parse (source.userData._auto3dFefco)); const oldTolerance = Number (source.userData._auto3dFitTolerance || 0); const basis = changes.basis || this.dimensionBasis || 'inside'; const beforeDimensions = FefcoDimensions (p, oldTolerance);
        const desired = { ...beforeDimensions[basis] }; for (const key of ['length', 'width', 'height']) { if (changes[key] !== undefined) { desired[key] = changes[key]; } }
        const tolerance = changes.tolerance ?? oldTolerance; const parameters = ResolveFefcoDimensions ({ ...p, thickness : changes.thickness ?? p.thickness }, desired, basis, tolerance);
        const module = await LoadPackagingModule (); this.Editable (); if (editor.document !== target || !target.objects.includes (source)) { throw new Error ('The selected box changed before updating dimensions.'); }
        const flat = source.userData._auto3dPackagingState === 'flat'; const data = flat ? module.UnfoldFefco (parameters) : module.CreateFefcoBox (parameters); const surfaces = FefcoSurfaces (target.CompactModel ([source], true));
        const model = PackagingModel (data, target.model.GetUnit (), surfaces); const index = target.objects.indexOf (source); const previous = editor.selected; const before = target.packaging; let replacement;
        this.dimensionUpdating = true; editor.busy = true; editor.RefreshButtons?.();
        try {
            replacement = target.AddImported (model, source.name); Object.assign (replacement, { id : source.id, source : source.source, position : [...source.position], rotation : [...source.rotation], visible : source.visible, castShadow : source.castShadow !== false, receiveShadow : source.receiveShadow !== false, packagingProfile : data.profile, userData : { ...source.userData, _auto3dFefco : JSON.stringify (parameters), _auto3dFitTolerance : String (tolerance) } });
            target.ApplyTransform (replacement); target.Remove (replacement); target.Remove (source); target.Restore (replacement, index); target.packaging = data.profile; editor.selected = replacement; await editor.Render ();
            const apply = async forward => { target.Remove (forward ? source : replacement); target.Restore (forward ? replacement : source, index); target.packaging = forward ? data.profile : before; editor.selected = forward ? replacement : previous; await editor.Render (); this.Refresh (); editor.website.packagingPanel?.Refresh (); };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); this.dimensionBasis = basis; this.fefco = parameters; editor.Status ('Updated box dimensions · ' + basis + ' · tolerance ±' + tolerance + ' mm'); this.Refresh (); editor.website.packagingPanel?.Refresh ();
            return { objectId : replacement.id, basis, dimensions : FefcoDimensions (parameters, tolerance), state : flat ? 'flat' : 'folded' };
        } catch (error) { if (replacement) { target.Remove (replacement); if (!target.objects.includes (source)) { target.Restore (source, index); } target.packaging = before; editor.selected = previous; await editor.Render (); } throw error; }
        finally { this.dimensionUpdating = false; editor.busy = false; editor.RefreshButtons?.(); }
    }
    FoldScrubInspect ()
    {
        const object = this.editor.selected; if (!object?.userData?._auto3dFefco) { return { available : false, progress : 0 }; }
        const record = this.presentation.records.get (object.id); return { available : true, objectId : object.id, progress : record?.preview.visible ? record.pose : BaseFoldPose (object) };
    }
    async SetFoldScrub (progress, commit = true, objectId = null)
    {
        this.Editable (); if (!Number.isFinite (progress) || progress < 0 || progress > 1 || typeof commit !== 'boolean') { throw new Error ('Use fold progress from 0 to 1.'); }
        const editor = this.editor; const object = objectId ? editor.document.objects.find (item => item.id === objectId) : editor.selected;
        if (!object?.userData?._auto3dFefco) { throw new Error ('Select a generated box.'); }
        const owner = editor.website.auth.user.id; editor.timeline.Stop ();
        const first = !this.scrubEdit || this.scrubEdit.object !== object; if (first) { this.scrubEdit = { object, before : object.userData._auto3dFoldPreview }; }
        this.presentation.manual.set (object.id, progress); await this.presentation.Prepare (object);
        if (editor.website.auth.user?.id !== owner || editor.website.accountReady === false || editor.readOnly || !editor.document.objects.includes (object)) { throw new Error ('The account or model changed while scrubbing.'); }
        if (first && editor.timeline.foldAutoFit !== false && !editor.timeline.cameraKeyframes.length) { const record = this.presentation.records.get (object.id); record.root.updateMatrixWorld (true); const sphere = record.sweep.clone ().applyMatrix4 (record.root.matrixWorld).getBoundingSphere (new Sphere ()); editor.website.viewer.FitSphereToWindow (sphere, true); }
        this.presentation.Apply (editor.timeline.time, false); editor.UpdateSelectionBox (); editor.website.viewer.RequestRender (); editor.website.packagingPanel?.fefcoPanel?.RefreshPlayback ();
        if (commit) {
            const before = this.scrubEdit.before; const after = String (progress); const apply = value => { if (value === undefined) { delete object.userData._auto3dFoldPreview; } else { object.userData._auto3dFoldPreview = value; } this.presentation.manual.delete (object.id); this.presentation.Apply (editor.timeline.time, false); editor.UpdateSelectionBox (); editor.website.viewer.Render (); editor.website.packagingPanel?.fefcoPanel?.RefreshPlayback (); };
            object.userData._auto3dFoldPreview = after; this.presentation.manual.delete (object.id); this.scrubEdit = null;
            if (before !== after) { editor.history.Push ({ undo : () => apply (before), redo : () => apply (after) }); } editor.MarkDirty ();
        }
        return { available : true, objectId : object.id, progress : this.presentation.records.get (object.id)?.pose ?? progress };
    }
    OpenTimelineAction ()
    {
        this.Editable (); if (!this.editor.selected?.userData?._auto3dFefco) { throw new Error ('Select a box before adding a fold action.'); }
        const dialog = WorkspaceDialog ('Add timeline action'); const label = Element ('label', null, 'Action', dialog); const action = Element ('select', null, undefined, label); action.setAttribute ('aria-label', 'Timeline action');
        for (const [value, text] of [['toggle', 'Fold / unfold selected box'], ['fold', 'Fold selected box'], ['unfold', 'Unfold selected box']]) { action.add (new Option (text, value)); }
        const durationLabel = Element ('label', null, 'Duration (seconds)', dialog); const duration = Element ('input', null, undefined, durationLabel); duration.type = 'number'; duration.min = '1'; duration.max = '30'; duration.value = '6'; duration.setAttribute ('aria-label', 'Action duration');
        const status = Element ('p', 'section_hint', 'Add at playhead ' + this.editor.timeline.time.toFixed (2) + ' s.', dialog); const add = Element ('button', null, 'Add action keyframe', dialog); add.type = 'button';
        const target = this.editor.selected; add.onclick = async () => { add.disabled = true; try { await this.editor.timeline.AddAction ({ objectId : target.id, direction : action.value, duration : Number (duration.value) }); dialog.close (); } catch (error) { status.textContent = error.message; add.disabled = false; } }; return { opened : true };
    }
    FoldInspect ()
    {
        if (!this.foldOperation) { return this.lastFold || { state : 'idle', progress : 0 }; }
        const operation = this.foldOperation; const playback = operation.player?.Inspect () || { state : 'preparing', progress : 0 };
        const state = { completed : 'finishing', cancelled : 'cancelling', failed : 'restoring' }[playback.state] || playback.state;
        return { ...playback, state, stage : operation.stage, action : operation.action, objectId : operation.source.id, clearance : operation.clearance || null, cameraAutoFit : operation.cameraAutoFit ?? false, boundingBoxVisible : !!this.editor.selectionBox?.visible };
    }
    async ToggleFold ()
    {
        const state = this.FoldInspect ().state;
        if (state === 'playing') { return this.FoldControl ('pause'); }
        if (state === 'paused') { return this.FoldControl ('resume'); }
        return this.AnimateFold ();
    }
    FoldControl (action)
    {
        const operation = this.foldOperation;
        if (!this.editor.website.auth?.user || this.editor.readOnly || this.editor.website.accountReady === false) { throw new Error ('Sign in to an editable workspace.'); }
        if (!operation?.player || !['pause', 'resume', 'cancel'].includes (action)) { throw new Error ('Start a folding animation first; use pause, resume or cancel.'); }
        if (action === 'pause') { operation.player.Pause (); } else if (action === 'resume') { operation.player.Resume (); } else { operation.player.Stop (); }
        this.editor.website.packagingPanel?.fefcoPanel?.RefreshPlayback (); return this.FoldInspect ();
    }
    AnimationInspect () { try { const source = this.editor.selected; return source?.userData?._auto3dFefco ? FefcoAnimationPlan (JSON.parse (source.userData._auto3dFefco), source.userData._auto3dPackagingState || 'folded') : null; } catch { return null; } }
    async CheckFolds (objectId = null)
    {
        const editor = this.editor; const target = editor.document; const account = editor.website.auth?.user?.id; const source = objectId ? target.objects.find (item => item.id === objectId) : editor.selected;
        if (!account || editor.website.accountReady === false || !source?.userData?._auto3dFefco) { throw new Error ('Select a generated FEFCO box or dieline in your workspace.'); }
        if (source.scale.some (v => Math.abs (v - 1) > 1e-6)) { throw new Error ('Reset object scaling before checking the saved dieline.'); }
        const serialized = source.userData._auto3dFefco; const parameters = ValidateFefco (JSON.parse (serialized)); const profile = ValidatePackaging (source.packagingProfile || FefcoProfile (parameters)); const profileBefore = JSON.stringify (profile); const module = await LoadPackagingModule ();
        const unchanged = () => { if (editor.document !== target || !target.objects.includes (source) || source.userData._auto3dFefco !== serialized || JSON.stringify (source.packagingProfile || FefcoProfile (parameters)) !== profileBefore || source.scale.some (v => Math.abs (v - 1) > 1e-6) || editor.website.auth?.user?.id !== account || editor.website.accountReady === false) { throw new Error ('The workspace or account changed while checking folding.'); } };
        unchanged (); const rig = module.CreateFefcoFoldRig (parameters, profile); const report = await module.InspectFefcoFold (rig, async progress => { unchanged (); editor.Status ('Checking folding surfaces · ' + Math.round (progress * 100) + '%'); await new Promise (resolve => setTimeout (resolve, 0)); }); unchanged ();
        editor.Status (report.clear ? 'FEFCO ' + parameters.code + ' · full fold/unfold route checked · no board intersections' : 'Fold blocked · ' + report.intersections[0].panels.join (' / '));
        return { ...report, objectId : source.id };
    }
    async AnimateFold (objectId = null, duration = 6)
    {
        this.Editable (); if (!Number.isFinite (duration) || duration < 1 || duration > 30) { throw new Error ('Animation duration must be 1–30 seconds.'); }
        const editor = this.editor; const target = editor.document; const source = objectId ? target.objects.find (item => item.id === objectId) : editor.selected;
        if (!source?.userData?._auto3dFefco || !source.visible) { throw new Error ('Select a visible generated FEFCO box or its flat dieline.'); }
        if (source.scale.some (v => Math.abs (v - 1) > 1e-6)) { throw new Error ('Reset object scaling before animating the saved dieline.'); }
        const parameters = ValidateFefco (JSON.parse (source.userData._auto3dFefco)); const profile = ValidatePackaging (source.packagingProfile || FefcoProfile (parameters));
        const module = await LoadPackagingModule (); this.Editable (); const accountId = editor.website.auth.user.id;
        if (editor.document !== target || !target.objects.includes (source)) { throw new Error ('The workspace changed before folding.'); }
        const manualPose = source.userData._auto3dFoldPreview === undefined ? null : BaseFoldPose (source); const plan = FefcoAnimationPlan (parameters, manualPose === 0 ? 'flat' : source.userData._auto3dPackagingState || 'folded'); if (manualPose !== null) { plan.from = manualPose; } const rig = module.CreateFefcoFoldRig (parameters, profile);
        // Audit while the original is still in the scene. Keep saving/editing
        // blocked during this preparation, and recheck account/scene on yields.
        let clearance; this.foldOperation = { source, action : plan.action, stage : 'checking surfaces' }; editor.UpdateSelectionBox?.(); editor.website.viewer?.Render (); editor.busy = true; editor.RefreshButtons?.();
        try { clearance = await module.InspectFefcoFold (rig, async progress => { if (editor.document !== target || !target.objects.includes (source) || editor.website.auth?.user?.id !== accountId || editor.website.accountReady === false || editor.readOnly) { throw new Error ('The workspace or account changed while checking folding.'); } editor.Status ('Processing · checking fold surfaces · ' + Math.round (progress * 100) + '%'); editor.website.packagingPanel?.fefcoPanel?.RefreshPlayback (); await new Promise (resolve => setTimeout (resolve, 0)); }); }
        finally { this.foldOperation = null; editor.busy = false; editor.RefreshButtons?.(); }
        this.Editable (); if (!clearance.clear) { throw new Error ('Fold blocked: ' + clearance.intersections[0].panels.join (' / ') + ' intersect.'); }
        const surfaces = FefcoSurfaces (target.CompactModel ([source], true)); const unit = target.model.GetUnit ();
        const before = target.packaging; const previous = editor.selected; const index = target.objects.indexOf (source); const account = editor.website.auth.user.id; const cameraBefore = editor.website.viewer?.GetCamera?.().Clone (); let preview; let final;
        editor.website.viewer?.navigation?.StopCameraMovement ();
        const restore = async () => { if (preview) { target.Remove (preview); } if (final) { target.Remove (final); } if (!target.objects.includes (source)) { target.Restore (source, index); } target.packaging = before; if (editor.document === target) { editor.selected = previous; await editor.Render (); if (cameraBefore) { editor.website.viewer.SetCamera (cameraBefore.Clone ()); } } };
        const assign = (object, state, data = parameters) => { object.id = source.id; object.keyframes = (source.keyframes || []).map (frame => ({ ...frame, position : [...frame.position], rotation : [...frame.rotation], scale : [...frame.scale] })); object.packagingProfile = profile; object.userData = { ...source.userData, _auto3dFefco : JSON.stringify (data), _auto3dPackagingState : state }; delete object.userData._auto3dFoldPreview; object.position = [...source.position]; object.rotation = [...source.rotation]; object.visible = source.visible; object.castShadow = source.castShadow !== false; object.receiveShadow = source.receiveShadow !== false; target.ApplyTransform (object); };
        const autoFit = editor.timeline?.foldAutoFit !== false && !editor.timeline?.cameraKeyframes?.length;
        const operation = { source, action : plan.action, stage : plan.stages[0], clearance, cameraAutoFit : autoFit }; this.foldOperation = operation;
        const canvas = editor.website.viewer?.renderer?.domElement;
        const manualCamera = () => { operation.cameraAutoFit = false; operation.cameraManual = true; };
        const removeCameraListeners = () => { for (const event of ['pointerdown', 'wheel', 'touchstart']) { canvas?.removeEventListener (event, manualCamera); } };
        try {
            preview = target.AddImported (PackagingModel (rig, unit, surfaces), source.name + ' · Folding'); assign (preview, 'flat'); target.packaging = profile; this.Refresh (); target.Remove (preview); target.Remove (source); target.Restore (preview, index); editor.selected = preview;
            editor.busy = true; editor.RefreshButtons?.(); await editor.Render (false, () => { if (preview.threeObject) { ApplyFefcoFoldPose (preview.threeObject, rig, module.FefcoFoldPose (rig, plan.from), unit); } }); editor.busy = true; editor.RefreshButtons?.();
            let sweepRadius = 0;
            if (preview.threeObject) {
                // Fit the whole sequence so the long CAD blank remains visible while unfolding.
                for (let sample = 0; sample <= 20; sample++) { ApplyFefcoFoldPose (preview.threeObject, rig, module.FefcoFoldPose (rig, sample / 20), unit); sweepRadius = Math.max (sweepRadius, new Box3 ().setFromObject (preview.threeObject).getBoundingSphere (new Sphere ()).radius); }
                ApplyFefcoFoldPose (preview.threeObject, rig, module.FefcoFoldPose (rig, plan.from), unit);
            }
            for (const event of ['pointerdown', 'wheel', 'touchstart']) { canvas?.addEventListener (event, manualCamera, { passive : true }); }
            editor.selectionBox && (editor.selectionBox.visible = false);
            operation.player = new module.FoldPlayback (progress => {
                if (editor.document !== target || editor.website.auth.user?.id !== account || editor.website.accountReady === false || editor.readOnly) { throw new Error ('The workspace or account changed during folding.'); }
                const motion = FoldMotionProgress (progress, autoFit); const pose = module.FefcoFoldPose (rig, plan.from + (plan.to - plan.from) * motion); operation.stage = plan.action === 'unfold' ? ({ 'closing top' : 'opening top', 'closing base' : 'opening base', 'erecting walls' : 'unwrapping walls' }[pose.stage] || pose.stage) : pose.stage;
                if (preview.threeObject) {
                    ApplyFefcoFoldPose (preview.threeObject, rig, pose, unit);
                    if (operation.cameraAutoFit && cameraBefore) { const viewer = editor.website.viewer; const sphere = new Box3 ().setFromObject (preview.threeObject).getBoundingSphere (new Sphere ()); const size = viewer.GetImageSize (); viewer.SetCamera (FoldCameraFrame (cameraBefore, sphere, sweepRadius, progress, size.width / size.height, CameraBottomInset (viewer, editor.status))); }
                    else if (!operation.cameraManual && editor.timeline?.cameraKeyframes?.length) { const timeline = editor.timeline; ApplyCameraState (editor.website.viewer, timeline.CameraStateAt (timeline.rangeStart + progress * (timeline.rangeEnd - timeline.rangeStart))); }
                    else { editor.website.viewer.Render (); }
                } else { editor.website.viewer?.Render (); } editor.Status ('Folding · ' + operation.stage + ' · ' + Math.round (progress * 100) + '%'); editor.website.packagingPanel?.fefcoPanel?.RefreshPlayback ();
            }, duration);
            // Playback controls remain accessible while ordinary editing/saving is blocked.
            operation.completion = operation.player.Start ().then (async result => {
                if (!result.completed) { await restore (); this.lastFold = { state : 'cancelled', progress : 0, objectId : source.id }; editor.Status ('Folding cancelled · original object restored'); return; }
                const next = { ...parameters, closure : plan.targetClosure }; const data = plan.targetState === 'flat' ? module.UnfoldFefco (next, profile) : module.CreateFefcoBox (next, profile); final = target.AddImported (PackagingModel (data, unit, surfaces), source.name.replace (/ · (Dieline|Folded|Open|Closed)$/, '') + (plan.targetState === 'flat' ? ' · Dieline' : plan.targetClosure === 'open' ? ' · Open' : ' · Closed')); assign (final, plan.targetState, data.parameters); final.source = 'FEFCO ' + parameters.code + ' ' + plan.targetState;
                target.Remove (final); target.Remove (preview); target.Restore (final, index); target.packaging = profile; editor.selected = final; await editor.Render ();
                const apply = async forward => { target.Remove (forward ? source : final); target.Restore (forward ? final : source, index); target.packaging = forward ? profile : before; editor.selected = forward ? final : previous; await editor.Render (true); this.Refresh (); editor.website.packagingPanel?.Refresh (); };
                editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); this.lastFold = { state : 'completed', progress : 1, stage : plan.stages.at (-1), action : plan.action, objectId : final.id }; editor.Status ('Folding complete · ' + plan.stages.at (-1) + ' · Undo available');
            }).catch (async error => { try { await restore (); } catch { /* Retain the playback error. */ } this.lastFold = { state : 'failed', progress : 0, error : error.message }; editor.website.errorLogs?.Record ('error', 'packaging-fold', error.message); editor.Status (error.message); }).finally (() => { removeCameraListeners (); this.foldOperation = null; editor.UpdateSelectionBox?.(); editor.busy = false; editor.RefreshButtons?.(); this.Refresh (); editor.website.packagingPanel?.Refresh (); });
            editor.website.packagingPanel?.fefcoPanel?.RefreshPlayback (); return { started : true, objectId : source.id, duration, action : plan.action, stages : plan.stages, clearance };
        } catch (error) { removeCameraListeners (); try { await restore (); } finally { this.foldOperation = null; editor.busy = false; editor.RefreshButtons?.(); } throw error; }
    }
    SetFoldCameraAutoFit (autoFit)
    {
        this.Editable (); if (typeof autoFit !== 'boolean') { throw new Error ('Auto-fit must be a boolean.'); }
        const editor = this.editor; const before = editor.timeline.foldAutoFit !== false;
        const apply = value => { editor.timeline.foldAutoFit = value; editor.MarkDirty?.(); editor.AnimationUI?.(); };
        if (before !== autoFit) { apply (autoFit); editor.history.Push ({ undo : () => apply (before), redo : () => apply (autoFit) }); }
        return { autoFit, cameraKeyframesOverride : !!editor.timeline.cameraKeyframes?.length };
    }
    CanUnfold () { return Boolean (this.editor.selected?.userData?._auto3dFefco) && this.editor.selected.userData._auto3dPackagingState !== 'flat'; }
    async UnfoldSelected (objectId = null)
    {
        this.Editable (); const editor = this.editor; const target = editor.document;
        const source = objectId ? target.objects.find (item => item.id === objectId) : editor.selected;
        if (!source?.userData?._auto3dFefco || source.userData._auto3dPackagingState === 'flat') { throw new Error ('Select a generated folded FEFCO box to unfold.'); }
        if (source.scale.some (value => Math.abs (value - 1) > 1e-6)) { throw new Error ('Unfold uses the saved design dimensions. Undo object scaling or generate a box with the desired dimensions first.'); }
        const parameters = ValidateFefco (JSON.parse (source.userData._auto3dFefco));
        const profile = ValidatePackaging (source.packagingProfile || FefcoProfile (parameters)); const before = target.packaging; const previous = editor.selected;
        const module = await LoadPackagingModule (); this.Editable ();
        if (editor.document !== target || !target.objects.includes (source)) { throw new Error ('The selected box changed before unfolding.'); }
        const surfaces = FefcoSurfaces (target.CompactModel ([source], true)); const data = module.UnfoldFefco (parameters, profile); const model = PackagingModel (data, target.model.GetUnit (), surfaces);
        const index = target.objects.indexOf (source); let flat;
        editor.busy = true; editor.RefreshButtons?.(); editor.Status ('Unfolding FEFCO ' + parameters.code + '…');
        try {
            await new Promise (resolve => setTimeout (resolve, 20));
            flat = target.AddImported (model, source.name + ' · Dieline'); flat.source = 'FEFCO ' + parameters.code + ' flat dieline'; flat.packagingProfile = profile;
            flat.userData = { ...source.userData, _auto3dPackagingState : 'flat' }; flat.visible = source.visible; flat.position = [...source.position]; flat.castShadow = source.castShadow !== false; flat.receiveShadow = source.receiveShadow !== false;
            target.ApplyTransform (flat); target.Remove (flat); target.Remove (source); target.Restore (flat, index); target.packaging = profile; editor.selected = flat;
            await editor.Render (true);
            const apply = async forward => { target.Remove (forward ? source : flat); target.Restore (forward ? flat : source, index); target.packaging = forward ? profile : before; editor.selected = forward ? flat : previous; await editor.Render (); this.Refresh (); editor.website.packagingPanel?.Refresh (); };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) });
            this.Refresh (); editor.Status ('Unfolded FEFCO ' + parameters.code + ' · kraft dieline · CUT red / SCORE blue');
            return { objectId : flat.id, replacedObjectId : source.id, code : parameters.code, state : 'flat', units : 'mm', thicknessMM : profile.thickness, profilePaths : profile.paths.length, materialPreserved : true };
        } catch (error) {
            if (flat) { target.Remove (flat); if (!target.objects.includes (source)) { target.Restore (source, index); } target.packaging = before; editor.selected = previous; await editor.Render (); } throw error;
        } finally { editor.busy = false; editor.RefreshButtons?.(); editor.website.packagingPanel?.Refresh (); }
    }
    FefcoInspect () { return { ...ValidateFefco (this.fefco || DefaultFefco), ...(this.generationBoard ? { thickness : this.generationBoard.caliperMm } : {}), units : 'mm', dimensions : this.generationBoard ? 'score' : 'internal', axes : 'W=X, L=Z, H=Y' }; }
    SetGenerationBasis (basis) { this.Editable (); if (!['inside', 'outside', 'score'].includes (basis)) { throw new Error ('Choose inside, outside or score dimensions.'); } this.generationBasis = basis; this.editor.website.packagingPanel?.fefcoPanel?.Refresh (); return { basis }; }
    async BoardStore (reload = false)
    {
        const module = await LoadPackagingModule (); if (!this.boardDatabase) { this.boardDatabase = new AccountBoardDatabase (this.editor.website, module); }
        await this.boardDatabase.Load (reload); const record = this.boardDatabase.records.find (item => item.id === this.generationBoard?.id) || this.boardDatabase.records.find (item => item.caliperMm === (this.generationBoard?.caliperMm || this.fefco?.thickness || DefaultFefco.thickness)); this.generationBoard = record ? structuredClone (record) : null; return this.boardDatabase;
    }
    BoardInspect () { return this.boardDatabase?.Inspect () || { scope : 'account', revision : null, records : [] }; }
    async SelectBoard (id, target = 'generation')
    {
        this.Editable (); if (!['generation', 'selected'].includes (target)) { throw new Error ('Choose generation or selected board.'); } const store = await this.BoardStore (); this.Editable (); const record = store.records.find (item => item.id === id); if (!record) { throw new Error ('Choose an existing board record.'); }
        if (target === 'generation') { this.generationBoard = structuredClone (record); this.Refresh (); return { target, boardId : id, caliperMm : record.caliperMm }; }
        if (!this.editor.selected?.packagingProfile) { throw new Error ('Select a packaging model first.'); }
        if (JSON.stringify (this.Design ()) !== JSON.stringify (this.editor.selected.packagingProfile)) { throw new Error ('Apply or load the selected CAD profile before changing its board.'); }
        const inspection = this.EngineeringInspect (), base = inspection.material, basis = this.dimensionBasis || 'inside';
        // Preserve the currently displayed box dimensions while recalculating
        // the canonical score spans with the new caliper and allowances.
        const dimensions = inspection.dimensions.filter (d => EngineeringAxes.includes (d.id)).map (d => ({ id : d.id, mode : d.mode === 'parametric' ? 'parametric' : 'manual', basis, targetMm : basis === 'inside' ? d.insideMm : d.outsideMm }));
        const sameBoard = Object.keys (record).every (key => key === 'calibrated' || base[key] === record[key]);
        const result = await this.UpdateEngineering ({ boardRecord : { ...base, ...record, calibrated : sameBoard && base.calibrated }, dimensions }); this.Message ('Board applied · ' + record.name + ' · ' + record.caliperMm + ' mm'); return { target, boardId : id, caliperMm : result.material.caliperMm, objectId : this.editor.selected.id };
    }
    async SaveBoardCSV (csv, revision)
    {
        this.Editable (); const store = await this.BoardStore (); const module = await LoadPackagingModule (); const records = module.ImportBoardCSV (csv); const result = await store.Save (records, revision === undefined ? store.revision : revision); this.Editable ();
        if (this.generationBoard) { this.generationBoard = records.find (record => record.id === this.generationBoard.id) || null; }
        this.Refresh (); return result;
    }
    async OpenBoardDatabase ()
    {
        this.Editable (); const store = await this.BoardStore (true); const module = await LoadPackagingModule (); let revision = store.revision;
        return module.OpenBoardDatabaseEditor ({ records : store.records, save : async records => { const result = await this.SaveBoardCSV (module.ExportBoardCSV (records), revision); revision = result.revision; this.editor.website.packagingPanel?.Refresh (); return result; }, readOnly : this.editor.readOnly });
    }
    async FefcoCatalog () { const module = await LoadPackagingModule (); return module.FefcoCatalog (); }
    ConfigureFefco (changes)
    {
        this.Editable (); this.fefco = ValidateFefco ({ ...(this.fefco || DefaultFefco), ...changes }); if (changes.thickness !== undefined && this.generationBoard?.caliperMm !== changes.thickness) { this.generationBoard = null; } this.editor.website.packagingPanel?.fefcoPanel?.Refresh (); return this.FefcoInspect ();
    }
    GenerationMaterial (input, code)
    {
        const state = DefaultEngineering (FefcoProfile (input), code), selected = this.editor.selected; let prior = null;
        try { if (JSON.parse (selected?.userData?._auto3dFefco || '{}').code === code && selected?.packagingProfile?.engineering) { const existing = EngineeringMeasurements (selected.packagingProfile).material; if ((!this.generationBoard && existing.caliperMm === input.thickness) || existing.id === this.generationBoard?.id) { prior = existing; } } } catch { /* A legacy or unrelated object has no reusable allowances. */ }
        return { ...state.materials[0], ...(prior || {}), ...(this.generationBoard || {}), caliperMm : input.thickness, calibrated : Boolean (prior?.calibrated && prior.caliperMm === input.thickness) };
    }
    ConvertGenerationBasis ({ from, to, length, width, height })
    {
        if (!['inside', 'outside', 'score'].includes (from) || !['inside', 'outside', 'score'].includes (to)) { throw new Error ('Choose valid dimension bases.'); }
        const input = ValidateFefco ({ ...(this.fefco || DefaultFefco), ...(this.generationBoard ? { thickness : this.generationBoard.caliperMm } : {}), length, width, height });
        const material = this.GenerationMaterial (input, input.code), dimensions = {};
        for (const [axis, id] of EngineeringAxes.entries ()) {
            const score = ScoreForTarget ({ axis, basis : from, targetMm : input[id] }, material);
            if (to !== 'score') { ScoreForTarget ({ axis, basis : to, targetMm : 10000 }, material); }
            dimensions[id] = score + (to === 'inside' ? -material.insideFactors[axis] : to === 'outside' ? material.outsideFactors[axis] : 0) * material.caliperMm;
        }
        return { from, to, dimensions, units : 'mm' };
    }
    GeneratePreset (code, changes = {})
    {
        this.Editable (); const { basis, ...fields } = changes;
        const input = FefcoPreset ({ ...(this.fefco || DefaultFefco), ...(this.generationBoard ? { thickness : this.generationBoard.caliperMm } : {}), ...fields }, code);
        if (basis === undefined || basis === 'score') { return this.GenerateFefco (input); }
        if (!['inside', 'outside'].includes (basis)) { throw new Error ('Choose inside, outside or score dimensions.'); }
        const material = this.GenerationMaterial (input, code);
        const parameters = { ...input };
        for (const [axis, id] of EngineeringAxes.entries ()) { parameters[id] = ScoreForTarget ({ axis, basis, targetMm : input[id] }, material); }
        return this.GenerateFefco (ValidateFefco (parameters), { material, basis });
    }
    async GenerateFefco (changes = {}, dimensional = null)
    {
        this.Editable (); const editor = this.editor; if (editor.document.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const data = ValidateFefco ({ ...(this.fefco || DefaultFefco), ...(this.generationBoard ? { thickness : this.generationBoard.caliperMm } : {}), ...changes });
        const target = editor.document; const module = await LoadPackagingModule (); this.Editable ();
        if (editor.document !== target) { throw new Error ('The workspace changed before generating packaging.'); }
        if (target.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const unit = target.objects.length ? target.model.GetUnit () : Unit.Millimeter;
        // Validate geometry and units before changing the scene or profile.
        let profile = FefcoProfile (data);
        if (dimensional || this.generationBoard?.caliperMm === data.thickness) { const engineering = DefaultEngineering (profile, data.code); engineering.materials[0] = dimensional?.material || { ...engineering.materials[0], ...this.generationBoard }; engineering.activeMaterialId = engineering.materials[0].id; if (dimensional) { engineering.dimensions.forEach (d => { d.basis = dimensional.basis; }); } profile.grade = engineering.materials[0].name; profile.engineering = engineering; }
        profile = ValidatePackaging (profile); const model = PackagingModel (module.CreateFefcoBox (data, profile), unit);
        const before = target.packaging; const previous = editor.selected;
        editor.busy = true; editor.RefreshButtons?.(); editor.Status ('Generating FEFCO ' + data.code + '…');
        let object;
        try {
            await new Promise (resolve => setTimeout (resolve, 20));
            object = target.AddImported (model, profile.name); object.source = 'FEFCO ' + data.code; object.packagingProfile = profile; object.userData._auto3dFefco = JSON.stringify (data); target.packaging = profile;
            const index = target.objects.indexOf (object); editor.selected = object;
            await editor.Render (true);
            const apply = async (add) => { if (add) { target.Restore (object, index); target.packaging = profile; editor.selected = object; } else { target.Remove (object); target.packaging = before; editor.selected = previous && target.objects.includes (previous) ? previous : null; } await editor.Render (); this.Refresh (); editor.website.packagingPanel?.Refresh (); };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); this.fefco = data; if (dimensional?.basis) { this.dimensionBasis = dimensional.basis; } if (this.generationBoard?.caliperMm !== data.thickness) { this.generationBoard = null; }
            this.Refresh (); editor.website.packagingPanel?.Refresh (); editor.Status ('Added FEFCO ' + data.code + ' · ' + data.length + ' × ' + data.width + ' × ' + data.height + ' mm');
            return { objectId : object.id, ...data, units : 'mm', sceneUnit : unit, profilePaths : profile.paths.length };
        } catch (error) {
            if (object) { target.Remove (object); target.packaging = before; editor.selected = previous; await editor.Render (); } throw error;
        } finally { editor.busy = false; editor.RefreshButtons?.(); editor.website.packagingPanel?.Refresh (); }
    }
    EngineeringInspect ()
    {
        const profile = ValidatePackaging (this.Design ()); const code = this.EngineeringParameters (profile)?.code || null;
        return EngineeringMeasurements ({ ...profile, engineering : profile.engineering || DefaultEngineering (profile, code) });
    }
    EngineeringParameters (profile)
    {
        try { const p = this.editor.selected?.userData?._auto3dFefco ? ValidateFefco (JSON.parse (this.editor.selected.userData._auto3dFefco)) : ValidateFefco (this.fefco || DefaultFefco);
            const expected = FefcoProfile (p); return JSON.stringify (expected.paths) === JSON.stringify (profile.paths.map (path => { const copy = { ...path }; delete copy.process; return copy; })) && expected.thickness === profile.thickness ? p : null;
        } catch { return null; }
    }
    async UpdateEngineering (changes)
    {
        this.Editable (); const editor = this.editor; const target = editor.document; const account = editor.website.auth.user.id; const before = ValidatePackaging (this.Design ()); const originalParameters = this.EngineeringParameters (before);
        const { engineering, material, driving } = EditEngineering (before, changes, originalParameters?.code);
        let next = { ...before, thickness : material.caliperMm, grade : material.name, engineering }; let parameters = originalParameters;
        if (originalParameters) {
            parameters = { ...originalParameters, thickness : material.caliperMm };
            for (const dimension of driving) { if (EngineeringAxes.includes (dimension.id)) { parameters[dimension.id] = ScoreForTarget (dimension, material); } }
            parameters = ValidateFefco (parameters); next = { ...FefcoProfile (parameters), name : before.name, grade : material.name, engineering, ...(before.appearance ? { appearance : before.appearance } : {}) };
        } else { for (const dimension of driving) { next = DrivePathDimension (next, dimension, material); } }
        if (originalParameters) { for (const path of next.paths) { const old = before.paths.find (item => item.id === path.id); if (old?.process && path.type === 'score') { path.process = { ...old.process }; } } }
        next = ValidatePackaging (next);
        const result = EngineeringMeasurements (next);
        if (result.dimensions.some (d => d.mode === 'parametric' && !d.targetMet)) { throw new Error ('Conflicting parametric dimensions. Adjust their targets or switch one to Auto.'); }
        const source = editor.selected; const matching = source?.packagingProfile && JSON.stringify (ValidatePackaging (source.packagingProfile)) === JSON.stringify (before);
        if (source && matching && source.scale.some (v => Math.abs (v - 1) > 1e-6)) { throw new Error ('Reset object scaling before editing engineering dimensions.'); }
        if (!matching) { this.Change (next); return this.EngineeringInspect (); }
        // Build before mutation; then atomically replace profile and selected object.
        const module = await LoadPackagingModule (); this.Editable ();
        if (editor.document !== target || editor.website.auth.user.id !== account || !target.objects.includes (source) || JSON.stringify (this.Design ()) !== JSON.stringify (before)) { throw new Error ('The workspace or account changed during the engineering edit.'); }
        const flat = source.userData._auto3dPackagingState === 'flat'; const data = !parameters ? module.CreateBoard (next, { textured : true, guides : true }) : flat ? module.UnfoldFefco (parameters, next) : module.CreateFefcoBox (parameters, next); data.profile = next;
        const model = PackagingModel (data, target.model.GetUnit (), FefcoSurfaces (target.CompactModel ([source], true))); const index = target.objects.indexOf (source); let replacement;
        editor.busy = true; editor.RefreshButtons?.();
        try {
            replacement = target.AddImported (model, source.name); Object.assign (replacement, { id : source.id, source : source.source, position : [...source.position], rotation : [...source.rotation], scale : [...source.scale], visible : source.visible, castShadow : source.castShadow !== false, receiveShadow : source.receiveShadow !== false, packagingProfile : next, userData : { ...source.userData, ...(parameters ? { _auto3dFefco : JSON.stringify (parameters) } : {}) } }); target.ApplyTransform (replacement);
            target.Remove (replacement); target.Remove (source); target.Restore (replacement, index); target.packaging = next; editor.selected = replacement; await editor.Render ();
            const apply = async forward => { target.Remove (forward ? source : replacement); target.Restore (forward ? replacement : source, index); target.packaging = forward ? next : before; editor.selected = forward ? replacement : source; this.fefco = forward ? parameters : originalParameters; await editor.Render (); this.Refresh (); };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); this.fefco = parameters; this.Refresh (); return result;
        } catch (error) { if (replacement) { target.Remove (replacement); } if (!target.objects.includes (source)) { target.Restore (source, index); } target.packaging = before; editor.selected = source; await editor.Render (); throw error; }
        finally { editor.busy = false; editor.RefreshButtons?.(); this.Refresh (); }
    }
    Factor () { return this.editor.website.preferences.units === 'standard' ? 25.4 : 1; }
    Editable () { if (this.editor.readOnly || this.editor.busy || !this.editor.website.auth?.user || this.editor.website.accountReady === false) { throw new Error ('Sign in to an editable, idle workspace.'); } }
    Inspect () { return { ...ValidatePackaging (this.Design ()), units : 'mm', displayUnits : DisplayUnitLabel (this.editor.website.preferences.units), selectedPathId : this.active, selectedPathIds : [...this.selectedPaths], tool : this.cadTool, linkedObjectId : this.linkedObjectId, creaseProcess : { ...this.creaseProcess }, draftType : this.draftType, gridSnapMM : this.gridSnapMM, draftPoints : this.draft.map ((point) => [...point]) }; }
    Change (next)
    {
        this.Editable (); const before = this.editor.document.packaging ? ValidatePackaging (this.editor.document.packaging) : null; const after = ValidatePackaging (next); if (after.engineering && EngineeringMeasurements (after).dimensions.some (d => d.mode === 'parametric' && !d.targetMet)) { throw new Error ('This edit conflicts with a parametric measurement. Update its target or switch it to Auto.'); } const target = this.editor.document;
        const apply = (value) => { target.packaging = value ? ValidatePackaging (value) : null; this.Refresh (); };
        apply (after); this.editor.history.Push ({ undo : () => apply (before), redo : () => apply (after) }); return this.Inspect ();
    }
    AddPath (points, type = 'cut', closed = false, units = 'display')
    {
        const factor = units === 'mm' ? 1 : this.Factor (); const design = ValidatePackaging (this.Design ()); const path = { id : crypto.randomUUID (), type, closed, points : points.map ((point) => point.map ((value) => value * factor)) }; if (type === 'score' && this.creaseProcess.kind !== 'crease') { path.process = { ...this.creaseProcess }; } design.paths.push (path); if (design.engineering) { design.engineering.dimensions.push (...DefaultEngineering ({ ...design, paths : [path] }).dimensions); } const result = this.Change (design); this.active = path.id; this.Refresh (); return { pathId : path.id, design : result };
    }
    EditPath (id, changes, units = 'display')
    {
        const design = ValidatePackaging (this.Design ()); const path = design.paths.find ((item) => item.id === id); if (!path) { throw new Error ('Choose an existing path.'); }
        const factor = units === 'mm' ? 1 : this.Factor (); if (changes.points) { path.points = changes.points.map ((point) => point.map ((value) => value * factor)); } if (changes.type !== undefined) { path.type = changes.type; } if (changes.closed !== undefined) { path.closed = changes.closed; } if (changes.process !== undefined) { path.process = changes.process; } if (path.type === 'cut') { delete path.process; } return this.Change (design);
    }
    DeletePath (id) { const design = ValidatePackaging (this.Design ()); if (!design.paths.some ((path) => path.id === id)) { throw new Error ('Choose an existing path.'); } design.paths = design.paths.filter ((path) => path.id !== id); if (design.engineering) { design.engineering.dimensions = design.engineering.dimensions.filter (d => d.pathId !== id); } return this.Change (design); }
    SetBoard (thickness, grade = 'Custom', units = 'display') { const design = ValidatePackaging (this.Design ()); if (design.engineering) { return this.UpdateEngineering ({ material : { caliperMm : thickness * (units === 'mm' ? 1 : this.Factor ()), name : grade } }); } design.thickness = thickness * (units === 'mm' ? 1 : this.Factor ()); design.grade = grade; return this.Change (design); }
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
        this.Editable (); const design = ValidatePackaging (this.Design ()); const editor = this.editor; const target = editor.document; const module = await LoadPackagingModule (); this.Editable ();
        if (editor.document !== target) { throw new Error ('The workspace changed before extruding packaging.'); }
        if (target.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const model = PackagingModel (module.CreateBoard (design), target.objects.length ? target.model.GetUnit () : Unit.Millimeter);
        const object = target.AddImported (model, design.name); object.source = 'Packaging profile'; object.packagingProfile = design; const index = target.objects.indexOf (object);
        const apply = async (add) => { if (add) { editor.document.Restore (object, index); editor.selected = object; } else { editor.document.Remove (object); editor.selected = null; } await editor.Render (); };
        try { editor.selected = object; await editor.Render (true); }
        catch (error) { editor.document.Remove (object); editor.selected = null; await editor.Render (); throw error; }
        editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); editor.Status ('Added board · ' + design.thickness + ' mm · ' + design.grade); return { objectId : object.id, thicknessMM : design.thickness, grade : design.grade };
    }
    LoadSelected ()
    {
        const profile = this.editor.selected?.packagingProfile; if (!profile) { throw new Error ('Select a board created from a packaging profile.'); }
        const saved = this.editor.selected.userData?._auto3dFefco; const fefco = saved ? ValidateFefco (JSON.parse (saved)) : null;
        this.linkedObjectId = this.editor.selected.id; this.selectedPaths.clear (); this.active = null; this.draft = []; const result = this.Change (profile); if (fefco) { this.fefco = fefco; this.Refresh (); } return result;
    }
    OpenSelected ()
    {
        this.Editable (); const object = this.editor.selected;
        if (!object?.packagingProfile) { throw new Error ('Select a generated packaging box or dieline.'); }
        const profile = ValidatePackaging (object.packagingProfile); this.linkedObjectId = object.id;
        if (JSON.stringify (this.Design ()) !== JSON.stringify (profile)) { this.LoadSelected (); }
        const result = this.Open (); this.Fit (); return { ...result, objectId : object.id, profilePaths : profile.paths.length };
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
    SelectPath (id, additive = false)
    {
        if (!this.Design ().paths.some ((path) => path.id === id)) { throw new Error ('Choose an existing path.'); }
        if (!additive) { this.selectedPaths.clear (); } if (additive && this.selectedPaths.has (id)) { this.selectedPaths.delete (id); } else { this.selectedPaths.add (id); }
        this.active = this.selectedPaths.has (id) ? id : [...this.selectedPaths].at (-1) || null; const selected = this.Design ().paths.find (path => path.id === this.active); if (selected?.type === 'score') { this.creaseProcess = { ...(selected.process || { kind : 'crease' }) }; } this.Refresh (); return { selectedPathId : this.active, selectedPathIds : [...this.selectedPaths] };
    }
    SetCADTool (tool)
    {
        this.Editable (); if (!['select', 'pen'].includes (tool)) { throw new Error ('Choose select or pen.'); }
        if (this.draft.length && tool !== this.cadTool) { throw new Error ('Finish or cancel the current path first.'); }
        this.cadTool = tool; this.Refresh (); return { tool };
    }
    OpenCreaseSettings () { const result = this.Open (); this.SetControlLayer ('drawing'); this.creaseSettings.hidden = false; return { ...result, settings : 'crease-perforation' }; }
    SetCreaseProcess (process)
    {
        this.Editable (); const design = ValidatePackaging (this.Design ());
        // Use the same validator as saved profiles, even when configuring a new line.
        const probe = { id : 'process-validation', type : 'score', closed : false, points : [[0, 0], [1, 0]], process };
        const checked = ValidatePackaging ({ version : 1, name : '', grade : '', thickness : 3, paths : [probe] }).paths[0].process;
        const ids = new Set (this.selectedPaths); if (this.active) { ids.add (this.active); }
        const scores = design.paths.filter (path => ids.has (path.id) && path.type === 'score');
        for (const path of scores) { path.process = checked; }
        if (scores.length) { this.Change (design); } this.creaseProcess = checked; this.Refresh (); return { process : checked, updatedPathIds : scores.map (path => path.id) };
    }
    AssignSelected (type)
    {
        this.Editable (); if (!['cut', 'score'].includes (type)) { throw new Error ('Choose cut or crease.'); }
        const design = ValidatePackaging (this.Design ()); const ids = new Set (this.selectedPaths); if (this.active) { ids.add (this.active); }
        if (!ids.size) { throw new Error ('Select one or more paths.'); }
        for (const path of design.paths) { if (ids.has (path.id)) { path.type = type; if (type === 'cut') { delete path.process; } else if (this.creaseProcess.kind !== 'crease') { path.process = { ...this.creaseProcess }; } } }
        return this.Change (design);
    }
    async ApplyCAD (mode = 'auto', objectId = null)
    {
        this.Editable (); if (!['auto', 'flat'].includes (mode)) { throw new Error ('Choose auto or flat.'); }
        if (this.draft.length) { throw new Error ('Finish or cancel the current path before applying.'); }
        const editor = this.editor, target = editor.document, account = editor.website.auth.user.id;
        const source = target.objects.find (object => object.id === (objectId || this.linkedObjectId || editor.selected?.id));
        if (!source?.packagingProfile) { throw new Error ('Open the target box in CAD first.'); }
        if (source.scale.some (v => Math.abs (v - 1) > 1e-6)) { throw new Error ('Reset object scaling before applying CAD.'); }
        const next = ValidatePackaging (this.Design ()); const before = ValidatePackaging (target.packaging); const previousParameters = this.fefco;
        if (next.engineering && EngineeringMeasurements (next).dimensions.some (d => d.mode === 'parametric' && !d.targetMet)) { throw new Error ('Resolve conflicting parametric dimensions before applying.'); }
        let parameters = null;
        try {
            const parsed = ValidateFefco (JSON.parse (source.userData._auto3dFefco)); const expected = FefcoProfile ({ ...parsed, thickness : next.thickness });
            const paths = next.paths.map (path => { const copy = { ...path }; delete copy.process; return copy; });
            if (JSON.stringify (expected.paths) === JSON.stringify (paths)) { parameters = { ...parsed, thickness : next.thickness }; }
        } catch { /* A custom board has no generated fold rig. */ }
        const flat = mode === 'flat' || source.userData._auto3dPackagingState === 'flat' || !source.userData._auto3dFefco;
        if (!flat && !parameters) { throw new Error ('Edited cut/crease geometry needs a new fold rig. Choose “Flat board” to apply exact CAD, or Undo the path edits to keep this box folded.'); }
        if (JSON.stringify (source.packagingProfile) === JSON.stringify (next) && (source.userData._auto3dPackagingState === 'flat') === flat) { return { objectId : source.id, state : flat ? 'flat' : 'folded', updated : false }; }
        editor.busy = true; editor.RefreshButtons?.(); let replacement; let appliedMessage = null;
        const index = target.objects.indexOf (source);
        try {
            const module = await LoadPackagingModule ();
            const data = parameters ? (flat ? module.UnfoldFefco (parameters, next) : module.CreateFefcoBox (parameters, next)) : module.CreateBoard (next, { textured : true, guides : true }); data.profile = next;
            if (editor.readOnly || editor.website.accountReady === false || editor.document !== target || editor.website.auth.user?.id !== account || !target.objects.includes (source) || JSON.stringify (this.Design ()) !== JSON.stringify (before)) { throw new Error ('The workspace or account changed during Apply.'); }
            const model = PackagingModel (data, target.model.GetUnit (), FefcoSurfaces (target.CompactModel ([source], true)));
            replacement = target.AddImported (model, source.name);
            Object.assign (replacement, { id : source.id, source : source.source, position : [...source.position], rotation : [...source.rotation], scale : [...source.scale], visible : source.visible, castShadow : source.castShadow !== false, receiveShadow : source.receiveShadow !== false, keyframes : structuredClone (source.keyframes || []), packagingProfile : next, userData : { ...source.userData, _auto3dPackagingState : flat ? 'flat' : 'folded' } });
            delete replacement.userData._auto3dFoldPreview; if (parameters) { replacement.userData._auto3dFefco = JSON.stringify (parameters); } else { delete replacement.userData._auto3dFefco; }
            target.ApplyTransform (replacement); target.Remove (replacement); target.Remove (source); target.Restore (replacement, index); target.packaging = next; editor.selected = replacement; await editor.Render ();
            if (editor.document !== target || editor.website.auth.user?.id !== account || editor.readOnly) { throw new Error ('The workspace or account changed during Apply.'); }
            const apply = async forward => { target.Remove (forward ? source : replacement); target.Restore (forward ? replacement : source, index); target.packaging = forward ? next : before; editor.selected = forward ? replacement : source; this.fefco = forward ? parameters : previousParameters; await editor.Render (); this.Refresh (); };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); this.fefco = parameters; editor.MarkDirty?.();
            const result = { objectId : source.id, state : flat ? 'flat' : 'folded', updated : true, units : 'mm', pathCount : next.paths.length }; appliedMessage = 'CAD applied to ' + source.name + ' · ' + result.state; return result;
        } catch (error) { if (replacement) { target.Remove (replacement); if (!target.objects.includes (source)) { target.Restore (source, index); } target.packaging = before; if (editor.document === target) { editor.selected = source; await editor.Render (); } } throw error; }
        finally { editor.busy = false; editor.RefreshButtons?.(); this.Refresh (); if (appliedMessage) { this.Message (appliedMessage); } }
    }

    Finish (closed)
    {
        this.Editable (); const result = this.AddPath (this.draft, this.draftType, closed, 'mm'); this.draft = []; this.Refresh (); this.Message ((closed ? 'Closed outline' : 'Open path') + ' added · ' + result.pathId.slice (0, 8)); return result;
    }
    SetControlLayer (layer)
    {
        if (!['drawing', 'measurement'].includes (layer)) { throw new Error ('Choose Drawing or Measurement layer.'); }
        this.controlLayer = layer;
        if (this.authoringContainer) { this.authoringContainer.hidden = layer !== 'drawing'; }
        if (this.engineeringContainer) { this.engineeringContainer.hidden = layer !== 'measurement'; }
        this.layerButtons?.forEach ((button, key) => button.setAttribute ('aria-pressed', String (key === layer)));
        return { opened : Boolean (this.dialog?.isConnected), layer };
    }
    OpenMeasurements () { const result = this.Open (); this.SetControlLayer ('measurement'); return { ...result, layer : 'measurement' }; }
    Open ()
    {
        if (this.dialog?.isConnected) { return { opened : true }; } this.Editable (); this.draft = []; this.active = null; this.selectedPaths.clear (); this.cadTool = 'select'; this.displayFactor = this.Factor ();
        const dialog = WorkspaceDialog ('Packaging'); this.dialog = dialog; dialog.classList.add ('packaging_dialog');
        const body = Element ('div', dialog, undefined, 'packaging_body'); const controls = Element ('div', body, undefined, 'packaging_controls'); const layers = Element ('div', controls, undefined, 'packaging_actions'); const tools = Element ('div', controls); this.authoringContainer = tools;
        const field = (title, tag = 'input') => { const label = Element ('label', tools, title); const input = Element (tag, label); input.setAttribute ('aria-label', title); return input; };
        const action = (title, fn, parent = tools) => { const button = Element ('button', parent, title); button.type = 'button'; button.addEventListener ('click', () => this.Run (fn)); return button; };
        this.layerButtons = new Map (); for (const [id, title] of [['drawing', 'Drawing tools'], ['measurement', 'Measurement layer']]) { const button = action (title, () => this.SetControlLayer (id), layers); this.layerButtons.set (id, button); }
        this.name = field ('Profile name'); this.name.maxLength = 100; this.name.addEventListener ('change', () => this.Run (() => this.SetName (this.name.value)));
        const toolbar = Element ('div', tools, undefined, 'packaging_actions packaging_toolstrip'); toolbar.setAttribute ('role', 'toolbar'); toolbar.setAttribute ('aria-label', 'CAD tools');
        this.selectToolButton = action ('Select', () => this.SetCADTool ('select'), toolbar); this.penToolButton = action ('Pen', () => this.SetCADTool ('pen'), toolbar);
        this.selectToolButton.insertAdjacentHTML ('afterbegin', '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 3v17l5-5 4 7 3-2-4-7 7-1Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>');
        this.penToolButton.insertAdjacentHTML ('afterbegin', '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m4 16 12-12 4 4L8 20H4Z M13 7l4 4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>');
        this.type = field ('Line type', 'select'); this.type.add (new Option ('Cut · red', 'cut')); this.type.add (new Option ('Crease · blue dashed', 'score')); this.type.value = this.draftType; this.type.addEventListener ('change', () => { this.Run (() => this.SetDraftType (this.type.value)); });
        toolbar.appendChild (this.type.parentElement);
        const gear = action ('⚙', () => this.OpenCreaseSettings (), toolbar); gear.setAttribute ('aria-label', 'Crease and perforation settings');
        const settings = Element ('div', tools); this.creaseSettings = settings; settings.hidden = true;
        const processLabel = Element ('label', settings, 'Crease / perforation type'); const processType = Element ('select', processLabel); processType.setAttribute ('aria-label', 'Crease / perforation type');
        for (const [value, title] of [['crease', 'Standard crease'], ['reverse-crease', 'Reverse crease'], ['perforation', 'Perforation'], ['crease-perforation', 'Crease + perforation']]) { processType.add (new Option (title, value)); }
        const lengthInput = title => { const label = Element ('label', settings, title); const input = Element ('input', label); input.type = 'number'; input.min = '0.01'; input.step = 'any'; input.value = '3'; input.setAttribute ('aria-label', title); return input; };
        const cutLength = lengthInput ('Perforation cut (mm)'), tieLength = lengthInput ('Perforation tie (mm)'); tieLength.value = '1'; this.processFields = { type : processType, cut : cutLength, tie : tieLength };
        action ('Apply crease settings', () => this.SetCreaseProcess ({ kind : processType.value, ...(processType.value.includes ('perforation') ? { cutMm : cutLength.valueAsNumber, tieMm : tieLength.valueAsNumber } : {}) }), settings);
        Element ('p', settings, 'Manufacturing line metadata; confirm the rule and cut/tie specification with your converter.', 'section_hint');
        const hint = Element ('p', tools, 'Select arrow: click a line; Ctrl/Cmd-click adds or removes lines. Pen: click points, then finish or close the path.', 'section_hint');
        this.x = field ('Point X'); this.y = field ('Point Y'); for (const input of [this.x, this.y]) { input.type = 'number'; input.step = 'any'; input.value = '0'; }
        action ('Add point', () => this.AddDraftPoint ([this.x.valueAsNumber, this.y.valueAsNumber]));
        const finish = Element ('div', tools, undefined, 'packaging_actions'); action ('Finish open path', () => this.Finish (false), finish); action ('Close outline', () => this.Finish (true), finish);
        action ('Remove last point', () => this.RemoveDraftPoint ()); action ('Cancel current path', () => this.CancelDraft ());
        this.snap = field ('Grid snap'); this.snap.type = 'number'; this.snap.step = 'any'; this.snap.min = '0'; this.snap.value = String (this.gridSnapMM / this.Factor ());
        this.paths = field ('Selected path', 'select'); this.paths.addEventListener ('change', () => { this.SelectPath (this.paths.value); });
        const assign = Element ('div', tools, undefined, 'packaging_actions'); action ('Assign cut', () => this.AssignSelected ('cut'), assign); action ('Assign score', () => this.AssignSelected ('score'), assign); action ('Delete path', () => this.DeletePath (this.active));
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
        this.engineeringContainer = Element ('div', controls); this.SetControlLayer (this.controlLayer || 'drawing'); LoadPackagingModule ().then (module => { if (!dialog.isConnected) { return; } this.engineeringPanel = new module.EngineeringPanel ({ inspect : () => this.EngineeringInspect (), update : changes => this.UpdateEngineering (changes), factor : () => this.Factor (), blocked : () => this.editor.readOnly || this.editor.busy, run : action => this.Run (action) }, this.engineeringContainer); }).catch (error => this.Message (error.message));
        const drawing = Element ('div', body, undefined, 'packaging_drawing');
        const applyBar = Element ('div', drawing, undefined, 'packaging_actions packaging_applybar'); const applyMode = Element ('select', applyBar); applyMode.setAttribute ('aria-label', 'CAD apply mode'); applyMode.add (new Option ('Keep box fold state', 'auto')); applyMode.add (new Option ('Flat board', 'flat')); action ('Apply to 3D', () => this.ApplyCAD (applyMode.value), applyBar).classList.add ('workspace_primary');
        Element ('p', drawing, 'Dimensions and materials update live when linked. Apply commits path edits; custom fold geometry can be applied as a flat board.', 'section_hint'); const top = Element ('div', drawing, undefined, 'packaging_drawing_header'); this.units = Element ('span', top); action ('Fit drawing', () => this.Fit (), top);
        this.svg = document.createElementNS ('http://www.w3.org/2000/svg', 'svg'); this.svg.classList.add ('packaging_canvas'); this.svg.setAttribute ('role', 'img'); this.svg.setAttribute ('aria-label', 'Packaging point-to-point drawing'); this.svg.setAttribute ('tabindex', '0'); drawing.appendChild (this.svg);
        const coordinate = (event) => { const point = this.svg.createSVGPoint (); point.x = event.clientX; point.y = event.clientY; const converted = point.matrixTransform (this.svg.getScreenCTM ().inverse ()); return [converted.x, -converted.y]; };
        this.svg.addEventListener ('click', (event) => this.Run (() => {
            if (event.button !== 0) { return; } this.Editable (); const pathNode = event.target.closest ('[data-path], [data-hit-path]'); if (this.cadTool === 'select') { if (pathNode) { this.SelectPath (pathNode.getAttribute ('data-path') || pathNode.getAttribute ('data-hit-path'), event.ctrlKey || event.metaKey); } else if (!event.ctrlKey && !event.metaKey) { this.selectedPaths.clear (); this.active = null; this.Refresh (); } return; }
            let point = coordinate (event); const snap = this.gridSnapMM; if (Number.isFinite (snap) && snap > 0) { point = point.map ((value) => Math.round (value / snap) * snap); }
            if (!point.every ((value) => Number.isFinite (value) && Math.abs (value) <= 100000) || this.draft.length >= 2000) { throw new Error ('Point or draft exceeds design limits.'); }
            this.AddDraftPoint (point, 'mm'); this.x.value = String (point[0] / this.Factor ()); this.y.value = String (point[1] / this.Factor ()); this.Draw ();
        }));
        this.svg.addEventListener ('wheel', (event) => { event.preventDefault (); const anchor = coordinate (event); const scale = event.deltaY > 0 ? 1.15 : 1 / 1.15; if (this.view.width * scale < 0.1 || this.view.width * scale > 200000) { return; } this.view.x = anchor[0] + (this.view.x - anchor[0]) * scale; this.view.y = -anchor[1] + (this.view.y + anchor[1]) * scale; this.view.width *= scale; this.view.height *= scale; this.Draw (); }, { passive : false });
        this.svg.addEventListener ('keydown', (event) => { if (event.key === 'Enter' && this.draft.length) { event.preventDefault (); this.Run (() => this.Finish (event.shiftKey)); } if (event.key === 'Escape' && this.draft.length) { event.preventDefault (); event.stopPropagation (); this.CancelDraft (); } });
        this.status = Element ('p', drawing, 'Ready to draw', 'packaging_status'); this.status.setAttribute ('role', 'status');
        dialog.addEventListener ('cancel', (event) => { if (this.draft.length) { event.preventDefault (); this.CancelDraft (); } });
        dialog.addEventListener ('close', () => { this.draft = []; this.dialog = null; this.status = null; this.engineeringPanel = null; }); this.snap.addEventListener ('change', () => this.Run (() => this.SetGridSnap (this.snap.valueAsNumber)));
        hint.title = 'Enter finishes an open path; Shift+Enter closes it. Escape cancels the current draft. Scroll to zoom.'; this.Refresh (); this.Fit (); return { opened : true };
    }
    Refresh ()
    {
        this.editor.website.packagingPanel?.fefcoPanel?.Refresh ();
        if (!this.dialog?.isConnected || this.refreshing) { return; } this.refreshing = true; try { this.RenderControls (); } finally { this.refreshing = false; }
    }
    RenderControls ()
    {
        const factor = this.Factor (); if (factor !== this.displayFactor) { for (const input of [this.x, this.y]) { if (Number.isFinite (input.valueAsNumber)) { input.value = String (Number ((input.valueAsNumber * this.displayFactor / factor).toFixed (6))); } } this.displayFactor = factor; } this.snap.value = String (Number ((this.gridSnapMM / factor).toFixed (6)));
        const design = this.Design (); this.name.value = design.name; this.thickness.value = String (Number ((design.thickness / this.Factor ()).toFixed (6))); this.grade.value = Object.hasOwn (BoardCalipers, design.grade) ? design.grade : 'Custom';
        this.units.textContent = 'X/Y and thickness in ' + DisplayUnitLabel (this.editor.website.preferences.units) + ' · scroll to zoom · Enter to finish · Shift+Enter to close';
        for (const id of this.selectedPaths) { if (!design.paths.some (path => path.id === id)) { this.selectedPaths.delete (id); } } if (!design.paths.some ((path) => path.id === this.active)) { this.active = null; }
        if (this.processFields) { const fields = this.processFields; fields.type.value = this.creaseProcess.kind; fields.cut.value = String (this.creaseProcess.cutMm ?? 3); fields.tie.value = String (this.creaseProcess.tieMm ?? 1); }
        this.selectToolButton.setAttribute ('aria-pressed', String (this.cadTool === 'select')); this.penToolButton.setAttribute ('aria-pressed', String (this.cadTool === 'pen')); this.svg.style.cursor = this.cadTool === 'pen' ? 'crosshair' : 'default'; this.paths.replaceChildren ();
        design.paths.forEach ((path, index) => this.paths.add (new Option ((index + 1) + ' · ' + path.type + ' · ' + (path.closed ? 'closed' : 'open') + ' · ' + path.points.length + ' points', path.id))); this.paths.value = this.active || '';
        this.pointFields.replaceChildren (); const selected = design.paths.find ((path) => path.id === this.active);
        selected?.points.forEach ((point, index) => {
            const row = Element ('div', this.pointFields, undefined, 'packaging_vertex'); Element ('span', row, String (index + 1));
            point.forEach ((value, axis) => { const input = Element ('input', row); input.type = 'number'; input.step = 'any'; input.value = String (Number ((value / this.Factor ()).toFixed (6))); input.setAttribute ('aria-label', 'Path point ' + (index + 1) + ' ' + (axis ? 'Y' : 'X')); input.addEventListener ('change', () => { if (this.refreshing) { return; } this.Run (() => { const points = selected.points.map ((item) => [...item]); points[index][axis] = input.valueAsNumber * this.Factor (); this.EditPath (selected.id, { points }, 'mm'); }); }); });
        }); this.engineeringPanel?.Refresh (); this.Draw ();
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
            const selected = this.selectedPaths.has (path.id) || path.id === this.active; const d = path.points.map ((point, index) => (index ? 'L' : 'M') + point[0] + ' ' + -point[1]).join (' ') + (path.closed ? 'Z' : '');
            if (path.id !== 'draft') { make ('path', { d, fill : 'none', stroke : 'transparent', 'stroke-width' : 12, 'vector-effect' : 'non-scaling-stroke', 'data-hit-path' : path.id, 'pointer-events' : 'stroke' }); }
            make ('path', { d, fill : path.closed && path.type === 'cut' ? '#b8926112' : 'none', stroke : path.type === 'cut' ? '#e34b4b' : '#318cdd', 'stroke-width' : selected ? 3 : 2, 'vector-effect' : 'non-scaling-stroke', 'stroke-dasharray' : path.process?.kind?.includes ('perforation') ? (path.process.cutMm + ' ' + path.process.tieMm) : path.type === 'score' ? '7 5' : 'none', 'data-path' : path.id, 'pointer-events' : 'stroke' });
            if (selected || path.id === 'draft') { path.points.forEach ((point) => make ('circle', { cx : point[0], cy : -point[1], r : this.view.width / 240, fill : path.type === 'cut' ? '#e34b4b' : '#318cdd', 'pointer-events' : 'none' })); }
        }
        const measurements = this.EngineeringInspect ();
        if (measurements.state.visible) {
            const layer = make ('g', { id : 'MEASUREMENT', 'pointer-events' : 'none', 'data-source' : 'canonical-cad' });
            const size = this.view.width / 85;
            for (const [index, dimension] of measurements.dimensions.entries ()) {
                const { a, b } = dimension; const dx = b[0] - a[0], dy = b[1] - a[1]; const length = Math.hypot (dx, dy) || 1; const offset = size * (2 + index * 0.3); const normal = [-dy / length, dx / length];
                const p = [a[0] + normal[0] * offset, -a[1] - normal[1] * offset], q = [b[0] + normal[0] * offset, -b[1] - normal[1] * offset];
                const line = (x, y) => make ('line', { x1 : x[0], y1 : x[1], x2 : y[0], y2 : y[1], stroke : '#bd76ed', 'stroke-width' : 1, 'vector-effect' : 'non-scaling-stroke' }, layer);
                line ([a[0], -a[1]], p); line ([b[0], -b[1]], q); line (p, q);
                for (const point of [p, q]) { line ([point[0] - size / 3, point[1] + size / 3], [point[0] + size / 3, point[1] - size / 3]); }
                const text = make ('text', { x : (p[0] + q[0]) / 2, y : (p[1] + q[1]) / 2 - size / 2, fill : '#d39afa', 'font-size' : size, 'text-anchor' : 'middle', 'paint-order' : 'stroke', stroke : 'var(--ov_background_color, #202326)', 'stroke-width' : size / 5 }, layer);
                if (Math.abs (dy) > Math.abs (dx)) { const x = (p[0] + q[0]) / 2 - size / 2, y = (p[1] + q[1]) / 2; text.setAttribute ('x', x); text.setAttribute ('y', y); text.setAttribute ('transform', 'rotate(-90 ' + x + ' ' + y + ')'); }
                text.textContent = dimension.id + ' ' + Number ((dimension.valueMm / this.Factor ()).toFixed (4)) + ' ±' + Number ((dimension.toleranceMm / this.Factor ()).toFixed (4)) + ' ' + DisplayUnitLabel (this.editor.website.preferences.units) + ' · ' + dimension.basis;
            }
        }
        if (this.status) { const selected = design.paths.find ((path) => path.id === this.active); const length = selected ? selected.points.reduce ((sum, point, index) => index ? sum + Math.hypot (point[0] - selected.points[index - 1][0], point[1] - selected.points[index - 1][1]) : sum, 0) + (selected.closed ? Math.hypot (selected.points[0][0] - selected.points.at (-1)[0], selected.points[0][1] - selected.points.at (-1)[1]) : 0) : 0; this.status.textContent = this.draft.length + ' draft points · ' + design.paths.length + ' paths · selected length ' + (length / this.Factor ()).toFixed (3) + ' ' + DisplayUnitLabel (this.editor.website.preferences.units); }
    }
}
