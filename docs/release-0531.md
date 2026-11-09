# Auto3D 0.53.1 / Packaging 1.10.4 / Primary Products 0.5.0

## Right-drag pans sideways in the main viewer

In the main viewer, the horizontal part of a right-button drag now moves the camera left and right (the same sideways pan as middle-drag) instead of rotating around the model. Vertical right-drag movement still tilts the view around the selection, and a short right click still opens the context menu. The engine navigation gains an opt-in `rightDragPansHorizontally` flag; the shared-link mini viewer leaves it off, so its "right-drag to rotate" behavior is unchanged. Touch navigation is unchanged.

## One landing page for welcome and sign-in

The welcome scene and the sign-in screen were two full-screen steps: the welcome waited for a click anywhere, then a separate sign-in screen appeared, often showing "Checking saved sign-in…". They are now one landing page:

- The sign-in panel sits beside the Auto3D identity on the animated welcome scene (stacked on narrow screens). The saved sign-in is checked in the background as soon as the page opens.
- Signed out: sign in on the landing page; a successful sign-in opens the workspace directly.
- Saved sign-in: the landing shows "Welcome back · Signed in as …" with **Continue to workspace** (primary) and Sign out, and waits for the user.
- Clicks, Escape or Enter elsewhere on the landing never bypass sign-in. After the landing closes, signing out or a revoked session shows the existing full-screen sign-in gate.
- New agent command `auth.continue` continues from the landing with a saved sign-in (returns `continued : false` when signed out). Automated browsers continue automatically once signed in, as before.
- New browser regression `landing-signin` runs the human flow (with `navigator.webdriver` hidden) on desktop and mobile; `auth`, updated for the combined page, now passes and joins CI (41 tests).

## Closer fold/unfold auto-fit

Packaging fold and unfold animations kept the camera far out and did not re-frame the result. Measured on a 300 × 200 × 150 mm 0201 box: the flat dieline filled 59% of the width, and after folding the closed box filled only 18% × 24% of the view, off to the left, with the camera at 1,779 mm instead of about 600 mm.

- **Stale bounds.** The camera framed `Box3.setFromObject` of the folding preview. Folding moves vertices in place, so each panel's cached geometry bounds still described the flat pose; the closed box was framed as if it were still a 1 m blank. `VisibleBounds` now recomputes bounds from the current vertices of visible meshes only.
- **Closer crop.** Framing fits the box's projected corners against both the horizontal and vertical field of view with a 10% margin, instead of its bounding sphere, so boxes and flat dielines fill the view. The command-bar inset is still respected.
- **Re-frame the result.** The finished object replaces the preview at the box's original position; the camera now eases to fit it, and the fold reports completed only after that settles.

Result for the same box: the dieline fills about 85% of the width (camera 1,197 mm), the camera follows the box in as it closes (1,020 → 612 mm) without drifting off it, and the closed box ends centred, filling about 53% × 64% of the view. Timeline fold actions use the same framing. New browser regression `fold-camera-fit` (in CI) and unit tests cover current-pose bounds and the projected fit. `scene-presentation` now compares the "auto-fit off" camera with a 1e-6 tolerance instead of exact floats.

## Browser tests wait for sign-in

Since 0.51.0 the welcome screen closes immediately in automated browsers, before the saved sign-in is restored. Seven browser tests waited only for the welcome screen and could call commands while the app was still locked; `errorlogs-panel` failed this way in CI on main after PR #87. They now also wait for the unlocked app: `capture`, `errorlogs-panel`, `lighting-ui`, `packaging-effects`, `rendering`, `session-cameras` and `shadow-controls`.

`capture`, `packaging-effects`, `rendering` and `shadow-controls` still fail on older, unrelated expectations, exactly as on unchanged main; they remain outside the CI list. `selected-orbit` now waits for the camera to settle, checks the current focus behavior (camera position kept, orbit center on the selection) and the new right-drag behavior; it passes and joins the CI list.
