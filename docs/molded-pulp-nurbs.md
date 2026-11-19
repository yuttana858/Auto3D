# Molded Pulp: review model and NURBS output

Status: Phase 1 shipped in Auto3D 0.88.0 / Molded Pulp 0.3.0. Phase 2 is the next step to build and test.

## Decision

Molded Pulp keeps two representations of every formed sheet, tray or clamshell.

**Review model (internal).** This is today's forming result: a pair of heightfields (product side and tool side) on a node grid. Sensing, clearance, draft, ribs, lugs, the thickness offset and every DFM check run on it.
- It is what the viewer shows, through the adaptive mesh.
- It stays the source of truth for checks.
- It is never sent to a customer or a toolmaker as-is.

**Output model (NURBS B-rep).** This is what leaves Auto3D.
- **STEP:** a closed solid per shell, in millimetres, for tooling and CAD.
- **GLB:** the formed shape with its pulp material, in metres, for customer review.
- **Future CAD work:** the same NURBS core becomes the foundation of the solid modeling module.

Why the split:
- **No crashes or hangs.** The viewer never has to show the most expensive representation, and output can be produced off the main thread: in the forming worker today, in Cloud 3D Studio later (Phase 3).
- **Checks stay exact.** DFM and nesting checks keep running on the field they were designed for.
- **Output can improve independently.** Phase 2 changes the output surfaces without touching forming or checks.

## Phase 1 (shipped): exact B-rep on the review nodes

Code is in `modules/molded-pulp/src/nurbs/`.

| File | Role |
| --- | --- |
| `bspline.js` | Degree-generic B-spline core: clamped knot vectors, Greville abscissae, span search and Cox–de Boor basis (The NURBS Book A2.1/A2.2), curve and surface evaluation, separable least-squares grid fitting (banded Cholesky), grid evaluation. Tested for partition of unity, linear precision and exact bicubic reproduction. |
| `shell.js` | `NurbsShell`: product-side and tool-side faces as degree-1 B-spline surfaces through the review nodes, on one shared knot grid, in world mm through the shell's pull direction. Review grids above 513 nodes per side are subsampled exactly, every other node. |
| `brep.js` | `ShellBrep`: 6 faces (two B-spline faces, four ruled sides), 12 shared edges and 8 vertices, with orientation derived once in the forming frame. `BrepEdgeUses` checks that every edge is used once in each direction. |
| `step.js` | `WriteStep`: STEP AP214 (ISO 10303-21) text with one `MANIFOLD_SOLID_BREP` per shell, B-spline faces and edges, millimetre units, and shared control points written once. No CAD kernel is needed. |

**Host, panel and commands:**
- The **Output** section of the Molded Pulp panel has **Export STEP** and **Export GLB**.
- The agent command is `pulp.export { format: 'step' | 'glb' }`.
- Export uses the plan behind the object on screen. A pulp object from a saved session, or one restored by Undo, is formed again from its saved definition first, in the worker.
- Not in STEP: the clamshell hinge bead. It stays a display mesh and is planned for Phase 2.

**Validation:**
- Unit tests:
  - closed topology;
  - outward orientation by signed volume, for a tray, all three clamshell modes and sheets;
  - volume within 2% of the review volume;
  - exact node values after subsampling;
  - every STEP reference defined;
  - AP214 header and units.
- Browser test `molded-pulp-export`:
  - STEP and GLB from the panel buttons;
  - a clamshell STEP with 2 solids;
  - re-forming after Undo.
- OpenCASCADE (occt-import-js 0.0.22, run locally, not a project dependency) reading Auto3D's STEP:

| Case | Result |
| --- | --- |
| 9 × 9 dish, pull +y, −y, +x, −z | 1 solid, 6 faces, 0 open edges, volume 12.800 cm³ (expected 12.800) |
| 6-can tray (3 × 2, 86 mm pitch), Type 2, 35 mm, draft detail (129 × 129 nodes) | 1 solid, 6 faces, 0 open edges, volume 288.00 cm³ vs review 288.3 cm³; 2.05 MB STEP written in 118 ms |

