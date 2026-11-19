// Deliberately narrow: commands that create, delete or alter materials cannot yet be
// represented by native transform/camera tracks and are rejected before execution.
const SupportedSteps = new Set (['object.transform', 'selection.transform', 'view.fit', 'view.focus', 'camera.activate', 'camera.fov', 'object.select', 'scene.inspect', 'camera.current.inspect']);

export async function RecordMacroAnimation (editor, registry, macro, stepSeconds = 2)
{
    if (!macro || macro.version !== 1 || !Array.isArray (macro.steps) || !macro.steps.length || macro.steps.length > 100) { throw new Error ('Use a version 1 macro with 1–100 steps.'); }
    if (!Number.isFinite (stepSeconds) || stepSeconds < 0.1 || stepSeconds > 30 || macro.steps.length * stepSeconds > 3600) { throw new Error ('Use 0.1–30 seconds per step, up to one hour total.'); }
    const unsupported = [...new Set (macro.steps.map (step => step?.command).filter (id => !SupportedSteps.has (id)))];
    if (unsupported.length) { throw new Error ('Cannot record these macro steps yet: ' + unsupported.join (', ') + '. Object creation, deletion, materials and procedural animation are not supported.'); }
    const document = editor.document, timeline = editor.timeline, owner = editor.website.auth?.user?.id;
    if (!owner || editor.website.accountReady === false || editor.readOnly || editor.busy) { throw new Error ('Use an editable signed-in session.'); }
    if (!document.objects.length || document.objects.length > 100) { throw new Error ('Record a session containing 1–100 objects.'); }
    if (document.objects.some (item => item.player?.state?.playing)) { throw new Error ('Pause embedded animation before recording a macro.'); }
    if (timeline.playing || timeline.cameraKeyframes.length || timeline.actions.length || document.objects.some (item => item.keyframes?.length)) { throw new Error ('Start with an empty, stopped timeline so existing animation is not overwritten.'); }
    const objects = [...document.objects], before = timeline.Serialize (); let started = false;
    const valid = () => editor.website.auth?.user?.id === owner && editor.website.accountReady !== false && !editor.readOnly && editor.document === document && document.objects.length === objects.length && objects.every ((object, i) => document.objects[i] === object);
    const capture = time => { if (!valid ()) { throw new Error ('The account or scene changed during macro recording.'); } timeline.time = time; timeline.CaptureScene (); timeline.CaptureCamera (); };
    const clear = () => { for (const object of objects) { object.keyframes = []; } timeline.cameraKeyframes = []; timeline.actions = []; timeline.Load (before); editor.MarkDirty (); editor.AnimationUI (); };
    let result;
    try {
        result = await registry.InvokeMacro (macro, { start : () => { started = true; timeline.duration = Math.max (before.duration, macro.steps.length * stepSeconds); capture (0); }, step : (_step, _result, index) => capture (index * stepSeconds) });
        if (!result.ok) { if (started && valid ()) { clear (); } return { ...result, recorded : false }; }
        if (!valid ()) { throw new Error ('The account or scene changed during macro recording.'); }
        const end = macro.steps.length * stepSeconds; timeline.SetRange (0, end); timeline.time = end;
        const after = timeline.Serialize (), saved = objects.map (item => structuredClone (item.keyframes));
        const apply = forward => { if (editor.document !== document || !objects.every (item => document.objects.includes (item))) { throw new Error ('The recorded scene is no longer available.'); } for (let i = 0; i < objects.length; i++) { objects[i].keyframes = forward ? structuredClone (saved[i]) : []; } timeline.Load (forward ? after : before); timeline.Seek (timeline.time); editor.MarkDirty (); editor.AnimationUI (); };
        // One Undo step: fold the macro's own history entry (its scene changes) into the recording entry.
        const run = registry.lastRun, steps = run?.history === editor.history && run.entry && editor.history.undo.at (-1) === run.entry ? editor.history.undo.pop () : null;
        editor.history.Push ({ macroRecording : true, undo : async () => { apply (false); if (steps) { await steps.undo (); } }, redo : async () => { if (steps) { await steps.redo (); } apply (true); } }); editor.MarkDirty (); editor.AnimationUI ();
        return { recorded : true, duration : end, steps : result.completed.length, objects : objects.length, completed : result.completed.map (({ id, command }) => ({ id, command })) };
    } catch (error) { if (started && valid ()) { clear (); } throw error; }
}
