import { WorkspaceDialog } from './modellibrary.js';
import { BoardCalipers, NewPackagingDesign, ValidatePackaging, PackagingBounds, ExportPackagingSVG, ExportPackagingDXF } from './packagingcore.js';
import { Unit } from '../engine/model/unit.js';
import { DisplayUnitLabel } from './preferences.js';
import { DefaultFefco, ValidateFefco, FefcoProfile, FefcoPreset, FefcoAnimationPlan } from '../../modules/packaging/src/fefco.js';
import { FefcoDimensions, ResolveFefcoDimensions } from '../../modules/packaging/src/dimensions.js';
import { Box3, Vector3, Sphere } from 'three';
import { LoadPackagingModule, PackagingModel, FefcoSurfaces, ApplyFefcoFoldPose } from './packagingadapter.js';


function Element (tag, parent, text, className)
{
    const node = document.createElement (tag); if (text !== undefined) { node.textContent = text; } if (className) { node.className = className; } parent?.appendChild (node); return node;
}
export class PackagingWorkspace
{
    constructor (editor) { this.editor = editor; this.dialog = null; this.refreshing = false; this.draft = []; this.active = null; this.draftType = 'cut'; this.gridSnapMM = 5; this.displayFactor = 1; this.view = { x : -20, y : -220, width : 340, height : 240 }; }
    Design () { return this.editor.document.packaging || NewPackagingDesign (); }
    PanelHost () { return { dimensions : () => this.DimensionsInspect (), dimensionMode : basis => this.DimensionMode (basis), updateDimensions : changes => this.UpdateDimensions (changes), dimensionsBlocked : () => this.editor.readOnly || !this.editor.website.auth?.user || this.editor.website.accountReady === false || this.editor.busy && !this.dimensionUpdating, inspect : () => this.FefcoInspect (), configure : changes => this.ConfigureFefco (changes), generate : changes => this.GenerateFefco (changes), preset : (code, changes) => this.GeneratePreset (code, changes), designer : () => this.OpenSelected (), unfold : () => this.UnfoldSelected (), animate : () => this.AnimateFold (), animation : () => this.AnimationInspect (), playback : () => this.FoldInspect (), control : action => this.FoldControl (action), canAnimate : () => Boolean (this.editor.selected?.userData?._auto3dFefco), factor : () => this.Factor (), run : action => this.editor.Run (action), blocked : () => this.editor.busy || this.editor.readOnly || !this.editor.website.auth?.user || this.editor.website.accountReady === false, canUnfold : () => this.CanUnfold () }; }
    DimensionsInspect ()
    {
        const object = this.editor.selected; if (!object?.userData?._auto3dFefco) { return null; }
        try { const p = ValidateFefco (JSON.parse (object.userData._auto3dFefco)); const tolerance = Number (object.userData._auto3dFitTolerance || 0); return { ...FefcoDimensions (p, tolerance), objectId : object.id, name : object.name, code : p.code, basis : this.dimensionBasis || 'inside', editable : object.scale.every (v => Math.abs (v - 1) < 1e-6) }; } catch { return null; }
    }
    DimensionMode (basis) { if (!['inside', 'outside'].includes (basis)) { throw new Error ('Choose inside or outside dimensions.'); } this.dimensionBasis = basis; this.editor.website.aiWorkspace?.fefcoPanel?.RefreshDimensions (); return this.DimensionsInspect (); }
    async UpdateDimensions (changes, objectId = null)
    {
        this.Editable (); const editor = this.editor; const target = editor.document; const source = objectId ? target.objects.find (item => item.id === objectId) : editor.selected;
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
            const apply = async forward => { target.Remove (forward ? source : replacement); target.Restore (forward ? replacement : source, index); target.packaging = forward ? data.profile : before; editor.selected = forward ? replacement : previous; await editor.Render (); this.Refresh (); editor.website.aiWorkspace?.RefreshPackaging (); };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); this.dimensionBasis = basis; this.fefco = parameters; editor.Status ('Updated box dimensions · ' + basis + ' · tolerance ±' + tolerance + ' mm'); this.Refresh (); editor.website.aiWorkspace?.RefreshPackaging ();
            return { objectId : replacement.id, basis, dimensions : FefcoDimensions (parameters, tolerance), state : flat ? 'flat' : 'folded' };
        } catch (error) { if (replacement) { target.Remove (replacement); if (!target.objects.includes (source)) { target.Restore (source, index); } target.packaging = before; editor.selected = previous; await editor.Render (); } throw error; }
        finally { this.dimensionUpdating = false; editor.busy = false; editor.RefreshButtons?.(); }
    }
    FoldInspect ()
    {
        if (!this.foldOperation) { return this.lastFold || { state : 'idle', progress : 0 }; }
        const operation = this.foldOperation; const playback = operation.player?.Inspect () || { state : 'preparing', progress : 0 };
        const state = { completed : 'finishing', cancelled : 'cancelling', failed : 'restoring' }[playback.state] || playback.state;
        return { ...playback, state, stage : operation.stage, action : operation.action, objectId : operation.source.id, clearance : operation.clearance || null };
    }
    FoldControl (action)
    {
        const operation = this.foldOperation;
        if (!this.editor.website.auth?.user || this.editor.readOnly || this.editor.website.accountReady === false) { throw new Error ('Sign in to an editable workspace.'); }
        if (!operation?.player || !['pause', 'resume', 'cancel'].includes (action)) { throw new Error ('Start a folding animation first; use pause, resume or cancel.'); }
        if (action === 'pause') { operation.player.Pause (); } else if (action === 'resume') { operation.player.Resume (); } else { operation.player.Stop (); }
        this.editor.website.aiWorkspace?.fefcoPanel?.RefreshPlayback (); return this.FoldInspect ();
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
        const plan = FefcoAnimationPlan (parameters, source.userData._auto3dPackagingState || 'folded'); const rig = module.CreateFefcoFoldRig (parameters, profile);
        // Audit while the original is still in the scene. Keep saving/editing
        // blocked during this preparation, and recheck account/scene on yields.
        let clearance; this.foldOperation = { source, action : plan.action, stage : 'checking surfaces' }; editor.busy = true; editor.RefreshButtons?.();
        try { clearance = await module.InspectFefcoFold (rig, async progress => { if (editor.document !== target || !target.objects.includes (source) || editor.website.auth?.user?.id !== accountId || editor.website.accountReady === false || editor.readOnly) { throw new Error ('The workspace or account changed while checking folding.'); } editor.Status ('Processing · checking fold surfaces · ' + Math.round (progress * 100) + '%'); editor.website.aiWorkspace?.fefcoPanel?.RefreshPlayback (); await new Promise (resolve => setTimeout (resolve, 0)); }); }
        finally { this.foldOperation = null; editor.busy = false; editor.RefreshButtons?.(); }
        this.Editable (); if (!clearance.clear) { throw new Error ('Fold blocked: ' + clearance.intersections[0].panels.join (' / ') + ' intersect.'); }
        const surfaces = FefcoSurfaces (target.CompactModel ([source], true)); const unit = target.model.GetUnit ();
        const before = target.packaging; const previous = editor.selected; const index = target.objects.indexOf (source); const account = editor.website.auth.user.id; const cameraBefore = editor.website.viewer?.GetCamera?.().Clone (); let preview; let final;
        const restore = async () => { if (preview) { target.Remove (preview); } if (final) { target.Remove (final); } if (!target.objects.includes (source)) { target.Restore (source, index); } target.packaging = before; if (editor.document === target) { editor.selected = previous; await editor.Render (); if (cameraBefore) { editor.website.viewer.SetCamera (cameraBefore.Clone ()); } } };
        const assign = (object, state, data = parameters) => { object.packagingProfile = profile; object.userData = { ...source.userData, _auto3dFefco : JSON.stringify (data), _auto3dPackagingState : state }; object.position = [...source.position]; object.rotation = [...source.rotation]; object.visible = source.visible; object.castShadow = source.castShadow !== false; object.receiveShadow = source.receiveShadow !== false; target.ApplyTransform (object); };
        const operation = { source, action : plan.action, stage : plan.stages[0], clearance }; this.foldOperation = operation;
        try {
            preview = target.AddImported (PackagingModel (rig, unit, surfaces), source.name + ' · Folding'); assign (preview, 'flat'); target.packaging = profile; this.Refresh (); target.Remove (preview); target.Remove (source); target.Restore (preview, index); editor.selected = preview;
            editor.busy = true; editor.RefreshButtons?.(); await editor.Render (); editor.busy = true; editor.RefreshButtons?.();
            if (preview.threeObject) {
                // Fit the whole sequence so the long CAD blank remains visible while unfolding.
                let radius = 0;
                for (const progress of [0, 0.22, 0.48, 0.72, 1]) { ApplyFefcoFoldPose (preview.threeObject, rig, module.FefcoFoldPose (rig, progress), unit); radius = Math.max (radius, new Box3 ().setFromObject (preview.threeObject).getBoundingSphere (new Sphere ()).radius); }
                ApplyFefcoFoldPose (preview.threeObject, rig, module.FefcoFoldPose (rig, plan.from), unit); const sphere = new Box3 ().setFromObject (preview.threeObject).getBoundingSphere (new Sphere ()); sphere.radius = radius; editor.website.viewer.FitSphereToWindow (sphere, false);
            }
            editor.selectionBox && (editor.selectionBox.visible = false);
            let center = preview.threeObject ? new Box3 ().setFromObject (preview.threeObject).getCenter (new Vector3 ()) : null;
            operation.player = new module.FoldPlayback (progress => {
                if (editor.document !== target || editor.website.auth.user?.id !== account || editor.website.accountReady === false || editor.readOnly) { throw new Error ('The workspace or account changed during folding.'); }
                const pose = module.FefcoFoldPose (rig, plan.from + (plan.to - plan.from) * progress); operation.stage = plan.action === 'unfold' ? ({ 'closing top' : 'opening top', 'closing base' : 'opening base', 'erecting walls' : 'unwrapping walls' }[pose.stage] || pose.stage) : pose.stage;
                if (preview.threeObject) { ApplyFefcoFoldPose (preview.threeObject, rig, pose, unit); const next = new Box3 ().setFromObject (preview.threeObject).getCenter (new Vector3 ()); const delta = next.clone ().sub (center); const camera = editor.website.viewer.GetCamera ().Clone (); for (const axis of ['x', 'y', 'z']) { camera.eye[axis] += delta[axis]; camera.center[axis] += delta[axis]; } center = next; editor.website.viewer.SetCamera (camera); } else { editor.website.viewer?.Render (); } editor.Status ('Folding · ' + operation.stage + ' · ' + Math.round (progress * 100) + '%'); editor.website.aiWorkspace?.fefcoPanel?.RefreshPlayback ();
            }, duration);
            // Playback controls remain accessible while ordinary editing/saving is blocked.
            operation.completion = operation.player.Start ().then (async result => {
                if (!result.completed) { await restore (); this.lastFold = { state : 'cancelled', progress : 0, objectId : source.id }; editor.Status ('Folding cancelled · original object restored'); return; }
                const next = { ...parameters, closure : plan.targetClosure }; const data = plan.targetState === 'flat' ? module.UnfoldFefco (next, profile) : module.CreateFefcoBox (next); final = target.AddImported (PackagingModel (data, unit, surfaces), source.name.replace (/ · (Dieline|Folded|Open|Closed)$/, '') + (plan.targetState === 'flat' ? ' · Dieline' : plan.targetClosure === 'open' ? ' · Open' : ' · Closed')); assign (final, plan.targetState, data.parameters); final.source = 'FEFCO ' + parameters.code + ' ' + plan.targetState;
                target.Remove (final); target.Remove (preview); target.Restore (final, index); target.packaging = profile; editor.selected = final; await editor.Render (true);
                const apply = async forward => { target.Remove (forward ? source : final); target.Restore (forward ? final : source, index); target.packaging = forward ? profile : before; editor.selected = forward ? final : previous; await editor.Render (true); this.Refresh (); editor.website.aiWorkspace?.RefreshPackaging (); };
                editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); this.lastFold = { state : 'completed', progress : 1, stage : plan.stages.at (-1), action : plan.action, objectId : final.id }; editor.Status ('Folding complete · ' + plan.stages.at (-1) + ' · Undo available');
            }).catch (async error => { try { await restore (); } catch { /* Retain the playback error. */ } this.lastFold = { state : 'failed', progress : 0, error : error.message }; editor.website.errorLogs?.Record ('error', 'packaging-fold', error.message); editor.Status (error.message); }).finally (() => { this.foldOperation = null; editor.busy = false; editor.RefreshButtons?.(); this.Refresh (); editor.website.aiWorkspace?.RefreshPackaging (); });
            editor.website.aiWorkspace?.fefcoPanel?.RefreshPlayback (); return { started : true, objectId : source.id, duration, action : plan.action, stages : plan.stages, clearance };
        } catch (error) { try { await restore (); } finally { this.foldOperation = null; editor.busy = false; editor.RefreshButtons?.(); } throw error; }
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
            const apply = async forward => { target.Remove (forward ? source : flat); target.Restore (forward ? flat : source, index); target.packaging = forward ? profile : before; editor.selected = forward ? flat : previous; await editor.Render (); this.Refresh (); editor.website.aiWorkspace?.RefreshPackaging (); };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) });
            this.Refresh (); editor.Status ('Unfolded FEFCO ' + parameters.code + ' · kraft dieline · CUT red / SCORE blue');
            return { objectId : flat.id, replacedObjectId : source.id, code : parameters.code, state : 'flat', units : 'mm', thicknessMM : profile.thickness, profilePaths : profile.paths.length, materialPreserved : true };
        } catch (error) {
            if (flat) { target.Remove (flat); if (!target.objects.includes (source)) { target.Restore (source, index); } target.packaging = before; editor.selected = previous; await editor.Render (); } throw error;
        } finally { editor.busy = false; editor.RefreshButtons?.(); editor.website.aiWorkspace?.RefreshPackaging (); }
    }
    FefcoInspect () { return { ...ValidateFefco (this.fefco || DefaultFefco), units : 'mm', dimensions : 'internal', axes : 'W=X, L=Z, H=Y' }; }
    async FefcoCatalog () { const module = await LoadPackagingModule (); return module.FefcoCatalog (); }
    ConfigureFefco (changes)
    {
        this.Editable (); this.fefco = ValidateFefco ({ ...(this.fefco || DefaultFefco), ...changes }); this.editor.website.aiWorkspace?.fefcoPanel?.Refresh (); return this.FefcoInspect ();
    }
    GeneratePreset (code, changes = {}) { this.Editable (); return this.GenerateFefco (FefcoPreset ({ ...(this.fefco || DefaultFefco), ...changes }, code)); }
    async GenerateFefco (changes = {})
    {
        this.Editable (); const editor = this.editor; if (editor.document.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const data = ValidateFefco ({ ...(this.fefco || DefaultFefco), ...changes });
        const target = editor.document; const module = await LoadPackagingModule (); this.Editable ();
        if (editor.document !== target) { throw new Error ('The workspace changed before generating packaging.'); }
        if (target.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const unit = target.objects.length ? target.model.GetUnit () : Unit.Millimeter;
        // Validate geometry and units before changing the scene or profile.
        const model = PackagingModel (module.CreateFefcoBox (data), unit); const profile = FefcoProfile (data);
        const before = target.packaging; const previous = editor.selected;
        editor.busy = true; editor.RefreshButtons?.(); editor.Status ('Generating FEFCO ' + data.code + '…');
        let object;
        try {
            await new Promise (resolve => setTimeout (resolve, 20));
            object = target.AddImported (model, profile.name); object.source = 'FEFCO ' + data.code; object.packagingProfile = profile; object.userData._auto3dFefco = JSON.stringify (data); target.packaging = profile;
            const index = target.objects.indexOf (object); editor.selected = object;
            await editor.Render (true);
            const apply = async (add) => { if (add) { target.Restore (object, index); target.packaging = profile; editor.selected = object; } else { target.Remove (object); target.packaging = before; editor.selected = previous && target.objects.includes (previous) ? previous : null; } await editor.Render (); this.Refresh (); editor.website.aiWorkspace?.RefreshPackaging (); };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); this.fefco = data;
            this.Refresh (); editor.website.aiWorkspace?.RefreshPackaging (); editor.Status ('Added FEFCO ' + data.code + ' · ' + data.length + ' × ' + data.width + ' × ' + data.height + ' mm');
            return { objectId : object.id, ...data, units : 'mm', sceneUnit : unit, profilePaths : profile.paths.length };
        } catch (error) {
            if (object) { target.Remove (object); target.packaging = before; editor.selected = previous; await editor.Render (); } throw error;
        } finally { editor.busy = false; editor.RefreshButtons?.(); editor.website.aiWorkspace?.RefreshPackaging (); }
    }
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
        this.draft = []; const result = this.Change (profile); if (fefco) { this.fefco = fefco; this.Refresh (); } return result;
    }
    OpenSelected ()
    {
        this.Editable (); const object = this.editor.selected;
        if (!object?.packagingProfile) { throw new Error ('Select a generated packaging box or dieline.'); }
        const profile = ValidatePackaging (object.packagingProfile);
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
        this.editor.website.aiWorkspace?.fefcoPanel?.Refresh ();
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
