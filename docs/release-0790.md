# Auto3D 0.79.0 — Auto Pack on the packaging engineering system

Auto3D 0.79.0 / Packaging 1.13.0 / Primary Products 0.15.0 / Molded Pulp 0.1.0. Based on main after #140 (0.78.0). Not deployed.

## Review: how Auto Pack related to the packaging generator

The Packaging module's generator is the engineering source of truth. It connects four parts:

| Part | What it does |
| --- | --- |
| **Board record** | Account board catalog: caliper, liners, flute pitch and direction, allowance factors. Chosen with `packaging.boards.select`. |
| **Dimension basis** | `GeneratePreset` converts inside or outside targets to score spans with `ScoreForTarget` and the board's allowance factors. For a 0201, the FEFCO 101 reference factors give inside L/W = score − t and inside H = score − 2t. |
| **CAD profile and measurement layer** | `GenerateFefco` attaches `profile.engineering` (board material, dimension references and their basis) to the dieline. That layer drives the dimensions panel, measurements, the CAD designer, board changes and SVG/DXF/EPS output. |
| **Fold rig** | `CreateFefcoFoldRig` builds the panels, edges and exposed corrugated edges from the profile and its board visuals. |

Before this release, Auto Pack shared the dieline and fold rig, but bypassed the other parts:

- **Its own score formula.** Score was set to product + 2 × clearance (+ t on the long side), and the allowance factors were never applied. Measured by the carton's own engineering reference, the box was smaller inside than the product: inside height came out about 2t short.
- **No measurement layer.** The carton's profile had no `engineering` record. The dimensions panel, measurements and CAD fell back to generic defaults, and the generation board record was not attached.
- **Generic board visuals.** The rig was built from the plan alone, so its board visuals (exposed corrugated edges, flute pitch and direction) came from defaults rather than the selected board.

## What changed

- **Planner (`autopackplan.js`).** With a board material, Auto Pack now computes the required **inside** dimensions:
  - product + 2 × clearance on each axis;
  - plus one caliper on the longer side for the inside glue tab;
  - then converts them to score spans with `ScoreForTarget` and the board's inside factors.

  This is the same calculation Generate uses with the inside basis. An uncalibrated board with a zero inside factor is refused, exactly as in the dimension tools.
- **Shared generation profile (`PackagingWorkspace.GenerationProfile`).** One method now builds a generated CAD profile with its measurement layer: board record, factors and basis. `GenerateFefco`, presets and Auto Pack all use it.
- **The carton is a standard generated 0201:**
  - its profile carries the generation board record with inside-basis dimensions;
  - its rig is built from that profile, so edges and flute visuals follow the board;
  - `packaging.dimensions.inspect` and the measurements report exactly the fit's inside size.
- **The clearance audit still runs.** The 3,601-pose solid check proves that the folded panels clear the product. It now checks the engineering spans.
- **Auto tab.** The panel adds an **RSC score size** row next to the inside size, and explains that the board record and its allowance factors set the score. `packaging.auto.inspect` adds `basis`, `scoreMm` and `allowanceMm`, and `boardName` now comes from the material actually used.
- **Saved cartons.**
  - New cartons record `basis: "engineering-inside"`. Replay re-derives the fit from the board record stored in the carton's own CAD profile.
  - Cartons saved before this release keep their original score fit and still replay.

## Unchanged on purpose

- **Bottom-anchored fold route.** The product stays still and the carton folds around it from an anchored bottom flap. The standard fold route moves the whole carton, so it can't wrap a stationary product.
- **Exact panel surfaces during Auto Pack.** The cosmetic panel bow and crease arcs are still left out, so what you see matches the audited solids at a 0.0254 mm clearance.
- **Dimension edits on a fitted carton are still blocked.** Changing them would break the fit; run Auto Pack again instead.

## Validation

- **Module tests (77):**
  - inside targets become score spans with the 0201 reference allowances (+t, +t, +2t);
  - cartons without a board record keep the earlier fit;
  - an uncalibrated board with zero factors is refused, while a calibrated zero is allowed;
  - the full anchored fold clears the product with engineering spans.
- **Scene test:** the folded carton's engineering inside length, width and height equal the fit targets, use the inside basis and carry the board caliper. This is in addition to the existing array, guard, Undo and session tests.
- **Browser test `packaging-auto-pack`:** `packaging.dimensions.inspect` on the carton matches Auto Pack's inside size, and the basis is reported.
- **Totals:** 956 unit, 72 MCP and 77 Packaging module tests pass. Lint and builds pass.
