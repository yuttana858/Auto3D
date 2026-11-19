import { VideoExport, VideoSizes, VideoFrameRates, VideoFrameTimes } from './videoexport.js';
import { ScheduleArrayReveal } from './timelinearray.js';

function Element (tag, className, text, parent)
{
    const element = document.createElement (tag); if (className) { element.className = className; } if (text !== undefined) { element.textContent = text; } if (parent) { parent.appendChild (element); } return element;
}
const Seconds = value => Number (value).toFixed (2) + ' s';
const Bytes = value => value >= 1048576 ? (value / 1048576).toFixed (1) + ' MB' : Math.max (1, Math.round (value / 1024)) + ' KB';
const SizeDetails = { '720p' : '1280 × 720', '1080p' : '1920 × 1080', '4k' : '3840 × 2160' };
const SizeLabels = { viewport : 'Viewport', '720p' : '720p', '1080p' : '1080p', '4k' : '4K' };

// Animation module panel: playback, sequence settings, keyframes and video export in one docked panel. Every control
// calls the same timeline and export functions as the animation.* agent commands; the bottom Advance animation panel
// stays the detailed track editor.
export class AnimationPanel
{
    constructor (website)
    {
        this.website = website; this.video = new VideoExport (website); this.options = { size : '1080p', fps : 30, format : 'auto' };
        this.panel = document.createElement ('section'); this.panel.id = 'animation_module_panel'; this.panel.className = 'animation_module_panel'; this.panel.hidden = true; this.panel.setAttribute ('aria-label', 'Animation');
        website.parameters.rightContainerDiv.appendChild (this.panel);
        website.modulePanels.Register ('animation', { title : 'Animation', body : this.panel, animated : true, onOpen : () => { this.Refresh (); this.RefreshMacros (); }, onMode : () => this.Refresh () });
        this.Build ();
        this.video.Subscribe (() => this.RefreshVideo ());
        website.auth?.Subscribe (() => { this.macroGeneration = (this.macroGeneration || 0) + 1; this.macroLoading = false; this.macroChoice.replaceChildren (new Option ('Choose a saved macro', '')); this.macroStatus.textContent = ''; this.Refresh (); });
    }
    get editor () { return this.website.sessionEditor; }
    get timeline () { return this.editor.timeline; }
    Open () { return this.website.modulePanels.Open ('animation'); }
    Visible () { return !this.panel.hidden; }
    Locked () { return this.editor.readOnly || this.video.running; }

    Section (title, help)
    {
        const section = Element ('section', 'animation_section', undefined, this.panel); section.setAttribute ('aria-label', title);
        Element ('h3', null, title, section); if (help) { Element ('p', 'animation_help', help, section); } return section;
    }
    Field (parent, label, input) { const row = Element ('label', 'animation_field', undefined, parent); Element ('span', null, label, row); row.appendChild (input); input.setAttribute ('aria-label', label); return input; }
    Number (parent, label, min, max, step) { const input = document.createElement ('input'); input.type = 'number'; input.min = String (min); input.max = String (max); input.step = String (step); return this.Field (parent, label, input); }
    Select (parent, label, items) { const select = document.createElement ('select'); items.forEach (([value, text]) => select.add (new Option (text, String (value)))); return this.Field (parent, label, select); }
    Button (parent, text, onClick, className = null, status = null) { const button = Element ('button', className, text, parent); button.type = 'button'; button.addEventListener ('click', () => this.Guard (onClick, status)); return button; }
    async Guard (action, status = null) { const target = status || this.status; try { target.textContent = ''; await action (); } catch (error) { target.textContent = error.message; } this.Refresh (); }
    // Timeline edits are saved with the session like the Advance panel's (MarkDirty), and both panels redraw.
    Changed () { this.editor.MarkDirty (); this.editor.AnimationUI (); }

