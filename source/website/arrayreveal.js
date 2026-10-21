import { Box3, Sphere } from 'three';
import { FoldCameraFrame, CameraBottomInset } from './foldcamera.js';
import { ApplyCameraState } from './sessiontimeline.js';

export class ArrayRevealPlayer
{
    constructor (render, duration, clock = {})
    {
        this.render = render; this.duration = duration; this.state = 'idle'; this.progress = 0; this.elapsed = 0;
        this.now = clock.now || (() => performance.now ()); this.request = clock.request || (callback => requestAnimationFrame (callback)); this.cancel = clock.cancel || (id => cancelAnimationFrame (id));
    }
    Start ()
    {
        if (this.state !== 'idle') { throw new Error ('Array reveal already started.'); }
        this.state = 'playing'; this.last = this.now (); this.completion = new Promise ((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); this.Tick (); return this.completion;
    }
    Tick ()
    {
        if (this.state !== 'playing') { return; }
        try {
            const time = this.now (); this.elapsed += Math.max (0, time - this.last); this.last = time; this.progress = Math.min (1, this.elapsed / (this.duration * 1000)); this.render (this.progress);
            if (this.progress === 1) { this.state = 'completed'; this.resolve ({ completed : true }); } else { this.frame = this.request (() => this.Tick ()); }
        } catch (error) { this.state = 'failed'; this.reject (error); }
    }
    Pause () { if (this.state === 'playing') { this.cancel (this.frame); this.state = 'paused'; } }
    Resume () { if (this.state === 'paused') { this.last = this.now (); this.state = 'playing'; this.Tick (); } }
    Stop () { if (['playing', 'paused'].includes (this.state)) { this.cancel (this.frame); this.state = 'cancelled'; this.resolve ({ completed : false }); } }
    Inspect () { return { state : this.state, progress : this.progress, duration : this.duration }; }
}

export function ArrayRevealSample (index, count, progress)
{
    if (!Number.isInteger (index) || !Number.isInteger (count) || index < 0 || index >= count || count < 1 || !Number.isFinite (progress)) { throw new Error ('Invalid array reveal sample.'); }
    const fraction = count === 1 ? 0 : index / (count - 1);
    const start = 0.08 + 0.8 * Math.pow (fraction, 0.45); const duration = 0.16 - 0.10 * fraction;
    const u = Math.max (0, Math.min (1, (progress - start) / duration));
    // Accelerating fall, then a short ease into exact contact; no bounce/interpenetration.
    const fall = u * u * (3 - 2 * u);
    return { visible : progress >= start, offset : 1 - Math.max (0, Math.min (1, fall)), settled : u === 1, start };
}

export async function RevealArray (editor, source, added, dropHeight, operation)
{
    const viewer = editor.website.viewer; const initial = viewer.GetCamera ().Clone ();
    const records = added.map (object => ({ object, mesh : object.threeObject, matrix : object.threeObject.matrix.clone (), autoUpdate : object.threeObject.matrixAutoUpdate, settled : false }));
    const bounds = new Box3 ().setFromObject (source.threeObject, true);
    for (const record of records) { const visible = record.mesh.visible; record.mesh.visible = true; bounds.union (new Box3 ().setFromObject (record.mesh, true)); record.mesh.visible = visible; }
    const finalSphere = bounds.getBoundingSphere (new Sphere ());
    bounds.max.y += dropHeight; const sphere = bounds.getBoundingSphere (new Sphere ());
    operation.framing = { center : sphere.center.toArray (), radius : sphere.radius };
    const canvas = viewer.renderer?.domElement; let manual = false;
    const takeControl = () => { manual = true; operation.cameraAutoFit = false; };
    for (const event of ['pointerdown', 'wheel', 'touchstart']) { canvas?.addEventListener (event, takeControl, { passive : true }); }
    const controls = document.createElement ('div'); controls.className = 'array_reveal_controls';
    for (const [action, title] of [['pause', 'Pause array'], ['resume', 'Resume array'], ['cancel', 'Cancel array']]) {
        const button = document.createElement ('button'); button.type = 'button'; button.textContent = title; button.addEventListener ('click', () => editor.ArrayControl (action)); controls.appendChild (button);
    }
    editor.status?.parentElement?.appendChild (controls);
    let completed = false;
    try {
        operation.player = new ArrayRevealPlayer (progress => {
            operation.check (); if (operation.cancelled) { throw new Error ('Array creation canceled.'); }
            let settled = 0;
            records.forEach ((record, index) => {
                const sample = ArrayRevealSample (index, records.length, progress);
                if (!record.settled) {
                    record.mesh.visible = sample.visible; record.mesh.matrixAutoUpdate = false; record.mesh.matrix.copy (record.matrix); record.mesh.matrix.elements[13] += sample.offset * dropHeight; record.mesh.updateMatrixWorld (true);
                    if (sample.settled) { record.settled = true; record.mesh.matrix.copy (record.matrix); record.mesh.matrixAutoUpdate = record.autoUpdate; record.mesh.updateMatrixWorld (true); }
                }
                if (record.settled) { settled++; }
            });
            operation.placed = settled + 1;
            if (operation.cameraAutoFit && !manual) {
                const size = viewer.GetImageSize (); const t = Math.max (0, Math.min (1, (progress - .8) / .2)); const settle = t * t * (3 - 2 * t);
                const frame = sphere.clone (); frame.center.lerp (finalSphere.center, settle); frame.radius += (finalSphere.radius - frame.radius) * settle;
                viewer.SetCamera (FoldCameraFrame (initial, frame, frame.radius, progress * 0.15, size.width / size.height, CameraBottomInset (viewer, editor.status)));
            }
            else if (!manual && editor.timeline?.cameraKeyframes?.length) { const timeline = editor.timeline; ApplyCameraState (viewer, timeline.CameraStateAt (timeline.rangeStart + progress * (timeline.rangeEnd - timeline.rangeStart))); }
            else { viewer.Render (); }
            editor.Status ('Building array · ' + (settled + 1) + ' / ' + (added.length + 1) + ' · accelerating');
        }, operation.duration);
        const result = await operation.player.Start (); if (!result.completed) { throw new Error ('Array creation canceled.'); }
        completed = true;
    } finally {
        controls.remove (); for (const event of ['pointerdown', 'wheel', 'touchstart']) { canvas?.removeEventListener (event, takeControl); }
        records.forEach (record => { record.mesh.visible = completed && record.object.visible; record.mesh.matrix.copy (record.matrix); record.mesh.matrixAutoUpdate = record.autoUpdate; record.mesh.updateMatrixWorld (true); });
        if (completed) { editor.website.sceneEffects?.Refresh (); }
    }
}
