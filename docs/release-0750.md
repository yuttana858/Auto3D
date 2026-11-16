# Auto3D 0.75.0 / Packaging 1.11.0 / Primary Products 0.15.0 / Molded Pulp 0.1.0

## Auto Pack

Packaging has Packaging / Auto tabs. Auto shows the selected static product's world-axis bounding box (W=X, L=Z, H=Y) and planned RSC inside dimensions in the account's display units. Measurements include object translation, rotation and scale and use canonical millimeters without display rounding. Select exactly one complete, visible, static mesh object with known scene units. Animated, partly hidden, planar, missing and oversized products are rejected. The existing RSC generator's size/caliper limits still apply.

Auto Pack uses 0.001 inch (0.0254 mm) clearance per product face. Usable dimensions grow by 0.002 inch overall. The existing RSC has an internal glue tab; its intrusion needs one additional board caliper along the longer horizontal dimension. The UI identifies this reserve. The current generator board caliper is used; there is no silently enlarged manufacturing tolerance or smaller-than-supported fallback.

The unfolded finite-caliper blank is positioned beneath the stationary product. One inner bottom flap stays fixed while its adjoining wall rises; remaining walls wrap around the bounding box, other base flaps close beneath it, and top flaps close above it. The same route works in reverse. The product's geometry, transforms, materials and identity are unchanged.

A preflight audits 3,601 poses against both product bounds and other carton panels. Every displayed pose is also checked before rendering. The audit samples less than one degree of hinge movement per interval; it is not a proof of continuous collision freedom or certification of real board compression/production tolerances. Colliding combinations are rejected. Auto Pack uses exact panel surfaces instead of cosmetic paper bow and crease arcs, which can protrude beyond the audited envelope at this small clearance. Existing board textures remain.

Pause, Resume and Cancel are available in Auto. Cancel restores the flat carton. Generation and completion are separate Undo steps: Undo first restores the unfolded carton, then removes it. Saving/exporting is blocked during preparation and playback. Saved metadata retains the specialized fold route through sessions, fold/unfold, preview and timeline controls. A moved, resized or replaced product/carton blocks another fold until Auto Pack is regenerated. Fitted carton geometry/CAD dimension edits also require regeneration; materials can still be edited.

Only the selected product is protected by the fit audit; other scene objects are not packing obstacles. The first release fits an axis-aligned bounding box, not nested products or a minimum-volume orientation search.

## Shared commands

- `packaging.tab({tab:"auto"})` opens the Auto tab without creating geometry.
- `packaging.auto.inspect({})` returns product bounding dimensions, RSC inside dimensions, usable dimensions, glue-tab reserve and clearance in mm.
- `packaging.auto.generate({duration:8})` creates the blank and starts fitting/folding.
- Existing `packaging.fefco.playback.inspect`, `packaging.fefco.control`, `packaging.fefco.animate`, fold check and scrub commands operate on the generated carton.

These are shared UI/agent/MCP services with strict schemas and existing session/account/read-only checks. No upload or publication occurs.
