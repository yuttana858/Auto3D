import { Unit } from '../engine/model/unit.js';
import { RGBColor } from '../engine/model/color.js';
import { ImporterGltf } from '../engine/import/importergltf.js';
import { CadError } from './cadconversioncontract.js';

const millimeters = new Map ([[Unit.Millimeter, 1], [Unit.Centimeter, 10], [Unit.Meter, 1000], [Unit.Inch, 25.4], [Unit.Foot, 304.8]]);
export function ParseConvertedGlb (buffer)
{
    return new Promise ((resolve, reject) => {
        const importer = new ImporterGltf ();
        importer.Import ('model.glb', 'glb', buffer, {
            getDefaultMaterialColor : () => new RGBColor (180, 185, 195), getDefaultLineMaterialColor : () => new RGBColor (80, 85, 95), getFileBuffer : () => null,
            onSuccess : () => { const model = importer.GetModel (); model.SetUnit (Unit.Meter); resolve ({ model, upVector : importer.GetUpDirection () }); },
            onError : () => reject (CadError ('validation_failed')), onComplete : () => importer.Clear ()
        });
    });
}
export async function AddConvertedModel (editor, result, job, assertCurrent)
{
    assertCurrent ();
    const target = editor.document, previous = editor.selected, selection = new Set (editor.selectedIds || []);
    const before = { meshes : target.model.meshes.length, materials : target.model.materials.length, unit : target.model.GetUnit (), index : target.objects.length };
    if (before.index >= 1000) { throw CadError ('too_large'); }
    if (before.index && !millimeters.has (before.unit)) { throw CadError ('unknown_units'); }
    let added;
    try {
        result.model.SetUnit (Unit.Meter);
        added = target.AddImported (result.model, job.source.name.replace (/\.[^.]+$/, ''), result.upVector);
        const unit = before.index ? before.unit : Unit.Meter;
        const scale = 1000 / millimeters.get (unit);
        added.unit = unit; added.scale = [scale, scale, scale]; target.ApplyTransform (added);
        added.userData.cadConversion = JSON.stringify ({ jobId : job.id, sourceSha256 : job.source.sha256, sourceUnits : job.source.unit || 'embedded', producer : 'cloud-3d-studio', version : job.summary.producerVersion, outputUnits : 'm' });
        editor.selected = added; editor.selectedIds = new Set ([added.id]);
        await editor.Render (true, assertCurrent); assertCurrent ();
        editor.history.Push ({
            undo : async () => { target.Remove (added); if (!target.objects.length) { target.model.SetUnit (before.unit); } editor.selected = previous; editor.selectedIds = new Set (selection); await editor.Render (); },
            redo : async () => { if (!target.objects.length) { target.model.SetUnit (unit); } target.Restore (added, before.index); editor.selected = added; editor.selectedIds = new Set ([added.id]); await editor.Render (); }
        });
        editor.Status ('Added converted CAD · STEP/STL in mm · GLB interpreted in meters · Undo available');
        return { objectId : added.id, jobId : job.id, sceneUnit : unit, scale, dimensionsMm : job.summary.dimensionsMm };
    } catch (error) {
        if (added) { target.Remove (added); }
        target.model.meshes.length = before.meshes; target.model.materials.length = before.materials; target.model.SetUnit (before.unit);
        if (editor.document === target) { editor.selected = previous; editor.selectedIds = selection; try { assertCurrent (); await editor.Render (); } catch { /* Preserve the import failure; never render an obsolete account/session. */ } }
        throw error;
    }
}