### Phase 1 findings that set Phase 2

1. **Smooth cubic surfaces written as height over the floor plan do not work for pulp walls.** Drafted walls are nearly vertical at grid scale: a 35 mm wall at 4° spans about 2.4 mm, roughly 2 standard cells.
   - Least-squares refinement on the 6-can tray stalled at 6.2 mm error with spans of 2 cells.
   - Allowing finer spans only converged by interpolating every node (259 × 259 controls on a 257-node grid).
   - That interpolant overshoots by up to 13.6 mm between nodes at rim and floor creases.
2. **Rounding the field first does not rescue the floor-plan form.** A rolling-ball opening and closing (r = 1.5–4.5 mm) still left 10–13 mm vertical overshoot. On steep walls, vertical error is the wrong measure anyway: 1 mm sideways is 14 mm vertically at 4°.
3. **Dense degree-1 faces are valid but heavy for importers.** OpenCASCADE (WebAssembly) took 8 min 17 s to mesh the 129 × 129 tray at 0.5 mm deflection (1.03 M triangles). Desktop CAD will be faster but still heavy.

Conclusion: walls must be parameterized **by height**. A pocket wall is the stack of its outlines at increasing depth, so the natural surface is a loft through those outlines.

## Phase 2 (next): smooth, compact cubic B-rep — the test we will run

### What we build

Starting from the review field, for each shell:

1. **Outlines.**
   - Extract iso-contours of the product-side field at the floor, at the plateau and at N heights between them. Use marching squares on the review grid, with N from the wall height and the target tolerance.
   - Fit each closed contour with a periodic cubic B-spline by least-squares with adaptive knots.
   - Use a consistent seam and parameterization across levels: chord length and a shared seam angle.
2. **Walls.**
   - Loft (skin) the per-level curves into one cubic surface per pocket wall, and one for the outer skirt.
   - Where contours merge or split between levels (a narrow land between pockets, ribs), split the loft into bands at the topology change.
   - Lugs and ribs become their own lofts or trimmed patches.
3. **Floors and plateau.**
   - Flat regions become planes trimmed by the floor and rim curves.
   - Non-flat floors (bottle punts) are fitted bicubic patches, where the height-over-floor-plan form is fine because floors are gentle.
4. **Fillets.**
   - A rim and floor radius R. The default is the DFM minimum radius for the pulp type, at least the wall thickness.
   - Built as the loft's first and last sections (offset outlines), not as a separate blend.
5. **Tool side.**
   - Offset the product-side outlines by the thickness in plan at each level.
   - Equivalently, offset the lofted surface along its normal by sampling sections.
   - Then loft again. Checking against the review tool-side field is the gate.
6. **Topology and STEP.**
   - Trimmed faces need `FACE_BOUND` holes on the plateau and planes with B-spline boundaries.
   - Extend `brep.js` for faces with inner loops, then sew walls, floors, plateau, skirt and flange edge into one closed shell.
   - The Phase 1 writer, number formatting and validation stay.
7. **Display.** Tessellate the B-rep to a chord tolerance, in the worker, and show it as the default solid view. The review mesh stays available as a "Review mesh" view mode and remains what checks run on.

### Test cases

| ID | Case | Why |
| --- | --- | --- |
| T1 | 6 cans (3 × 2), 86 mm pitch, Type 2, 35 mm, standard | Baseline from Phase 1 |
| T2 | Same, 70 mm pitch | Knife-edge land between pockets: contours merge below the plateau |
| T3 | 6 cans, fine and ultra detail | Output must not scale with grid size |
| T4 | Dome/toilet-base proxy (`Dome` in tests) | Curved floor, no flat pocket floor |
| T5 | T1 with ribs and lugs on (rule base auto) | Features on walls and plateau |
| T6 | T1 as top-bottom and side-x clamshells, hinge on | Two shells, pull directions, hinge solid |
| T7 | Type 3 dry, 1° draft, and 0° draft | Near-vertical walls; 0° must report clearly, not fail silently |
| T8 | Sheet only | Trivial box stays exact |

