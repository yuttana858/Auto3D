import { DefaultPulpDraft, UpdatePulpDraft, PulpTypeList } from '../../modules/molded-pulp/src/state.js';
import { MoldedPulpWorkspace } from './moldedpulpworkspace.js';
const moduleUrl = new URL ('./molded-pulp/molded-pulp.module.js', import.meta.url);
moduleUrl.search = new URL (import.meta.url).search;

// Host adapter for the independent Molded Pulp module: lazy loading, account-scoped draft state and host callbacks only.
// Panel content and styles live in modules/molded-pulp; scene operations live in MoldedPulpWorkspace.
export class MoldedPulpPanel
{
    constructor (website)
    {
        this.website = website; this.pulp = new MoldedPulpWorkspace (this, async () => { await this.Ensure (); return this.module; }); this.draft = DefaultPulpDraft (); this.owner = website.auth?.user?.id || null;
        this.panel = document.createElement ('section'); this.panel.id = 'molded_pulp_module_panel'; this.panel.className = 'molded_pulp_module_panel'; this.panel.hidden = true; this.panel.setAttribute ('aria-label', 'Molded Pulp'); website.parameters.rightContainerDiv.appendChild (this.panel);
        website.modulePanels.Register ('molded-pulp', { title : 'Molded Pulp', body : this.panel, animated : true, onOpen : () => this.Ensure (), onMode : () => this.Refresh () });
        website.auth?.Subscribe?.(user => { const owner = user?.id || null; if (owner !== this.owner) { this.owner = owner; this.draft = DefaultPulpDraft (); this.pulp.Reset (); this.Refresh (); } });
    }
    Blocked () { return !this.website.auth?.user || this.website.accountReady === false || this.website.sessionEditor.readOnly || this.website.sessionEditor.busy || this.pulp?.active; }
    UnavailableReason ()
    {
        if (!this.website.auth?.user) { return 'Sign in to design molded pulp.'; }
        if (this.website.accountReady === false) { return 'Wait for your account to finish loading.'; }
        if (this.website.sessionEditor.readOnly) { return 'Open an editable session to design molded pulp.'; }
        if (this.pulp?.active) { return 'Forming pulp…'; }
        if (this.website.sessionEditor.busy) { return 'Wait for the current scene operation to finish.'; }
        return '';
    }
    Inspect ()
    {
        const current = this.pulp.Current ();
        return { schemaVersion : 1, units : 'mm', draft : { ...this.draft }, types : PulpTypeList (), sensed : this.pulp.Summary (), stage : this.pulp.result?.stage || (current ? 'existing' : 'none'), pulpObjectId : current?.id || null, result : this.pulp.result ? { stage : this.pulp.result.stage, metrics : { ...this.pulp.result.metrics }, checks : this.pulp.result.checks.map (c => ({ ...c })) } : null, unavailableReason : this.UnavailableReason (), generating : this.pulp.active === true };
    }
    Configure (changes)
    {
        if (this.Blocked ()) { throw new Error ('Open an editable session before changing the molded pulp draft.'); }
        this.draft = UpdatePulpDraft (this.draft, changes); this.Refresh (); return this.Inspect ();
    }
    Reset ()
    {
        if (this.Blocked ()) { throw new Error ('Open an editable session before changing the molded pulp draft.'); }
        this.draft = DefaultPulpDraft (); this.pulp.Reset (); this.Refresh (); return this.Inspect ();
    }
    async Ensure ()
    {
        if (!this.loading) {
            this.panel.textContent = 'Loading Molded Pulp…';
            this.loading = (async () => {
                if (!this.styles) {
                    const css = new URL ('./molded-pulp.module.css', moduleUrl); css.search = moduleUrl.search;
                    this.styles = document.createElement ('link'); this.styles.rel = 'stylesheet'; this.styles.href = css.href;
                    await new Promise ((resolve, reject) => { this.styles.onload = resolve; this.styles.onerror = () => { this.styles.remove (); this.styles = null; reject (new Error ('Unable to load Molded Pulp styles. Open the module to retry.')); }; document.head.appendChild (this.styles); });
                }
                const url = new URL (moduleUrl); if (this.attempts) { url.searchParams.set ('retry', String (this.attempts)); } this.attempts = (this.attempts || 0) + 1;
                const module = await import (url.href); if (module.MoldedPulpAPIVersion !== 1) { throw new Error ('Unsupported Molded Pulp module.'); } this.module = module; this.panel.replaceChildren ();
                this.workspace = new module.MoldedPulpPanel ({ inspect : () => this.Inspect (), configure : changes => this.Configure (changes), sense : () => this.pulp.Sense (), generateSheet : () => this.pulp.Build ('sheet'), setFormDepth : mm => this.pulp.SetFormDepth (mm), formTray : () => this.pulp.Build ('tray'), reset : () => this.Reset (), units : () => this.website.preferences.units, blocked : () => this.Blocked () }, this.panel);
            })().catch (error => { this.loading = null; this.panel.textContent = error.message; throw error; });
        }
        await this.loading; this.Refresh ();
    }
    Open () { return this.website.modulePanels.Open ('molded-pulp'); }
    Refresh () { this.workspace?.Refresh (); }
    RefreshAvailability () { this.workspace?.Refresh (); }
}