    Build ()
    {
        Element ('p', 'animation_help', 'Record a macro to the shared timeline, refine it in Advance Animation, then render a video.', this.panel);
        const macro = this.Section ('Record a macro', 'Runs the macro and creates editable tracks. Start with an empty, stopped timeline and paused embedded clips. Completed changes remain if a step fails.');
        this.macroChoice = this.Select (macro, 'Saved macro', [['', 'Choose a saved macro']]);
        this.macroChoice.addEventListener ('change', () => this.Refresh ());
        this.macroHint = Element ('p', 'animation_help', '', macro);
        this.macroStatus = Element ('p', 'animation_summary', '', macro); this.macroStatus.setAttribute ('role', 'status');
        const macroButtons = Element ('div', 'animation_buttons', undefined, macro);
        this.macroRecord = this.Button (macroButtons, 'Run and record', async () => { const name = this.macroChoice.value; if (!name) { throw new Error ('Choose a saved macro.'); } this.macroRecording = true; this.Refresh (); this.macroStatus.textContent = 'Running macro and recording tracks…'; try { const response = await this.website.commands.Execute ('animation.workflow.record', { name }); if (!response.ok) { throw new Error (response.error.message); } this.macroStatus.textContent = 'Recorded ' + Seconds (response.result.duration) + '. Review the timeline, then render the video.'; } finally { this.macroRecording = false; } }, 'animation_primary', this.macroStatus);
        this.macroReload = this.Button (macroButtons, 'Refresh macros', () => this.RefreshMacros (), null, this.macroStatus);
        this.macroEdit = this.Button (macroButtons, 'Edit macros', () => this.website.commands.Execute ('ui.commands'), null, this.macroStatus);
        this.macroCancel = this.Button (macroButtons, 'Stop after current step', async () => { const response = await this.website.commands.Execute ('macro.cancel'); this.macroStatus.textContent = response.ok && response.result.requested ? 'Stopping after the current step…' : 'Recording has not started or has already stopped.'; }, null, this.macroStatus);
        const play = this.Section ('Playback');
        const transport = Element ('div', 'animation_buttons', undefined, play);
        this.play = this.Button (transport, 'Play', () => this.timeline.Toggle ());
        this.reset = this.Button (transport, 'Reset', () => { this.timeline.Reset (); this.Changed (); });
        this.timeText = Element ('span', 'animation_time', '', transport); this.timeText.setAttribute ('aria-live', 'off');
        this.scrub = document.createElement ('input'); this.scrub.type = 'range'; this.scrub.step = '0.01'; this.scrub.min = '0'; this.scrub.className = 'animation_scrub'; this.scrub.setAttribute ('aria-label', 'Animation playhead'); play.appendChild (this.scrub);
        this.scrub.addEventListener ('input', () => { this.timeline.Seek (Number (this.scrub.value)); this.editor.MarkDirty (); });

        const sequence = this.Section ('Sequence', 'The range is what plays and what the video records.');
        const grid = Element ('div', 'animation_grid', undefined, sequence);
        this.duration = this.Number (grid, 'Duration (s)', 0.1, 3600, 0.1);
        this.rangeStart = this.Number (grid, 'Range start (s)', 0, 3600, 0.01);
        this.rangeEnd = this.Number (grid, 'Range end (s)', 0, 3600, 0.01);
        this.tween = this.Select (grid, 'Tween', [['smooth', 'Smooth'], ['linear', 'Linear'], ['step', 'Step']]);
        const loopRow = Element ('label', 'animation_check', undefined, sequence); this.loop = Element ('input', null, undefined, loopRow); this.loop.type = 'checkbox'; loopRow.appendChild (document.createTextNode (' Loop playback'));
        this.duration.addEventListener ('change', () => this.Guard (() => { this.timeline.SetDuration (Number (this.duration.value)); this.Changed (); }));
        for (const input of [this.rangeStart, this.rangeEnd]) { input.addEventListener ('change', () => this.Guard (() => { this.timeline.SetRange (Number (this.rangeStart.value), Number (this.rangeEnd.value)); this.Changed (); })); }
        this.tween.addEventListener ('change', () => this.Guard (() => { this.timeline.interpolation = this.tween.value; this.editor.MarkDirty (); }));
        this.loop.addEventListener ('change', () => this.Guard (() => { this.timeline.loop = this.loop.checked; this.Changed (); }));

        const keys = this.Section ('Keyframes', 'Keyframes are saved at the playhead. Move the playhead, change the scene or camera, then add the next keyframe.');
        const keyButtons = Element ('div', 'animation_buttons', undefined, keys);
        this.keyScene = this.Button (keyButtons, 'Keyframe scene', () => { this.timeline.CaptureScene (); this.Changed (); });
        this.keyObject = this.Button (keyButtons, 'Keyframe selected', () => { if (!this.editor.selected) { throw new Error ('Select an object first.'); } this.timeline.CaptureObject (this.editor.selected); this.Changed (); });
        this.keyCamera = this.Button (keyButtons, 'Keyframe camera', () => { this.timeline.CaptureCamera (); this.Changed (); });
        this.keyAction = this.Button (keyButtons, 'Fold action', () => this.editor.Run (() => this.editor.packaging.OpenTimelineAction ()));
        this.keySummary = Element ('p', 'animation_summary', '', keys);
        this.Button (keys, 'Open timeline editor', () => this.editor.ShowAdvanceAnimation (true), 'animation_secondary');
        const visibility = Element ('details', 'animation_visibility', undefined, keys); Element ('summary', null, 'Object visibility', visibility);
        this.visibilityTarget = Element ('p', 'animation_summary', '', visibility);
        Element ('p', 'animation_help', 'Add a show or hide key at the playhead, or set a lifetime. Setting a lifetime replaces this object’s visibility keys; the model stays in the session.', visibility);
        this.visibilityStatus = Element ('p', 'animation_summary', '', visibility); this.visibilityStatus.setAttribute ('role', 'status');
        const visibilityButtons = Element ('div', 'animation_buttons', undefined, visibility);
        this.keyShow = this.Button (visibilityButtons, 'Show at playhead', () => { this.timeline.SetVisibilityKey (this.editor.selected, this.timeline.time, true); this.visibilityStatus.textContent = 'Show key added.'; }, null, this.visibilityStatus);
        this.keyHide = this.Button (visibilityButtons, 'Hide at playhead', () => { this.timeline.SetVisibilityKey (this.editor.selected, this.timeline.time, false); this.visibilityStatus.textContent = 'Hide key added.'; }, null, this.visibilityStatus);
        const lifetime = Element ('div', 'animation_grid', undefined, visibility);
        this.lifeStart = this.Number (lifetime, 'Show from (s)', 0, 3600, .01); this.lifeStart.value = '0';
        this.lifeEnd = this.Number (lifetime, 'Hide at (s, optional)', 0, 3600, .01); this.lifeEnd.placeholder = 'No end';
        const lifetimeButtons = Element ('div', 'animation_buttons', undefined, visibility);
        this.setLifetime = this.Button (lifetimeButtons, 'Set lifetime', () => { if (!this.lifeStart.value.trim ()) { throw new Error ('Enter a start time.'); } this.timeline.SetLifetime (this.editor.selected, Number (this.lifeStart.value), this.lifeEnd.value.trim () ? Number (this.lifeEnd.value) : null); this.visibilityStatus.textContent = 'Lifetime set.'; }, null, this.visibilityStatus);
        this.clearVisibility = this.Button (lifetimeButtons, 'Clear visibility keys', () => { this.timeline.SetVisibilityKeys (this.editor.selected, []); this.visibilityStatus.textContent = 'Visibility keys cleared.'; }, null, this.visibilityStatus);


        const embedded = Element ('details', 'animation_clip_section', undefined, keys); Element ('summary', null, 'Embedded clip', embedded);
        this.clipTarget = Element ('p', 'animation_summary', '', embedded); Element ('p', 'animation_help', 'Pause the clip, then add it at the playhead. Speed changes playback; a non-looping clip holds its last frame.', embedded);
        this.clipStatus = Element ('p', 'animation_summary', '', embedded); this.clipStatus.setAttribute ('role', 'status');
        const clipGrid = Element ('div', 'animation_grid', undefined, embedded);
        this.clipChoice = this.Select (clipGrid, 'Embedded clip', []); this.clipDuration = this.Number (clipGrid, 'Timeline duration (s)', .01, 3600, .01); this.clipSpeed = this.Number (clipGrid, 'Clip speed', .01, 10, .1); this.clipSpeed.value = '1';
        const clipLoopLabel = Element ('label', 'animation_check', undefined, embedded); this.clipLoop = Element ('input', null, undefined, clipLoopLabel); this.clipLoop.type = 'checkbox'; clipLoopLabel.appendChild (document.createTextNode (' Loop clip'));
        this.clipChoice.addEventListener ('change', () => { const clip = this.editor.selected?.player?.clips[Number (this.clipChoice.value)]; if (clip) { this.clipDuration.value = String (Number (clip.duration.toFixed (3))); } });
        const clipButtons = Element ('div', 'animation_buttons', undefined, embedded);
        this.clipAdd = this.Button (clipButtons, 'Add clip at playhead', () => { const object = this.editor.selected; if (!object?.player || !this.clipDuration.value.trim () || !this.clipSpeed.value.trim ()) { throw new Error ('Choose a paused clip, duration and speed.'); } this.timeline.AddEmbeddedClip ({ objectId : object.id, clip : Number (this.clipChoice.value), time : this.timeline.time, duration : Number (this.clipDuration.value), speed : Number (this.clipSpeed.value), loop : this.clipLoop.checked }); this.clipStatus.textContent = 'Clip added to timeline.'; }, null, this.clipStatus);

        const array = Element ('details', 'animation_array_section', undefined, keys); Element ('summary', null, 'Array reveal', array);
        this.arrayTarget = Element ('p', 'animation_summary', '', array); Element ('p', 'animation_help', 'Scheduled objects are hidden from the start until their reveal. They appear in scene-list order. No models are created.', array);
        this.arrayStatus = Element ('p', 'animation_summary', '', array); this.arrayStatus.setAttribute ('role', 'status');
        const keepLabel = Element ('label', 'animation_check', undefined, array); this.arrayKeepActive = Element ('input', null, undefined, keepLabel); this.arrayKeepActive.type = 'checkbox'; this.arrayKeepActive.checked = true; keepLabel.appendChild (document.createTextNode (' Keep active object in place')); this.arrayKeepActive.addEventListener ('change', () => this.Refresh ());
        const arrayGrid = Element ('div', 'animation_grid', undefined, array); this.arrayDuration = this.Number (arrayGrid, 'Reveal duration (s)', 1, 15, .1); this.arrayDuration.value = '4'; this.arrayHeight = this.Number (arrayGrid, 'Drop distance (model units)', .000001, 1000000, .1); this.arrayHeight.value = '1';
        const arrayButtons = Element ('div', 'animation_buttons', undefined, array); this.arraySchedule = this.Button (arrayButtons, 'Schedule reveal', () => { const selected = this.ArrayTargets (); if (!this.arrayDuration.value.trim () || !this.arrayHeight.value.trim ()) { throw new Error ('Enter a duration and drop distance.'); } ScheduleArrayReveal (this.editor, { objectIds : selected.map (item => item.id), time : this.timeline.time, duration : Number (this.arrayDuration.value), dropHeight : Number (this.arrayHeight.value) }); this.arrayStatus.textContent = 'Array reveal scheduled.'; }, null, this.arrayStatus);

        const video = this.Section ('Export video', 'Renders the timeline frame by frame using the current app lighting. This is not a screen recording; the video has no audio and stays in this browser until downloaded.');
        const videoGrid = Element ('div', 'animation_grid', undefined, video);
        this.size = this.Select (videoGrid, 'Video size', Object.keys (VideoSizes).map (key => [key, SizeLabels[key]]));
        this.fps = this.Select (videoGrid, 'Frame rate', VideoFrameRates.map (fps => [fps, fps + ' fps']));
        this.format = this.Select (videoGrid, 'Format', [['auto', 'Auto'], ['mp4', 'MP4'], ['webm', 'WebM']]);
        for (const [key, select] of [['size', this.size], ['fps', this.fps], ['format', this.format]]) { select.addEventListener ('change', () => { this.options[key] = key === 'fps' ? Number (select.value) : select.value; this.Refresh (); }); }
        this.videoPlan = Element ('p', 'animation_summary', '', video);
        const videoButtons = Element ('div', 'animation_buttons', undefined, video);
        this.exportButton = this.Button (videoButtons, 'Export video', () => this.ExportVideo (), 'animation_primary');
        this.cancelButton = this.Button (videoButtons, 'Cancel export', () => this.video.Cancel ());
        this.downloadButton = this.Button (videoButtons, 'Download video', () => this.video.Download ());
        this.progress = Element ('progress', 'animation_progress', undefined, video); this.progress.max = 100; this.progress.value = 0; this.progress.setAttribute ('aria-label', 'Video export progress');
        this.videoStatus = Element ('p', 'animation_summary', '', video); this.videoStatus.setAttribute ('aria-live', 'polite');
        this.status = Element ('p', 'animation_status', '', this.panel); this.status.setAttribute ('role', 'status');

        this.timeline.Subscribe ((type) => { if (!this.Visible ()) { return; } if (type === 'time') { this.RefreshTime (); } else { this.Refresh (); } });
    }

