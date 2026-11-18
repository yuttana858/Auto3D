# Auto3D 0.84.1 — Auto Pack edges match generated RSC boxes

Auto3D 0.84.1 / Packaging 1.14.1 / Primary Products 0.15.0 / Molded Pulp 0.1.0. Based on main after #147 (0.84.0). Not deployed.

## Why Auto Pack edges looked different

Generated RSC boxes show the standard board presentation:
- each panel is trimmed back at its score and finished with the board appearance (panel bow, fold softness, cut compression, grain);
- **crease bends** (`CreaseVisualMeshes`) join neighbouring panels round every fold;
- the glue tab is shifted onto its shared score.

Auto Pack cartons replaced all of this with the raw collision panels (`presentationMeshes = meshes`, `visualMeshes = []`). They rendered as square slabs meeting at the scores, with corrugated flute exposed at every fold edge and gaps between the flap layers.

That was deliberate in 0.75.0, when the carton score equalled product + 0.0254 mm: any display curvature could poke into the product. Since 0.80.0, Auto Pack sizes cartons on the engineering inside basis, which leaves at least one caliper (two in height) between the score panels and the product.

## Fix

- **One display step for every fold route.** `FoldDisplayPose` (in `folding.js`) is the standard display step: trimmed panels, crease bends and the glue-tab shift. `FefcoFoldPose` and Auto Pack both use it.
- **Engineering-basis Auto Pack cartons use the standard presentation**, guarded by `DisplayClearance`. The check samples the fold route at 121 poses (flat, then every 1/120, to closed) and refuses the presentation if any panel or crease-bend vertex lies inside the product bounds.
- **Panel bow is cosmetic and can bulge a few millimetres** on larger panels sitting 0.0254 mm from the product. If the check fails, Auto Pack turns bow off in the carton's saved board appearance and checks again. Crease bends, trimmed edges, fold softness, cut compression and grain are kept. The setting is saved in the CAD profile, so replays, sessions and the mini viewer show the same carton.
- **Exact panels remain the fallback.** They're used for cartons fitted before 0.80.0 (score fit) and for any fit that still fails the check. `rig.autoPackPresentation` reports which presentation is in use: `standard`, `standard without panel bow` or `exact panels`.
- **Unchanged:**
  - the collision audit (`InspectAutoPackFold`, 3,601 poses on exact solids);
  - the fold route;
  - the fit and dimensions.
- **Caching:** the check result is cached per fit and appearance (64 entries), because hosts rebuild the rig for every presentation.

## Validation

- **New module tests:**
  - engineering cartons use the standard presentation, with the same number of crease bends as the standard fold route at the closed pose;
  - a 300 × 150 × 200 mm product turns panel bow off, and replaying from the saved profile gives the standard presentation directly;
  - score-fit cartons keep exact panels.
- **Totals:** 1,012 unit, 73 MCP and 89 Packaging module tests pass. Lint and builds pass.
- **Browser tests pass:** `packaging-auto-pack`, `fefco`, `fold-actions`, `fold-camera-fit`, `packaging-solid-folds`, `packaging-effects`, `packaging-accessories` and `packaging-module`. The closed Auto Pack carton now shows rounded crease edges like a generated RSC.
