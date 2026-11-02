const clamp = x => Math.max (0, Math.min (1, x));
const ease = x => { const u = clamp (x); return u * u * (3 - 2 * u); };
export function FoldMotionProgress (progress, autoFit = true)
{
    return autoFit ? clamp ((progress - 0.15) / 0.7) : clamp (progress);
}

export function CameraBottomInset (viewer, status)
{
    const canvas = viewer.renderer?.domElement?.getBoundingClientRect?.(); const overlay = status?.parentElement?.getBoundingClientRect?.();
    if (!canvas?.height || !overlay || overlay.top >= canvas.bottom || overlay.bottom <= canvas.top) { return 0; }
    return Math.max (0, Math.min (0.35, (canvas.bottom - Math.max (canvas.top, overlay.top) + 12) / canvas.height));
}

// Camera presentation only. The box holds its start/end pose while framing eases.
export function FoldCameraFrame (initial, sphere, sweepRadius, progress, aspect = 1, bottomInset = 0)
{
    void sweepRadius; // Retained for callers using the original API.
    const p = clamp (progress); const camera = initial.Clone ();
    if (p === 0) { return camera; }
    const offset = ['x', 'y', 'z'].map (axis => initial.eye[axis] - initial.center[axis]); const distance = Math.hypot (...offset) || 1;
    const direction = offset.map (v => v / distance); const horizontal = Math.hypot (direction[0], direction[2]);
    const elevation = Math.max (25 * Math.PI / 180, Math.min (65 * Math.PI / 180, Math.asin (Math.max (-1, Math.min (1, direction[1])))));
    const target = [horizontal > 1e-8 ? direction[0] / horizontal * Math.cos (elevation) : Math.cos (elevation) / Math.SQRT2, Math.sin (elevation), horizontal > 1e-8 ? direction[2] / horizontal * Math.cos (elevation) : Math.cos (elevation) / Math.SQRT2];
    const lead = ease (p / 0.15);
    // Frame only the current pose: a flat blank must not force the initial
    // closed box away from the camera before its panels begin unfolding.
    const radius = sphere.radius;
    const halfFov = Math.atan (Math.tan ((initial.fov || 45) * Math.PI / 360) * Math.min (1, Math.max (0.05, aspect)));
    const inset = Math.max (0, Math.min (0.35, bottomInset));
    const fitDistance = Math.max (1e-6, radius) * 1.04 / Math.sin (halfFov) / (1 - inset);
    const d = distance * (1 - lead) + fitDistance * lead;
    const vector = direction.map ((v, i) => v * (1 - lead) + target[i] * lead); const length = Math.hypot (...vector) || 1;
    for (const [i, axis] of ['x', 'y', 'z'].entries ()) {
        camera.center[axis] = initial.center[axis] * (1 - lead) + sphere.center[axis] * lead;
        camera.eye[axis] = camera.center[axis] + vector[i] / length * d;
    }
    const dir = vector.map (v => v / length); const up = [initial.up.x, initial.up.y, initial.up.z]; const dot = up.reduce ((sum, v, i) => sum + v * dir[i], 0);
    const screenUp = up.map ((v, i) => v - dot * dir[i]); const upLength = Math.hypot (...screenUp) || 1;
    const pan = d * Math.tan ((initial.fov || 45) * Math.PI / 360) * inset * lead;
    for (const [i, axis] of ['x', 'y', 'z'].entries ()) { camera.center[axis] -= screenUp[i] / upLength * pan; camera.eye[axis] -= screenUp[i] / upLength * pan; }
    return camera;
}
