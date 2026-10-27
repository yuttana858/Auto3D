import { LoadPackagingModule } from './packagingadapter.js';
import { PackagingModuleVersion } from '../../modules/packaging/src/version.js';

// Host adapter only; all Packaging panel controls live in the independent module.
export class PackagingPanel
{
    constructor (website)
    {
        this.website = website; this.panel = document.createElement ('section'); this.panel.id = 'packaging_module_panel'; this.panel.className = 'packaging_module_panel'; this.panel.hidden = true; this.panel.setAttribute ('aria-label', 'Packaging Generative'); website.parameters.rightContainerDiv.appendChild (this.panel);
        website.modulePanels.Register ('packaging', { title : 'Packaging Gen', body : this.panel, onOpen : () => this.Ensure (), onMode : () => this.Refresh () });
    }
    async Ensure ()
    {
        if (!this.loading) {
            this.panel.textContent = 'Loading Packaging…';
            this.loading = LoadPackagingModule ().then (module => {
                this.panel.replaceChildren (); const host = this.website.sessionEditor.packaging.PanelHost ();
                this.workspace = new module.PackagingPanel ({ ...host, version : PackagingModuleVersion, profile : () => this.website.sessionEditor.packaging.Design (), openDesigner : () => { const packaging = this.website.sessionEditor.packaging; return this.website.sessionEditor.selected?.packagingProfile ? packaging.OpenSelected () : packaging.Open (); }, download : format => this.website.sessionEditor.packaging.Download (format) }, this.panel);
                this.fefcoPanel = this.workspace.fefcoPanel;
            }).catch (error => { this.loading = null; this.panel.textContent = error.message; throw error; });
        }
        await this.loading; this.Refresh ();
    }
    Open () { return this.website.modulePanels.Open ('packaging'); }
    Close () { return this.website.modulePanels.Set ('packaging', 'closed'); }
    Refresh () { this.workspace?.Refresh (); }
}
