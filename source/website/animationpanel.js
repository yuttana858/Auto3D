import { VideoExport, VideoSizes, VideoFrameRates, VideoFrameTimes } from './videoexport.js';

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
        website.modulePanels.Register ('animation', { title : 'Animation', body : this.panel, animated : true, onOpen : () => this.Refresh (), onMode : () => this.Refresh () });
        this.Build ();
        this.video.Subscribe (() => this.RefreshVideo ());
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
    Button (parent, text, onClick, className = null) { const button = Element ('button', className, text, parent); button.type = 'button'; button.addEventListener ('click', () => this.Guard (onClick)); return button; }
    async Guard (action) { try { this.status.textContent = ''; await action (); } catch (error) { this.status.textContent = error.message; } this.Refresh (); }
    // Timeline edits are saved with the session like the Advance panel's (MarkDirty), and both panels redraw.
    Changed () { this.editor.MarkDirty (); this.editor.AnimationUI (); }

    Build ()
    {
        Element ('p', 'animation_help', 'Animate objects, the camera and box folds on one timeline, then export it as a video.', this.panel);
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

        const video = this.Section ('Export video', 'Records the range frame by frame, so no frame is dropped. The video stays in this browser until you download it.');
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
        this.RefreshTime (); this.play.textContent = t.playing ? 'Pause' : 'Play';
        for (const [input, value] of [[this.duration, t.duration], [this.rangeStart, t.rangeStart], [this.rangeEnd, t.rangeEnd]]) { if (document.activeElement !== input) { input.value = String (Number (value.toFixed (3))); } }
        this.tween.value = t.interpolation; this.loop.checked = t.loop;
        [this.duration, this.rangeStart, this.rangeEnd, this.tween, this.loop, this.keyScene, this.keyCamera].forEach (control => { control.disabled = locked; });
        this.keyScene.disabled ||= !hasObjects; this.keyObject.disabled = locked || !editor.selected; this.keyAction.disabled = locked || editor.busy || !editor.selected?.userData?._auto3dFefco;
        this.play.disabled = this.reset.disabled = this.scrub.disabled = this.video.running;
        const objectKeys = editor.document.objects.reduce ((sum, item) => sum + (item.keyframes?.length || 0), 0), animated = editor.document.objects.filter (item => item.keyframes?.length).length;
        this.keySummary.textContent = t.cameraKeyframes.length + ' camera keyframe' + (t.cameraKeyframes.length === 1 ? '' : 's') + ' · ' + objectKeys + ' object keyframe' + (objectKeys === 1 ? '' : 's') + (animated ? ' on ' + animated + ' object' + (animated === 1 ? '' : 's') : '') + ' · ' + (t.actions?.length || 0) + ' fold action' + ((t.actions?.length || 0) === 1 ? '' : 's');
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