    ArrayTargets () { const objects = this.editor.SelectedObjects?.() || []; return this.arrayKeepActive.checked ? objects.filter (item => item !== this.editor.selected) : objects; }

    async RefreshMacros ()
    {
        const owner = this.website.auth?.user?.id, generation = this.macroGeneration = (this.macroGeneration || 0) + 1;
        if (!owner) { this.macroChoice.replaceChildren (new Option ('Sign in to load macros', '')); this.Refresh (); return; }
        const previous = this.macroChoice.value; this.macroLoading = true; this.Refresh ();
        const availability = await this.website.commands.Execute ('macro.library.inspect');
        if (generation !== this.macroGeneration || this.website.auth?.user?.id !== owner) { return; }
        const response = await this.website.commands.Execute ('macro.list');
        if (generation !== this.macroGeneration || this.website.auth?.user?.id !== owner) { return; }
        this.macroLoading = false; this.macroChoice.replaceChildren (new Option ('Choose a saved macro', ''));
        if (!response.ok) { this.macroStatus.textContent = response.error.message; this.Refresh (); return; }
        for (const item of response.result) { this.macroChoice.add (new Option (item.name + (item.location === 'browser' ? ' · this browser' : ''), item.name)); }
        if ([...this.macroChoice.options].some (option => option.value === previous)) { this.macroChoice.value = previous; }
        if (!this.macroRecording) { this.macroStatus.textContent = !availability.ok ? availability.error.message : !availability.result.available ? 'Shared macro library unavailable. Browser-only macros are still listed.' : !response.result.length ? 'No saved macros. Use Edit macros to create one.' : ''; }
        this.Refresh ();
    }

