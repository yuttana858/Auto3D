# Auto3D 0.83.0 / Packaging 1.14.0 / Primary Products 0.15.0 / Molded Pulp 0.2.0

Molded Pulp 0.2.0 adds knowledge-base ribs and denest lugs, live preview, high-detail forming off the main thread, and clamshells. Based on main after #145 (0.82.1). See [modules/molded-pulp/README.md](../modules/molded-pulp/README.md).

## Ribs and denest lugs from a rule base

`modules/molded-pulp/src/rules.js` is a declarative rule base: each rule has an id, a kind (parameter, placement or check), its MP knowledge-base basis (mp-des-structural-features, mp-des-dfm-rules-by-process-type) and a run function that records what it decided and why.

| Rule | Decision |
| --- | --- |
| RIB-PROFILE | U corrugation: floor width max(3 × wall, 6 mm) (KB: base width ≥ 2–3× wall), depth ~30% of form depth within 3–15 mm, drafted walls |
| RIB-BETWEEN | Rib down the land between pocket columns/rows only where the gap fits the rib opening plus 8 mm land on each side (KB: features ≥ 8 mm apart) |
| RIB-PANEL | Cross ribs at ≤ 100 mm pitch across flat margins larger than ~100 × 100 mm (KB: break up flat areas), kept symmetric |
| RIB-LENGTH | Drops ribs shorter than 16 mm |
| LUG-PLACE | Four symmetric lugs at the middle of each drafted outer wall (KB: at least 3–4, symmetric) with 1–3 mm stand-off |
| NEST-PITCH | Pitch ≈ (wall + stand-off) / tan(draft); flags draft < 3° (wedging) and ratios outside 5:1–15:1 |
| HINGE | Clamshell hinge on the long flange edge in the parting plane, 2 score grooves for 180° folding |

Ribs are hollow wall folds cut before the thickness offset; lugs thicken the drafted wall after it, so a nested part rests on them. Overrides (`ribs`/`lugs` off, `ribDepthMm`, `ribWidthMm`, `lugStandoffMm`) always win and are traced. The panel's **Why** list and `pulp.inspect` `result.trace` show every decision; `pulp.rules.list` lists the rules.

## Live preview

Pulp thickness, additional length/width, clearance, draft, rib and lug fields update the current sheet or tray in the viewer as you type (debounced). Selects and toggles apply at once. Consecutive live edits merge into one Undo step until another action adds history, so Undo returns to the state before the tweaking. `pulp.configure { live : true }` does the same for agents; `pulp.inspect` reports `livePending`.

## High detail without freezing

- Forming runs in a Web Worker (`molded-pulp.worker.js`, a separate classic bundle beside the lazy module; listed in `version.json` and checked by `verify_deployment.mjs`). One job runs at a time; a newer request terminates the stale worker.
- Detail tiers: Draft 2 mm, Standard ~1 mm, Fine 0.5 mm, Ultra 0.25 mm (grids up to 2049² nodes). Above Draft, a draft-detail shape is committed first and the requested detail replaces it in place, in the same Undo step, when ready. `pulp.tray.form` and `pulp.form_depth.set` wait for the requested detail.
- Smooth shapes: the draft limit is now a fast-marching eikonal solve (near-isotropic) instead of an 8-neighbour chamfer, so pocket walls are round instead of octagonal. Clearance uses a linear-time octagon filter (exact disc for small radii); the thickness offset runs on a thickness/3 grid and is upsampled.
- Adaptive mesh: one right-triangulated irregular network shared by the inner and outer surfaces (watertight, flat areas collapse). Display density is capped at 1025 nodes per side; Ultra keeps its accuracy in the computed shape.
- Main thread: the engine model is built in 40,000-triangle slices that yield to the browser, and `SceneDocument.AddImported` takes an optional `adopt` flag so freshly built geometry is not cloned.

## Clamshells

`clamshell` `top-bottom`, `side-x` or `side-z` forms two shells, each in its own pull frame, meeting at `partingFraction` (default 50%) of the product extent, so the products are fully encapsulated. Optional living-hinge bead on the long flange edge. Sheets are placed on both sides for a clamshell sheet stage.

## Validation

- `npm test`: see the PR for the count on the final commit; the Molded Pulp suite has 28 tests (fast-marching isotropy, octagon clearance, adaptive mesh watertightness, detail grid sizes, rule base placements and overrides, rib/lug geometry, clamshell flanges and hinge winding, worker transfer, 0.1.0 draft compatibility).
- `npm run lint`: clean.
- `test/browser/molded-pulp.mjs`: the 0.1.0 flow plus live typing (one Undo step), a Fine tray with rule-base ribs and lugs refined in the worker while the page keeps rendering, the Why list, top-bottom and side clamshells, and an Ultra tray. It logs the longest main-thread task: under software WebGL most of it is the GL draw of the large mesh, not JavaScript.
