# Auto3D 0.58.0 — oval and rounded-rectangle bottles; fit on generate; right-drag keeps framing

Primary Products 0.9.0; Packaging remains 1.10.7. Based on main after merged PR #96 (0.57.1). Not deployed.

**Non-round bottles (build plan Phase 2).** Bottles now have a **Cross-section** of Round, Oval or Rounded rectangle, stored as an optional `bottleSection { shape, depthMm, cornerRadiusMm }`.
- **Size:** `diameterMm` remains the body width (W) and `depthMm` is the front-to-back length (L), so W × L × H fields, callouts and `primary.dimensions.set` edit width and depth independently. Pressing Enter on Length resizes the depth of the selected bottle live.
- **Geometry:** the body is lofted from an arc-length-sampled section outline. The straight walls keep the exact section, the shoulder blends to the round neck along each outline direction, and the cap is unchanged. Bounds are exact: X = ±W/2 and Z = ±L/2.
- **Neck fit:** the default neck and its fit check follow the narrower side.
- **Labels:** front, back and wrap labels follow the outline by arc length, so they keep their physical size. Front and back panels span the rectangle's flat face (plus part of each corner) or 30% of the oval perimeter; a wrap uses the whole perimeter.
- **Persistence and validation:** existing round definitions are unchanged and need no migration. Invalid sections are rejected before mutation, including a corner radius above half the narrower side, a depth outside 10–500 mm, or a neck that no longer fits.
- **Catalog:** three new designs, for 33 in total: oval shampoo, rectangular cleaner and square juice bottle.

**Fit on generate.** A newly generated Primary Product (Generate, a design card or `primary.designs.generate`) is selected and framed to fit the window. Live resizes (Enter, `primary.dimensions.set`) keep the current view.

**Right-drag orbits without re-aiming.** In the main viewer, right-drag still orbits around the selected object's center (left/right, with up/down tilt), but it no longer first points the camera at the object. The eye and the view center orbit together around the object, so the current framing is kept and the distance to the object is unchanged. `camera.orbit.focus_selected` still aims the view at the selection when asked explicitly.

Validation: application lint, 805 app/module tests (new: section validation and W/L mapping, lofted bounds, finite normals, label arc length), 64 MCP tests. Browser tests pass for `primary-products` (new: rectangle section via the UI, corner radius, L callout, Enter live depth resize, oval design callouts, fit on generate) and `selected-orbit` (new: right-drag keeps the view-center offset and eye distance to the model instead of snapping onto it).
