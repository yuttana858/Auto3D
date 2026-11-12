import { ArtworkImageInfo, MaxArtworkBytes } from '../../modules/primary-products/src/imageinfo.js';
import { ValidateProductArtwork } from '../../modules/primary-products/src/artwork.js';
import { GetArtworkZones } from '../../modules/primary-products/src/zones.js';

export class PrimaryProductsArtwork
{
    constructor (panel) { this.panel = panel; this.entries = []; this.resources = new Map (); this.generation = 0; }
    Clear () { this.generation++; this.entries = []; this.resources.clear (); }
    Inspect () { return this.entries.map (a => ({ ...a })); }
    Open ()
    {
        if (this.panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        if (!this.input) { this.input = document.createElement ('input'); this.input.type = 'file'; this.input.accept = 'image/png,image/jpeg,image/webp'; this.input.hidden = true; this.panel.panel.appendChild (this.input); this.input.addEventListener ('change', () => { const file = this.input.files?.[0]; this.input.value = ''; if (file) { this.Import (file).catch (error => this.panel.workspace?.ReportError (error.message)); } }); }
        if (!this.input.isConnected) { this.panel.panel.appendChild (this.input); }
        this.input.click (); return { opened : true, interactive : true };
    }
    async Import (file)
    {
        const panel = this.panel, ticket = ++this.generation, owner = panel.website.auth?.user?.id, draft = JSON.stringify (panel.draft), target = panel.website.sessionEditor.document;
        if (panel.Blocked () || !file || file.size > MaxArtworkBytes) { throw new Error ('Use a local image up to 4 MiB in an editable session.'); }
        const buffer = await file.arrayBuffer (), info = ArtworkImageInfo (buffer);
        const bitmap = await createImageBitmap (new Blob ([buffer], { type : info.mime }));
        try { if (bitmap.width > 4096 || bitmap.height > 4096 || bitmap.width * bitmap.height > 16 * 1024 * 1024) { throw new Error ('Decoded image is too large.'); } info.width = bitmap.width; info.height = bitmap.height; } finally { bitmap.close (); }
        const resourceId = Array.from (new Uint8Array (await crypto.subtle.digest ('SHA-256', buffer)), n => n.toString (16).padStart (2, '0')).join ('');
        if (ticket !== this.generation || panel.Blocked () || owner !== panel.website.auth?.user?.id || target !== panel.website.sessionEditor.document || draft !== JSON.stringify (panel.draft)) { throw new Error ('The product, account or session changed before image import finished.'); }
        const zone = GetArtworkZones (panel.draft).find (z => z.id === panel.draft.labelZone), ratio = info.width / info.height;
        const previous = this.entries.find (a => a.zone === zone.id), widthMm = previous?.widthMm ?? Math.min (zone.widthMm * 0.9, zone.heightMm * 0.9 * ratio), heightMm = previous?.heightMm ?? widthMm / ratio;
        const entry = { finish : previous?.finish || 'paperMatte', ...(previous?.offsetXmm !== undefined ? { offsetXmm : previous.offsetXmm, offsetYmm : previous.offsetYmm || 0 } : {}), resourceId, name : String (file.name || 'Label').slice (0, 80), mime : info.mime, zone : zone.id, widthMm, heightMm };
        const entries = ValidateProductArtwork (panel.draft, [...this.entries.filter (a => a.zone !== zone.id), entry]);
        this.resources.set (resourceId, { buffer, ...info }); this.entries = entries; this.Prune (); panel.Refresh (); return { imported : true, artwork : this.Inspect () };
    }
    Prune () { for (const id of this.resources.keys ()) { if (!this.entries.some (a => a.resourceId === id)) { this.resources.delete (id); } } }
    Mapping ({ zone, ...changes })
    {
        if (this.panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        if (Object.keys (changes).some (key => !['widthMm', 'heightMm', 'finish', 'offsetXmm', 'offsetYmm'].includes (key))) { throw new Error ('Invalid label placement or finish.'); }
        if (!this.entries.some (a => a.zone === zone)) { throw new Error ('Import artwork for this zone first.'); }
        this.entries = ValidateProductArtwork (this.panel.draft, this.entries.map (a => a.zone === zone ? { ...a, ...changes } : a)); this.panel.Refresh (); return this.Inspect ();
    }
    Remove ({ zone })
    {
        if (this.panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        this.generation++; this.entries = this.entries.filter (a => a.zone !== zone); this.Prune (); this.panel.Refresh (); return this.Inspect ();
    }
    Load (definition, model)
    {
        const entries = definition.artwork || [], resources = new Map ();
        for (const a of entries) {
            const map = model.materials.find (m => m.diffuseMap?.name?.startsWith (a.resourceId + '.'))?.diffuseMap;
            if (!map?.buffer) { throw new Error ('The saved label source is missing. Remove or replace its artwork before editing.'); }
            resources.set (a.resourceId, { buffer : map.buffer, ...ArtworkImageInfo (map.buffer) });
        }
        this.generation++; this.entries = entries.map (a => ({ ...a })); this.resources = resources;
    }
}
