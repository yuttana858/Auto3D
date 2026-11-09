import { Box3 } from 'three';

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

// Bounds of the meshes a viewer can actually see, in their current pose. Box3.setFromObject
// reuses each geometry's cached bounds (the flat pose, since folding moves vertices in place)
// and counts hidden helpers, which kept the fold camera zoomed far out and off the box.
export function VisibleBounds (object)
{
    const box = new Box3 (); if (!object) { return box; }
    object.updateWorldMatrix?.(true, true);
    object.traverseVisible (child => {
        if (!child.isMesh || !child.geometry) { return; }
        // Folding moves vertices in place, so a cached geometry bounding box still describes the flat pose.
        child.geometry.computeBoundingBox ();
        box.union (child.geometry.boundingBox.clone ().applyMatrix4 (child.matrixWorld));
    });
    return box;
}

// Fills the view with the box's projected corners (not its bounding sphere) using both the
// horizontal and vertical field of view, so boxes and flat dielines stay closely cropped.
export const FoldFitMargin = 0.9;
function ProjectedFit (bounds, direction, up, tanX, tanY)
{
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const unit = v => { const length = Math.hypot (...v) || 1; return v.map (x => x / length); };
    const right = unit (cross (up, direction)), screenUp = cross (direction, right);
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const center = [(bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2, (bounds.min.z + bounds.max.z) / 2];
    const corners = [];
    for (const x of [bounds.min.x, bounds.max.x]) { for (const y of [bounds.min.y, bounds.max.y]) { for (const z of [bounds.min.z, bounds.max.z]) { const rel = [x - center[0], y - center[1], z - center[2]]; corners.push ([dot (rel, right), dot (rel, screenUp), dot (rel, direction)]); } } }
    // Centre the projected extents, then find the nearest distance at which every corner fits.
    const midX = (Math.min (...corners.map (c => c[0])) + Math.max (...corners.map (c => c[0]))) / 2;
    const midY = (Math.min (...corners.map (c => c[1])) + Math.max (...corners.map (c => c[1]))) / 2;
    let distance = 1e-6;
    for (const [x, y, z] of corners) { distance = Math.max (distance, z + Math.abs (x - midX) / (tanX * FoldFitMargin), z + Math.abs (y - midY) / (tanY * FoldFitMargin)); }
    return { center : center.map ((v, i) => v + right[i] * midX + screenUp[i] * midY), distance };
}

// Camera presentation only. The box holds its start/end pose while framing eases.
// Pass bounds (a Box3 of the visible pose) for a projected fit; the sphere remains the fallback.
export function FoldCameraFrame (initial, sphere, sweepRadius, progress, aspect = 1, bottomInset = 0, bounds = null)
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
    const radius = sphere ? sphere.radius : 1;
    const halfFov = Math.atan (Math.tan ((initial.fov || 45) * Math.PI / 360) * Math.min (1, Math.max (0.05, aspect)));
    const inset = Math.max (0, Math.min (0.35, bottomInset));
    const fitDistance = Math.max (1e-6, radius) * 1.04 / Math.sin (halfFov) / (1 - inset);
    const vector = direction.map ((v, i) => v * (1 - lead) + target[i] * lead); const length = Math.hypot (...vector) || 1;
    let fitCenter = sphere ? [sphere.center.x, sphere.center.y, sphere.center.z] : [initial.center.x, initial.center.y, initial.center.z], fit = fitDistance;
    if (bounds && !bounds.isEmpty ()) {
        const tanY = Math.tan ((initial.fov || 45) * Math.PI / 360) * (1 - inset), tanX = Math.tan ((initial.fov || 45) * Math.PI / 360) * Math.max (0.05, aspect);
        const projected = ProjectedFit (bounds, vector.map (v => v / length), [initial.up.x, initial.up.y, initial.up.z], tanX, tanY);
        fitCenter = projected.center; fit = projected.distance;
    }
    const d = distance * (1 - lead) + fit * lead;
    for (const [i, axis] of ['x', 'y', 'z'].entries ()) {
        camera.center[axis] = initial.center[axis] * (1 - lead) + fitCenter[i] * lead;
        camera.eye[axis] = camera.center[axis] + vector[i] / length * d;
    }
    const dir = vector.map (v => v / length); const up = [initial.up.x, initial.up.y, initial.up.z]; const dot = up.reduce ((sum, v, i) => sum + v * dir[i], 0);
    const screenUp = up.map ((v, i) => v - dot * dir[i]); const upLength = Math.hypot (...screenUp) || 1;
    const pan = d * Math.tan ((initial.fov || 45) * Math.PI / 360) * inset * lead;
    for (const [i, axis] of ['x', 'y', 'z'].entries ()) { camera.center[axis] -= screenUp[i] / upLength * pan; camera.eye[axis] -= screenUp[i] / upLength * pan; }
    return camera;
}
