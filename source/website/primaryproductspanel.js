import { DefaultProductDetails, ScaleProductChanges } from '../../modules/primary-products/src/details.js';
import { ProductCategories, ListProductDesigns, ProductDesign } from '../../modules/primary-products/src/catalog.js';
import { PrimaryProductsArtwork } from './primaryproductsartwork.js';
import { ValidateProductArtwork } from '../../modules/primary-products/src/artwork.js';
import { PrimaryProductsWorkspace } from './primaryproductsworkspace.js';
import { ProductCalloutRecords } from './dimensioncore.js';
import { DefaultProductDraft, UpdateProductDraft, BottleShape, ProductSize, DimensionChanges } from '../../modules/primary-products/src/state.js';
const moduleUrl = new URL ('./primary-products/primary-products.module.js', import.meta.url);
moduleUrl.search = new URL (import.meta.url).search;
export class PrimaryProductsPanel
{
    constructor (website)
    {
        this.website = website; this.artwork = new PrimaryProductsArtwork (this); this.products = new PrimaryProductsWorkspace (this, async () => { await this.Ensure (); return this.module; }); this.draft = UpdateProductDraft (DefaultProductDraft (), { details : {} }); this.callouts = true; this.owner = website.auth?.user?.id || null;
        this.panel = document.createElement ('section'); this.panel.id = 'primary_products_module_panel'; this.panel.className = 'primary_products_module_panel'; this.panel.hidden = true; this.panel.setAttribute ('aria-label', 'Primary Products'); website.parameters.rightContainerDiv.appendChild (this.panel);
        website.modulePanels.Register ('primary-products', { title : 'Primary Products', body : this.panel, animated : true, onOpen : () => this.Ensure (), onMode : () => this.Refresh () });
        website.auth?.Subscribe?.(user => { const owner = user?.id || null; if (owner !== this.owner) { this.owner = owner; this.artworkTarget = null; this.catalogOpen = false; this.artwork.Clear (); this.draft = UpdateProductDraft (DefaultProductDraft (), { details : {} }); this.Refresh (); } });
    }
    Blocked () { return !this.website.auth?.user || this.website.accountReady === false || this.website.sessionEditor.readOnly || this.website.sessionEditor.busy || this.products?.active; }
    UnavailableReason ()
    {
        if (!this.website.auth?.user) { return 'Sign in to generate a product.'; }
        if (this.website.accountReady === false) { return 'Wait for your account to finish loading.'; }
        if (this.website.sessionEditor.readOnly) { return 'Open an editable session to generate a product.'; }
        if (this.products?.active) { return 'Generating product…'; }
        if (this.website.sessionEditor.busy) { return 'Wait for the current scene operation to finish.'; }
        return '';
    }
    RefreshAvailability () { this.workspace?.SetDisabled (); }
    Inspect () { const shape = this.draft.family === 'bottle' ? BottleShape (this.draft) : null; return { catalogCategory : this.catalogCategory || 'bottles', catalogOpen : this.catalogOpen === true, profile : shape ? { ...shape, bodyHeightMm : this.draft.heightMm - shape.shoulderHeightMm - shape.neckHeightMm - shape.capHeightMm } : null, schemaVersion : 1, units : 'mm', ...this.draft, artwork : this.artwork?.Inspect () || [], draftOnly : false, generationAvailable : true, callouts : this.callouts, unavailableReason : this.UnavailableReason (), generating : this.products?.active === true }; }
    Configure (changes)
    {
        if (this.Blocked ()) { throw new Error ('Open an editable session before changing the product draft.'); }
        const next = UpdateProductDraft (this.draft, changes.family && changes.family !== this.draft.family && changes.details === undefined ? { ...changes, details : {} } : changes);
        if (next.family !== this.draft.family && this.artwork?.entries.length) { throw new Error ('Remove artwork before changing product family.'); }
        ValidateProductArtwork (next, this.artwork?.Inspect () || []); this.draft = next; this.Refresh (); return this.Inspect ();
    }
    Details (changes)
    {
        return this.Configure ({ details : changes === null ? null : { ...(this.draft.details || DefaultProductDetails (this.draft)), ...changes } });
    }
    async Scale ({ factor, scaleArtwork = true })
    {
        if (this.Blocked () || typeof scaleArtwork !== 'boolean') { throw new Error ('Open an editable session and choose whether to scale artwork.'); }
        const next = UpdateProductDraft (this.draft, ScaleProductChanges (this.draft, factor));
        const entries = ValidateProductArtwork (next, this.artwork.Inspect ().map (a => scaleArtwork ? { ...a, widthMm : a.widthMm*factor, heightMm : a.heightMm*factor, ...(a.offsetXmm !== undefined ? { offsetXmm : a.offsetXmm*factor } : {}), ...(a.offsetYmm !== undefined ? { offsetYmm : a.offsetYmm*factor } : {}) } : a));
        const before = this.draft, arts = this.artwork.entries; this.draft = next; this.artwork.entries = entries;
        try { const target = this.LiveTarget (), result = target ? await this.products.Generate (true, true) : null; this.Refresh (); return { ...ProductSize (next), updated : Boolean (result), objectId : result?.objectId || null, scaleArtwork }; }
        catch (error) { this.draft = before; this.artwork.entries = arts; this.Refresh (); throw error; }
    }
    Catalog (category = 'bottles', open = true)
    {
        if (['clamshell-retail', 'clamshell-food'].includes (category)) { category = 'clamshells'; }
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
        const target = apply && this.LiveTarget (); const result = target ? await this.products.Generate (true, true) : null;
        const size = ProductSize (this.draft), text = [size.widthMm, size.lengthMm, size.heightMm].map (v => Math.round (v * 100) / 100).join (' × ') + ' mm';
        return { ...size, units : 'mm', updated : Boolean (result), objectId : result?.objectId || null, message : result ? 'Resized selected product to ' + text + '.' : 'Draft set to ' + text + '. Select a generated ' + this.draft.family + ' to resize it live, or Generate.' };
    }
    // W × L × H callouts on the 3D model: the setting applies to newly generated products, and to the selected generated
    // product immediately (one Undo step through the Dimensions layer).
    SetCallouts (visible)
    {
        if (typeof visible !== 'boolean') { throw new Error ('Choose whether to show W × L × H callouts.'); }
        if (this.Blocked ()) { throw new Error ('Open an editable idle session before changing callouts.'); }
        this.callouts = visible; let object = null; try { object = this.products.Selected ().object; } catch { object = null; }
        let changed = false;
        if (object) {
            const doc = this.website.sessionEditor.document, current = doc.dimensions || [], own = current.filter (d => d.objectId === object.id && d.kind === 'design');
            if (visible && !own.length) { this.website.dimensions.Change ([...current, ...ProductCalloutRecords (doc, object)], true); changed = true; }
            if (!visible && own.length) { this.website.dimensions.Change (current.filter (d => !own.includes (d))); changed = true; }
        }
        this.Refresh (); return { callouts : visible, objectId : object?.id || null, changed, message : (visible ? 'W × L × H callouts on' : 'W × L × H callouts off') + (object ? ' for the selected product.' : ' for new products.') };
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
        this.artwork?.Clear (); this.draft = UpdateProductDraft (DefaultProductDraft (), { details : {} }); this.Refresh (); return this.Inspect ();
    }
    async OpenMaterials ()
    {
        this.products.LoadSelected (); await this.Ensure ();
        this.artworkTarget = this.products.Selected ().object.id;
        await this.website.modulePanels.Set ('primary-products', 'minimal');
        this.website.materialPanel.Open (); return { opened : true, objectId : this.artworkTarget };
    }
    async MountArtwork (parent)
    {
        let selected;
        try { selected = this.products.Selected (); } catch { return; }
        const id = selected.object.id; await this.Ensure ();
        if (!parent.isConnected || this.website.sessionEditor.selected?.id !== id) { return; }
        if (this.artworkTarget !== id) { this.products.LoadSelected (); this.artworkTarget = id; }
        parent.appendChild (this.workspace.artworkRoot); this.Refresh (); return true;
    }
    async ApplyArtwork ()
    {
        const selected = this.products.Selected ();
        if (selected.object.id !== this.artworkTarget) { throw new Error ('Open the material editor for the selected product first.'); }
        const shape = d => { const copy = { ...d }; delete copy.labelZone; return JSON.stringify (copy); };
        if (shape (selected.definition.draft) !== shape (this.draft)) { throw new Error ('Apply product changes before applying label artwork.'); }
        return this.products.Generate (true, true);
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
                this.workspace = new module.PrimaryProductsPanel ({ setDetails : changes => this.Details (changes), scaleProduct : args => this.Scale (args), openMaterials : () => this.OpenMaterials (), applyArtwork : () => this.ApplyArtwork (), catalog : (category, open) => this.Catalog (category, open), selectDesign : id => this.SelectDesign (id), generateDesign : id => this.GenerateDesign (id), setCallouts : visible => this.SetCallouts (visible), setDimensions : dimensions => this.SetDimensions (dimensions), inspect : () => this.Inspect (), configure : changes => this.Configure (changes), reset : () => this.Reset (), generate : () => this.products.Generate (), update : () => this.products.Generate (true), loadSelected : () => this.products.LoadSelected (), artworkOpen : () => this.artwork.Open (), artworkRemove : zone => this.artwork.Remove ({ zone }), artworkMapping : args => this.artwork.Mapping (args), artworkPreview : zone => { if (this.previewUrl) { URL.revokeObjectURL (this.previewUrl); this.previewUrl = null; } const a = this.artwork.entries.find (a => a.zone === zone), r = a && this.artwork.resources.get (a.resourceId); if (r) { this.previewUrl = URL.createObjectURL (new Blob ([r.buffer], { type : a.mime })); } return this.previewUrl; }, units : () => this.website.preferences.units, blocked : () => this.Blocked () }, this.panel);
            })().catch (error => { this.loading = null; this.panel.textContent = error.message; throw error; });
        }
        await this.loading; this.Refresh ();
    }
    Open () { return this.website.modulePanels.Open ('primary-products'); }
    Refresh () { this.workspace?.Refresh (); }
}