### Measurements per case

- **Accuracy:** normal distance (not vertical distance) between the output and the review surfaces, max and RMS, both faces. Measure from review nodes to the output surface, and from output samples to the review surface.
- **Fillets:** achieved minimum fillet radius at rims and floors, against the requested R.
- **Size:** control-point count, face count, STEP size, write time.
- **Validity:** OpenCASCADE import validity (solids, faces, open edges), volume difference from review, and import plus mesh time.
- **Desktop CAD round trip:** at least one of SolidWorks, Fusion or Rhino imports it as a solid. A manual check, recorded with screenshots.
- **Display:** triangles at 0.05 mm chord, worker time and main-thread long tasks during commit.

### Pass criteria (Phase 2 ready to replace Phase 1 output)

| Measure | Target |
| --- | --- |
| Max normal deviation from review (excluding intended fillets) | ≤ 0.25 × pulp-type tolerance (Type 2: ≤ 0.3 mm; Type 3: ≤ 0.12 mm) |
| Fillet radius | ≥ requested R everywhere it is applied |
| STEP size, T1 standard | ≤ 10% of Phase 1 (≤ 0.2 MB vs 2.05 MB) |
| STEP size growth from standard to ultra | ≤ 1.5× (output tracks shape, not grid) |
| OpenCASCADE | 1 solid per shell, 0 open edges, volume within 1% of review |
| OpenCASCADE import and mesh, T1 at 0.5 mm deflection | ≤ 10 s (vs 497 s Phase 1) |
| Worker time for the output, T1 standard | ≤ 2 s; longest main-thread task during commit ≤ 200 ms |
| T2 and T7 | Either pass, or fail with a named check (narrow land, 0° draft), never an invalid file |
| T6 | Two solids plus the hinge as a solid; shells meet at the parting plane within 0.05 mm |

### How to run it

- **Unit tests:** `modules/molded-pulp/test/nurbs.test.js` gets T1–T8 fixtures with the deviation, radius, size and validity measures as assertions.
- **OpenCASCADE validation:** a tool script, `tools/check_step.mjs`. It runs locally with `occt-import-js` installed outside the repo, and in CI only on demand, because OCCT is LGPL and the project ships MIT-only dependencies.
- **Browser:** `molded-pulp-export` grows a solid-view check: the default view is the B-rep tessellation, and Review mesh still shows the field.
- **Results:** recorded in a Phase 2 table in this document, in the same format as Phase 1.

### Phase 2 progress

#### Step 1 (done): lofted pocket walls

The code is `nurbs/contours.js` (marching squares with saddle resolution), `nurbs/periodic.js` (periodic cubic outline fits with a shared +x seam and chord-length parameters), `nurbs/loft.js` (`LoftPocketWalls`) and `nurbs/measure.js` (true 3D distance to the review surface).

Each pocket wall is one cubic B-spline surface:
- periodic around the pocket, with m outline controls;
- clamped in height, with n controls, so y equals the height parameter exactly.

| Case | Walls | Controls (all walls) | Max 3D distance to review | Time | Target |
| --- | --- | --- | --- | --- | --- |
| T1 6 cans, 86 mm pitch, Type 2, standard (513 nodes) | 6, each 16–24 × 4 | 408 (Phase 1: 263,169 per face) | 0.268 mm | 1.3 s | ≤ 0.3125 mm ✔ |
| T3 the same at fine (1025 nodes) | 6 | 648 (1.6× standard) | 0.157 mm | 5.4 s → 2.2 s after windowing (measured under load) | Distance ✔. Growth ≤ 1.5× ✘ (1.6×). Time ≤ 2 s: close, needs a timing without load |
| T2 6 cans, 70 mm pitch | none | none | none | 0.1 s | Named failure: pockets join about 13 mm up ✔ |

