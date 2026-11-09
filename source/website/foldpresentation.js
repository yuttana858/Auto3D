import { Box3, Sphere } from 'three';
import { LoadPackagingModule, PackagingModel, ApplyFefcoFoldPose, FefcoSurfaces, PackagingUnitMM, ApplyPackagingPresentation } from './packagingadapter.js';
import { FefcoProfile, ValidateFefco } from '../../modules/packaging/src/fefco.js';
import { ConvertModelToThreeObject, ModelToThreeConversionParams, ModelToThreeConversionOutput } from '../engine/threejs/threeconverter.js';
import { TimelineFoldSample } from './timelineactions.js';
import { FoldCameraFrame, CameraBottomInset, VisibleBounds } from './foldcamera.js';
export function BaseFoldPose (object)
{
    const manual = Number (object.userData?._auto3dFoldPreview); if (object.userData?._auto3dFoldPreview !== undefined && Number.isFinite (manual) && manual >= 0 && manual <= 1) { return manual; }
    if (object.userData?._auto3dPackagingState === 'flat') { return 0; }
    const parameters = JSON.parse (object.userData._auto3dFefco); return parameters.code === '0200' || parameters.closure === 'closed' ? 1 : .72;
}
export class FoldPresentation
{
    constructor (editor) { this.editor = editor; this.records = new Map (); this.preparing = new Map (); this.generation = 0; this.manual = new Map (); this.cameraRun = null; const canvas = editor.website.viewer?.renderer?.domElement; for (const event of ['pointerdown', 'wheel', 'touchstart']) { canvas?.addEventListener (event, () => { if (this.cameraRun) { this.cameraRun.manual = true; } }, { passive : true }); } }
    HasVisiblePreview () { return [...this.records.values ()].some (record => record.preview.visible); }
    Clear ()
    {
        this.generation++; this.cameraRun = null; this.manual.clear ();
        for (const record of this.records.values ()) { record.preview.removeFromParent (); record.children.forEach (([child, visible]) => { child.visible = visible; }); record.preview.traverse (child => child.geometry?.dispose ()); record.urls.forEach (URL.revokeObjectURL); }
        this.records.clear (); this.preparing.clear ();
    }
    async Prepare (object)
    {
        if (!object?.threeObject || !object.userData?._auto3dFefco) { throw new Error ('Select a generated box or its dieline.'); }
        const existing = this.records.get (object.id); if (existing?.root === object.threeObject) { return existing; }
        if (this.preparing.has (object.id)) { return this.preparing.get (object.id); }
        const owner = this.editor.website.auth?.user?.id; const generation = this.generation; const root = object.threeObject; const document = this.editor.document;
        const work = (async () => {
            const module = await LoadPackagingModule (); const parameters = ValidateFefco (JSON.parse (object.userData._auto3dFefco)); const profile = object.packagingProfile || FefcoProfile (parameters);
            const rig = module.CreateFefcoFoldRig (parameters, profile); const clearance = await module.InspectFefcoFold (rig); if (!clearance.clear) { throw new Error ('Fold action blocked by intersecting panels: ' + clearance.intersections[0].panels.join (' / ')); } const unit = PackagingUnitMM[object.unit] ? object.unit : PackagingUnitMM[document.model.GetUnit ()] ? document.model.GetUnit () : 1; const model = PackagingModel (rig, unit, FefcoSurfaces (document.CompactModel ([object], true)));
            const output = new ModelToThreeConversionOutput ();
            const preview = await new Promise ((resolve, reject) => ConvertModelToThreeObject (model, new ModelToThreeConversionParams (), output, { onTextureLoaded : () => {}, onModelLoaded : resolve, onError : reject })).catch (error => { output.objectUrls.forEach (URL.revokeObjectURL); throw error; });
            if (owner !== this.editor.website.auth?.user?.id || generation !== this.generation || document !== this.editor.document || root !== object.threeObject) { output.objectUrls.forEach (URL.revokeObjectURL); preview.traverse (child => { child.geometry?.dispose (); }); throw new Error ('The model changed while preparing fold controls.'); }
            const sourceMaterials = new Map (); const sourceMeshes = new Map (); root.traverse (child => { if (!child.isMesh) { return; } if (child.userData.originalMeshInstance) { sourceMeshes.set (child.name, child.userData.originalMeshInstance); } const materials = Array.isArray (child.material) ? child.material : [child.material]; materials.forEach ((material, slot) => sourceMaterials.set (material.name, { material, index : child.userData.originalMaterials?.[slot] })); });
            const fallback = sourceMeshes.values ().next ().value; const unused = new Set ();
            preview.traverse (child => { if (!child.isMesh) { return; } const materials = Array.isArray (child.material) ? child.material : [child.material]; child.material = materials.map (material => { const original = sourceMaterials.get (material.name); if (!original) { return material; } unused.add (material); return original.material; }); child.userData.originalMaterials = materials.map (material => sourceMaterials.get (material.name)?.index ?? 0); child.userData.originalMeshInstance = sourceMeshes.get (child.name) || fallback; child.userData.auto3dFoldPresentation = true; }); unused.forEach (material => material.dispose ());
            ApplyPackagingPresentation (preview, rig, unit, document.model.materials, true);
            const record = { object, root, preview, rig, module, unit, urls : output.objectUrls, children : root.children.map (child => [child, child.visible]) };
            preview.visible = false; root.add (preview); this.records.set (object.id, record); return record;
        }) ();
        this.preparing.set (object.id, work); try { return await work; } finally { if (this.preparing.get (object.id) === work) { this.preparing.delete (object.id); } }
    }
    async PrepareAll ()
    {
        const ids = new Set ((this.editor.timeline?.actions || []).map (action => action.objectId));
        for (const object of this.editor.document.objects) { if (ids.has (object.id) || object.userData?._auto3dFoldPreview !== undefined) { await this.Prepare (object); } }
    }
    SetPose (record, pose)
    {
        record.children.forEach (([child]) => { child.visible = false; }); record.preview.visible = true;
        ApplyFefcoFoldPose (record.preview, record.rig, record.module.FefcoFoldPose (record.rig, pose), record.unit); record.pose = pose;
    }
    Apply (time, camera = true)
    {
        const editor = this.editor; const timeline = editor.timeline; const active = []; const currentBounds = new Box3 ();
        for (const record of this.records.values ()) {
            if (record.root !== record.object.threeObject || !editor.document.objects.includes (record.object)) { continue; }
            const sample = TimelineFoldSample (timeline?.actions || [], record.object.id, time, BaseFoldPose (record.object), timeline?.foldAutoFit !== false);
            const manual = this.manual.get (record.object.id); const hasSaved = record.object.userData?._auto3dFoldPreview !== undefined;
            if (manual !== undefined || sample || hasSaved) {
                this.SetPose (record, manual ?? sample?.pose ?? BaseFoldPose (record.object));
                if (sample && record.object.visible) { active.push (sample); currentBounds.union (VisibleBounds (record.preview)); }
            } else { record.preview.visible = false; record.children.forEach (([child, visible]) => { child.visible = visible; }); }
        }
        editor.website.viewModes?.Refresh ();
        if (!camera || !active.length || timeline?.foldAutoFit === false || timeline?.cameraKeyframes?.length) { return; }
        const key = active.map (sample => sample.action.id).join (':');
        if (!this.cameraRun || this.cameraRun.key !== key || time < this.cameraRun.time) { this.cameraRun = { key, initial : editor.website.viewer.GetCamera ().Clone (), time, manual : false }; editor.website.viewer.navigation.StopCameraMovement?.(); }
        const run = this.cameraRun; run.time = time;
        if (!run.manual && !currentBounds.isEmpty ()) { const size = editor.website.viewer.GetImageSize (); const sphere = currentBounds.getBoundingSphere (new Sphere ()); const progress = Math.min (...active.map (sample => sample.progress)); editor.website.viewer.SetCamera (FoldCameraFrame (run.initial, sphere, 0, progress, size.width / size.height, CameraBottomInset (editor.website.viewer, editor.status), currentBounds)); }
    }
    WithOriginal (object, callback)
    {
        const record = this.records.get (object.id); if (!record || !record.preview.parent) { return callback (); }
        record.preview.removeFromParent (); try { return callback (); } finally { record.root.add (record.preview); }
    }
}
