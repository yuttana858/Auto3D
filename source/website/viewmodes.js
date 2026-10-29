import * as THREE from 'three';

export const ViewModeNames = ['default', 'wireframe', 'cel', 'xray'];

// Display materials are separate from the model's saved material definitions.
export class ViewModes
{
    constructor (website) { this.website = website; this.mode = 'default'; this.originals = new Map (); this.overrides = new Map (); this.sources = new Map (); }
    Inspect () { return { mode : this.mode, options : [...ViewModeNames] }; }
    Restore ()
    {
        for (const [mesh, original] of this.originals) { mesh.material = original; }
        this.originals.clear (); for (const material of this.overrides.values ()) { material.dispose (); } this.overrides.clear (); this.sources.clear ();
    }
    Material (source)
    {
        if (!source) { return source; } if (this.overrides.has (source)) { return this.overrides.get (source); }
        const common = { color : source.color?.clone () || new THREE.Color (0xb9c3ca), side : source.side, name : source.name, map : source.map || null };
        const result = this.mode === 'wireframe' ? new THREE.MeshBasicMaterial ({ ...common, map : null, wireframe : true }) : this.mode === 'cel' ? new THREE.MeshToonMaterial (common) : new THREE.MeshBasicMaterial ({ ...common, transparent : true, opacity : .22, depthWrite : false, side : THREE.DoubleSide });
        result.name = source.name; this.overrides.set (source, result); this.sources.set (result, source); return result;
    }
    Refresh ()
    {
        if (this.mode === 'default') { return; }
        const root = this.website.viewer.mainModel?.mainModel?.GetRootObject?.(); if (!root) { return; }
        root.traverse (mesh => { if (!mesh.isMesh || !mesh.material || this.originals.has (mesh)) { return; } const source = material => this.sources.get (material) || material; const original = Array.isArray (mesh.material) ? mesh.material.map (source) : source (mesh.material); this.originals.set (mesh, original); mesh.material = Array.isArray (original) ? original.map (material => this.Material (material)) : this.Material (original); });
    }
    Set (mode)
    {
        if (!ViewModeNames.includes (mode)) { throw new Error ('Choose Default, Wireframe, Cel shade or X-ray.'); }
        if (this.website.sessionEditor?.busy || this.website.rendering?.running) { throw new Error ('Wait for the current operation before changing view mode.'); }
        this.Restore (); this.mode = mode; this.Refresh (); this.website.viewer.Render (); this.website.renderingPanel?.SyncViewMode (); return this.Inspect ();
    }
}
