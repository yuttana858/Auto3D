import { CreateAutoPackPlan } from '../../modules/packaging/src/autopackplan.js';
import { LoadPackagingModule, PackagingModel, PackagingUnitMM } from './packagingadapter.js';
import { AutoPackDefinition } from './autopackfold.js';

// Measure canonical, transformed geometry in doubles; never round the fitting dimensions for display.
export class AutoPackWorkspace
{
    constructor (packaging) { this.packaging = packaging; this.editor = packaging.editor; }
    Measure ()
    {
        const editor = this.editor, object = editor.selected, document = editor.document;
        if (!object || !document.objects.includes (object) || object.visible === false) { throw new Error ('Select one visible product to pack.'); }
        if (editor.SelectedObjects && editor.SelectedObjects ().length !== 1) { throw new Error ('Select exactly one product to pack.'); }
        if (object.userData?._auto3dFefco) { throw new Error ('Select the product, rather than its carton.'); }
        if (object.animationAsset || object.keyframes?.length || object.hiddenParts?.length) { throw new Error ('Auto Pack requires a complete static model. Remove animation or hidden parts before fitting.'); }
        const factor = PackagingUnitMM[document.model.GetUnit ()]; if (!factor) { throw new Error ('Set known scene units before using Auto Pack.'); }
        let triangles = 0; object.node.EnumerateMeshIndices (index => { triangles += document.model.GetMesh (index).TriangleCount (); });
        if (triangles > 2000000) { throw new Error ('Simplify the product below 2,000,000 triangles before fitting.'); }
        document.ApplyTransform (object);
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; let count = 0;
        document.CompactModel ([object]).EnumerateTriangleVertices ((...points) => {
            if (++count > 2000000) { throw new Error ('Simplify the product below 2,000,000 triangles before fitting.'); }
            for (const point of points) { [point.x, point.y, point.z].forEach ((value, axis) => { const mm = value * factor; if (!Number.isFinite (mm)) { throw new Error ('Product geometry has invalid coordinates.'); } min[axis] = Math.min (min[axis], mm); max[axis] = Math.max (max[axis], mm); }); }
        });
        const size = max.map ((value, axis) => value - min[axis]);
        if (!count || size.some (v => !Number.isFinite (v) || v <= 0)) { throw new Error ('Select a solid product with three nonzero bounding dimensions.'); }
        const thickness = this.packaging.generationBoard?.caliperMm ?? this.packaging.FefcoInspect ().thickness;
        let plan, reason; try { plan = CreateAutoPackPlan ({ size, thickness, clearanceMm : .0254 }); } catch (error) { reason = error.message; }
        return { object, document, factor, bounds : { min, max }, size, plan, reason, origin : [(min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2] };
    }
    Inspect ()
    {
        try {
            const carton = this.editor.selected, saved = AutoPackDefinition (carton);
            if (saved) {
                const parameters = JSON.parse (carton.userData._auto3dFefco), p = CreateAutoPackPlan ({ size : saved.size, thickness : parameters.thickness, clearanceMm : saved.clearanceMm });
                const product = this.editor.document.objects.find (item => item.id === saved.productId);
                return { available : false, fitted : true, reason : 'Saved fit dimensions. Use Fold/Unfold carton to replay; select the product to create a new fit.', objectId : saved.productId, objectName : (product?.name || 'Packed product') + ' · saved fit', units : 'mm', productMm : { ...p.productMm }, insideMm : { ...p.insideMm }, usableInsideMm : { ...p.usableInsideMm }, glueTabAllowanceMm : p.glueTabAllowanceMm, clearanceMm : saved.clearanceMm, thicknessMm : parameters.thickness };
            }
            const m = this.Measure (), p = m.plan;
            if (!p) { return { available : false, reason : m.reason, objectId : m.object.id, objectName : m.object.name, units : 'mm', productMm : { width : m.size[0], length : m.size[2], height : m.size[1] } }; }
            return { available : true, objectId : m.object.id, objectName : m.object.name, units : 'mm', productMm : { width : m.size[0], length : m.size[2], height : m.size[1] }, insideMm : { ...p.insideMm }, usableInsideMm : { ...p.usableInsideMm }, glueTabAllowanceMm : p.glueTabAllowanceMm, clearanceMm : .0254, thicknessMm : p.parameters.thickness, boardName : this.packaging.generationBoard?.name || 'Current packaging caliper' };
        } catch (error) { return { available : false, reason : error.message }; }
    }
    async Generate ({ duration = 8 } = {})
    {
        this.packaging.Editable ();
        if (!Number.isFinite (duration) || duration < 1 || duration > 30) { throw new Error ('Animation duration must be 1–30 seconds.'); }
        const editor = this.editor, m = this.Measure (), target = m.document, previous = m.object, owner = editor.website.auth.user.id;
        if (!m.plan) { throw new Error (m.reason); }
        if (target.objects.length >= 1000) { throw new Error ('Session has reached the 1000 object limit.'); }
        const transform = JSON.stringify ([previous.position, previous.rotation, previous.scale]);
        const unchanged = () => { if (editor.document !== target || editor.website.auth?.user?.id !== owner || editor.website.accountReady === false || editor.readOnly || !target.objects.includes (previous) || editor.selected !== previous || transform !== JSON.stringify ([previous.position, previous.rotation, previous.scale])) { throw new Error ('The product or session changed while preparing Auto Pack.'); } };
        let object; const before = target.packaging;
        const preparing = { source : previous, action : 'auto pack', stage : 'checking fit' }; this.packaging.foldOperation = preparing;
        editor.busy = true; editor.RefreshButtons?.();
        try {
            const module = await LoadPackagingModule (); unchanged ();
            const rig = module.CreateAutoPackRig (m.plan);
            const report = await module.InspectAutoPackFold (rig, async progress => { unchanged (); editor.Status?.('Auto Pack · checking clearance · ' + Math.round (progress * 100) + '%'); await new Promise (resolve => setTimeout (resolve, 0)); });
            unchanged (); if (!report.clear) { throw new Error ('This product and board cannot be packed without intersections. Choose a thinner board or another product.'); }
            const data = module.AutoPackFrame (rig, 0), model = PackagingModel (data, target.model.GetUnit ());
            object = target.AddImported (model, 'Auto Pack · ' + previous.name); object.source = 'Auto Pack · FEFCO 0201'; object.packagingProfile = data.profile;
            object.position = m.origin.map (v => v / m.factor); object.rotation = [0, 0, 0]; object.scale = [1, 1, 1];
            object.userData = { _auto3dFefco : JSON.stringify (data.parameters), _auto3dPackagingState : 'flat', _auto3dAutoPack : JSON.stringify ({ version : 1, size : m.size, clearanceMm : .0254, productId : previous.id, productBounds : m.bounds, origin : m.origin }) };
            target.ApplyTransform (object); target.packaging = data.profile; editor.selected = object; await editor.Render (true); editor.busy = true;
            if (editor.document !== target || editor.website.auth?.user?.id !== owner || editor.website.accountReady === false || editor.readOnly) { throw new Error ('The session changed during Auto Pack.'); }
            const index = target.objects.indexOf (object);
            const apply = async add => { if (editor.document !== target) { throw new Error ('This Auto Pack belongs to another session.'); } if (add) { target.Restore (object, index); target.packaging = data.profile; editor.selected = object; } else { target.Remove (object); target.packaging = before; editor.selected = target.objects.includes (previous) ? previous : null; } await editor.Render (); editor.website.packagingPanel?.Refresh (); };
            editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); editor.MarkDirty?.();
        } catch (error) {
            if (object) { target.Remove (object); target.packaging = before; if (editor.document === target) { editor.selected = previous; await editor.Render (); } }
            throw error;
        } finally { if (this.packaging.foldOperation === preparing) { this.packaging.foldOperation = null; } editor.busy = false; editor.RefreshButtons?.(); editor.website.packagingPanel?.Refresh (); }
        const result = await this.packaging.AnimateFold (object.id, duration);
        return { ...result, productId : previous.id, clearanceMm : .0254, units : 'mm', message : 'Auto Pack · folding RSC around the product. Cancel restores the flat carton; Undo removes it.' };
    }
}
