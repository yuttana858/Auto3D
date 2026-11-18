// Deliberately narrow: commands that create, delete or alter materials cannot yet be
// represented by native transform/camera tracks and are rejected before execution.
const SupportedSteps = new Set (['object.transform', 'object.visibility', 'selection.transform', 'view.fit', 'view.focus', 'camera.activate', 'camera.fov', 'object.select', 'scene.inspect', 'camera.current.inspect']);

export async function RecordMacroAnimation (editor, registry, macro, stepSeconds = 2)
{
    if (!macro || macro.version !== 1 || !Array.isArray (macro.steps) || !macro.steps.length || macro.steps.length > 100) { throw new Error ('Use a version 1 macro with 1–100 steps.'); }
    if (!Number.isFinite (stepSeconds) || stepSeconds < 0.1 || stepSeconds > 30) { throw new Error ('Use 0.1–30 seconds per step.'); }
    let total = 0;
    const timings = macro.steps.map (step => {
        const animation = step?.animation ?? {};
        if (!animation || typeof animation !== 'object' || Array.isArray (animation) || Object.keys (animation).some (key => !['duration', 'pauseAfter'].includes (key))) { throw new Error ('Animation timing supports duration and pauseAfter only.'); }
        const duration = animation.duration ?? stepSeconds, pauseAfter = animation.pauseAfter ?? 0;
        if (!Number.isFinite (duration) || duration < 0.1 || duration > 30 || !Number.isFinite (pauseAfter) || pauseAfter < 0 || pauseAfter > 30) { throw new Error ('Use 0.1–30 seconds for duration and 0–30 seconds for pause.'); }
        const timing = { id : step.id, start : total, end : total + duration, pauseAfter }; total = timing.end + pauseAfter; return timing;
    });
    if (total > 3600) { throw new Error ('Macro animation cannot exceed one hour.'); }
    const unsupported = [...new Set (macro.steps.map (step => step?.command).filter (id => !SupportedSteps.has (id)))];
    if (unsupported.length) { throw new Error ('Cannot record these macro steps yet: ' + unsupported.join (', ') + '. Object creation, deletion, materials and procedural animation are not supported.'); }
    const document = editor.document, timeline = editor.timeline, owner = editor.website.auth?.user?.id;
    if (!owner || editor.website.accountReady === false || editor.readOnly || editor.busy) { throw new Error ('Use an editable signed-in session.'); }
    if (!document.objects.length || document.objects.length > 100) { throw new Error ('Record a session containing 1–100 objects.'); }
    if (document.objects.some (item => item.player?.state?.playing)) { throw new Error ('Pause embedded animation before recording a macro.'); }
    if (timeline.playing || timeline.cameraKeyframes.length || timeline.actions.length || timeline.embeddedClips.length || document.objects.some (item => item.keyframes?.length || item.visibilityKeys?.length)) { throw new Error ('Start with an empty, stopped timeline so existing animation is not overwritten.'); }
    const objects = [...document.objects], before = timeline.Serialize (), initialVisibility = new Map (), lastVisibility = new Map (); let started = false;
    const valid = () => editor.website.auth?.user?.id === owner && editor.website.accountReady !== false && !editor.readOnly && editor.document === document && document.objects.length === objects.length && objects.every ((object, i) => document.objects[i] === object);
    const capture = time => { if (!valid ()) { throw new Error ('The account or scene changed during macro recording.'); } timeline.time = time; timeline.CaptureScene (); for (const object of objects) { const visible = object.visible !== false; if (time === 0) { initialVisibility.set (object, visible); lastVisibility.set (object, visible); } else if (lastVisibility.get (object) !== visible) { const keys = object.visibilityKeys ||= []; if (!keys.length) { keys.push ({ id : crypto.randomUUID (), time : 0, visible : initialVisibility.get (object) }); } keys.push ({ id : crypto.randomUUID (), time, visible }); lastVisibility.set (object, visible); } } timeline.ApplyVisibility (); timeline.CaptureCamera (); };
    const clear = () => { for (const object of objects) { object.keyframes = []; object.visibilityKeys = []; } timeline.cameraKeyframes = []; timeline.actions = []; timeline.Load (before); timeline.ApplyVisibility (); editor.MarkDirty (); editor.AnimationUI (); };
    let result;
    try {
        result = await registry.InvokeMacro (macro, { start : () => { started = true; timeline.duration = Math.max (before.duration, total); capture (0); }, step : (_step, _result, index) => { const timing = timings[index - 1]; capture (timing.end); if (timing.pauseAfter) { capture (timing.end + timing.pauseAfter); } } });
        if (!result.ok) { if (started && valid ()) { clear (); } return { ...result, recorded : false }; }
        if (!valid ()) { throw new Error ('The account or scene changed during macro recording.'); }
        const end = total; timeline.SetRange (0, end); timeline.time = end;
        const after = timeline.Serialize (), saved = objects.map (item => ({ keyframes : structuredClone (item.keyframes), visibilityKeys : structuredClone (item.visibilityKeys || []) }));
        const apply = forward => { if (editor.document !== document || !objects.every (item => document.objects.includes (item))) { throw new Error ('The recorded scene is no longer available.'); } for (let i = 0; i < objects.length; i++) { objects[i].keyframes = forward ? structuredClone (saved[i].keyframes) : []; objects[i].visibilityKeys = forward ? structuredClone (saved[i].visibilityKeys) : []; } timeline.Load (forward ? after : before); timeline.Seek (timeline.time); editor.MarkDirty (); editor.AnimationUI (); };
        editor.history.Push ({ undo : () => apply (false), redo : () => apply (true) }); editor.MarkDirty (); editor.AnimationUI ();
        return { recorded : true, duration : end, steps : result.completed.length, objects : objects.length, completed : result.completed.map (({ id, command }, index) => ({ id, command, ...timings[index] })) };
    } catch (error) { if (started && valid ()) { clear (); } throw error; }
}
