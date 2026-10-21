import { GetBackgroundPreset } from '../engine/viewer/background.js';
import { ApplyCameraState, CaptureCameraState } from './sessiontimeline.js';

// Explicit colors make theme-relative backgrounds portable across viewers.
export function CapturePresentationBackground (settings, dark)
{
    return { colors : [...GetBackgroundPreset (settings.backgroundPreset, dark).colors], dark,
        color : { ...settings.backgroundColor } };
}

export function RestorePresentationCamera (viewer, view)
{
    let state = view.cameraState;
    if (!state && view.camera) {
        const camera = view.camera;
        state = { ...camera, ...Object.fromEntries (['eye', 'center', 'up'].map (key => [key, camera[key] && [camera[key].x, camera[key].y, camera[key].z]])) };
    }
    if (!state || !['eye', 'center', 'up'].every (key => Array.isArray (state[key]) && state[key].length === 3 && state[key].every (Number.isFinite)) || Math.hypot (...state.eye.map ((v, i) => v - state.center[i])) < 1e-9 || Math.hypot (...state.up) < 1e-9) { return false; }
    ApplyCameraState (viewer, { ...state, projectionMode : [1, 2].includes (state.projectionMode) ? state.projectionMode : null, fov : Number.isFinite (state.fov) ? Math.max (10, Math.min (120, state.fov)) : 45 });
    return true;
}

export function SavedPresentationCamera (viewer) { return CaptureCameraState (viewer); }
