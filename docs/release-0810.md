# Auto3D 0.81.0 — Packaging Accessories, and Auto Pack with nested partitions and pads

Auto3D 0.81.0 / Packaging 1.14.0 / Primary Products 0.15.0 / Molded Pulp 0.1.0. Based on main after #141 (0.80.0). Not deployed.

## Accessories tab

The Packaging module has a third tab, **Accessories**, next to Packaging and Auto. Arrow keys, Home and End move between the three tabs.

It works on the selected folded carton:
- **Sizes come from the dimensions panel.** They use the carton's engineering inside dimensions (`DimensionsInspect`), not its mesh.
- **Each piece is a standard CAD board profile:** a closed cut outline extruded to the board caliper. It opens in the CAD designer, measures, and exports to SVG/DXF/EPS, and its measurement layer carries the board record.
- **Grouping and Undo:** pieces join one group with the carton, so moving the carton moves them all. Each action is one Undo step.

### Pads

| Option | What it does |
| --- | --- |
| **Positions** | **Top** and **Bottom** pads lie horizontal and cover the inside length × width. **Front** and **Back** pads stand vertical against the two long walls and cover inside length × height, between any top and bottom pads. Every edge is 1 mm clear. |
| **Flute** | Chosen from the account board catalog (nominal E/B/C/EB/BC… until the catalog is saved). It sets the pad thickness. |
| **Board grade** | 32 ECT, 44 ECT, 48 ECT, 200# test or 275# test. Recorded in the pad's board record and CAD grade. |
| **Do not affect box ID** | Unticked (default): the carton inside grows by the pad thicknesses (height for top and bottom, width for front and back) through the standard dimension path, so the product space between the pads stays exactly the original inside size. Ticked: the carton keeps its size and the pads are shown in place. |

- **When "affect box" isn't available:**
  - Auto Pack cartons keep their fitted size, so for them tick **Do not affect box ID** or rerun Auto Pack.
  - Cartons that already hold accessories can't grow, because growing would move the existing pieces.
- **Order and Undo:**
  - Add pads before partitions.
  - When the box grows, Undo takes two steps: one removes the pads, the next restores the box size.

### Partitions

- **Cells:** set the cells along the length and across the width, 1–12 each, with at least 2 cells.
- **Interlocking strips:** strips along the length are slotted from the top and strips across from the bottom, at half height. Each slot is the caliper + 0.5 mm.
- **Placement:** strips stand on any bottom pad, stop under any top pad and fit between any front and back pads, with 1 mm clearance.
- **Board:** partitions use the carton's board.

## Auto Pack with packed contents

The Auto tab has a **Packed contents** section with these controls:
- **Partitions between products**;
- **Top / Bottom / Front / Back pad**;
- **Contents flute** and **Contents grade**, from the board catalog.

It previews the layout, the partition strips, how far the gaps open, the pads and the carton they need. On **Auto Pack**, the contents are built first and the RSC is then fitted around products and contents together. The carton folds around them, so the contents are in place during the assembly.

### The nesting algorithm (`modules/packaging/src/partitionnest.js`, pure)

Inputs: product bounds in the carton frame (length = the longer horizontal side, height, width) and the board caliper.

1. **Read the layout.** Products are grouped by overlapping extents into **columns** (along the length), **rows** (across the width) and **layers** (by height). Uneven spacing and mixed sizes within a column are understood.
2. **Make room.** Every gap between neighbouring columns or rows must hold one board plus 0.5 mm on each face (3 mm board → 4 mm). Short gaps are opened by moving whole columns or rows apart, keeping the layout centred; gaps that are already wide enough are left alone. The total growth is reported and becomes part of the carton ID.
3. **Nest.** One interlocking set goes in each layer:
   - a strip runs down the middle of every gap, spans the whole product envelope, and is as tall as the layer;
   - length strips are slotted from the top and width strips from the bottom, each slot the caliper + 0.5 mm, so they lock at half height;
   - like a collapsible die-cut partition, the set can pivot flat at its slots. The plan reports `collapsedMm`: the flat length and the stack thickness of one caliper per strip.
