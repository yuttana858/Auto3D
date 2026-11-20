import { NewLabelCAD, ValidateLabelCAD, LabelCADSVG } from '../../modules/primary-products/src/labelcad.js';
import { ValidateProductArtwork } from '../../modules/primary-products/src/artwork.js';
import { GetArtworkZones } from '../../modules/primary-products/src/zones.js';
import { PackagingContours, ValidatePackaging } from './packagingcore.js';
import { ExtractLabelVectors, TraceLabelImage } from './primarylabelvectors.js';

export class PrimaryLabelCAD
{
    constructor (panel) { this.panel = panel; this.current = null; this.generation = 0; }
    Editor () { return this.panel.website.sessionEditor; }
    Clear ()
    {
        this.generation++; this.current = null; const workspace = this.Editor ().packaging;
        if (this.binding && workspace?.externalProfile === this.binding) { const dialog = workspace.dialog; dialog?._auto3dPackagingCleanup?.(); dialog?.close (); workspace.externalProfile = null; }
        this.binding = null;
    }
    Inspect ()
    {
        const current = this.current;
        if (current && (current.owner !== this.panel.website.auth?.user?.id || current.document !== this.Editor ().document)) { return { available : false }; }
        return current ? { available : true, zone : current.zone, objectId : current.objectId, units : 'mm', profile : structuredClone (current.cad), conversion : { ...current.conversion }, applied : current.applied } : { available : false };
    }
    Guard (current = this.current)
    {
        if (!current || this.panel.Blocked () || current.document !== this.Editor ().document || current.owner !== this.panel.website.auth?.user?.id || current.objectId && current.objectId !== this.Editor ().selected?.id) { throw new Error ('The label target, account or session changed. Reopen label CAD.'); }
        if (JSON.stringify (this.panel.artwork.entries) !== current.artwork) { throw new Error ('The artwork changed. Reopen label CAD to use the current label.'); }
        if (JSON.stringify (this.panel.draft) !== current.draft) { throw new Error ('The product changed. Reopen label CAD for the current physical zone.'); }
    }
    async Open ({ zone } = {})
    {
        if (this.panel.Blocked ()) { throw new Error ('Open an editable, idle session.'); }
        this.panel.SyncSelected?.(); zone = zone ?? this.panel.draft.labelZone;
        const ticket = ++this.generation, panel = this.panel, editor = this.Editor (), objectId = panel.artworkTarget === editor.selected?.id ? editor.selected.id : null;
        const targetZone = GetArtworkZones (panel.draft).find (item => item.id === zone); if (!targetZone) { throw new Error ('Choose an available product label zone.'); }
        const artwork = panel.artwork.entries.find (entry => entry.zone === zone), current = { document : editor.document, owner : panel.website.auth?.user?.id, objectId, zone, draft : JSON.stringify (panel.draft), artwork : JSON.stringify (panel.artwork.entries), applied : false, conversion : { kind : 'blank', approximate : false } };
        let cad = artwork?.cad ? ValidateLabelCAD (artwork.cad) : NewLabelCAD (artwork?.widthMm || targetZone.widthMm * .8, artwork?.heightMm || targetZone.heightMm * .8, targetZone.surface === 'disc');
        if (artwork?.cad) { current.conversion = { kind : 'saved-cad', approximate : false }; }
        else if (artwork) {
            let converted = artwork.source?.kind === 'svg' ? ExtractLabelVectors (artwork.source.svg, cad.widthMm, cad.heightMm) : null;
            if (!converted?.vectorized) {
                const resource = panel.artwork.resources.get (artwork.resourceId); if (!resource) { throw new Error ('Load the saved label image before converting it to CAD.'); }
                converted = await TraceLabelImage (resource.buffer, artwork.mime, cad.widthMm, cad.heightMm);
            }
            if (!converted.vectorized) { throw new Error (converted.reason || 'Unable to convert this label to editable vectors.'); }
            cad = ValidateLabelCAD ({ ...cad, vectorized : true, paths : [...cad.paths, ...converted.paths] });
            current.conversion = { kind : converted.approximate ? 'traced-image' : 'svg-paths', approximate : Boolean (converted.approximate), ...(converted.widthPixels ? { widthPixels : converted.widthPixels, heightPixels : converted.heightPixels, paletteSize : converted.paletteSize } : {}), ...(converted.reason ? { reason : converted.reason } : {}) };
        } else {
            cad = ValidateLabelCAD ({ ...cad, vectorized : true, paths : [...cad.paths, { ...cad.paths[0], id : 'label-paper', type : 'artwork', fill : '#ffffff', stroke : 'none', strokeWidth : 0 }] });
        }
        if (ticket !== this.generation) { throw new Error ('A newer label CAD request replaced this conversion.'); }
        this.Guard (current); current.cad = cad; this.current = current;
        const status = current.conversion.approximate ? current.conversion.reason + ' Review the approximation before Apply.' : 'Editable cut outline and vector artwork; Apply updates the label.';
        this.binding = { title : 'Label CAD · ' + zone, description : status, status, design : () => this.Design (), change : next => this.Change (next), apply : () => this.Apply () };
        const result = editor.packaging.OpenExternal (this.binding);
        return { ...result, ...this.Inspect () };
    }
    Design ()
    {
        if (!this.current) { throw new Error ('Open a label in CAD first.'); }
        return ValidatePackaging ({ version : 1, name : 'Label · ' + this.current.zone, grade : 'Label stock', thickness : .1, paths : this.current.cad.paths });
    }
    Change (profile)
    {
        this.Guard (); const current = this.current, before = current.cad;
        const after = ValidateLabelCAD ({ ...before, paths : profile.paths }); PackagingContours (profile);
        const apply = value => { if (current.document !== this.Editor ().document || current.owner !== this.panel.website.auth?.user?.id) { throw new Error ('This label CAD edit belongs to another session.'); } current.cad = structuredClone (value); current.applied = false; this.Editor ().packaging.Refresh (); };
        apply (after); this.Editor ().history.Push ({ undo : () => apply (before), redo : () => apply (after) }); return this.Inspect ();
    }
    async Apply ()
    {
        this.Guard (); const current = this.current, panel = this.panel, cad = ValidateLabelCAD (current.cad); PackagingContours (this.Design ());
        if (!cad.paths.some (path => path.type === 'artwork')) { throw new Error ('Add artwork before applying this label.'); }
        const beforeZone = panel.draft.labelZone;
        try {
            panel.draft = { ...panel.draft, labelZone : current.zone }; current.draft = JSON.stringify (panel.draft);
            const result = await panel.ChangeArtwork (async () => {
                await panel.artwork.SVG ({ svg : LabelCADSVG (cad), name : 'CAD label · ' + current.zone + '.svg' });
                if (current !== this.current || JSON.stringify (current.cad) !== JSON.stringify (cad)) { throw new Error ('The CAD paths changed during Apply. Review and apply the current paths.'); }
                panel.artwork.entries = ValidateProductArtwork (panel.draft, panel.artwork.entries.map (entry => entry.zone === current.zone ? (() => { const updated = { ...entry, widthMm : cad.widthMm, heightMm : cad.heightMm, cad }; delete updated.source; return updated; }) () : entry));
                return { applied : true, objectId : current.objectId, zone : current.zone, paths : cad.paths.length, units : 'mm' };
            });
            current.applied = true; current.artwork = JSON.stringify (panel.artwork.entries); panel.Refresh (); return result;
        } catch (error) { panel.draft = { ...panel.draft, labelZone : beforeZone }; current.draft = JSON.stringify (panel.draft); throw error; }
    }
}
