function Element (tag, text, parent) { const element = document.createElement (tag); if (text !== undefined) { element.textContent = text; } parent.appendChild (element); return element; }
export class RenderingPanel
{
    constructor (website)
    {
        this.website = website; this.selectedJobs = new Set (); this.root = document.getElementById ('rendering_section');
        Element ('summary', 'Rendering', this.root); const content = Element ('div', undefined, this.root); content.className = 'section_content rendering_controls';
        const label = Element ('label', 'Resolution', content); this.resolution = Element ('select', undefined, label); this.resolution.setAttribute ('aria-label', 'Render resolution');
        [['screen', 'Screen size'], ['hd', 'HD · 1920 × 1080'], ['4k', '4K · 3840 × 2160'], ['16k', '16K · 15360 × 8640']].forEach (([value, title]) => this.resolution.add (new Option (title, value))); this.resolution.value = 'screen';
        const camera = Element ('label', 'View', content); this.camera = Element ('select', undefined, camera); this.camera.setAttribute ('aria-label', 'Render camera'); this.SyncCameras ();
        const alpha = Element ('label', undefined, content); this.alpha = Element ('input', undefined, alpha); this.alpha.type = 'checkbox'; this.alpha.setAttribute ('aria-label', 'Render model only with alpha'); alpha.appendChild (document.createTextNode (' Alpha · models only'));
        const render = Element ('button', 'Render', content); render.type = 'button'; render.addEventListener ('click', () => this.Action (() => website.rendering.RenderNow (this.Options ())));
        const add = Element ('button', 'Add to render queue', content); add.type = 'button'; add.addEventListener ('click', () => this.Action (() => website.rendering.Enqueue (this.Options ())));
        this.status = Element ('p', '', content); this.status.setAttribute ('role', 'status');
        const hint = Element ('p', 'Render uses the main viewer scene. The right panel shows progress and session images. Background rendering keeps navigation available; scene edits pause until the queue finishes. Download images to keep them.', content); hint.className = 'section_hint';
        this.queueRoot = document.createElement ('details'); this.queueRoot.className = 'render_queue'; this.queueRoot.open = true; this.queueRoot.id = 'render_queue'; Element ('summary', 'Render workspace', this.queueRoot); this.queueContent = Element ('div', undefined, this.queueRoot); this.queueContent.className = 'render_queue_content'; website.sidebar.detailsPanel.panelDiv.appendChild (this.queueRoot); this.RenderQueue ();
    }
    RevealQueue ()
    {
        if (document.getElementById ('data_panel_toggle').getAttribute ('aria-expanded') === 'false') { document.getElementById ('data_panel_toggle').click (); }
        this.website.sidebar.panelSet.ShowPanels (true); this.website.sidebar.panelSet.ShowPanel (this.website.sidebar.detailsPanel);
        this.queueRoot.open = true; this.queueRoot.scrollIntoView ({ block : 'start' });
        this.status.textContent = 'Render workspace opened on the right.';
    }
    Options () { return { resolution : this.resolution.value, alpha : this.alpha.checked, ...(this.camera.value === 'all' ? { allCameras : true } : this.camera.value ? { cameraId : this.camera.value } : {}) }; }
    Action (action) { Promise.resolve ().then (action).catch (error => { this.status.textContent = error.message; this.website.sessionEditor.Status?.(error.message); }); }
    Open () { if (document.getElementById ('upload_panel_toggle').getAttribute ('aria-expanded') === 'false') { document.getElementById ('upload_panel_toggle').click (); } this.root.open = true; this.SyncCameras (); this.root.scrollIntoView ({ block : 'nearest' }); return { opened : true }; }
    SyncCameras ()
    {
        if (!this.camera) { return; } const previous = this.camera.value; this.camera.replaceChildren (); this.camera.add (new Option ('Current screen', ''));
        const views = this.website.sessionEditor.cameras.Inspect ().views; views.forEach (view => this.camera.add (new Option (view.name, view.id))); if (views.length) { this.camera.add (new Option ('All saved cameras', 'all')); }
        if ([...this.camera.options].some (option => option.value === previous)) { this.camera.value = previous; }
    }
    RenderQueue ()
    {
        if (!this.queueContent) { return; } this.queueContent.replaceChildren (); const queue = this.website.rendering; const jobs = queue.Inspect ();
        for (const id of this.selectedJobs) { if (!jobs.some (job => job.id === id)) { this.selectedJobs.delete (id); } }
        const current = jobs.find (job => job.status === 'rendering') || jobs.find (job => job.status === 'queued') || jobs.findLast (job => job.downloadable) || jobs.at (-1);
        const live = Element ('div', undefined, this.queueContent); live.className = 'render_live_preview';
        Element ('strong', 'Scene render', live);
        if (current) {
            const image = Element ('img', undefined, live); image.alt = 'Live scene render preview'; image.dataset.capturePreview = 'true'; const preview = queue.Preview (current.id); image.hidden = !preview; if (preview) { image.src = preview; }
            const message = current.status === 'rendering' ? (queue.background ? 'Background rendering · ' : 'Rendering · ') + (current.progress >= 95 ? 'Encoding PNG…' : current.progress + '%') : current.status + ' · ' + current.size.width + ' × ' + current.size.height;
            Element ('p', message, live).setAttribute ('role', 'status'); const progress = Element ('progress', undefined, live); progress.setAttribute ('aria-label', 'Scene render progress'); progress.max = 100; progress.value = current.progress;
        } else { Element ('p', queue.running ? 'Stopping render…' : 'Render the current scene to see a preview here.', live); }
        const actions = Element ('div', undefined, this.queueContent); actions.className = 'mode_buttons';
        const button = (text, action, parent = actions) => { const element = Element ('button', text, parent); element.type = 'button'; element.onclick = () => this.Action (action); return element; };
        button ('Render in background', () => jobs.some (job => job.status === 'queued') ? queue.Start ({ background : true }) : queue.RenderNow ({ ...this.Options (), background : true })).disabled = queue.running;
        button ('Start queue', () => queue.Start ()).disabled = queue.running || !jobs.some (job => job.status === 'queued');
        button ('Stop', () => queue.Stop ()).disabled = !queue.running; button ('Clear queue', () => queue.Clear ()).disabled = !jobs.length;
        const note = Element ('p', queue.running && queue.background ? 'Orbit, pan and zoom remain available. Editing resumes when rendering finishes.' : 'Session images stay in this tab. Click a completed thumbnail to pan and zoom in a separate window.', this.queueContent); note.className = 'section_hint';
        Element ('strong', 'Session render history', this.queueContent);
        const selected = Element ('div', undefined, this.queueContent); selected.className = 'mode_buttons';
        const allLabel = Element ('label', undefined, selected); const all = Element ('input', undefined, allLabel); all.type = 'checkbox'; all.setAttribute ('aria-label', 'Select all render jobs'); all.checked = !!jobs.length && this.selectedJobs.size === jobs.length; allLabel.appendChild (document.createTextNode (' Select all'));
        all.addEventListener ('change', () => { this.selectedJobs = new Set (all.checked ? jobs.map (job => job.id) : []); this.RenderQueue (); });
        button ('Delete selected', () => queue.Delete ([...this.selectedJobs]), selected).disabled = !this.selectedJobs.size;
        if (!jobs.length) { Element ('p', 'No render jobs.', this.queueContent); }
        const history = Element ('div', undefined, this.queueContent); history.className = 'render_history'; history.setAttribute ('aria-label', 'Session render history');
        for (const job of [...jobs].reverse ()) {
            const row = Element ('div', undefined, history); row.className = 'render_queue_job'; row.dataset.jobId = job.id;
            const choose = Element ('label', undefined, row); const check = Element ('input', undefined, choose); check.type = 'checkbox'; check.setAttribute ('aria-label', 'Select render ' + job.id); check.checked = this.selectedJobs.has (job.id); choose.appendChild (document.createTextNode (' ' + job.name));
            check.addEventListener ('change', () => { if (check.checked) { this.selectedJobs.add (job.id); } else { this.selectedJobs.delete (job.id); } this.RenderQueue (); });
            const preview = queue.Preview (job.id);
            if (preview) { const open = button ('', () => queue.Open (job.id), row); open.className = 'render_thumbnail'; open.setAttribute ('aria-label', 'Open render ' + job.name); open.disabled = !job.downloadable; const image = Element ('img', undefined, open); image.src = preview; image.alt = job.name + ' render thumbnail'; image.dataset.capturePreview = 'true'; }
            Element ('span', job.size.width + ' × ' + job.size.height + (job.alpha ? ' · Alpha' : '') + (job.mode ? ' · ' + job.mode : ''), row);
            const status = Element ('span', job.status === 'rendering' && job.progress >= 95 ? 'Encoding PNG…' : job.status + (job.status === 'rendering' ? ' ' + job.progress + '%' : ''), row); status.setAttribute ('role', 'status');
            if (job.error) { Element ('p', job.error, row); } if (job.status === 'rendering') { const progress = Element ('progress', undefined, row); progress.max = 100; progress.value = job.progress; }
            if (job.downloadable) { button ('Open image', () => queue.Open (job.id), row); button ('Download PNG', () => queue.Download (job.id), row); }
            if (['queued', 'rendering'].includes (job.status)) { button ('Cancel', () => queue.Cancel (job.id), row); }
            button ('Delete render', () => queue.Delete ([job.id]), row);
        }
    }
}
