import { Box3 } from 'three';
import { CreatePackSequence, SamplePackSequence } from '../../modules/packaging/src/packsequence.js';

// Plays an Auto Pack assembly sequence on scene objects: each object keeps its saved placement (the packed
// result) and is drawn at that placement plus the planned offset, so cancelling or finishing only has to
// restore the saved transforms.
export class PackSequencePlayback
{
    constructor (editor, input, objects, factor)
    {
        this.editor = editor; this.factor = factor; this.objects = objects; this.progress = 0;
        this.plan = CreatePackSequence (input); this.sample = SamplePackSequence (this.plan, 0);
    }
    Fold (progress) { this.sample = SamplePackSequence (this.plan, progress); this.progress = this.sample.progress; return this.sample.fold; }
    Stage () { return this.sample.label; }
    // Draw every product and piece at its saved placement plus the sampled offset (millimetres → model units).
    Frame (progress = this.progress)
    {
        if (progress !== this.progress) { this.Fold (progress); }
        for (const state of this.sample.objects) {
            const object = this.objects.get (state.id), mesh = object?.threeObject; if (!mesh) { continue; }
            mesh.position.set (object.position[0] + state.offset[0] / this.factor, object.position[1] + state.offset[1] / this.factor, object.position[2] + state.offset[2] / this.factor);
            mesh.visible = object.visible !== false && state.visible; mesh.updateMatrixWorld (true);
        }
    }
    // Everything the camera should keep in view: final placements and the entry height above the carton.
    Bounds ()
    {
        const box = new Box3 ();
        for (const object of this.objects.values ()) { if (object.threeObject) { const mesh = object.threeObject, saved = mesh.position.clone (); mesh.position.fromArray (object.position); mesh.updateMatrixWorld (true); box.union (new Box3 ().setFromObject (mesh, true)); mesh.position.copy (saved); mesh.updateMatrixWorld (true); } }
        if (!box.isEmpty ()) { box.max.y = Math.max (box.max.y, this.plan.entryMm / this.factor + (box.max.y - box.min.y) * 0.25); }
        return box;
    }
    // Back to the saved packed placements, all visible.
    Reset ()
    {
        for (const object of this.objects.values ()) { const mesh = object.threeObject; if (!mesh) { continue; } mesh.position.fromArray (object.position); mesh.visible = object.visible !== false; mesh.updateMatrixWorld (true); }
    }
    Inspect () { return { progress : this.progress, stage : this.sample.stage, label : this.sample.label, fold : this.sample.fold, stages : this.plan.stages.map (s => ({ name : s.name, start : s.start, end : s.end })), entryMm : this.plan.entryMm, order : this.plan.tracks.filter (t => t.kind === 'product').sort ((a, b) => a.order - b.order).map (t => t.id) }; }
}
