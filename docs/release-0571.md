# Auto3D 0.57.1 — right-drag orbit and live new-box dimensions

Packaging 1.10.7; Primary Products remains 0.8.0. Based on main after merged PR #95 (0.57.0). Not deployed.

**Right-drag rotates again.** In the main viewer, right-drag left/right now rotates the camera around the view center instead of panning sideways; up/down still tilts. This reverses the 0.53.1 sideways pan. Each right-drag first re-centers the orbit on the selected model, so the camera turns to face it and rotates around it without moving the eye or changing zoom. With nothing selected, it orbits the current view center. Middle-drag still pans, and the mini viewer is unchanged. The engine keeps the `rightDragPansHorizontally` option, but the main viewer no longer enables it.

**New-box ID/OD dimensions update live.** In the Packaging panel's Box Dimensions section, pressing Enter in the Width (W), Length (L) or Height (H) field now updates the model.
- **A generated box is selected:** that dimension is applied to it in the chosen basis (Inside/ID, Outside/OD or Score/CAD). This uses the same service as the selected-box fields and the `packaging.dimensions.update` path, keeps the object identity and adds one Undo step. Inside/outside targets still need applicable converter allowance factors, and a missing factor is reported in the panel.
- **No box is selected:** Enter generates the current style from the draft, the same as clicking its catalog card.
- Typing without Enter still only edits the draft. The card click handler is now a shared `GenerateStyle` method.

Validation: application lint, 802 app/module tests, and the `selected-orbit`, `packaging-fold-dimensions`, `fefco`, `packaging-presets`, `packaging-thumbnail-generation`, `packaging-cleanup` and `packaging-module` browser tests pass. `selected-orbit` now asserts that right-drag keeps the view center on the selected model, including after a middle-drag pan moved it away. `packaging-fold-dimensions` asserts that Enter on the ID height resizes the selected box live with Undo/Redo.
