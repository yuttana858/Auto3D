# Auto3D 0.53.1 / Packaging 1.10.4 / Primary Products 0.5.0

## Right-drag pans sideways in the main viewer

In the main viewer, the horizontal part of a right-button drag now moves the camera left and right (the same sideways pan as middle-drag) instead of rotating around the model. Vertical right-drag movement still tilts the view around the selection, and a short right click still opens the context menu. The engine navigation gains an opt-in `rightDragPansHorizontally` flag; the shared-link mini viewer leaves it off, so its "right-drag to rotate" behavior is unchanged. Touch navigation is unchanged.

## Browser tests wait for sign-in

Since 0.51.0 the welcome screen closes immediately in automated browsers, before the saved sign-in is restored. Seven browser tests waited only for the welcome screen and could call commands while the app was still locked; `errorlogs-panel` failed this way in CI on main after PR #87. They now also wait for the unlocked app: `capture`, `errorlogs-panel`, `lighting-ui`, `packaging-effects`, `rendering`, `session-cameras` and `shadow-controls`.

`capture`, `packaging-effects`, `rendering` and `shadow-controls` still fail on older, unrelated expectations, exactly as on unchanged main; they remain outside the CI list. `selected-orbit` now waits for the camera to settle, checks the current focus behavior (camera position kept, orbit center on the selection) and the new right-drag behavior; it passes and joins the CI list (38 tests).
