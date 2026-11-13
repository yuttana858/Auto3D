import { PulpDefinition, ValidatePulpDefinition, MaxStoredProducts } from '../../modules/molded-pulp/src/definition.js';
import { PulpTypes } from '../../modules/molded-pulp/src/state.js';
import { MoldedPulpModel, SessionTrianglesMm, PulpMillimeters } from './moldedpulpadapter.js';

export const MoldedPulpDataKey = '_auto3dMoldedPulp';
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia ('(prefers-reduced-motion: reduce)').matches;

// Scene operations for the Molded Pulp module: sense the selected products, place a flat sheet directly under them and
// form it into a tray. Each scene change is one Undo step; a sheet or tray generated for the same products is replaced
// in place (same object identity), so Sense → Generate sheet → Form tray → Form depth edits one pulp object.
export class MoldedPulpWorkspace
{
    constructor (panel, load) { this.panel = panel; this.load = load; this.active = false; this.sensed = null; this.result = null; this.pulpId = null; }
    get editor () { return this.panel.website.sessionEditor; }
    IsPulp (object) { return object?.userData?.[MoldedPulpDataKey] !== undefined; }
    Products (ids)
    {
        const objects = this.editor.document.objects, found = ids.map (id => objects.find (object => object.id === id));
        if (found.some (object => !object)) { throw new Error ('A sensed product was removed. Select the products and sense again.'); }
        return found;
    }
    Sense ()
    {
        if (this.panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        const editor = this.editor, chosen = editor.SelectedObjects ().length ? editor.SelectedObjects () : editor.selected ? [editor.selected] : [];
        const primary = chosen.includes (editor.selected) && !this.IsPulp (editor.selected) ? editor.selected : null;
        const products = [primary, ...chosen.filter (object => object !== primary)].filter (object => object && object.visible !== false && !this.IsPulp (object));
        if (!products.length) { throw new Error ('Select one or more products (or a group) to sense.'); }
        if (products.length > 1000) { throw new Error ('Sense at most 1000 products at a time.'); }
        const triangles = SessionTrianglesMm (editor.document, products), bounds = this.Bounds (triangles);
        this.sensed = { objectIds : products.map (object => object.id), primaryId : products[0].id, primaryName : products[0].name, count : products.length, triangleCount : triangles.length / 9, footprint : { lengthMm : bounds.size[0], widthMm : bounds.size[2], heightMm : bounds.size[1] }, bounds };
        this.result = null; this.panel.Refresh ();
        const r = v => Math.round (v * 10) / 10;
        return { ...this.Summary (), message : `Sensed ${products.length} product${products.length === 1 ? '' : 's'}: ${r (bounds.size[0])} × ${r (bounds.size[2])} × ${r (bounds.size[1])} mm (L × W × H).` };
    }
    Bounds (triangles)
    {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < triangles.length; i += 3) { for (let a = 0; a < 3; a++) { min[a] = Math.min (min[a], triangles[i + a]); max[a] = Math.max (max[a], triangles[i + a]); } }
        if (!Number.isFinite (min[0])) { throw new Error ('The selected products have no triangle geometry.'); }
        return { min, max, size : max.map ((v, a) => v - min[a]) };
    }
    Summary () { return this.sensed ? { count : this.sensed.count, objectIds : [...this.sensed.objectIds], primaryId : this.sensed.primaryId, primaryName : this.sensed.primaryName, triangleCount : this.sensed.triangleCount, footprint : { ...this.sensed.footprint }, units : 'mm' } : null; }
    Current ()
    {
        const object = this.pulpId && this.editor.document.objects.find (item => item.id === this.pulpId);
        return object && this.IsPulp (object) ? object : null;
    }
    // Load a selected generated sheet/tray back into the draft and sensed product list without changing the scene.
    LoadSelected ()
    {
        if (this.panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        const object = this.editor.selected; if (!this.IsPulp (object)) { throw new Error ('Select a generated molded pulp sheet or tray.'); }
        const definition = ValidatePulpDefinition (JSON.parse (object.userData[MoldedPulpDataKey])); if (!definition.productIds.length) { throw new Error ('This pulp object was formed over more than ' + MaxStoredProducts + ' products. Select them and sense again.'); }
        const products = this.Products (definition.productIds);
        const triangles = SessionTrianglesMm (this.editor.document, products), bounds = this.Bounds (triangles);
        this.panel.draft = definition.draft; this.pulpId = object.id; this.result = null;
        this.sensed = { objectIds : products.map (p => p.id), primaryId : products[0].id, primaryName : products[0].name, count : products.length, triangleCount : triangles.length / 9, footprint : { lengthMm : bounds.size[0], widthMm : bounds.size[2], heightMm : bounds.size[1] }, bounds };
        this.panel.Refresh (); return { objectId : object.id, stage : definition.stage, draft : { ...definition.draft }, sensed : this.Summary () };
    }
    async Build (stage)
    {
        const panel = this.panel, editor = this.editor;
        if (this.active || panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        if (!this.sensed) { this.Sense (); }
        const target = editor.document, owner = panel.website.auth?.user?.id, draft = { ...panel.draft }, ids = [...this.sensed.objectIds];
        const source = this.Current (), index = source ? target.objects.indexOf (source) : target.objects.length, previous = editor.selected;
        if (!source && target.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const sameSession = () => { if (editor.document !== target || panel.website.auth?.user?.id !== owner || editor.readOnly || panel.website.accountReady === false) { throw new Error ('The account or session changed while forming pulp.'); } };
        const unchanged = () => { sameSession (); if (source && !target.objects.includes (source)) { throw new Error ('The pulp object was removed while forming pulp.'); } };
        this.active = true; editor.busy = true; panel.Refresh (); editor.RefreshButtons?.();
        let object;
        try {
            const module = await this.load (); unchanged ();
            const triangles = SessionTrianglesMm (target, this.Products (ids));
            const plan = stage === 'tray' ? module.PlanTray (triangles, draft) : module.PlanSheet (triangles, draft);
            const { model, position } = MoldedPulpModel (plan, target.model.GetUnit (), PulpTypes[draft.pulpType].roughness);
            object = target.AddImported (model, source?.name || (stage === 'tray' ? module.PulpName (draft) : 'Molded pulp sheet · ' + draft.thicknessMm + ' mm'));
            if (source) { for (const key of ['id', 'visible', 'castShadow', 'receiveShadow']) { object[key] = source[key]; } object.name = stage === 'tray' && source.name.startsWith ('Molded pulp sheet') ? module.PulpName (draft) : source.name; }
            object.position = position; object.rotation = [0, 0, 0]; object.scale = [1, 1, 1]; object.userData = { ...(source?.userData || {}) };
            object.userData[MoldedPulpDataKey] = JSON.stringify (PulpDefinition (draft, stage, ids.length <= MaxStoredProducts ? ids : [])); target.ApplyTransform (object);
            if (source) { target.Remove (object); target.Remove (source); target.Restore (object, index); }
            editor.selected = object; await editor.Render (); sameSession (); /* the source was intentionally replaced above */
            const apply = async forward => {
                if (editor.document !== target) { throw new Error ('This pulp object belongs to another session.'); }
                target.Remove (forward ? source : object);
                if (forward) { target.Restore (object, index); } else if (source) { target.Restore (source, index); }
                this.pulpId = forward ? object.id : source?.id || null;
                editor.selected = forward ? object : previous && target.objects.includes (previous) ? previous : null;
                await editor.Render (); panel.Refresh ();
            };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) });
            this.pulpId = object.id; this.result = { stage, metrics : plan.metrics, checks : plan.checks };
            editor.Status?.(stage === 'tray' ? 'Formed molded pulp tray.' : 'Placed molded pulp sheet under the products.');
            if (stage === 'tray') { await this.Animate (object); }
            const warnings = plan.checks.filter (c => c.severity === 'warning').length;
            return { objectId : object.id, stage, replaced : Boolean (source), units : 'mm', metrics : { ...plan.metrics }, checks : plan.checks.map (c => ({ ...c })), draft, message : (stage === 'tray' ? `Formed tray: ${plan.metrics.pocketCount} pocket${plan.metrics.pocketCount === 1 ? '' : 's'}, depth ${plan.metrics.achievedDepthMm} mm` : `Sheet ${plan.metrics.lengthMm} × ${plan.metrics.widthMm} × ${draft.thicknessMm} mm placed under the products`) + (warnings ? ` · ${warnings} design warning${warnings === 1 ? '' : 's'}.` : '.') };
        } catch (error) {
            if (object && target.objects.includes (object)) { target.Remove (object); if (source && !target.objects.includes (source)) { target.Restore (source, index); } editor.selected = previous && target.objects.includes (previous) ? previous : null; await editor.Render (); }
            throw error;
        } finally { this.active = false; editor.busy = false; editor.RefreshButtons?.(); panel.Refresh (); }
    }
    // Presentation only: the formed tray rises from the flat sheet about its base plane. The committed geometry and
    // object transform are unchanged; reduced-motion preference skips the motion.
    async Animate (object)
    {
        const three = object.threeObject, viewer = this.panel.website.viewer; if (!three || reducedMotion () || typeof requestAnimationFrame !== 'function') { return; }
        const start = performance.now (), duration = 900;
        await new Promise (resolve => {
            const step = now => {
                const t = Math.min (1, (now - start) / duration), eased = 1 - (1 - t) ** 3;
                three.scale.y = object.scale[1] * Math.max (0.02, eased); three.updateMatrixWorld?.(true); viewer.Render?.();
                if (t < 1 && object.threeObject === three) { requestAnimationFrame (step); } else { three.scale.y = object.scale[1]; three.updateMatrixWorld?.(true); viewer.Render?.(); resolve (); }
            };
            requestAnimationFrame (step);
        });
    }
    async SetFormDepth (mm)
    {
        this.panel.Configure ({ formDepthMm : mm });
        const current = this.Current (), stage = current && ValidatePulpDefinition (JSON.parse (current.userData[MoldedPulpDataKey])).stage;
        if (stage === 'tray') { const result = await this.Build ('tray'); return { ...result, formDepthMm : mm, message : 'Form depth ' + mm + ' mm · ' + result.message }; }
        return { formDepthMm : mm, updated : false, message : `Form depth set to ${mm} mm. Form tray pulls the sheet up to this height.` };
    }
    Reset () { this.sensed = null; this.result = null; this.pulpId = null; }
    UnitFactor () { return PulpMillimeters[this.editor.document.model.GetUnit ()] || null; }
}
