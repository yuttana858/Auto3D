# Auto3D 0.85.0 / Packaging 1.15.0 / Primary Products 0.15.0 / Molded Pulp 0.2.0

Auto Pack fits every Packaging generator style, opens the top of a packed carton, and works on models without unit information. Based on main after #148 (0.84.1).

## Auto Pack uses the Packaging generator styles

0.84.1 (#148) gave engineering-basis Auto Pack cartons the generator's presentation: `FoldDisplayPose` for trimmed panels and crease bends, guarded by `DisplayClearance`. This release extends Auto Pack beyond the RSC:

- **Styles:** the box style list is the generator catalog (`FefcoStyles`, exposed as `AutoPackStyles`). Today that is 0200 HSC, 0201 RSC, 0202 OSC and 0203 FOL. A style added to the generator catalog appears in Auto Pack with no Auto Pack change.
- **Flap layering** comes from the generator (`FefcoFlapLayers` / `FefcoFlapLayer`, shared with `FoldPose`). The fitted height reserves each style's flap stack, and the product rests on the base stack. For example, an HSC is 2 board layers shorter than an RSC, and an FOL is taller because its outer flaps overlap completely.
- **Allowances:** every style uses the RSC (FEFCO reference) body allowances from the generation board, and the plan adds each style's extra flap layers itself.
- **Presentation:** every style uses the 0.84.1 presentation path. `DisplayClearance` now also samples the Open top route.
- **Saved cartons** keep their code. Cartons from before this release replay as 0201.

**Panel:** the Auto tab has a **Box style** select.

**Commands:**
- `packaging.auto.styles` (read).
- `packaging.auto.style { code }` (non-mutating).
- `packaging.auto.inspect` reports `code`.

## Open top

A packed Auto Pack carton has an **Open top** button beside **Fold carton** / **Unfold carton**. It swings only the top flaps 120° open from closed, which is 30° outward past upright. When the carton is open, the button becomes **Close top**.

**How the flaps move**
- Flaps open in reverse closing order, so the outer flap goes first.
- Each flap swings up to upright, leaves its closed stack offset while exactly upright, and then leans outward.
- The outward lean hinges on the outside score face, as the generator's outward lean does, so the board never rolls into its own wall.
- Each flap moves on its own, so neighbours never cross at the corners.
- `InspectAutoPackFold (rig, yield, 'top')` audits this route with the same 3601-sample check as folding. 0201, 0202 and 0203 are clear.

**What gets saved**
- Completion replaces the carton with one Undo step and saves it with `closure: 'open'` (name " · Open"). Close top returns it to `closure: 'closed'` (" · Closed").
- An open-top carton unfolds and refolds along its open route: the top flaps stay open at the end of the fold.
- Regenerating the carton and timeline fold actions keep the open top (`rig.autoPackOpenTop`).

**Availability and command**
- Not offered for 0200 HSC (no top flaps) or for a flat carton.
- `packaging.auto.top { open?, duration? }` toggles when `open` is omitted. It returns when playback starts, and `packaging.fefco.playback.inspect` reports the `open top` or `close top` action.

## Refresh bounds on any model

STL, OBJ and many older or CAD exports carry no units. Auto Pack previously refused these scenes and gave no way forward. The Auto tab now explains that the scene has no units and shows a **Model units** select (mm, cm, m, in, ft). **Assign units and refresh bounds** assigns that unit to the scene and its unitless objects in one Undo step, then re-measures the selection.

- **Refresh bounds** with known units just re-measures.
- A scene that already has units is never reassigned.
- **Command:** `packaging.auto.refresh_bounds { units? }` (mutating only when it assigns units). `packaging.auto.inspect` reports `unitsUnknown`.

## Validation

- Unit tests: 1005 passing, including Packaging's "presents the Packaging generator carton" and "fits every Packaging generator style".
- Lint is clean.
- New browser test `test/browser/packaging-auto-styles.mjs` (in the CI suite):
  - starts with a unitless STL;
  - checks the guidance;
  - assigns units through the panel;
  - checks Undo/Redo;
  - lists the 4 styles;
  - selects 0203 from the panel;
  - checks that the FOL is taller than the RSC;
  - folds and checks the saved code.
- `packaging-auto-styles` also covers Open top from the panel (closure `open`, " · Open"), Undo/Redo, Close top through the command, and unfolding from an open top.
- Module test: every style's top route is clear; each top flap turns exactly 120° from closed and stands above and outside the walls; the open-top fold route is clear and keeps the flat pose unchanged.
- The existing `packaging-auto-pack` browser test passes.
