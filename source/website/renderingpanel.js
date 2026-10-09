function Element (tag, text, parent) { const element = document.createElement (tag); if (text !== undefined) { element.textContent = text; } parent.appendChild (element); return element; }
export class RenderingPanel
{
    constructor (website)
    {
        this.website = website; this.root = document.getElementById ('rendering_section');
        Element ('summary', 'Rendering', this.root); const content = Element ('div', undefined, this.root); content.className = 'section_content rendering_controls';
        const label = Element ('label', 'Resolution', content); this.resolution = Element ('select', undefined, label); this.resolution.setAttribute ('aria-label', 'Render resolution');
        [['screen', 'Screen size'], ['hd', 'HD · 1920 × 1080'], ['4k', '4K · 3840 × 2160'], ['16k', '16K · 15360 × 8640']].forEach (([value, title]) => this.resolution.add (new Option (title, value))); this.resolution.value = 'hd';
        const camera = Element ('label', 'View', content); this.camera = Element ('select', undefined, camera); this.camera.setAttribute ('aria-label', 'Render camera'); this.SyncCameras ();
        const alpha = Element ('label', undefined, content); this.alpha = Element ('input', undefined, alpha); this.alpha.type = 'checkbox'; this.alpha.setAttribute ('aria-label', 'Render model only with alpha'); alpha.appendChild (document.createTextNode (' Alpha · models only'));
        const add = Element ('button', 'Add to render queue', content); add.addEventListener ('click', () => this.Action (() => website.rendering.Enqueue (this.Options ())));
        const start = Element ('button', 'Render queue', content); start.addEventListener ('click', () => this.Action (() => website.rendering.Start ()));
        this.status = Element ('p', '', content); this.status.setAttribute ('role', 'status');
        const hint = Element ('p', 'PNG renders use tiled antialiasing. 16K needs substantial memory. Queue and images are kept in this tab; download completed renders to keep them.', content); hint.className = 'section_hint';
        this.queueRoot = document.createElement ('details'); this.queueRoot.className = 'render_queue'; this.queueRoot.open = true; this.queueRoot.id = 'render_queue'; Element ('summary', 'Render queue', this.queueRoot); this.queueContent = Element ('div', undefined, this.queueRoot); this.queueContent.className = 'render_queue_content'; website.sidebar.detailsPanel.panelDiv.appendChild (this.queueRoot); this.RenderQueue ();
    }
    RevealQueue ()
    {
        if (document.getElementById ('data_panel_toggle').getAttribute ('aria-expanded') === 'false') { document.getElementById ('data_panel_toggle').click (); }
        this.website.sidebar.panelSet.ShowPanels (true); this.website.sidebar.panelSet.ShowPanel (this.website.sidebar.detailsPanel);
        this.queueRoot.open = true; this.queueRoot.scrollIntoView ({ block : 'nearest' });
        this.status.textContent = 'Jobs queued. Start rendering below Details.';
    }
    Options () { return { resolution : this.resolution.value, alpha : this.alpha.checked, ...(this.camera.value === 'all' ? { allCameras : true } : this.camera.value ? { cameraId : this.camera.value } : {}) }; }
    Action (action) { Promise.resolve ().then (action).catch (error => { this.status.textContent = error.message; }); }
    Open () { if (document.getElementById ('upload_panel_toggle').getAttribute ('aria-expanded') === 'false') { document.getElementById ('upload_panel_toggle').click (); } this.root.open = true; this.SyncCameras (); this.root.scrollIntoView ({ block : 'nearest' }); return { opened : true }; }
    SyncCameras ()
    {
        if (!this.camera) { return; } const previous = this.camera.value; this.camera.replaceChildren (); this.camera.add (new Option ('Current screen', ''));
        const views = this.website.sessionEditor.cameras.Inspect ().views; views.forEach (view => this.camera.add (new Option (view.name, view.id))); if (views.length) { this.camera.add (new Option ('All saved cameras', 'all')); }
        if ([...this.camera.options].some (option => option.value === previous)) { this.camera.value = previous; }
    }
    RenderQueue ()
    {
        if (!this.queueContent) { return; } this.queueContent.replaceChildren (); const queue = this.website.rendering;
        const actions = Element ('div', undefined, this.queueContent); actions.className = 'mode_buttons';
        const button = (text, action, parent = actions) => { const element = Element ('button', text, parent); element.type = 'button'; element.onclick = () => this.Action (action); return element; };
        button ('Start', () => queue.Start ()).disabled = queue.running || !queue.jobs.some (job => job.status === 'queued'); button ('Stop', () => queue.Stop ()).disabled = !queue.running; button ('Clear finished', () => queue.Clear ());
        if (!queue.jobs.length) { Element ('p', 'No render jobs.', this.queueContent); }
        for (const job of queue.Inspect ()) {
            const row = Element ('div', undefined, this.queueContent); row.className = 'render_queue_job'; row.dataset.jobId = job.id;
            Element ('strong', job.name, row); Element ('span', job.size.width + ' × ' + job.size.height + (job.alpha ? ' · Alpha' : ''), row);
            const status = Element ('span', job.status === 'rendering' && job.progress >= 95 ? 'Encoding PNG…' : job.status + (job.status === 'rendering' ? ' ' + job.progress + '%' : ''), row); status.setAttribute ('role', 'status');
            if (job.error) { Element ('p', job.error, row); } if (job.status === 'rendering') { const progress = Element ('progress', undefined, row); progress.max = 100; progress.value = job.progress; }
            if (job.downloadable) { button ('Download PNG', () => queue.Download (job.id), row); }
            if (['queued', 'rendering'].includes (job.status)) { button ('Cancel', () => queue.Cancel (job.id), row); }
        }
    }
}
