import { ValidateTimelineActions } from './timelineactions.js';
import { ValidateTimelineClips } from './timelineclips.js';
import { ValidateMacroAnimation } from './macroshape.js';
import { ArrayRevealTiming } from './arrayreveal.js';
import { ArrayObjectBounds } from './arraylayout.js';
import { Vector3 } from 'three';

// The supported creation and removal commands are represented by timeline visibility;
// unsupported creation and material changes are rejected before execution.
const SupportedSteps = new Set (['object.transform', 'object.visibility', 'object.duplicate', 'object.duplicate_at', 'object.delete', 'selection.transform', 'view.fit', 'view.focus', 'camera.activate', 'camera.fov', 'object.select', 'scene.inspect', 'camera.current.inspect', 'packaging.fefco.animate', 'animation.action.add', 'animation.clip.add', 'object.array']);
const FoldSteps = new Set (['packaging.fefco.animate', 'animation.action.add']);
const ProceduralSteps = new Set ([...FoldSteps, 'animation.clip.add']);

export async function RecordMacroAnimation (editor, registry, macro, stepSeconds = 2)
{
    if (!macro || macro.version !== 1 || !Array.isArray (macro.steps) || !macro.steps.length || macro.steps.length > 100) { throw new Error ('Use a version 1 macro with 1–100 steps.'); }
    if (!Number.isFinite (stepSeconds) || stepSeconds < 0.1 || stepSeconds > 30) { throw new Error ('Use 0.1–30 seconds per step.'); }
    let total = 0;
    const timings = macro.steps.map (step => {
        const animation = ValidateMacroAnimation (step?.animation === undefined ? {} : step.animation);
        if (ProceduralSteps.has (step.command) && step.arguments?.time !== undefined) { throw new Error ('Recorded procedural steps use their sequence position; remove the time argument.'); }
        const duration = animation.duration ?? (step.command === 'object.array' && step.arguments?.animate !== false ? step.arguments?.duration ?? 4 : ProceduralSteps.has (step.command) ? step.arguments?.duration ?? (FoldSteps.has (step.command) ? 6 : stepSeconds) : stepSeconds), pauseAfter = animation.pauseAfter ?? 0;
        if (!Number.isFinite (duration) || duration < 0.1 || duration > 30 || !Number.isFinite (pauseAfter) || pauseAfter < 0 || pauseAfter > 30) { throw new Error ('Use 0.1–30 seconds for duration and 0–30 seconds for pause.'); }
        if (FoldSteps.has (step.command) && duration < 1) { throw new Error ('A recorded fold requires at least 1 second.'); }
        const timing = { id : step.id, start : total, end : total + duration, pauseAfter }; total = timing.end + pauseAfter; return timing;
    });
    if (total > 3600) { throw new Error ('Macro animation cannot exceed one hour.'); }
    const unsupported = [...new Set (macro.steps.map (step => step?.command).filter (id => !SupportedSteps.has (id)))];
    if (unsupported.length) { throw new Error ('Cannot record these macro steps yet: ' + unsupported.join (', ') + '. Other object creation and materials are not supported.'); }
    const document = editor.document, timeline = editor.timeline, owner = editor.website.auth?.user?.id;
    if (!owner || editor.website.accountReady === false || editor.readOnly || editor.busy) { throw new Error ('Use an editable signed-in session.'); }
    if (!document.objects.length || document.objects.length > 100) { throw new Error ('Record a session containing 1–100 objects.'); }
    if (document.objects.some (item => item.player?.state?.playing)) { throw new Error ('Pause embedded animation before recording a macro.'); }
    if (timeline.playing || timeline.cameraKeyframes.length || timeline.actions.length || timeline.embeddedClips.length || document.objects.some (item => item.keyframes?.length || item.visibilityKeys?.length)) { throw new Error ('Start with an empty, stopped timeline so existing animation is not overwritten.'); }
    const objects = [...document.objects], before = timeline.Serialize (), initialVisibility = new Map (), lastVisibility = new Map (), removed = new Set (); let started = false;
    const valid = () => editor.website.auth?.user?.id === owner && editor.website.accountReady !== false && !editor.readOnly && editor.document === document && document.objects.length === objects.length && objects.every ((object, i) => document.objects[i] === object);
    const procedural = async (step, args, invoke, index) => {
        if (step.command === 'scene.inspect' && removed.size) { const scene = await invoke (); return { ...scene, objects : scene.objects.map (item => removed.has (item.id) ? { ...item, retainedForTimeline : true, effectiveVisible : false } : item) }; }
        const target = objects.find (item => item.id === (args.objectId ?? editor.selected?.id));
        const targetsObject = step.command.startsWith ('object.') || ['selection.transform', 'view.focus', 'packaging.fefco.animate', 'animation.action.add', 'animation.clip.add'].includes (step.command);
        if (targetsObject && target && (removed.has (target.id) || (target.userData?._auto3dGroup && objects.some (item => item.userData?._auto3dGroup === target.userData._auto3dGroup && removed.has (item.id))))) { throw new Error ('That object or group was removed earlier in this recording.'); }
        if (step.command === 'object.delete') {
            if (!valid () || editor.busy || !target) { throw new Error ('Select an available object to remove.'); }
            const group = target.userData?._auto3dGroup, selected = objects.filter (item => item === target || (group && item.userData?._auto3dGroup === group));
            for (const object of selected) {
                const keys = object.visibilityKeys ||= [];
                if (!keys.length) { keys.push ({ id : crypto.randomUUID (), time : 0, visible : initialVisibility.get (object) }); }
                keys.push ({ id : crypto.randomUUID (), time : timings[index].end, visible : false }); removed.add (object.id); lastVisibility.set (object, false);
            }
            editor.Select (null); return { deletedId : target.id, objectIds : selected.map (object => object.id), retainedForTimeline : true };
        }
        if (step.command === 'object.duplicate' || step.command === 'object.duplicate_at') {
            if (!valid () || editor.busy || !target || target.visible === false) { throw new Error ('Select a visible existing object to duplicate.'); }
            const group = step.command === 'object.duplicate' && target.userData?._auto3dGroup;
            const count = group ? objects.filter (item => item.userData?._auto3dGroup === group).length : 1;
            if (group && objects.some (item => item.userData?._auto3dGroup === group && item.visible === false)) { throw new Error ('Show all objects in the group before recording a duplicate.'); }
            if (objects.length + count > 100) { throw new Error ('Recording supports up to 100 total scene objects.'); }
            const old = [...objects], result = await invoke ();
            if (editor.website.auth?.user?.id !== owner || editor.website.accountReady === false || editor.readOnly || editor.document !== document || !old.every ((item, i) => document.objects[i] === item)) { throw new Error ('The account or scene changed during duplication.'); }
            const added = document.objects.slice (old.length);
            if (added.length !== count || (step.command === 'object.duplicate' && added[0]?.id !== result.id) || (step.command === 'object.duplicate_at' && (result.objectIds.length !== count || added.some ((item, i) => item.id !== result.objectIds[i])))) { throw new Error ('Unexpected scene changes during duplication.'); }
            for (const object of added) { objects.push (object); initialVisibility.set (object, true); lastVisibility.set (object, true); object.visibilityKeys = [{ id : crypto.randomUUID (), time : 0, visible : false }, { id : crypto.randomUUID (), time : timings[index].end, visible : true }]; }
            return result;
        }
        if (step.command === 'object.array') {
            if (!valid () || editor.busy) { throw new Error ('The account or scene changed during macro recording.'); }
            const counts = [args.width, args.length, args.height];
            if (counts.some (count => !Number.isInteger (count) || count < 1 || count > 20) || objects.length + counts.reduce ((product, count) => product * count, 1) - 1 > 100) { throw new Error ('Recorded arrays support up to 100 total scene objects with integer counts.'); }
            const timing = timings[index], source = objects.find (item => item.id === (args.objectId ?? editor.selected?.id));
            if (!source?.threeObject || source.visible === false) { throw new Error ('Select a visible existing object to array.'); }
            const drop = Math.max (ArrayObjectBounds (source.threeObject).getSize (new Vector3 ()).y * 1.25, .001);
            const old = [...objects], result = await registry.Invoke ('object.array', { ...args, animate : false });
            if (editor.website.auth?.user?.id !== owner || editor.website.accountReady === false || editor.readOnly || editor.document !== document || !old.every ((item, i) => document.objects[i] === item)) { throw new Error ('The account or scene changed during array creation.'); }
            const added = document.objects.slice (old.length);
            if (added.length !== result.objectIds.length || added.some ((item, i) => item.id !== result.objectIds[i])) { throw new Error ('Unexpected scene changes during array creation.'); }
            const easing = editor.website.preferences?.motionEasing || 'smooth';
            for (const [i, object] of added.entries ()) {
                objects.push (object); initialVisibility.set (object, true); lastVisibility.set (object, true);
                const reveal = args.animate !== false, phase = reveal ? ArrayRevealTiming (i, added.length) : null;
                const begin = reveal ? timing.start + (timing.end - timing.start) * phase.start : timing.end;
                object.visibilityKeys = [{ id : crypto.randomUUID (), time : 0, visible : false }, { id : crypto.randomUUID (), time : begin, visible : true }];
                if (reveal) {
                    const end = begin + (timing.end - timing.start) * phase.duration, top = [...object.position]; top[1] += drop;
                    const frame = (time, position) => ({ id : crypto.randomUUID (), time, interpolation : easing === 'linear' ? 'linear' : 'smooth', motionEasing : easing, position : [...position], rotation : [...object.rotation], scale : [...object.scale] });
                    object.keyframes = [frame (0, top), frame (begin, top), frame (end, object.position)];
                }
            }
            return { ...result, recording : { reveal : args.animate !== false, cameraAutoFitRecorded : false, start : timing.start, end : timing.end } };
        }
        if (!ProceduralSteps.has (step.command)) { return invoke (); }
        if (!valid () || editor.busy) { throw new Error ('The account or scene changed during macro recording.'); }
        const timing = timings[index], objectId = args.objectId ?? editor.selected?.id, object = objects.find (item => item.id === objectId);
        if (FoldSteps.has (step.command)) {
            if (!object?.userData?._auto3dFefco) { throw new Error ('Select a generated box for the fold action.'); }
            if (editor.packaging.presentation.manual?.has (objectId)) { throw new Error ('Finish the manual fold adjustment before recording.'); }
            const action = { id : crypto.randomUUID (), objectId, type : 'foldUnfold', time : timing.start, duration : timing.end - timing.start, direction : args.direction ?? 'toggle' };
            const previous = timeline.actions, next = ValidateTimelineActions ([...previous, action]);
            await editor.packaging.presentation.Prepare (object);
            if (!valid () || editor.busy || timeline.actions !== previous) { throw new Error ('The workspace changed while preparing the fold action.'); }
            timeline.actions = next; return { action : { ...action } };
        }
        const player = object?.player;
        if (!player || player.state.playing || !Number.isInteger (args.clip) || !player.clips[args.clip]) { throw new Error ('Select an object with a paused embedded clip.'); }
        const first = timeline.embeddedClips.find (item => item.objectId === objectId);
        const action = { id : crypto.randomUUID (), objectId, clip : args.clip, time : timing.start, duration : timing.end - timing.start, speed : args.speed ?? 1, loop : args.loop ?? false, baseClip : first?.baseClip ?? player.state.clip, baseTime : first?.baseTime ?? player.state.time };
        timeline.embeddedClips = ValidateTimelineClips ([...timeline.embeddedClips, action]); return { action : { ...action } };
    };
    const capture = time => { if (!valid ()) { throw new Error ('The account or scene changed during macro recording.'); } timeline.time = time; timeline.CaptureScene (); for (const object of objects) { if (removed.has (object.id)) { continue; } const visible = object.visible !== false; if (time === 0) { initialVisibility.set (object, visible); lastVisibility.set (object, visible); } else if (lastVisibility.get (object) !== visible) { const keys = object.visibilityKeys ||= []; if (!keys.length) { keys.push ({ id : crypto.randomUUID (), time : 0, visible : initialVisibility.get (object) }); } keys.push ({ id : crypto.randomUUID (), time, visible }); lastVisibility.set (object, visible); } } timeline.ApplyVisibility (); timeline.CaptureCamera (); };
    const clear = () => { for (const action of timeline.embeddedClips) { const player = objects.find (item => item.id === action.objectId)?.player; if (player) { player.Choose (action.baseClip, action.baseTime, false); } } for (const object of objects) { object.keyframes = []; object.visibilityKeys = []; } timeline.cameraKeyframes = []; timeline.actions = []; timeline.Load (before); timeline.ApplyVisibility (); editor.packaging?.presentation?.Apply?.(timeline.time, false); editor.MarkDirty (); editor.AnimationUI (); };
    let result;
    try {
        result = await registry.InvokeMacro (macro, { start : () => { started = true; timeline.duration = Math.max (before.duration, total); capture (0); }, invoke : procedural, step : (_step, _result, index) => { const timing = timings[index - 1]; capture (timing.end); if (timing.pauseAfter) { capture (timing.end + timing.pauseAfter); } } });
        if (!result.ok) { if (started && valid ()) { clear (); } return { ...result, recorded : false }; }
        if (!valid ()) { throw new Error ('The account or scene changed during macro recording.'); }
        const end = total; timeline.SetRange (0, end); timeline.time = end;
        const after = timeline.Serialize (), saved = objects.map (item => ({ keyframes : structuredClone (item.keyframes), visibilityKeys : structuredClone (item.visibilityKeys || []) }));
        const apply = forward => { if (editor.document !== document || !objects.every (item => document.objects.includes (item))) { throw new Error ('The recorded scene is no longer available.'); } if (!forward) { for (const action of after.embeddedClips) { const player = objects.find (item => item.id === action.objectId)?.player; if (player) { player.Choose (action.baseClip, action.baseTime, false); } } } for (let i = 0; i < objects.length; i++) { objects[i].keyframes = forward ? structuredClone (saved[i].keyframes) : []; objects[i].visibilityKeys = forward ? structuredClone (saved[i].visibilityKeys) : []; } timeline.Load (forward ? after : before); timeline.Seek (timeline.time); editor.MarkDirty (); editor.AnimationUI (); };
        if (timeline.actions.length || timeline.embeddedClips.length) { timeline.Seek (end); }
        // One Undo step: fold the macro's own history entry (its scene changes) into the recording entry.
        const run = registry.lastRun, steps = run?.history === editor.history && run.entry && editor.history.undo.at (-1) === run.entry ? editor.history.undo.pop () : null;
        editor.history.Push ({ macroRecording : true, undo : async () => { apply (false); if (steps) { await steps.undo (); } }, redo : async () => { if (steps) { await steps.redo (); } apply (true); } }); editor.MarkDirty (); editor.AnimationUI ();
        const warnings = []; if (macro.steps.some (step => step.command === 'object.array')) { warnings.push ('Array copies are created immediately; automatic camera fitting is not recorded.'); } if (removed.size) { warnings.push ('Removed objects remain in the session and are hidden by timeline visibility keys.'); }
        return { recorded : true, duration : end, steps : result.completed.length, objects : objects.length, warnings, completed : result.completed.map (({ id, command, result : stepResult }, index) => ({ id, command, ...timings[index], ...(['object.array', 'object.duplicate_at', 'object.delete'].includes (command) ? { objectIds : [...stepResult.objectIds] } : command === 'object.duplicate' ? { objectIds : [stepResult.id] } : {}) })) };
    } catch (error) { if (started && valid ()) { clear (); } throw error; }
}
