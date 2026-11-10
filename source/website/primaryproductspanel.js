import { ProductCategories, ListProductDesigns, ProductDesign } from '../../modules/primary-products/src/catalog.js';
import { PrimaryProductsArtwork } from './primaryproductsartwork.js';
import { ValidateProductArtwork } from '../../modules/primary-products/src/artwork.js';
import { PrimaryProductsWorkspace } from './primaryproductsworkspace.js';
import { DefaultProductDraft, UpdateProductDraft, BottleShape, ProductSize, DimensionChanges } from '../../modules/primary-products/src/state.js';
const moduleUrl = new URL ('./primary-products/primary-products.module.js', import.meta.url);
moduleUrl.search = new URL (import.meta.url).search;
export class PrimaryProductsPanel
{
    constructor (website)
    {
        this.website = website; this.artwork = new PrimaryProductsArtwork (this); this.products = new PrimaryProductsWorkspace (this, async () => { await this.Ensure (); return this.module; }); this.draft = DefaultProductDraft (); this.owner = website.auth?.user?.id || null;
        this.panel = document.createElement ('section'); this.panel.id = 'primary_products_module_panel'; this.panel.className = 'primary_products_module_panel'; this.panel.hidden = true; this.panel.setAttribute ('aria-label', 'Primary Products'); website.parameters.rightContainerDiv.appendChild (this.panel);
        website.modulePanels.Register ('primary-products', { title : 'Primary Products', body : this.panel, animated : true, onOpen : () => this.Ensure (), onMode : () => this.Refresh () });
        website.auth?.Subscribe?.(user => { const owner = user?.id || null; if (owner !== this.owner) { this.owner = owner; this.catalogOpen = false; this.artwork.Clear (); this.draft = DefaultProductDraft (); this.Refresh (); } });
    }
    Blocked () { return !this.website.auth?.user || this.website.accountReady === false || this.website.sessionEditor.readOnly || this.website.sessionEditor.busy || this.products?.active; }
    UnavailableReason ()
    {
        if (!this.website.auth?.user) { return 'Sign in to generate a product.'; }
        if (this.website.accountReady === false) { return 'Wait for your account to finish loading.'; }
        if (this.website.sessionEditor.readOnly) { return 'Open an editable session to generate a product.'; }
        if (this.products?.active) { return 'Generating product…'; }
        if (this.website.sessionEditor.busy) { return 'Wait for the current scene operation to finish.'; }
        return this.draft.material === 'glass' ? 'Glass generation is not available yet. Choose opaque plastic.' : '';
    }
    RefreshAvailability () { this.workspace?.SetDisabled (); }
    Inspect () { const shape = this.draft.family === 'bottle' ? BottleShape (this.draft) : null; return { catalogCategory : this.catalogCategory || 'bottles', catalogOpen : this.catalogOpen === true, profile : shape ? { ...shape, bodyHeightMm : this.draft.heightMm - shape.shoulderHeightMm - shape.neckHeightMm - shape.capHeightMm } : null, schemaVersion : 1, units : 'mm', ...this.draft, artwork : this.artwork?.Inspect () || [], draftOnly : false, generationAvailable : this.draft.material !== 'glass', unavailableReason : this.UnavailableReason (), generating : this.products?.active === true }; }
    Configure (changes)
    {
        if (this.Blocked ()) { throw new Error ('Open an editable session before changing the product draft.'); }
        const next = UpdateProductDraft (this.draft, changes);
        if (next.family !== this.draft.family && this.artwork?.entries.length) { throw new Error ('Remove artwork before changing product family.'); }
        ValidateProductArtwork (next, this.artwork?.Inspect () || []); this.draft = next; this.Refresh (); return this.Inspect ();
    }
    Catalog (category = 'bottles', open = true)
    {
        if (!Object.hasOwn (ProductCategories, category) || typeof open !== 'boolean') { throw new Error ('Choose a valid product category and drawer state.'); }
        this.catalogCategory = category; this.catalogOpen = open; this.Refresh (); return { category, open, designs : ListProductDesigns (category) };
    }
    SelectDesign (id)
    {
        if (this.Blocked ()) { throw new Error ('Open an editable idle session.'); }
        const next = ProductDesign (id); ValidateProductArtwork (next, this.artwork?.Inspect () || []);
        if (next.family !== this.draft.family && this.artwork?.entries.length) { throw new Error ('Remove artwork before changing product family.'); }
        this.draft = next; this.Refresh (); return this.Inspect ();
    }
    // Parametric resize shared by the panel's Enter key and primary.dimensions.set: update the draft, then rebuild the
    // selected generated product of the same family in one Undo step.
    async SetDimensions (dimensions, apply = true)
    {
        if (this.Blocked ()) { throw new Error ('Open an editable idle session before changing product dimensions.'); }
        if (typeof apply !== 'boolean') { throw new Error ('Choose whether to apply the dimensions to the selected product.'); }
        this.Configure (DimensionChanges (this.draft, dimensions));
        const target = apply && this.LiveTarget (); const result = target ? await this.products.Generate (true) : null;
        const size = ProductSize (this.draft), text = [size.widthMm, size.lengthMm, size.heightMm].map (v => Math.round (v * 100) / 100).join (' × ') + ' mm';
        return { ...size, units : 'mm', updated : Boolean (result), objectId : result?.objectId || null, message : result ? 'Resized selected product to ' + text + '.' : 'Draft set to ' + text + '. Select a generated ' + this.draft.family + ' to resize it live, or Generate.' };
    }
    LiveTarget ()
    {
        try { return this.products.Selected ().definition.draft.family === this.draft.family; } catch { return false; }
    }
    async GenerateDesign (id)
    {
        this.SelectDesign (id); const result = await this.products.Generate ();
        return { ...result, design : id, message : 'Generated ' + ListProductDesigns ().find (design => design.id === id).name + '.' };
    }
    Reset ()
    {
        if (this.Blocked ()) { throw new Error ('Open an editable session before changing the product draft.'); }
        this.artwork?.Clear (); this.draft = DefaultProductDraft (); this.Refresh (); return this.Inspect ();
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
                this.workspace = new module.PrimaryProductsPanel ({ catalog : (category, open) => this.Catalog (category, open), selectDesign : id => this.SelectDesign (id), generateDesign : id => this.GenerateDesign (id), setDimensions : dimensions => this.SetDimensions (dimensions), inspect : () => this.Inspect (), configure : changes => this.Configure (changes), reset : () => this.Reset (), generate : () => this.products.Generate (), update : () => this.products.Generate (true), loadSelected : () => this.products.LoadSelected (), artworkOpen : () => this.artwork.Open (), artworkRemove : zone => this.artwork.Remove ({ zone }), artworkMapping : args => this.artwork.Mapping (args), artworkPreview : zone => { if (this.previewUrl) { URL.revokeObjectURL (this.previewUrl); this.previewUrl = null; } const a = this.artwork.entries.find (a => a.zone === zone), r = a && this.artwork.resources.get (a.resourceId); if (r) { this.previewUrl = URL.createObjectURL (new Blob ([r.buffer], { type : a.mime })); } return this.previewUrl; }, units : () => this.website.preferences.units, blocked : () => this.Blocked () }, this.panel);
            })().catch (error => { this.loading = null; this.panel.textContent = error.message; throw error; });
        }
        await this.loading; this.Refresh ();
    }
    Open () { return this.website.modulePanels.Open ('primary-products'); }
    Refresh () { this.workspace?.Refresh (); }
}
