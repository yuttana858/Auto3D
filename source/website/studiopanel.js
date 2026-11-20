import { StudioWorkspace } from './studioworkspace.js';

const moduleUrl = new URL ('./3dstudio/3dstudio.module.js', import.meta.url);
moduleUrl.search = new URL (import.meta.url).search;

// Host shell only. Geometry, authoring, interaction and styles belong to the
// independent module; scene transactions belong to StudioWorkspace.
export class StudioPanel
{
    constructor (website)
    {
        this.website = website; this.owner = website.auth?.user?.id || null;
        this.studio = new StudioWorkspace (this, async (definition, guard = () => {}) => { await this.Ensure (); guard (); return this.worker.evaluate (definition); });
        this.panel = document.createElement ('section'); this.panel.id = 'studio_module_panel'; this.panel.hidden = true; this.panel.setAttribute ('aria-label', '3Dstudio'); website.parameters.rightContainerDiv.appendChild (this.panel);
        website.modulePanels.Register ('3dstudio', { title : '3Dstudio', body : this.panel, animated : true, onOpen : () => this.Ensure (), onMode : () => this.Refresh () });
        website.auth?.Subscribe?.(user => {
            const owner = user?.id || null;
            if (owner !== this.owner) { this.owner = owner; this.Cancel (); this.workspace?.Dispose (); this.workspace = null; this.panel.replaceChildren (); this.Mount (); this.Refresh (); }
        });
    }
    Blocked () { const editor = this.website.sessionEditor; return !this.website.auth?.user || this.website.accountReady === false || editor.readOnly || (editor.busy && !this.studio.active); }
    Inspect (args = {}) { return this.studio.Inspect (args); }
    Notice (message) { if (this.workspace?.status) { this.workspace.status.textContent = message; } }
    Cancel () { this.workspace?.CancelEdits (); const result = this.studio.Cancel (); this.worker?.cancel (); this.Refresh (); return result; }
    SelectObject (objectId)
    {
        const editor = this.website.sessionEditor, object = editor.document.objects.find (item => item.id === objectId);
        if (!object) { throw new Error ('Choose an existing 3Dstudio model.'); }
        editor.SetSelection ([object], { expandGroups : false }); return this.Inspect ();
    }
    Mount ()
    {
        if (!this.module || this.workspace) { return; }
        this.panel.replaceChildren ();
        this.workspace = new this.module.StudioPanel ({
            inspect : () => this.Inspect (), units : () => this.website.preferences.units, blocked : () => this.Blocked (),
            create : args => this.studio.Create (args), updateNode : args => this.studio.UpdateNode (args),
            setTip : args => this.studio.SetTip (args), boolean : args => this.studio.Boolean (args),
            cancel : () => this.Cancel (), selectObject : id => this.SelectObject (id), fit : () => this.website.sessionEditor.Focus ()
        }, this.panel);
    }
    async Ensure ()
    {
        if (!this.loading) {
            this.panel.textContent = 'Loading 3Dstudio…';
            this.loading = (async () => {
                if (!this.styles) {
                    const css = new URL ('./3dstudio.module.css', moduleUrl); css.search = moduleUrl.search;
                    this.styles = document.createElement ('link'); this.styles.rel = 'stylesheet'; this.styles.href = css.href;
                    await new Promise ((resolve, reject) => { this.styles.onload = resolve; this.styles.onerror = () => { this.styles.remove (); this.styles = null; reject (new Error ('Unable to load 3Dstudio styles. Open the module to retry.')); }; document.head.appendChild (this.styles); });
                }
                const url = new URL (moduleUrl); if (this.attempts) { url.searchParams.set ('retry', String (this.attempts)); } this.attempts = (this.attempts || 0) + 1;
                const module = await import (url.href); if (module.StudioAPIVersion !== 1) { throw new Error ('Unsupported 3Dstudio module.'); }
                this.module = module; const workerUrl = new URL ('./3dstudio.worker.js', moduleUrl); workerUrl.search = moduleUrl.search;
                this.worker = new module.StudioWorkerClient ({ workerUrl }); this.Mount ();
            })().catch (error => { this.loading = null; this.panel.textContent = error.message; throw error; });
        }
        await this.loading; this.Refresh ();
    }
    Open () { return this.website.modulePanels.Open ('3dstudio'); }
    Refresh () { this.workspace?.Refresh (); }
    RefreshAvailability () { this.Refresh (); }
}
