import { ArrayRevealTiming } from './arrayreveal.js';

// Build native transform and visibility tracks for existing copies; nothing is created or removed.
export function ScheduleArrayReveal (editor, { objectIds, time = editor.timeline.time, duration = 4, dropHeight = 1 } = {})
{
    const timeline = editor.timeline, document = editor.document;
    if (editor.readOnly || editor.busy || timeline.playing || !editor.website.auth?.user || editor.website.accountReady === false) { throw new Error ('Pause playback and choose an editable signed-in timeline.'); }
    if (!Array.isArray (objectIds) || !objectIds.length || objectIds.length > 999 || new Set (objectIds).size !== objectIds.length || !Number.isFinite (time) || time < 0 || !Number.isFinite (duration) || duration < 1 || duration > 15 || time + duration > 3600 || !Number.isFinite (dropHeight) || dropHeight <= 0 || dropHeight > 1000000) { throw new Error ('Choose 1–999 objects, a 1–15 second duration and a positive drop distance.'); }
    const objects = objectIds.map (id => document.objects.find (item => item.id === id));
    if (objects.some (item => !item || !item.threeObject || item.visible === false || item.keyframes?.length || item.visibilityKeys?.length || item.userData?._auto3dFoldPreview !== undefined || editor.packaging?.presentation?.records?.get (item.id)?.preview?.visible || timeline.actions.some (action => action.objectId === item.id))) { throw new Error ('Use visible objects without existing motion, visibility or fold tracks.'); }
    const before = timeline.Serialize (), positions = objects.map (item => [...item.position]), tracks = objects.map ((object, index) => {
        const timing = ArrayRevealTiming (index, objects.length), begin = time + duration * timing.start, end = begin + duration * timing.duration;
        const top = [...object.position]; top[1] += dropHeight; const frame = (at, position) => ({ id : crypto.randomUUID (), time : at, interpolation : 'smooth', position : [...position], rotation : [...object.rotation], scale : [...object.scale] });
        return { motion : [frame (0, top), frame (begin, top), frame (end, object.position)], visibility : [{ id : crypto.randomUUID (), time : 0, visible : false }, { id : crypto.randomUUID (), time : begin, visible : true }] };
    });
    const apply = forward => {
        if (editor.document !== document || !objects.every (item => document.objects.includes (item))) { throw new Error ('The array objects are no longer in this session.'); }
        for (let i = 0; i < objects.length; i++) { objects[i].keyframes = forward ? structuredClone (tracks[i].motion) : []; objects[i].visibilityKeys = forward ? structuredClone (tracks[i].visibility) : []; if (!forward) { objects[i].position = [...positions[i]]; document.ApplyTransform (objects[i]); } }
        timeline.Load (before); if (forward) { timeline.ExtendDurationForKeys (); if (before.rangeEnd === before.duration) { timeline.rangeEnd = timeline.duration; } }
        timeline.Seek (timeline.time); editor.MarkDirty (); editor.AnimationUI ();
    };
    try { apply (true); } catch (error) { for (let i = 0; i < objects.length; i++) { objects[i].keyframes = []; objects[i].visibilityKeys = []; objects[i].position = [...positions[i]]; document.ApplyTransform (objects[i]); } timeline.Load (before); timeline.ApplyVisibility (); throw error; } editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); return { objectIds : [...objectIds], start : time, duration, dropHeight, objects : objects.length };
}
