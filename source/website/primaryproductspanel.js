import { PrimaryProductsWorkspace } from './primaryproductsworkspace.js';
import { DefaultProductDraft, UpdateProductDraft } from '../../modules/primary-products/src/state.js';
const moduleUrl = new URL ('./primary-products/primary-products.module.js', import.meta.url);
moduleUrl.search = new URL (import.meta.url).search;
export class PrimaryProductsPanel
{
    constructor (website)
    {
        this.website = website; this.products = new PrimaryProductsWorkspace (this, async () => { await this.Ensure (); return this.module; }); this.draft = DefaultProductDraft (); this.owner = website.auth?.user?.id || null;
        this.panel = document.createElement ('section'); this.panel.id = 'primary_products_module_panel'; this.panel.className = 'primary_products_module_panel'; this.panel.hidden = true; this.panel.setAttribute ('aria-label', 'Primary Products'); website.parameters.rightContainerDiv.appendChild (this.panel);
        website.modulePanels.Register ('primary-products', { title : 'Primary Products', body : this.panel, animated : true, onOpen : () => this.Ensure (), onMode : () => this.Refresh () });
        website.auth?.Subscribe?.(user => { const owner = user?.id || null; if (owner !== this.owner) { this.owner = owner; this.draft = DefaultProductDraft (); this.Refresh (); } });
    }
    Blocked () { return !this.website.auth?.user || this.website.accountReady === false || this.website.sessionEditor.readOnly || this.website.sessionEditor.busy || this.products?.active; }
    Inspect () { return { schemaVersion : 1, units : 'mm', ...this.draft, draftOnly : false, generationAvailable : this.draft.material !== 'glass' }; }
    Configure (changes)
    {
        if (this.Blocked ()) { throw new Error ('Open an editable session before changing the product draft.'); }
        this.draft = UpdateProductDraft (this.draft, changes); this.Refresh (); return this.Inspect ();
    }
    Reset ()
    {
        if (this.Blocked ()) { throw new Error ('Open an editable session before changing the product draft.'); }
        this.draft = DefaultProductDraft (); this.Refresh (); return this.Inspect ();
    }
    async Ensure ()
    {
        if (!this.loading) {
            this.panel.textContent = 'Loading Primary Products…';
            this.loading = (async () => {
                if (!this.styles) {
                    const css = new URL ('./primary-products.module.css', moduleUrl); css.search = moduleUrl.search;
                    this.styles = document.createElement ('link'); this.styles.rel = 'stylesheet'; this.styles.href = css.href;
                    await new Promise ((resolve, reject) => { this.styles.onload = resolve; this.styles.onerror = () => { this.styles.remove (); this.styles = null; reject (new Error ('Unable to load Primary Products styles. Open the module to retry.')); }; document.head.appendChild (this.styles); });
                }
                const url = new URL (moduleUrl); if (this.attempts) { url.searchParams.set ('retry', String (this.attempts)); } this.attempts = (this.attempts || 0) + 1;
                const module = await import (url.href); if (module.PrimaryProductsAPIVersion !== 1) { throw new Error ('Unsupported Primary Products module.'); } this.module = module; this.panel.replaceChildren ();
                this.workspace = new module.PrimaryProductsPanel ({ inspect : () => this.Inspect (), configure : changes => this.Configure (changes), reset : () => this.Reset (), generate : () => this.products.Generate (), update : () => this.products.Generate (true), loadSelected : () => this.products.LoadSelected (), units : () => this.website.preferences.units, blocked : () => this.Blocked () }, this.panel);
            })().catch (error => { this.loading = null; this.panel.textContent = error.message; throw error; });
        }
        await this.loading; this.Refresh ();
    }
    Open () { return this.website.modulePanels.Open ('primary-products'); }
    Refresh () { this.workspace?.Refresh (); }
}
