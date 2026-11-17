import { PackagingUnitMM } from './packagingadapter.js';

export const AutoPackDataKey = '_auto3dAutoPack';
export function AutoPackDefinition (object)
{
    const raw = object?.userData?.[AutoPackDataKey]; if (raw === undefined) { return null; }
    let value; try { value = JSON.parse (raw); } catch { throw new Error ('Invalid Auto Pack metadata. Generate Auto Pack again.'); }
    if (!value || value.version !== 1 || !Array.isArray (value.size) || value.size.length !== 3 || value.size.some (v => !Number.isFinite (v) || v <= 0) || !Number.isFinite (value.clearanceMm) || value.clearanceMm < .0254 || typeof value.productId !== 'string' || (value.productIds !== undefined && (!Array.isArray (value.productIds) || !value.productIds.length || value.productIds.some (id => typeof id !== 'string'))) || !Array.isArray (value.origin) || value.origin.length !== 3 || value.origin.some (v => !Number.isFinite (v))) { throw new Error ('Invalid Auto Pack metadata. Generate Auto Pack again.'); }
    return value;
}
// Earlier cartons packed one product; group packs list every product.
export const AutoPackProducts = (document, data) => (data.productIds || [data.productId]).map (id => document.objects.find (o => o.id === id));
export function AssertAutoPackPlacement (document, object)
{
    const data = AutoPackDefinition (object); if (!data) { return; }
    const factor = PackagingUnitMM[document.model.GetUnit ()]; if (!factor) { throw new Error ('Auto Pack requires known scene units.'); }
    if (object.rotation.some (v => Math.abs (v) > 1e-8) || object.scale.some (v => Math.abs (v - 1) > 1e-8) || object.position.some ((v, i) => Math.abs (v * factor - data.origin[i]) > 1e-5)) { throw new Error ('The Auto Pack carton moved or scaled. Generate Auto Pack again before folding.'); }
    const products = AutoPackProducts (document, data);
    if (products.some (product => !product || product.animationAsset || product.keyframes?.length)) { throw new Error ('Select a stationary product and generate Auto Pack again before folding.'); }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    products.forEach (product => document.ApplyTransform (product));
    document.CompactModel (products).EnumerateTriangleVertices ((...points) => { for (const v of points) { [v.x, v.y, v.z].forEach ((n, i) => { min[i] = Math.min (min[i], n * factor); max[i] = Math.max (max[i], n * factor); }); } });
    const expectedMin = [data.origin[0] - data.size[0] / 2, data.origin[1], data.origin[2] - data.size[2] / 2];
    if (min.some ((v, i) => !Number.isFinite (v) || Math.abs (v - expectedMin[i]) > 1e-5 || Math.abs (max[i] - v - data.size[i]) > 1e-5)) { throw new Error ('The packed product changed. Generate Auto Pack again before folding.'); }
}
// A full double-precision bounds check starts each motion. Cheap identity and
// transform checks on yielded audit steps and frames catch edits without scanning
// a large product mesh on every animation frame.
export function AutoPackMotionGuard (document, object)
{
    AssertAutoPackPlacement (document, object);
    const data = AutoPackDefinition (object); if (!data) { return () => {}; }
    const products = AutoPackProducts (document, data);
    const signature = item => JSON.stringify ([item.position, item.rotation, item.scale, item.animationAsset ? true : false, item.keyframes || []]);
    const productState = products.map (signature).join ('|'), cartonState = signature (object), metadata = object.userData[AutoPackDataKey];
    return () => {
        if (products.some (product => !document.objects.includes (product)) || products.map (signature).join ('|') !== productState || signature (object) !== cartonState || object.userData[AutoPackDataKey] !== metadata) { throw new Error ('The product or fitted carton changed during folding. Generate Auto Pack again.'); }
    };
}
export function GuardAutoPackGeometryEdit (object)
{
    if (object?.userData?.[AutoPackDataKey] !== undefined) { throw new Error ('This carton is fitted by Auto Pack. Change the product or generation board, then generate Auto Pack again.'); }
}
export function PackagingFoldRig (module, object, parameters, profile)
{
    const data = AutoPackDefinition (object); if (!data) { return module.CreateFefcoFoldRig (parameters, profile); }
    const plan = module.CreateAutoPackPlan ({ size : data.size, thickness : parameters.thickness, clearanceMm : data.clearanceMm });
    if (Object.keys (plan.parameters).some (key => key !== 'closure' && parameters[key] !== plan.parameters[key])) { throw new Error ('The Auto Pack carton dimensions changed. Generate Auto Pack again.'); }
    const rig = module.CreateAutoPackRig (plan, profile); rig.hostAutoPack = true; return rig;
}
export const PackagingFoldPose = (module, rig, progress) => rig.hostAutoPack ? module.AutoPackFoldPose (rig, progress) : module.FefcoFoldPose (rig, progress);
export const InspectPackagingFold = (module, rig, progress) => rig.hostAutoPack ? module.InspectAutoPackFold (rig, progress) : module.InspectFefcoFold (rig, progress);
export function PackagingFoldFrame (module, rig, parameters, profile, flat)
{
    return rig.hostAutoPack ? { ...module.AutoPackFoldFrame (rig, flat ? 0 : 1), parameters } : flat ? module.UnfoldFefco (parameters, profile) : module.CreateFefcoBox (parameters, profile);
}
