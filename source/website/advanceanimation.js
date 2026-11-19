function Element (tag, className, text, parent)
{
    const item = document.createElement (tag); if (className) { item.className = className; } if (text !== undefined) { item.textContent = text; } parent.appendChild (item); return item;
}

export function ShowAdvanceAnimation (editor, visible)
{
    if (!editor.advancePanel) { return; }
    editor.advancePanel.hidden = !visible;
    editor.animationPanel.querySelector ('.advance_animation_button')?.setAttribute ('aria-expanded', String (visible));
    if (visible) { editor.website.materialPanel?.Close (); }
    editor.website.layouter.Resize ();
}

export function CreateTimelineTracks (editor, parent, slots = {})
{
    const timeline = editor.timeline;
    // In and Out fields sit in the toolbar's Timing group, Auto-fit in its Camera group, when the toolbar provides them.
    const ranges = slots.ranges || Element ('div', 'timeline_ranges', undefined, parent);
    for (const [key, label, short] of [['rangeStart', 'Beginning', 'In'], ['rangeEnd', 'End', 'Out']]) {
        const field = Element ('label', 'timeline_field', undefined, ranges); Element ('span', null, short, field); const input = Element ('input', null, undefined, field);
        field.title = label + ' of the played range (s)';
        input.type = 'number'; input.min = '0'; input.max = String (timeline.duration); input.step = '0.01'; input.value = String (timeline[key]); input.disabled = editor.readOnly;
        input.setAttribute ('aria-label', label + ' of animation');
        input.addEventListener ('change', () => {
            try { timeline.SetRange (key === 'rangeStart' ? Number (input.value) : timeline.rangeStart, key === 'rangeEnd' ? Number (input.value) : timeline.rangeEnd); editor.MarkDirty (); }
            catch (error) { editor.Status (error.message); }
            input.value = String (timeline[key]); editor.UpdatePlayheads ();
        });
        input.dataset.range = key;
    }
    const cameraLabel = Element ('label', 'timeline_field timeline_check fold_camera_option', undefined, slots.camera || parent);
    const autoFit = Element ('input', null, undefined, cameraLabel); autoFit.type = 'checkbox'; autoFit.checked = timeline.foldAutoFit !== false; autoFit.disabled = editor.readOnly || editor.busy;
    autoFit.setAttribute ('aria-label', 'Auto-fit folding camera'); Element ('span', null, 'Auto-fit fold', cameraLabel);
    cameraLabel.title = 'Frame the box while it folds or unfolds. Camera keyframes take priority.';
    autoFit.addEventListener ('change', () => editor.Run (() => editor.packaging.SetFoldCameraAutoFit (autoFit.checked)));
    if (slots.camera) { slots.camera.prepend (cameraLabel); }
    const tracks = Element ('div', 'advance_animation_tracks', undefined, parent);
    const state = editor.animationTrackState ||= { open : false, objects : new Set (), groups : { object : true, camera : true, action : true } };
    state.groups ||= { object : true, camera : true, action : true };
    for (const [type, label] of [['object', 'Scene state'], ['camera', 'Camera positioning'], ['action', 'Actions']]) {
        const group = Element ('details', 'animation_scene_track', undefined, tracks); group.open = state.groups[type] !== false; Element ('summary', null, label, group); group.addEventListener ('toggle', () => { if (group.isConnected) { state.groups[type] = group.open; } });
        const row = Element ('div', 'advance_animation_track', undefined, group); Element ('strong', null, label, row);
        const rail = Element ('div', 'advance_animation_rail', undefined, row);
        const interval = Element ('div', 'animation_interval', undefined, rail);
        interval.setAttribute ('aria-hidden', 'true');
        const playhead = Element ('input', 'animation_playhead', undefined, rail);
        playhead.type = 'range'; playhead.min = '0'; playhead.max = String (timeline.duration); playhead.step = '0.01'; playhead.value = String (timeline.time);
        playhead.setAttribute ('aria-label', label + ' playhead');
        playhead.addEventListener ('input', () => { timeline.Stop (); timeline.Seek (Number (playhead.value)); });
        playhead.addEventListener ('change', () => editor.MarkDirty ());
        const entries = type === 'action' ? timeline.actions.filter (action => editor.document.objects.some (object => object.id === action.objectId)).map (keyframe => ({ keyframe, label : 'Fold / unfold · ' + editor.document.objects.find (object => object.id === keyframe.objectId).name })) : type === 'camera' ? timeline.cameraKeyframes.map ((keyframe) => ({ keyframe, label : 'Camera' })) : editor.document.objects.flatMap ((object) => (object.keyframes || []).map ((keyframe) => ({ keyframe, label : object.name })));
        for (const { keyframe, label : name } of entries) {
            const marker = Element ('button', 'animation_key_marker', '◆', rail); marker.style.left = 100 * keyframe.time / timeline.duration + '%';
            marker.title = name + ' at ' + keyframe.time.toFixed (2) + ' s'; marker.setAttribute ('aria-label', marker.title);
            marker.addEventListener ('click', () => { timeline.Stop (); timeline.Seek (keyframe.time); });
        }
        for (const [key, name] of [['rangeStart', 'Beginning'], ['rangeEnd', 'End']]) {
            const marker = Element ('button', 'animation_range_marker', key === 'rangeStart' ? '❮' : '❯', rail); marker.dataset.range = key; marker.disabled = editor.readOnly;
            marker.setAttribute ('aria-label', name + ' marker on ' + label); marker.title = 'Drag to adjust ' + name.toLowerCase ();
            let pointer = null;
            const move = (event) => {
                if (pointer !== event.pointerId) { return; }
                const box = rail.getBoundingClientRect (); if (!box.width) { return; }
                const time = Math.max (0, Math.min (timeline.duration, (event.clientX - box.left) / box.width * timeline.duration));
                timeline.SetRange (key === 'rangeStart' ? Math.min (time, timeline.rangeEnd - 0.01) : timeline.rangeStart, key === 'rangeEnd' ? Math.max (time, timeline.rangeStart + 0.01) : timeline.rangeEnd);
                editor.UpdatePlayheads ();
            };
            marker.addEventListener ('pointerdown', (event) => { if (event.button !== 0) { return; } timeline.Stop (); pointer = event.pointerId; marker.setPointerCapture (pointer); event.preventDefault (); });
            marker.addEventListener ('pointermove', move);
            const release = (event) => { if (pointer !== event.pointerId) { return; } pointer = null; editor.MarkDirty (); };
            marker.addEventListener ('pointerup', release); marker.addEventListener ('pointercancel', release); marker.addEventListener ('lostpointercapture', release);
            marker.addEventListener ('keydown', (event) => {
                if (!['ArrowLeft', 'ArrowRight'].includes (event.key)) { return; }
                event.preventDefault (); const value = timeline[key] + (event.key === 'ArrowRight' ? 0.1 : -0.1);
                timeline.SetRange (key === 'rangeStart' ? Math.max (0, Math.min (value, timeline.rangeEnd - 0.01)) : timeline.rangeStart, key === 'rangeEnd' ? Math.min (timeline.duration, Math.max (value, timeline.rangeStart + 0.01)) : timeline.rangeEnd);
                editor.UpdatePlayheads (); editor.MarkDirty ();
            });
        }
    }
    // Keep one expandable track per object while retaining the existing scene and camera tracks.
    const objects = Element ('details', 'animation_object_tracks', undefined, parent); objects.open = state.open;
    Element ('summary', null, 'Object tracks (' + editor.document.objects.length + ')', objects); Element ('p', 'animation_track_legend', '◆ motion · ● show · ○ hide · ▸ clip', objects);
    objects.addEventListener ('toggle', () => { if (objects.isConnected) { state.open = objects.open; } });
    for (const object of editor.document.objects) {
        const group = Element ('details', 'animation_object_track', undefined, objects); group.open = state.objects.has (object.id);
        Element ('summary', null, object.name + ' · ' + (object.keyframes?.length || 0) + ' motion / ' + (object.visibilityKeys?.length || 0) + ' visibility / ' + timeline.embeddedClips.filter (item => item.objectId === object.id).length + ' clips', group);
        group.addEventListener ('toggle', () => { if (!group.isConnected) { return; } if (group.open) { state.objects.add (object.id); } else { state.objects.delete (object.id); } });
        const row = Element ('div', 'advance_animation_track', undefined, group); Element ('strong', null, object.name, row);
        const rail = Element ('div', 'advance_animation_rail', undefined, row);
        const playhead = Element ('input', 'animation_playhead', undefined, rail); playhead.type = 'range'; playhead.min = '0'; playhead.max = String (timeline.duration); playhead.step = '0.01'; playhead.value = String (timeline.time); playhead.setAttribute ('aria-label', 'Object ' + object.name + ' playhead');
        playhead.addEventListener ('input', () => { timeline.Stop (); timeline.Seek (Number (playhead.value)); }); playhead.addEventListener ('change', () => editor.MarkDirty ());
        for (const keyframe of object.keyframes || []) { const marker = Element ('button', 'animation_key_marker', '◆', rail); marker.style.left = 100 * keyframe.time / timeline.duration + '%'; marker.title = object.name + ' at ' + keyframe.time.toFixed (2) + ' s'; marker.setAttribute ('aria-label', marker.title); marker.addEventListener ('click', () => { timeline.Stop (); timeline.Seek (keyframe.time); }); }
        for (const keyframe of object.visibilityKeys || []) { const marker = Element ('button', 'animation_key_marker animation_visibility_marker', keyframe.visible ? '●' : '○', rail); marker.style.left = 100 * keyframe.time / timeline.duration + '%'; marker.title = object.name + (keyframe.visible ? ' shown at ' : ' hidden at ') + keyframe.time.toFixed (2) + ' s'; marker.setAttribute ('aria-label', marker.title); marker.addEventListener ('click', () => { timeline.Stop (); timeline.Seek (keyframe.time); }); }
        for (const clip of timeline.embeddedClips.filter (item => item.objectId === object.id)) { const span = Element ('span', 'animation_clip_span', undefined, rail); span.style.left = 100 * clip.time / timeline.duration + '%'; span.style.width = 100 * clip.duration / timeline.duration + '%'; span.setAttribute ('aria-hidden', 'true'); const marker = Element ('button', 'animation_key_marker animation_clip_marker', '▸', rail); marker.style.left = 100 * clip.time / timeline.duration + '%'; const name = object.player?.clips[clip.clip]?.name || 'Clip ' + (clip.clip + 1); marker.title = object.name + ' · ' + name + ' · ' + clip.time.toFixed (2) + ' s start · ' + clip.duration.toFixed (2) + ' s duration'; marker.setAttribute ('aria-label', marker.title); marker.addEventListener ('click', () => { timeline.Stop (); timeline.Seek (clip.time); }); }
    }
    UpdatePlayheads (editor);
}

export function UpdatePlayheads (editor)
{
    if (!editor.advancePanel) { return; }
    const timeline = editor.timeline;
    editor.advancePanel.querySelectorAll ('.animation_playhead').forEach ((item) => { item.value = String (timeline.time); });
    editor.advancePanel.querySelectorAll ('[data-range]').forEach ((item) => {
        const time = timeline[item.dataset.range];
        if (item.tagName === 'INPUT') { item.value = String (Math.round (time * 100) / 100); }
        else { item.style.left = time / timeline.duration * 100 + '%'; }
    });
    editor.advancePanel.querySelectorAll ('.animation_interval').forEach ((item) => { item.style.left = timeline.rangeStart / timeline.duration * 100 + '%'; item.style.width = (timeline.rangeEnd - timeline.rangeStart) / timeline.duration * 100 + '%'; });
}