What we learned while building it:
- The review outlines carry about ±0.35 mm of grid ripple from the octagonal clearance filter. The outline fit tolerance is therefore 0.6 × cell (at least 0.15 mm). Fitting tighter only chases grid noise; the smooth loft is closer to the design intent than the review field is.
- Error must be measured in 3D. A slope-scaled vertical estimate overstated wall error by about 10× near the floor crease.

#### Panel option and check (experimental)

The Output section of the Molded Pulp panel has two Phase 2 controls:
- an **Outer skirt wall (experimental)** checkbox, saved in the draft as `skirtWall` (off by default);
- a **Check smooth walls** button (agents: `pulp.loft.check`).

The check builds the smooth walls of the current tray in the worker and reports each wall's control counts and true 3D distance to the review surface. It never changes the scene. It runs at Standard detail when the tray is at Draft, because about 2 mm cells are too coarse for walls a few millimetres wide (on T1 at Draft, walls miss by 0.87–1.11 mm).

Pockets are recognised by the ground just inside their lowest outline, not at its centre. Real Primary Products cans have a domed base, and the centre test found no pockets at all.

On real Primary Products cans (3 × 2, 20 mm gap, Type 2, 35 mm, standard):
- the six pocket walls use 12–18 × 8 controls and stay within 0.24–0.31 mm (limit 0.3125 mm);
- with the skirt on, the skirt needs the 256-control cap and misses by 1.56 mm, and the check reports it as outside the tolerance.

#### Next steps

1. ✔ Speed-up (identical output): contours scan a per-pocket window between floor and rim outlines; outline checks search the curve near each point's parameter; the 3D distance search reaches only as far as the tolerance needs. T1 standard: 1.3 s → 0.85 s. T3 fine: 5.4 s → 2.2 s.
2. ✔ Outer skirt wall, corner-aware (option `skirtWall`, off by default).
   - **Why the first version failed:** the skirt rises from the rectangular sheet edge, so its outlines have true 90° plan corners. One smooth closed curve cannot follow them: it needed the 256-control cap and still missed by 1.52 mm.
   - **The fix:** `OutlineCorners` finds the corners (turning angle over ±3 mm of arc). They are stable at every level: four corners at 84–89° on T1. Each level is split into sides between corners. Each side is an open clamped cubic with its ends pinned to the corners, so neighbouring sides meet in a shared corner edge, and each side is lofted through the levels.
   - **Results:**

     | Case | Skirt sides | Whole tray |
     | --- | --- | --- |
     | T1 standard | 4 sides, within 0.08–0.13 mm | ok, 696 controls |
     | T1 fine | 4 sides, within 0.04 mm | ok, 1,160 controls |
     | Real Primary Products cans | 4 sides, 48–72 × 4 controls, within 0.15–0.18 mm | ok |

   - **To do:** straight sides still use 32–72 outline controls because the fit follows the review grid's ripple. A side tolerance tied to straightness, or a line or arc check, should bring a straight side down to about 4 controls.
3. ✔ Compact walls and the complete product side.
   - **Control counts:** the outline count m and the height count n now grow only until the wall is within the 3D distance tolerance (a failed try stops at its first sample beyond it), instead of until the outline matches the review grid's ripple. Straight skirt sides drop to 4 × 4 controls.

     | Case | Controls | Max distance |
     | --- | --- | --- |
     | T1 standard, skirt on | 472 | 0.294 mm |
     | T1 fine, skirt on | 424 | 0.198 mm |

     Fine is now smaller than standard, which meets the "output tracks shape, not grid" target.
   - **Exact span:** walls run exactly from the floor (y = 0) to the plateau (y = depth). Each traced level is mapped proportionally, a sideways change of hundredths of a millimetre.
   - **Flat faces:** pocket floors and the plateau are planes bounded by the walls' end curves. These are exactly the walls' first and last control rows, so faces and walls share edges.

     | Face (T1 standard) | From the boundary curves | Review field |
     | --- | --- | --- |
     | Plateau | 16,902 mm² | 17,091 mm² |
     | Each floor | about 3,590 mm² | |

   - **Raised floors:** a floor that is not flat (a domed can base) is reported as `patch-needed` with its height, not flattened.
