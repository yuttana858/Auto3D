# Auto3D 0.97.0 — Universal 12 oz collar, white top, board artwork and fast collars with progress

Packaging **1.19.0**, Primary Products 0.16.0, Molded Pulp 0.3.0. Based on main after 0.96.0 (#168); 0.95.0 is reserved by the animation PR #167. Not deployed.

## Universal 12 oz can collar

Collars for 12 oz cans now use one universal design. Every collar uses the same hole: the same tab count, tab width, tab height, tip diameter and relief diameter, whatever the pack layout. The design, `12oz-202`, is for a 211 body (Ø 66 mm) with a 202 end (seam Ø about 57.9 mm):

| Feature | Value |
| --- | --- |
| Tabs | 16 |
| Tab tips | Ø 55.0 mm, tucking about 1.45 mm under the seam |
| Relief slits | end at Ø 64.0 mm, so tabs are 4.5 mm tall |
| Slit width at the tip | 1.0 mm, so tabs are about 9.8 mm wide |
| Web between touching cans | 2 mm (66 mm pitch) |

These values were chosen against the library standard beverage can. The tabs clear its neck through the board thickness by about 0.8 mm. The values live in one place: `CollarStandards` in `modules/packaging/src/cancollar.js`.

- **Choosing the design.** A new **Collar design** setting has three choices:
  - **Automatic** (default): the universal design when the rims fit it (rim Ø 56.9–58.9 mm, cans at least 65.5 mm apart, tabs clear of the neck), otherwise a custom fit, with the reason shown. Giving tuck, relief, tab or slit values asks Automatic for a custom fit.
  - **12 oz universal**: always the universal design. Cans that do not fit are refused with the reason.
  - **Custom fit**: the earlier rim-fitted design.

  With the universal design, the tuck, relief and tab fields are fixed. Board, edge margin and corners still apply.
- **Naming.** The collar is named "12 oz can collar · N cans", and its saved data records `design: '12oz-202'`.
- **Tied to a CAD design.** `StandardReliefHole` is the hole every 12 oz collar uses. The CAD Shape tools have **Add 12 oz collar hole** (`packaging.path.standard_hole`) to draw it anywhere.

## White top

Paperboard collars (SBS 24 pt, and CUK and kraft white top) have a **white top**. The top face is a coated white liner; the back and edges stay kraft. Molded fiber stays natural.

The board top is part of the CAD profile, as the new validated `print` (`{ version: 1, ground: 'white' | 'natural', artwork? }`). It works for any flat board: collars, pads and custom dielines.

## Board artwork (CAD and model)

The CAD designer has a **Print: board top and artwork** section:

- **Board top:** natural kraft or white top.
- **Load artwork…:** PNG, JPEG or WebP up to 4 MiB. **Demo artwork** draws a sparkling-water design sized to the dieline, locally.
- **Fit to dieline** (cover), **Remove artwork**, and Artwork X / Y / width / height in display units.
- **In the drawing:** the artwork shows under the dieline, cropped by the cut lines (holes included).
- **On the model:** a change updates the linked flat board in 3D at once. The CAD change and the model rebuild are **one Undo step**.

How it works:

- **Geometry.** `CreateBoard` (via `ApplyBoardPrint` in `modules/packaging/src/print.js`) gives the top face a white-top material and clips it at the artwork rectangle. The part inside gets a print material whose UVs run across the rectangle. Edges and the back are unchanged. Artwork beyond the cut edge is cropped.
- **Image.** The profile stores only the image SHA-256 and its placement. The bytes travel in the model's print material (its diffuse map), so saved sessions keep them. Reopening a board in CAD registers them again (`source/website/boardprint.js`).
- **Collar shortcut.** In the Can collar section, **Edit collar artwork in CAD** (`packaging.accessories.collar.artwork`) selects the pack's collar and opens it in CAD.
- **Guide lines.** Applying CAD to an accessory no longer adds red and blue guide lines to its model.
- **Not yet printed.** Folded generator boxes keep the print in their profile but do not show it yet.

## Fast can collars with a progress popup

Adding a six-can collar took about 10 s on a desktop and 45.7 s on the sandbox software renderer. The planning itself (rim sensing and the collar plan) takes about 0.1 s. Almost all the time was the board appearance pass (panel bow and cut-edge compression), and it ran twice:

- **Every edge for every sample.** It measured the distance to every dieline edge (about 700 on a six-can collar) from each of about 500,000 sample points, five times per point. It now keeps the edges in a uniform grid and checks only nearby cells. The output is identical: the edge effects are flat beyond about 6 calipers, and a module test compares every vertex and normal against the old implementation.
- **Rebuilt on every render.** Board presentation data was rebuilt each time the scene rendered. It is now cached across renders (`CachedPackagingData`, the last 8 boards), and adding an accessory seeds the cache, so the first render reuses it.

Result: the six-can collar board builds in about 0.45 s instead of 28.8 s in Node. The whole Add takes about 2.0 s in the sandbox (45.7 s before).

**Progress popup.** While the collar is added, a popup over the viewer shows each step with its real detail and measured time, plus the overall percentage and a progress bar:

1. Sensing can rims (per can, with the rim diameter)
2. Planning collar and tabs
3. Building board geometry
4. Placing in the scene
5. Lowering onto the cans (frame by frame)

The percentage is the weighted share of completed work; the weights follow the measured step times. The popup closes itself shortly after it finishes. Agents get the same record as `progress` in the `packaging.accessories.collar` result. The popup is a shared component (`source/website/progresspopup.js`) for other multi-step operations.

## Fix: imported models keep their real size

A model in another known unit now keeps its real size when added to a scene. For example, a GLB (metres) opened or dropped into a millimetre scene made by Primary Products used to appear 1000× too small, as a dot, so it looked as if it had not been added. It is now scaled to the scene unit (Undo and Update model included). Models with unknown units (STL, OBJ) are unchanged.

## Agent commands

- `packaging.accessories.collar` / `.collar.inspect` take `design` (`auto` | `12oz-202` | `custom`). Inspect lists `designs` and returns `collar.standard`.
- New: `packaging.accessories.collar.artwork`, `packaging.path.standard_hole`, `packaging.print.inspect`, `packaging.print.ground`, `packaging.print.demo`, `packaging.print.artwork` (data URL), `packaging.print.open_file` (interactive file picker), `packaging.print.place` and `packaging.print.clear`.

## Validation

- Packaging module: new `print.test.js` (7 tests) covers:
  - print validation and artwork fit modes
  - the white top only on the top face
  - the artwork split, its area and UVs, and cropping at the cut edge
  - the 12 oz design: the identical hole in 6- and 4-packs, refusals, and the white top in the profile
- Browser `can-collar` (extended) covers:
  - automatic 12 oz design, and the universal design ignoring tab and relief options
  - custom fit
  - white top material
  - demo artwork reaching the model's print material and the CAD drawing
  - moving the artwork, one Undo step, board top switch and Undo
  - the 12 oz CAD hole
- New browser test `import-units`: a metre GLB in a millimetre scene keeps its size.
- `boardappearance-speed.test.js`: the edge grid matches the reference exactly, and a six-can collar board builds in seconds. `test/progresspopup.test.js` covers the progress percentages and failure.
- `can-collar` also checks that the popup reaches 100% with all five steps done and timed.
- Both browser tests are in the CI suite.