    async ExportVideo () { const result = await this.video.Export ({ ...this.options }); this.status.textContent = ''; return result; }

    RefreshTime ()
    {
        const t = this.timeline; this.scrub.max = String (t.duration); if (document.activeElement !== this.scrub) { this.scrub.value = String (t.time); }
        this.timeText.textContent = Seconds (t.time) + ' / ' + Seconds (t.duration);
    }
    Refresh ()
    {
        if (!this.Visible ()) { return; }
        const t = this.timeline, editor = this.editor, locked = this.Locked (), hasObjects = editor.document.objects.length > 0;
        const hasTracks = t.cameraKeyframes.length || t.actions.length || t.embeddedClips.length || editor.document.objects.some (item => item.keyframes?.length || item.visibilityKeys?.length), clipPlaying = editor.document.objects.some (item => item.player?.state?.playing);
        this.macroChoice.disabled = locked || editor.busy || this.macroRecording || this.macroLoading; this.macroRecord.disabled = locked || editor.busy || this.macroRecording || this.macroLoading || !hasObjects || editor.document.objects.length > 100 || !this.macroChoice.value || t.playing || hasTracks || clipPlaying; this.macroEdit.disabled = this.macroRecording; this.macroReload.disabled = this.macroRecording || this.macroLoading; this.macroCancel.hidden = !this.macroRecording;
        this.macroHint.textContent = this.macroRecording ? 'Recording in progress.' : locked ? 'Use an editable session.' : editor.busy ? 'Wait for the current operation.' : !hasObjects ? 'Add a model first.' : editor.document.objects.length > 100 ? 'Recording supports up to 100 objects.' : t.playing ? 'Pause the timeline first.' : hasTracks ? 'Use an empty timeline; existing tracks will not be overwritten.' : clipPlaying ? 'Pause embedded clips first.' : this.macroLoading ? 'Loading saved macros…' : !this.macroChoice.value ? 'Choose a saved macro.' : 'Ready to record into the timeline.';
        if (this.visibilityObjectId !== (editor.selected?.id || null)) { this.visibilityObjectId = editor.selected?.id || null; this.lifeStart.value = '0'; this.lifeEnd.value = ''; this.visibilityStatus.textContent = ''; }
        const clipPlayer = editor.selected?.player, clipId = editor.selected?.id || null;
        if (clipId !== this.clipObjectId || clipPlayer !== this.clipPlayer) { this.clipObjectId = clipId; this.clipPlayer = clipPlayer; this.clipChoice.replaceChildren (); clipPlayer?.clips.forEach ((clip, index) => this.clipChoice.add (new Option (clip.name || 'Clip ' + (index + 1), String (index)))); if (clipPlayer) { this.clipChoice.value = String (clipPlayer.state.clip); this.clipDuration.value = String (Number (clipPlayer.clips[clipPlayer.state.clip].duration.toFixed (3))); } else { this.clipDuration.value = ''; } this.clipSpeed.value = '1'; this.clipLoop.checked = false; this.clipStatus.textContent = ''; }
        this.clipTarget.textContent = !clipPlayer ? 'Select a model with an embedded clip.' : locked ? 'Selected: ' + editor.selected.name + ' · Editing unavailable.' : editor.busy ? 'Selected: ' + editor.selected.name + ' · Wait for the current operation.' : t.playing ? 'Selected: ' + editor.selected.name + ' · Pause the timeline to add a clip.' : clipPlayer.state.playing ? 'Selected: ' + editor.selected.name + ' · Pause the embedded clip first.' : 'Selected: ' + editor.selected.name; [this.clipChoice, this.clipDuration, this.clipSpeed, this.clipLoop, this.clipAdd].forEach (control => { control.disabled = locked || editor.busy || t.playing || !clipPlayer || clipPlayer.state.playing; });
        const targets = this.ArrayTargets (), selectedCount = targets.length; const invalid = targets.some (item => !item.threeObject || item.visible === false || item.keyframes?.length || item.visibilityKeys?.length || item.userData?._auto3dFoldPreview !== undefined || editor.packaging?.presentation?.records?.get (item.id)?.preview?.visible || t.actions.some (action => action.objectId === item.id));
        this.arrayTarget.textContent = locked ? 'Editing is unavailable.' : editor.busy ? 'Wait for the current operation.' : t.playing ? 'Pause the timeline first.' : !selectedCount ? (this.arrayKeepActive.checked && editor.selected ? 'Keeping ' + editor.selected.name + ' in place. Select more objects or include the active object.' : 'Select objects to reveal.') : invalid ? 'Use visible objects without motion, visibility or active fold previews.' : (this.arrayKeepActive.checked && editor.selected ? 'Keeping ' + editor.selected.name + ' in place. ' : '') + selectedCount + ' object' + (selectedCount === 1 ? '' : 's') + ' will be scheduled.';
        [this.arrayKeepActive, this.arrayDuration, this.arrayHeight, this.arraySchedule].forEach (control => { control.disabled = locked || editor.busy || t.playing; }); this.arraySchedule.disabled ||= !selectedCount || invalid;
        this.RefreshTime (); this.play.textContent = t.playing ? 'Pause' : 'Play';
        for (const [input, value] of [[this.duration, t.duration], [this.rangeStart, t.rangeStart], [this.rangeEnd, t.rangeEnd]]) { if (document.activeElement !== input) { input.value = String (Number (value.toFixed (3))); } }
        this.tween.value = t.interpolation; this.loop.checked = t.loop;
        [this.duration, this.rangeStart, this.rangeEnd, this.tween, this.loop, this.keyScene, this.keyCamera].forEach (control => { control.disabled = locked; });
        this.keyScene.disabled ||= !hasObjects; this.keyObject.disabled = locked || !editor.selected; [this.keyShow, this.keyHide, this.lifeStart, this.lifeEnd, this.setLifetime].forEach (control => { control.disabled = locked || editor.busy || !editor.selected; }); this.clearVisibility.disabled = locked || editor.busy || !editor.selected?.visibilityKeys?.length; this.visibilityTarget.textContent = editor.selected ? 'Selected: ' + editor.selected.name : 'Select an object to set its visibility.'; this.keyAction.disabled = locked || editor.busy || !editor.selected?.userData?._auto3dFefco;
        this.play.disabled = this.reset.disabled = this.scrub.disabled = this.video.running;
        const visibilityKeys = editor.document.objects.reduce ((sum, item) => sum + (item.visibilityKeys?.length || 0), 0);
        const objectKeys = editor.document.objects.reduce ((sum, item) => sum + (item.keyframes?.length || 0), 0), animated = editor.document.objects.filter (item => item.keyframes?.length).length;
        this.keySummary.textContent = t.cameraKeyframes.length + ' camera keyframe' + (t.cameraKeyframes.length === 1 ? '' : 's') + ' · ' + objectKeys + ' object keyframe' + (objectKeys === 1 ? '' : 's') + (animated ? ' on ' + animated + ' object' + (animated === 1 ? '' : 's') : '') + ' · ' + visibilityKeys + ' visibility keyframe' + (visibilityKeys === 1 ? '' : 's') + ' · ' + (t.embeddedClips?.length || 0) + ' clip action' + ((t.embeddedClips?.length || 0) === 1 ? '' : 's') + ' · ' + (t.actions?.length || 0) + ' fold action' + ((t.actions?.length || 0) === 1 ? '' : 's');
        this.size.value = this.options.size; this.fps.value = String (this.options.fps); this.format.value = this.options.format;
        this.RefreshVideo ();
    }
    RefreshVideo ()
    {
        if (!this.Visible ()) { return; }
        const t = this.timeline, state = this.video.Inspect (), running = this.video.running;
        let plan; try { const frames = VideoFrameTimes (t.rangeStart, Math.min (t.rangeEnd, t.duration), this.options.fps).length; plan = Seconds (t.rangeStart) + ' – ' + Seconds (t.rangeEnd) + ' · ' + frames + ' frames'; } catch (error) { plan = error.message; }
        // Auto picks MP4 (H.264) where the browser can encode it, else WebM.
        this.videoPlan.textContent = plan + ' · ' + (this.options.size === 'viewport' ? 'viewport size' : SizeDetails[this.options.size]) + (this.options.format === 'auto' ? ' · MP4, or WebM if the browser has no H.264 encoder' : '');
        [this.size, this.fps, this.format].forEach (control => { control.disabled = running; });
        this.exportButton.disabled = running || this.editor.busy || !this.editor.document.objects.length || !this.website.auth?.user;
        this.cancelButton.hidden = !running; this.downloadButton.hidden = running || !state.video;
        this.progress.hidden = !running; this.progress.value = state.progress;
        this.videoStatus.textContent = running ? 'Encoding frame ' + state.frame + ' of ' + state.frames + ' · ' + state.width + ' × ' + state.height + ' ' + state.container.toUpperCase () + '…'
            : state.status === 'failed' ? 'Export failed: ' + state.error : state.status === 'cancelled' ? 'Export cancelled.'
                : state.video ? 'Ready: ' + state.video.filename + ' · ' + Seconds (state.video.durationSeconds) + ' · ' + Bytes (state.video.bytes) : (this.website.auth?.user ? '' : 'Sign in to export video.');
    }
}