4. Tool side: **finding, decision needed.** The loft generalizes to any floor height (`floorMm`). Tracing the review tool-side field, however, shows a different topology from the product side.
   - On T1 the plateau strip between each edge pocket and the skirt is about 5 mm wide on the product side. On the tool side both walls move about 3 mm into it (the 3 mm wall thickness), so the strip vanishes and the pocket wall meets the skirt in a sharp ridge.
   - At the tool side's top level only four small plateau islands and one larger outline remain, and the edge pockets have no closed rim of their own.
   - The tool side is therefore an offset of the product side, with ridges where neighbouring offsets collide. That is the "thicken / shell" operation of a CAD kernel, and robust self-intersection handling is kernel work.

   Options:

   | Option | What it is | Trade-off |
   | --- | --- | --- |
   | (a) Local | Tool side from the review field as Phase 1 degree-1 faces, joined to the smooth product side by a foot band at the sheet edge | Valid now, but the tool side stays dense |
   | (b) Cloud (recommended) | Cloud 3D Studio's OpenCASCADE thickens the smooth product-side shell (`BRepOffsetAPI_MakeThickSolid`) and returns a validated STEP | Compact and smooth on both sides, with ridges handled by the kernel |
   | (c) Local offset | Offset each product-side face and intersect neighbours ourselves | The most work and the least robust |
   **Decided: (b) Cloud.** See "Product surface output and the tool side" below.
5. T2: split walls into bands at the join height, plus a saddle patch. Until then, the shell keeps the Phase 1 output and reports why.
6. Domed can bases: fitted floor patches (today `patch-needed`).
7. In the app: an "Export smooth surface (STEP)" action and agent command, then the owned cloud thicken job.

#### Product surface output and the tool side