4. **Pad.** Front and back pads cover the envelope's long faces. Top and bottom pads cover the envelope plus the front and back pads.
5. **Fit.** Auto Pack measures products, strips and pads together, adds the clearance and the board allowance factors as in 0.80.0, folds the carton around everything (the 3,601-pose clearance audit includes the contents), and guards every piece for replay.

**Example:** a 4 × 3 × 2 grid of touching 66 mm bottles with a 3 mm board:
- every gap opens to 4 mm, so the load grows 12 mm in length and 8 mm in width;
- 5 strips per layer, 10 in total;
- 24 cells.

**Undo:** the first Undo removes the carton; the second removes the contents and puts the products back where they were. Content pieces are linked to their carton, so the Accessories tab sees them.

`AddBoardPiece` (in `accessoriesworkspace.js`) is the shared builder that extrudes and places board pieces, for both Accessories and Auto Pack.

## Agent commands

- `packaging.auto.inspect` and `packaging.auto.generate` take `{ pads, partitions, boardId, grade }`. Inspect previews the contents; generate builds them and fits the carton.
- `packaging.tab` accepts `accessories`.
- `packaging.accessories.inspect` reads the inside size, the boards and grades, and the planned pads and partitions.
- `packaging.accessories.pads { positions, boardId, grade, keepBox }`.
- `packaging.accessories.partitions { columns, rows }`.

## Module boundary

- **Packaging module:** pure planning (`accessories.js`) and the tab panel (`accessoriespanel.js`).
- **Host:** `accessoriesworkspace.js` measures the carton, extrudes and places the pieces, and handles grouping, Undo and the dimension path.
- **Panel refresh:** the panel refreshes on selection and display-unit changes, like the Auto tab.

## Not yet

- **Seeing inside:** pads sit inside the closed carton, so hide the carton (`object.visibility`) to see them. A see-through carton option would be the next step.
- **Partition board:** partitions don't have their own flute or grade choice yet.
- **Pad positions:** there are no end (left/right) pads yet.

## Validation

- **Nesting module tests (6):**
  - layout reading and clustering;
  - touching products opened to exactly board + 2 × 0.5 mm, with no strip touching a product;
  - already-wide gaps left alone, with cuts at the gap centres;
  - only narrow gaps opened, with the layout kept centred;
  - every slot lined up with the crossing strip at half height;
  - error cases.
- **Auto Pack scene test:** a 3-product array with partitions and four E-flute 44 ECT pads. It checks:
  - the preview: 3 columns, 2 strips, +5 mm, packed size 155 × 83 × 33 mm;
  - products 2.5 mm apart with each strip in its gap;
  - the carton fitted around all 9 pieces and guarding them, with pieces linked to the carton;
  - two Undos restoring the original positions.
- **Browser test `packaging-auto-pack`** is extended for an array with partitions and top/bottom pads: the preview text, a paused mid-fold screenshot with the contents in place, the completed fold, and three Undos.

- **Module tests (80):** pad sizes and growth for all four positions, valid CAD boards, slots aligned with the crossing strips and half-height interlocks, and input validation.
- **Scene tests:**
  - Pads and partitions inside a generated carton, both normal and turned 90°: they sit on the floor and under the lid, stay inside, line up on the cell boundaries, are grouped, and take one Undo step each.
  - Affect box: the carton grows 150 → 153 mm in height and 200 → 203 mm in width with E-flute 44 ECT pads, the space between the pads is exactly 150 × 200 mm, and partitions fit between the pads.
  - Strict commands are checked.
- **Browser test `packaging-accessories`** (added to CI):
  - three tabs and keyboard navigation;
  - the inside size;
  - the pad positions, flute and grade lists;
  - the box growth and keep-box text;
  - pads that grow the box to 153 mm;
  - 8-cell partitions and grouping;
  - mobile width;
  - three Undo steps back to 150 mm.
- **Related browser tests pass:** `module-panels`, `packaging-auto-pack`, `packaging-auto-pallet`, `packaging-module`, `packaging-measurements` and `workspace-commands`.
- **Totals:** 988 unit, 72 MCP and 86 Packaging module tests pass. Lint and builds pass.
- **Browser tests also pass:** `packaging-auto-pallet`, `fold-actions` and `packaging-solid-folds`.
