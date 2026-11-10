import { Unit } from '../engine/model/unit.js';
import { ProductDefinition, ValidateProductDefinition } from '../../modules/primary-products/src/definition.js';
import { PrimaryProductModel } from './primaryproductsadapter.js';
import { ProductCalloutRecords, ValidateDimensions } from './dimensioncore.js';

export const PrimaryProductDataKey = '_auto3dPrimaryProduct';
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
    async Generate (update = false)
    {
        const panel = this.panel; const editor = panel.website.sessionEditor;
        if (this.active || panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        const definition = ProductDefinition (panel.draft, panel.artwork?.Inspect () || []);
        if (definition.draft.material === 'glass') { throw new Error ('Glass generation needs transmission and hollow-wall support. Choose opaque plastic.'); }
        const target = editor.document; const owner = panel.website.auth.user.id; const source = update ? this.Selected ().object : null;
        if (source?.hiddenParts?.length || source?.animationAsset || source?.keyframes?.length) { throw new Error ('Remove hidden parts and animation before rebuilding this product.'); }
        if (!source && target.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const previous = editor.selected; const previousUnit = target.model.GetUnit (); const index = source ? target.objects.indexOf (source) : target.objects.length;
        const unchanged = () => {
            if (editor.document !== target || panel.website.auth?.user?.id !== owner || editor.readOnly || panel.website.accountReady === false || source && (!target.objects.includes (source) || editor.selected !== source)) { throw new Error ('The account, selection or session changed during generation.'); }
        };
        this.active = true; editor.busy = true; panel.Refresh (); editor.RefreshButtons?.();
        let object, calloutsAdded = false, restoreDimensions = null;
        try {
            const module = await this.load (); unchanged ();
            const unit = target.objects.length ? previousUnit : Unit.Millimeter;
            const model = PrimaryProductModel (module.CreatePrimaryProduct (definition.draft), unit, definition.artwork || [], panel.artwork?.resources);
            object = target.AddImported (model, source?.name || module.PrimaryFamilies[definition.draft.family].name);
            if (source) {
                for (const key of ['id', 'name', 'source', 'visible', 'castShadow', 'receiveShadow']) { object[key] = source[key]; }
                for (const key of ['position', 'rotation', 'scale']) { object[key] = [...source[key]]; }
                object.userData = { ...source.userData }; target.ApplyTransform (object);
                target.Remove (object); target.Remove (source); target.Restore (object, index);
            }
            object.userData[PrimaryProductDataKey] = JSON.stringify (definition); editor.selected = object;
            // New products get W × L × H callout brackets in the same Undo step; rebuilt products keep their existing callouts.
            const dimensionsBefore = target.dimensions || [], visibleBefore = target.dimensionsVisible !== false; let dimensionsAfter = dimensionsBefore;
            if (!source && panel.callouts !== false) { try { dimensionsAfter = ValidateDimensions ([...dimensionsBefore, ...ProductCalloutRecords (target, object)]); } catch { dimensionsAfter = dimensionsBefore; } }
            const showDimensions = forward => { target.dimensions = forward ? dimensionsAfter : dimensionsBefore; target.dimensionsVisible = forward && dimensionsAfter !== dimensionsBefore ? true : visibleBefore; panel.website.dimensions?.Draw?.(panel.website.viewer?.camera); };
            calloutsAdded = dimensionsAfter !== dimensionsBefore; restoreDimensions = () => showDimensions (false); showDimensions (true);
            await editor.Render ();
            if (editor.document !== target || panel.website.auth?.user?.id !== owner || editor.readOnly || panel.website.accountReady === false) { throw new Error ('The account or session changed before generation completed.'); }
            const apply = async forward => {
                if (editor.document !== target) { throw new Error ('This product belongs to another session.'); }
                target.Remove (forward ? source : object); showDimensions (forward);
                if (forward) { target.Restore (object, index); } else if (source) { target.Restore (source, index); }
                editor.selected = forward ? object : previous && target.objects.includes (previous) ? previous : null;
                await editor.Render (); panel.Refresh ();
            };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) });
            editor.Status?.(source ? 'Updated Primary Products object.' : 'Added Primary Products object.');
            return { objectId : object.id, updated : Boolean (source), units : 'mm', definition, components : model.meshes.map (mesh => mesh.GetName ()), callouts : calloutsAdded };
        } catch (error) {
            restoreDimensions?.();
            if (object) { target.Remove (object); if (source && !target.objects.includes (source)) { target.Restore (source, index); } if (!target.objects.length) { target.model.SetUnit (previousUnit); } }
            if (editor.document === target && panel.website.auth?.user?.id === owner) { editor.selected = previous && target.objects.includes (previous) ? previous : null; if (object) { await editor.Render (); } }
            throw error;
        } finally { this.active = false; editor.busy = false; editor.RefreshButtons?.(); panel.Refresh (); }
    }
}