`ProductSurface` (`src/nurbs/surface.js`) builds the product side as one open shell; `WriteSurfaceStep` writes it as an AP214 `OPEN_SHELL` in mm.
- **Topology.** Pocket walls, the skirt, floor planes and the plateau with a hole per pocket. Neighbours share their boundary curves exactly: closed walls are clamped by knot insertion, so every boundary is a control row or column. Only the skirt bottom is open.
- **Halves.** Closed walls and blends are written as two halves (u in [0, ½] and [½, 1]); OpenCASCADE reports a face that closes on itself as self-intersecting.
- **Fillets** (`floorFilletMm`, `rimFilletMm`). `EndBlend` splits a wall exactly at r from its floor or top and adds a cubic blend with the wall's U knots. The blend is tangent to the plane (horizontal handles) and to the wall (handles along its height derivative at one constant scale).
- **Rounded skirt** (`skirtCornerMm` in `LoftPocketWalls`). Each level's skirt outline becomes straight sides (least-squares lines) joined by tangent arcs, and the skirt is lofted as one closed wall. The review distance skips the corner zones, which leave the review's sharp corners on purpose; there each outline fit is held to its own rounded outline.
- **Raised floors** (`src/nurbs/floor.js`): a domed or recessed can base gets one closed floor band from the wall's foot to a small flat cap, instead of a fillet and a floor plane.
  - **Wall end:** the band starts on the wall's foot row (shared exactly), and its second row continues the wall's height derivative, so it is tangent to the wall.
  - **Middle:** each row sits at a fixed fraction of the way from the wall to the cap on every control's ray towards the pocket seed (rows correspond around the pocket), and only its height is fitted to the review. The review is a height over the plan, so along a ray it is a function of the radial distance. Rows are placed outside each ray by the same ratio the wall's foot controls sit outside its foot curve, so the surface itself lands on the rays.
  - **Cap end:** the last two rows are level at the cap height, tangent to the cap. The cap is as wide as the review stays within half the tolerance of level (2.5 mm on a beverage dome, 23 mm on a food can's recessed panel).
  - **Seam:** the band is fitted on the wall's periodic controls and every row is clamped the same way, so it is as smooth across the seam as the wall. Fitting the clamped columns independently left a crease there, and the offset halves parted by 0.02 mm, making the thickened STEP invalid on reimport.
  - **Tolerance:** rows grow until the band is within the wall tolerance of the review (the wall's foot edge is checked with the wall).
- **Checks before writing** (`ProductSurfaceProblem`): the skirt is on; rim fillets need the rounded (closed) skirt; floors are flat; the fillets fit the depth; and every plateau strip (`PlateauLand`) holds two rim fillets.

Cloud 3D Studio thickens the surface (`cloud3d thicken`, Cloud 3D Studio `docs/pulp-thicken.md`). Results on T1 (Type 2, 35 mm, standard detail):

| Product surface | Thickening (inside) |
| --- | --- |
| Sharp creases (17 faces) | One valid solid up to 1.8 mm; from 2 mm OCCT splits pocket floors off |
| Floor fillets only (4 mm) | Same: pockets with the plateau, or the skirt with the plateau, thicken at 3 mm; the full tray does not |
| Every crease rounded: 4 mm floor and rim fillets, 10 mm skirt corners, 40 mm extra material (47 faces) | One offset, no joins, at 2, 3 and 4 mm. Every sample passes, minimum thickness equals the request, volume within 1% of area × t. The bounded job publishes STEP and manifest at 3 mm |

Real can trays (Primary Products real-world cans, default draft, extra material raised automatically), thickened at 3 mm:

| Tray | Floors | Result |
| --- | --- | --- |
| 6 × 355 ml beverage cans (10.2 mm dome) | Bands within 0.26–0.29 mm, 2.5 mm caps | 47 faces; one valid solid; every sample passes; minimum 3.000 mm; volume −0.8% |
| 6 × 300 × 407 food cans (3.2 mm recessed panel) | Bands within 0.25–0.30 mm, 23 mm caps | 47 faces; one valid solid; minimum 2.996 mm; volume −0.8% |

Design limits:
- A rim radius must exceed the pulp thickness, because it shrinks by the thickness on the tool side.
- Each plateau strip must hold two rim fillets. With the default 20 mm extra material, T1 has only 3.5 mm of plateau between the corner pockets and the skirt, so 3 mm pulp with rounded rims needs more extra material.

## Phase 3: Cloud 3D Studio

Cloud 3D Studio already runs OpenCASCADE for CAD conversion, using the private, owned, expiring `conversion.*` job pattern. It can take the heavy and authoritative steps:
- **STEP validation and healing:** `BRepCheck` and `ShapeFix`, sewing, AP242 output and a validation report. The reverse of today's converter direction, with the same job contract.
- **Heavy fits:** Phase 2 lofting at ultra detail or for large multi-cavity tools, so the browser never runs the most expensive step.
- **Blender in the cloud:** photoreal customer-review renders and turntables from the GLB (material: pulp type colour and roughness), delivered as images or video next to the GLB.

The interface: Auto3D sends the plan's NURBS JSON and the draft (no product geometry unless needed), and receives STEP, a report and optional renders, as private downloads under the same quota and retention rules as conversions. Agents use the same `conversion.*`-style job commands.

## Phase 4: foundation for the solid modeling module

`nurbs/bspline.js`, `brep.js` and `step.js` are kept free of pulp and forming imports so they can move into a shared package that both modules import, for example `modules/nurbs`. The solid modeling module adds:
- **Curves:** lines, arcs and SVG paths (cubic Béziers convert exactly to B-splines).
- **Operations:** extrude with draft, revolve, loft and sweep, reusing the Phase 2 loft.
- **Topology:** trimmed faces and booleans, the hard part. Booleans and healing can run in Cloud 3D Studio's OpenCASCADE first.

Exchange goes through the same STEP writer and GLB path.

## Open items

- Hinge bead as a solid (Phase 2).
- Colour and naming in STEP (`STYLED_ITEM`), and an AP242 header option.
- The STEP export reuses the subsampled review grid at fine and ultra detail (513 nodes per side at most). Phase 2 removes the grid dependency.
