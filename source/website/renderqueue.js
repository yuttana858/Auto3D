import { CaptureAllowed } from './agentcapture.js';
import { CaptureCameraState } from './sessiontimeline.js';
import { RenderDimensions, RenderPNG } from './rendercore.js';

export class RenderQueue
{
    constructor (website, render = RenderPNG)
    {
        this.website = website; this.render = render; this.jobs = []; this.running = false; this.stopping = false; this.generation = 0;
    }
    Inspect () { return this.jobs.map (({ blob, owner, ...job }) => structuredClone ({ ...job, downloadable : Boolean (blob) })); }
    Enqueue ({ resolution = 'hd', alpha = false, cameraId, allCameras = false } = {})
    {
        CaptureAllowed (this.website); if (typeof alpha !== 'boolean' || typeof allCameras !== 'boolean' || allCameras && cameraId) { throw new Error ('Choose the screen, one saved camera or all cameras.'); }
        if (!this.website.sessionEditor.document.objects.length) { throw new Error ('Add a model before rendering.'); }
        const size = RenderDimensions (resolution, this.website.viewer.GetImageSize ()); const cameras = this.website.sessionEditor.cameras;
        const views = allCameras ? cameras.Inspect ().views : cameraId ? [structuredClone (cameras.Find (cameraId))] : [{ name : 'Screen', state : CaptureCameraState (this.website.viewer) }];
        if (!views.length) { throw new Error ('Create a saved camera first.'); }
        if (views.length + this.jobs.filter (job => ['queued', 'rendering'].includes (job.status)).length > 20) { throw new Error ('The queue supports up to 20 pending renders.'); }
        const created = views.map (view => ({ id : crypto.randomUUID (), owner : this.website.auth.user.id, name : view.name, resolution, size : { ...size }, alpha, camera : structuredClone (view.state), status : 'queued', progress : 0, error : null, blob : null }));
        this.jobs.push (...created); this.Trim (); this.Refresh (); this.website.renderingPanel?.RevealQueue (); return created.map (job => ({ id : job.id, name : job.name, size : job.size }));
    }
    Refresh () { this.website.renderingPanel?.RenderQueue (); }
    Trim ()
    {
        while (this.jobs.length > 50) { const index = this.jobs.findIndex (job => !['queued', 'rendering'].includes (job.status)); if (index < 0) { break; } this.jobs.splice (index, 1); }
        let bytes = this.jobs.reduce ((total, job) => total + (job.blob?.size || 0), 0);
        const newest = this.jobs.findLast (job => job.blob);
        for (const job of this.jobs) { if (job === newest) { continue; } if (bytes <= 256 * 1024 * 1024) { break; } if (job.blob) { bytes -= job.blob.size; job.blob = null; job.status = 'expired'; } }
    }
    Start ()
    {
        CaptureAllowed (this.website); if (this.running) { return { running : true }; }
        if (this.website.sessionEditor.busy) { throw new Error ('Wait for the current edit to finish.'); }
        this.completion = this.Run ().catch (error => { this.website.errorLogs?.Record ('error', 'render', error.message); });
        return { running : this.running };
    }
    async Run ()
    {
        CaptureAllowed (this.website); if (this.running) { return { running : true }; }
        const editor = this.website.sessionEditor; if (editor.busy) { throw new Error ('Wait for the current edit to finish.'); }
        const owner = this.website.auth.user.id; const generation = this.generation; this.running = true; this.stopping = false;
        const navigation = this.website.viewer.navigation; const navigationEnabled = navigation.enabled;
        const elements = ['toolbar', 'upload_panel_content', 'main_viewer', 'advance_animation_panel', 'material_drawer'].map (id => document.getElementById (id)).filter (Boolean);
        elements.push (...[editor.strip, this.website.sidebar?.detailsPanel.contentDiv, this.website.sidebar?.settingsPanel?.panelDiv].filter (Boolean));
        elements.push (...(document.querySelectorAll?.('#header_buttons > :not(.auth_header_button):not(.header_fullscreen_button)') || []));
        const inert = elements.map (element => [element, element.inert]); inert.forEach (([element]) => { element.inert = true; });
        editor.timeline.Stop (); editor.players?.forEach (player => player.SetPlaying (false)); editor.busy = true; navigation.enabled = false; editor.RefreshButtons ();
        try {
            for (;;) {
                const job = this.jobs.find (item => item.status === 'queued'); if (!job || this.stopping || generation !== this.generation) { break; }
                if (job.owner !== owner) { job.status = 'cancelled'; continue; }
                job.status = 'rendering'; this.Refresh ();
                const cancelled = () => this.stopping || job.status === 'cancelled' || generation !== this.generation || !this.website.auth.user || this.website.auth.user.id !== owner || this.website.auth.loggedOut;
                try {
                    const blob = await this.render (this.website, job, { cancelled, progress : value => { job.progress = value; this.Refresh (); } });
                    if (cancelled ()) { job.status = 'cancelled'; } else { job.blob = blob; job.status = 'completed'; job.progress = 100; this.Trim (); }
                } catch (error) { job.status = cancelled () ? 'cancelled' : 'failed'; job.error = job.status === 'failed' ? error.message : null; if (job.error) { this.website.errorLogs?.Record ('error', 'render', error.message); } }
                this.Refresh ();
            }
        } finally { editor.busy = false; navigation.enabled = navigationEnabled; inert.forEach (([element, value]) => { element.inert = value; }); this.running = false; editor.RefreshButtons (); this.Refresh (); }
        return { running : false, jobs : this.Inspect () };
    }
    Cancel (id)
    {
        const job = this.jobs.find (item => item.id === id); if (!job) { throw new Error ('Render job not found.'); }
        if (['queued', 'rendering'].includes (job.status)) { job.status = 'cancelled'; } this.Refresh (); return { id, status : job.status };
    }
    Stop () { this.stopping = true; this.Refresh (); return { stopping : true }; }
    Clear () { this.jobs = this.jobs.filter (job => ['queued', 'rendering'].includes (job.status)); this.Refresh (); return { jobs : this.Inspect () }; }
    Lock () { this.generation++; this.stopping = true; this.jobs = []; this.Refresh (); }
    Download (id)
    {
        CaptureAllowed (this.website); const job = this.jobs.find (item => item.id === id);
        if (!job?.blob || job.owner !== this.website.auth.user.id) { throw new Error ('Render image is not available.'); }
        const name = (job.name || 'Auto3D').replace (/[^a-z0-9._-]+/gi, '_'); const url = URL.createObjectURL (job.blob); const link = document.createElement ('a');
        link.href = url; link.download = name + '-' + job.size.width + 'x' + job.size.height + (job.alpha ? '-alpha' : '') + '.png'; link.click (); setTimeout (() => URL.revokeObjectURL (url), 1000); return { id, filename : link.download };
    }
}
