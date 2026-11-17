# Auto3D 0.76.0 — Auto pallet

Auto3D 0.76.0 / Packaging 1.12.0 / Primary Products 0.15.0 / Molded Pulp 0.1.0. Based on main after #136 (0.75.0). Not deployed.

## What it does

A new **Auto pallet** section in the Packaging **Auto** tab, below Auto Pack, works on the selected box:

- **Measures** the box's outside size from its transformed world bounds, in mm (W = X, L = Z, H = Y), exactly as Auto Pack does.
- **Plans** the most boxes that fit on a **40 × 48 in pallet, 5 in high** (1016 × 1219.2 × 127 mm), with column stacking, under a **maximum overall height** that includes the pallet. The default is **55 in** (1397 mm), and the height can be edited in display units.
- **Shows the plan** before anything is built: boxes per layer, layers, total boxes, overall height, pattern, deck coverage and load size.
- **Pallet colour:** blue, brown or black.
- **Auto pallet button:**
  - adds a procedural block pallet under the box, centred on the box's current position;
  - turns the selected box into the first box of the load, with copies sharing its geometry and materials;
  - puts the pallet and all boxes in one group;
  - **one Undo step** removes the load and restores the box.

The demo box (FEFCO 0201, 300 × 200 × 150 mm inside, 203 × 303 × 156 mm outside on 1.5 mm E flute) plans **20 per layer × 8 layers = 160 boxes, 54.13 in overall**.

## The algorithm (`modules/packaging/src/palletplan.js`)

Pure module code: millimetres in, a layer pattern and placements out. It works for any box size.

**Rules**
- **Boxes stay upright.** The box height stays vertical, but a box may turn 90° in plan.
- **Column stacking.** Every layer uses the same pattern, so each box sits directly on the box below. That keeps the corners, the strongest part of a corrugated box, aligned for compression.
- **No overhang.** The load stays inside the deck and is centred on it.
- **Layers** = ⌊(max overall height − pallet height) ÷ box height⌋.

**Layer pattern: guillotine dynamic programming**
1. List the "raster points" along each side of the deck: every length reachable as *i·a + j·b*, where *a* × *b* is the box footprint. A best pattern never needs a cut anywhere else.
2. For every sub-rectangle *w* × *l* built from raster points, the best count is the largest of:
   - a single-orientation grid: ⌊w/a⌋·⌊l/b⌋ or ⌊w/b⌋·⌊l/a⌋;
   - one straight cut across the width or the length, with each part solved the same way. The second part is rounded down to a raster point.
3. Solve from small rectangles up to the whole deck, then walk back through the choices to get each box's position and orientation.
4. Centre the used area on the pallet. Placements are reported from the pallet centre.

**Why this method**
- It is exact for every pattern that can be cut into blocks with straight lines. That covers single-orientation grids and the common two-, three- and multi-block mixed layers.
- It never does worse than the best grid. A unit test checks this across 132 box sizes.
- It finds mixed layers when they fit more. On a 40 × 48 in deck:
  - 254 × 355.6 mm: 13 per layer vs 12 for the best grid;
  - 228.6 × 304.8 mm: 17 vs 16;
  - 180 × 260 mm: 23 vs 20;
  - 300 × 400 mm: 10 vs 9.
- It runs in about a millisecond for normal boxes.

**Limits**
- Non-guillotine pinwheel patterns are not searched. They occasionally fit one more box, and could be added later as an extra candidate.
- A single sample over 400 raster points, which only happens with very small boxes, falls back to the best grid. The plan reports `exhaustive: false`.
- More than 2,000 boxes per layer is refused.
- A load larger than the 1,000-object session limit is refused before anything changes.

## Pallet geometry (`modules/packaging/src/pallet.js`)

`CreatePallet({ color })` builds a 40 × 48 × 5 in block pallet in the module's neutral mesh format: seven top deck boards across the width, three stringer boards, a 3 × 3 grid of blocks and three bottom boards. Its origin is at the centre of the bottom face. The finishes are blue, brown (wood) and black (plastic). This is a visual pallet model, not a structural rating.

## Commands

| Command | What it does |
| --- | --- |
| `packaging.pallet.plan` | Pure calculation for any outside box size: `{ width, length, height, maxHeightMm? }` in mm. Doesn't change the scene. |
| `packaging.pallet.inspect` | Measures the selected box and returns the plan: `{ maxHeightMm?, color? }`. |
| `packaging.pallet.generate` | Same as the **Auto pallet** button: `{ maxHeightMm?, color? }`. |

`packaging.tab({ tab: "auto" })` opens the Auto tab with both sections.

**Refused selections:** a flat dieline (fold it first), a box tilted on X or Z, the pallet itself, animated or partly hidden models, unknown scene units, and read-only sessions.

## Other changes

- **Shared measurement.** Auto Pack's world-bounds measurement is now the shared `MeasureWorldBoundsMm`.
- **Units refresh.** Changing display units now refreshes an open Auto tab. Before, Auto Pack's sizes only updated on the next refresh.

## Validation

- **Module tests (73):**
  - the pallet preset and the 55 in default;
  - the demo box (20 × 8 = 160, centred);
  - mixed patterns beating grids, with no overlap and no overhang;
  - never worse than a grid across 132 sizes;
  - height limits and invalid input;
  - pallet geometry bounds for all three colours.
- **Scene test, `autopallet-workspace`:**
  - plans without changing the scene;
  - builds a 51-box mixed load on a brown pallet, centred, with no overlap or overhang, boxes on whole layers and turned boxes included;
  - one Undo/Redo step;
  - inch scenes;
  - refuses a tilted, flat, read-only or over-limit selection;
  - strict agent commands.
- **Unit suite:** 938 passing. **MCP:** 72 passing. Lint, website, Pages and MCP worker builds pass.
- **New browser test, `packaging-auto-pallet`** (added to CI):
  - the panel's live plan and units, the height input and the colour choice;
  - a 160-box build on a black pallet;
  - mobile width;
  - Undo.
- **Related browser tests also pass:** `packaging-auto-pack`, `module-panels`, `packaging-module`, `workspace-commands`, `packaging-measurements`, `fefco` and `fold-actions`.
