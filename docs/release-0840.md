# Auto3D 0.84.0 / Packaging 1.15.0 / Primary Products 0.15.0 / Molded Pulp 0.2.0

Auto Pack builds its carton with the Packaging generator and works on models without unit information. Based on main after #146 (0.83.0).

## Auto Pack uses the Packaging generator

Before this release Auto Pack built only an RSC (0201) and showed the raw fold panels. Their cut edges were sharp and exposed because the generator's board appearance and crease visuals were dropped. Now:

- The carton uses the generator's presentation: the same `CreateFefcoFoldRig` board appearance meshes, and the crease visuals (`FefcoDisplayPose` → `CreaseVisualMeshes`) during and after folding. A test checks that the Auto Pack presentation matches the generator's rig for the same parameters.
- The style list is the generator catalog (`FefcoStyles`, exposed as `AutoPackStyles`). Today that is 0200 HSC, 0201 RSC, 0202 OSC and 0203 FOL. A style added to the generator catalog appears in Auto Pack with no Auto Pack change.
- Flap layering comes from the generator (`FefcoFlapLayers` / `FefcoFlapLayer`, shared with `FoldPose`). The fitted height reserves each style's flap stack, so the inside height is unchanged when a style has more or fewer flap layers. For example, an HSC is 2 board layers shorter than an RSC, and an FOL is taller because its outer flaps overlap completely.
- Allowances: every style uses the RSC (FEFCO reference) body allowances from the generation board, and the plan adds each style's extra flap layers itself.
- Saved cartons keep their code. Cartons from before 0.84.0 replay as 0201.

**Panel:** the Auto tab has a **Box style** select.

**Commands:**

- `packaging.auto.styles` (read).
- `packaging.auto.style { code }` (non-mutating; changes what the next inspect and generate use).
- `packaging.auto.inspect` reports `code`.

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
- The existing `packaging-auto-pack` browser test passes.
