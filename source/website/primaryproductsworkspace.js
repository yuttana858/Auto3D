import { CloneSurface } from './scenedocument.js';
import { Unit } from '../engine/model/unit.js';
import { ProductDefinition, ValidateProductDefinition } from '../../modules/primary-products/src/definition.js';
import { PrimaryProductModel, ApplyProductOptics } from './primaryproductsadapter.js';
import { ProductCalloutRecords, ValidateDimensions } from './dimensioncore.js';
import { BottleCap } from '../../modules/primary-products/src/bottleconstruction.js';
import { PlaceGeneratedObject } from './generatedplacement.js';

export const PrimaryProductDataKey = '_auto3dPrimaryProduct';
async function RenderProduct (panel, preserveView)
{
    const website = panel.website, editor = website.sessionEditor, viewer = website.viewer;
    const document = editor.document, owner = website.auth?.user?.id;
    let camera = null, pivot = null;
    const captureView = () => {
        if (!preserveView) { return; }
        camera = viewer?.GetCamera?.().Clone () || null; pivot = viewer?.navigation?.orbitCenter?.Clone () || null;
    };
    captureView (); // Keep a fallback if conversion fails before the display callback.
    // Navigation stays available during conversion; capture its latest position before OnModelLoaded resets the view.
    try { await editor.Render (false, preserveView ? captureView : null); }
    finally {
        if (camera && editor.document === document && website.auth?.user?.id === owner) { viewer.SetCamera (camera); if (viewer.navigation) { viewer.navigation.orbitCenter = pivot; } }
    }
}
export class PrimaryProductsWorkspace
{
    constructor (panel, load) { this.panel = panel; this.load = load; this.active = false; }
    Selected ()
    {
        const object = this.panel.website.sessionEditor.selected;
        if (!object?.userData?.[PrimaryProductDataKey] || !this.panel.website.sessionEditor.document.objects.includes (object)) { throw new Error ('Select a generated Primary Products object.'); }
        const definition = ValidateProductDefinition (JSON.parse (object.userData[PrimaryProductDataKey]));
        return { object, definition };
    }
    LoadSelected ()
    {
        if (this.panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        const { object, definition } = this.Selected (); this.panel.artwork?.Load (definition, this.panel.website.sessionEditor.document.CompactModel ([object], true)); this.panel.draft = definition.draft; this.panel.Refresh (); return this.panel.Inspect ();
    }
    async Generate (update = false, preserveMaterials = false, surfaceChanges = {}, options = {})
    {
        const panel = this.panel; const editor = panel.website.sessionEditor;
        if (this.active || panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        const definition = ProductDefinition (panel.draft, panel.artwork?.Inspect () || []);
        const target = editor.document; const owner = panel.website.auth.user.id; const source = update ? this.Selected ().object : null;
        if (source?.hiddenParts?.length || source?.animationAsset || source?.keyframes?.length) { throw new Error ('Remove hidden parts and animation before rebuilding this product.'); }
        if (!source && target.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const previous = editor.selected; const previousUnit = target.model.GetUnit (); const index = source ? target.objects.indexOf (source) : target.objects.length;
        const unchanged = (committed = false) => {
            options.guard?.();
            const expected = committed ? object : source;
            if (editor.document !== target || panel.website.auth?.user?.id !== owner || editor.readOnly || panel.website.accountReady === false || expected && (!target.objects.includes (expected) || editor.selected !== expected)) { throw new Error ('The account, selection or session changed during generation.'); }
        };
        this.active = true; editor.busy = true; panel.Refresh (); editor.RefreshButtons?.();
        let object, calloutsAdded = false, restoreDimensions = null;
        try {
            const module = await this.load (); unchanged ();
            const unit = target.objects.length ? previousUnit : Unit.Millimeter;
            const geometry = module.CreatePrimaryProduct (definition.draft);
            const model = PrimaryProductModel (geometry, unit, definition.artwork || [], panel.artwork?.resources);
            if (source && preserveMaterials) {
                const previousModel = target.CompactModel ([source], true);
                const old = this.Selected ().definition.draft, next = definition.draft;
                for (const mesh of model.meshes) {
                    const role = geometry.components.find (component => component.id === mesh.GetName ())?.materialRole;
                    const body = ['body', 'glass-neck'].includes (role), closure = role === 'closure';
                    if (mesh.GetName ().startsWith ('label-') || mesh.GetName () === 'contents' || body && old.material !== next.material || closure && old.details?.capMaterial !== next.details?.capMaterial) { continue; }
                    const previousMesh = previousModel.meshes.find (m => m.GetName () === mesh.GetName ());
                    if (previousMesh?.TriangleCount () && mesh.TriangleCount ()) {
                        const copy = CloneSurface (previousModel.materials[previousMesh.GetTriangle (0).mat]);
                        const oldCap = closure && old.family === 'bottle' ? BottleCap (old) : null, nextCap = oldCap ? BottleCap (next) : null;
                        for (const value of Object.values (copy)) { if (value?.name?.startsWith ('primary-') && value.scale) { value.scale.x *= nextCap ? nextCap.radiusMm / oldCap.radiusMm : (next.diameterMm || next.widthMm) / (old.diameterMm || old.widthMm); value.scale.y *= nextCap ? nextCap.heightMm / oldCap.heightMm : next.heightMm / old.heightMm; } }
                        const generated = model.materials[mesh.GetTriangle (0).mat];
                        if (old.details?.textureStrength !== next.details?.textureStrength || old.details?.textureScaleMm !== next.details?.textureScaleMm || Boolean (old.details) !== Boolean (next.details)) {
                            // These controls explicitly replace generated grain, not unrelated paint or advanced PBR values.
                            for (const key of ['normalMap', 'bumpMap', 'roughnessMap', 'metalnessMap', 'normalScale', 'bumpScale', 'reliefMode']) { copy[key] = generated[key]; }
                        }
                        if (body) {
                            if (surfaceChanges.optics === null) { for (const key of ['color', 'transmission', 'ior', 'attenuationColor', 'attenuationDistance', 'opacity', 'transparent', 'transmissionBackground']) { copy[key] = generated[key]; } }
                            if (old.color !== next.color) { copy.color = generated.color; }
                            if (old.roughness !== next.roughness) { copy.roughness = generated.roughness; }
                            ApplyProductOptics (copy, JSON.stringify (old.optics) !== JSON.stringify (next.optics) || old.color !== next.color ? next : { ...next, optics : undefined }, geometry.quality.wallMm || 0, unit);
                        }
                        if (closure && old.details?.capColor !== next.details?.capColor) { copy.color = model.materials[mesh.GetTriangle (0).mat].color; }
                        model.materials[mesh.GetTriangle (0).mat] = copy;
                    }
                }
            }
            object = target.AddImported (model, source?.name || module.ProductName (definition.draft));
            if (source) {
                for (const key of ['id', 'name', 'source', 'visible', 'castShadow', 'receiveShadow']) { object[key] = source[key]; }
                for (const key of ['position', 'rotation', 'scale']) { object[key] = [...source[key]]; }
                object.userData = { ...source.userData }; target.ApplyTransform (object);
                target.Remove (object); target.Remove (source); target.Restore (object, index);
            } else { PlaceGeneratedObject (target, object); }
            object.userData[PrimaryProductDataKey] = JSON.stringify (definition); editor.selected = object;
            // New products get W × L × H callout brackets in the same Undo step; rebuilt products keep their existing callouts.
            const dimensionsBefore = target.dimensions || [], visibleBefore = target.dimensionsVisible !== false; let dimensionsAfter = dimensionsBefore;
            if (!source && panel.callouts !== false) { try { dimensionsAfter = ValidateDimensions ([...dimensionsBefore, ...ProductCalloutRecords (target, object)]); } catch { dimensionsAfter = dimensionsBefore; } }
            const showDimensions = forward => { target.dimensions = forward ? dimensionsAfter : dimensionsBefore; target.dimensionsVisible = forward && dimensionsAfter !== dimensionsBefore ? true : visibleBefore; panel.website.dimensions?.Draw?.(panel.website.viewer?.camera); };
            calloutsAdded = dimensionsAfter !== dimensionsBefore; restoreDimensions = () => showDimensions (false); showDimensions (true);
            await RenderProduct (panel, Boolean (source)); unchanged (true);
            const apply = async forward => {
                if (editor.document !== target) { throw new Error ('This product belongs to another session.'); }
                target.Remove (forward ? source : object); showDimensions (forward);
                if (forward) { target.Restore (object, index); } else if (source) { target.Restore (source, index); }
                editor.selected = forward ? object : previous && target.objects.includes (previous) ? previous : null;
                await RenderProduct (panel, true); panel.Refresh ();
            };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) });
            editor.Status?.(source ? 'Updated Primary Products object.' : 'Added Primary Products object.');
            if (!source) { editor.Select?.(object); editor.Focus?.(); panel.website.viewer?.navigation?.FinishCameraMovement (); } // Settle the fit before another edit can rebuild the scene.
            return { objectId : object.id, updated : Boolean (source), units : 'mm', definition, components : model.meshes.map (mesh => mesh.GetName ()), callouts : calloutsAdded };
        } catch (error) {
            restoreDimensions?.();
            if (object) { target.Remove (object); if (source && !target.objects.includes (source)) { target.Restore (source, index); } if (!target.objects.length) { target.model.SetUnit (previousUnit); } }
            if (editor.document === target && panel.website.auth?.user?.id === owner) { if (editor.selected === object || editor.selected === source) { editor.selected = previous && target.objects.includes (previous) ? previous : null; } if (object) { await RenderProduct (panel, true); } }
            throw error;
        } finally { this.active = false; editor.busy = false; editor.RefreshButtons?.(); panel.Refresh (); }
    }
}
