# Auto3D 0.57.1 — right-drag orbit, live new-box dimensions and 3D product callouts

Packaging 1.10.7; Primary Products 0.8.1. PR #96. Based on main after merged PR #95 (0.57.0). Not deployed.

**Right-drag rotates again.** In the main viewer, right-drag left/right now rotates the camera around the view center instead of panning sideways; up/down still tilts. This reverses the 0.53.1 sideways pan. Each right-drag first re-centers the orbit on the selected model, so the camera turns to face it and rotates around it without moving the eye or changing zoom. With nothing selected, it orbits the current view center. Middle-drag still pans, and the mini viewer is unchanged. The engine keeps the `rightDragPansHorizontally` option, but the main viewer no longer enables it.

**New-box ID/OD dimensions update live.** In the Packaging panel's Box Dimensions section, pressing Enter in the Width (W), Length (L) or Height (H) field now updates the model.
- **A generated box is selected:** that dimension is applied to it in the chosen basis (Inside/ID, Outside/OD or Score/CAD). This uses the same service as the selected-box fields and the `packaging.dimensions.update` path, keeps the object identity and adds one Undo step. Inside/outside targets still need applicable converter allowance factors, and a missing factor is reported in the panel.
- **No box is selected:** Enter generates the current style from the draft, the same as clicking its catalog card.
- Typing without Enter still only edits the draft. The card click handler is now a shared `GenerateStyle` method.

**W × L × H callouts on 3D products.** Generated Primary Products now carry three bracket callouts in the viewport, labelled `W · …`, `L · …` and `H · …`:
- **W** sits along the front-bottom edge, **L** along the right-bottom edge and **H** on the front-right vertical edge, each offset outward from the product's envelope.
- They are a new `design` kind on the existing Dimensions layer. Their lengths come from the product definition in mm, not from the tessellated mesh, so they are exact for round bottles and cans too. They follow live resizes, object moves and rotations, and are listed, hidden and deleted like other dimensions.
- For new products they are added in the same Undo step as the generation.
- Double-clicking a callout (or `dimensions.value`) edits that dimension and rebuilds the product live through `primary.dimensions.set`'s path.
- The panel's **Show W × L × H on model** checkbox (`primary.callouts.set`) sets this for new products and adds or removes the callouts on the selected product (one Undo step). On a scaled object, the label reports the measured scaled length and value editing is disabled, the same as for boxes.

Validation: application lint, 803 app/module tests (new: callouts in the generation Undo step, live resize, toggle off and design-kind validation), 64 MCP tests, and the `selected-orbit`, `packaging-fold-dimensions`, `fefco`, `packaging-presets`, `packaging-thumbnail-generation`, `packaging-cleanup` and `packaging-module`, `primary-products` (new: 3D callout labels, resize following, `dimensions.value` edit with Undo, checkbox off and `primary.callouts.set`), `dimensions` and `packaging-measurements` browser tests pass. `selected-orbit` now asserts that right-drag keeps the view center on the selected model, including after a middle-drag pan moved it away. `packaging-fold-dimensions` asserts that Enter on the ID height resizes the selected box live with Undo/Redo.
