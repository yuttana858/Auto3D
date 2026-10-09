import { CaptureCameraState, ApplyCameraState } from './sessiontimeline.js';

export function ValidateCameraViews (data)
{
    if (data === undefined || data === null) { return { version : 1, views : [] }; }
    if (data.version !== 1 || !Array.isArray (data.views) || data.views.length > 50) { throw new Error ('Invalid saved camera list.'); }
    const ids = new Set ();
    const views = data.views.map ((view) => {
        const state = view?.state;
        if (typeof view?.id !== 'string' || !view.id || view.id.length > 100 || ids.has (view.id) || typeof view.name !== 'string' || !view.name.trim () || view.name.length > 100) { throw new Error ('Invalid saved camera.'); }
        if (!state || !['eye', 'center', 'up'].every ((key) => Array.isArray (state[key]) && state[key].length === 3 && state[key].every (Number.isFinite)) || !Number.isFinite (state.fov) || state.fov < 10 || state.fov > 120 || ![1, 2, null].includes (state.projectionMode)) { throw new Error ('Invalid saved camera state.'); }
        const distance = Math.hypot (...state.eye.map ((value, i) => value - state.center[i]));
        if (distance < 1e-9 || Math.hypot (...state.up) < 1e-9) { throw new Error ('Invalid saved camera orientation.'); }
        ids.add (view.id);
        return { id : view.id, name : view.name.trim (), state : { eye : [...state.eye], center : [...state.center], up : [...state.up], fov : state.fov, projectionMode : state.projectionMode } };
    });
    return { version : 1, views };
}

export class SessionCameras
{
    constructor (editor) { this.editor = editor; this.data = ValidateCameraViews (); }
    Inspect () { return structuredClone (this.data); }
    Load (data) { this.data = ValidateCameraViews (data); this.Refresh (); }
    Refresh () { this.editor.website.cameraPanel?.Render (); this.editor.website.renderingPanel?.SyncCameras (); this.editor.RefreshButtons?.(); }
    AssertWritable () { if (this.editor.readOnly || this.editor.busy) { throw new Error ('Camera views cannot be edited in this session.'); } }
    Change (update)
    {
        this.AssertWritable (); const before = this.Inspect (); const draft = this.Inspect (); const result = update (draft);
        const after = ValidateCameraViews (draft); this.data = after;
        this.editor.history.Push ({ undo : () => this.Load (before), redo : () => this.Load (after) });
        this.editor.MarkDirty (); this.Refresh (); return result;
    }
    Create (name)
    {
        const view = { id : crypto.randomUUID (), name, state : CaptureCameraState (this.editor.website.viewer) };
        this.Change ((data) => { data.views.push (view); }); return structuredClone (this.data.views.at (-1));
    }
    Find (id) { const view = this.data.views.find ((item) => item.id === id); if (!view) { throw new Error ('Camera view not found.'); } return view; }
    Activate (id)
    {
        const view = this.Find (id); this.editor.timeline.Stop (); ApplyCameraState (this.editor.website.viewer, view.state);
        if (!this.editor.readOnly) { this.editor.MarkDirty (); } this.Refresh (); return structuredClone (view);
    }
    Update (id) { this.Find (id); this.Change ((data) => { data.views.find ((view) => view.id === id).state = CaptureCameraState (this.editor.website.viewer); }); return structuredClone (this.Find (id)); }
    Rename (id, name) { this.Find (id); this.Change ((data) => { data.views.find ((view) => view.id === id).name = name; }); return structuredClone (this.Find (id)); }
    Delete (id) { this.Find (id); this.Change ((data) => { data.views = data.views.filter ((view) => view.id !== id); }); return { deleted : id }; }
    SetFov (fov)
    {
        if (!Number.isFinite (fov) || fov < 10 || fov > 120) { throw new Error ('FOV must be between 10 and 120 degrees.'); }
        this.editor.timeline.Stop (); const viewer = this.editor.website.viewer; const camera = viewer.GetCamera ().Clone (); camera.fov = fov; viewer.SetCamera (camera);
        if (!this.editor.readOnly) { this.editor.MarkDirty (); } this.Refresh (); return { fov };
    }
}
