# Molded Pulp 0.3.0

Independent molded pulp tray UI and neutral geometry package, API 1. No Auto3D engine, account, Packaging or Primary Products imports. Auto3D integrates its lazy module bundle through `moldedpulpadapter.js`, `MoldedPulpWorkspace` and `moldedpulppanel.js`, the same boundary as Primary Products.

## Workflow

1. **Sense selection.** The host passes world-space triangles of the selected products (canonical mm, Y-up). `SenseBounds` returns the grouped footprint; the first selected object is the primary product.
2. **Generate sheet.** `PlanSheet (triangles, draft)` sizes a flat sheet to the exact footprint (X = length, Z = width) plus `extraLengthMm` / `extraWidthMm`, split evenly on both sides, and places its top face on the lowest product point, directly under the group.
3. **Form depth.** `formDepthMm` sets how far up the mold forms the pulp, measured from the sheet top.
4. **Form tray.** `PlanTray (triangles, draft)` pulls the sheet up around the products:
   - `BottomHeightfield` rasterizes the lowest product surface at each grid node. A straight-pull tool only sees the product from below, so undercuts cannot be represented, which matches conventional wet molding.
   - Pockets follow each product's bottom where it is at or below the form depth; everything else rises to the form depth; the sheet perimeter drafts down to a foot on the base plane.
   - `clearanceMm` widens pockets (grey-scale erosion with a disc); `draftDeg` limits every slope to cot(draft) with a conservative distance transform, so pockets always open wider at the top.
   - The outer surface is the inner surface offset by `thicknessMm` along the surface normal (erosion with a ball), so steep walls keep their full thickness.
   - `ShellMesh` emits one closed, outward-facing shell in the Primary Products component format `{ id, materialRole, positions, normals, uvs, indices }`, origin-relative.

Both plans return `metrics` (sheet size, achieved depth, pocket count, narrowest rib, shell volume, indicative mass) and `checks`.

## Ribs, denest lugs and the rule base (0.2.0)

`rules.js` holds a declarative rule base (`PulpRuleBase`, listed by `PulpRuleList`). `PlanFeatures (context)` runs every rule over the formed tray (depth, draft slope, sheet rect, pocket boxes, outer-wall run) and returns rib segments, lug placements, nesting estimates, an optional hinge and a trace of every decision with its knowledge-base basis. `features.js` applies them: ribs are hollow U corrugations cut into the plateau before the thickness offset; lugs thicken the drafted outer wall after it (stand-off × cot(draft)), leaving the outer surface in place. Draft fields `ribs`/`lugs` (`auto`|`off`), `ribDepthMm`/`ribWidthMm` (null = automatic) and `lugStandoffMm` override the defaults.

## Detail, worker and adaptive mesh (0.2.0)

`detail` is `draft`, `standard`, `fine` or `ultra` (`PulpDetail`): target cell 2 / ~1 / 0.5 / 0.25 mm on a square 2^k + 1 grid (`DetailGrid`, at most 2049 per side). `field.js` provides the operators: `SlopeLimit` (fast-marching eikonal draft limit), `MinFilterOctagon` (linear-time clearance; exact disc for small radii) and `OffsetDown` (ball erosion on a thickness/3 grid, upsampled). `rtin.js` builds one adaptive triangulation shared by both surfaces, so the shell stays watertight; display density is capped at 1025 per side. `worker.js` (`HandlePulpJob`) runs `PlanPulp` in a Web Worker and transfers the typed arrays; hosts build it as a separate classic script.

## Clamshells (0.2.0)

`clamshell` is `none`, `top-bottom`, `side-x` or `side-z`. Each shell is formed in its own pull frame (`orient.js`, proper rotations) toward a parting plane at `partingFraction` of the product extent, and the flanges meet there. `hinge` adds a half-cylinder bead along the longer flange edge. Components: `pulp-shell-a`, optional `pulp-hinge`, `pulp-shell-b`; `PlanSheet` places a sheet per shell.

## Output: NURBS B-rep, STEP and GLB (0.3.0)

The formed heightfields stay the review model. Every plan also carries `plan.nurbs`: `{ apiVersion : 1, units : 'mm', representation : 'brep', degree : 1, shells }`.
- **Shells.** Each shell (`NurbsShell`, `nurbs/shell.js`) has product-side and tool-side degree-1 B-spline faces through the review nodes, in world mm, at most 513 nodes per side.
- **Topology.** `ShellBrep` (`nurbs/brep.js`) closes each shell with four ruled sides: 6 faces, 12 shared edges, outward orientation.
- **STEP.** `WriteStep (shells, { name })` (`nurbs/step.js`) writes STEP AP214 with one `MANIFOLD_SOLID_BREP` per shell.
- **Foundation.** `nurbs/bspline.js` is a degree-generic B-spline core (knots, basis, evaluation, least-squares grid fitting) meant as the foundation of a future solid modeling module.

The NURBS faces are built in the worker with the plan, and their buffers are transferred. Phase 2 (smooth cubic lofts) is specified, with its test, in Auto3D `docs/molded-pulp-nurbs.md`.

## Pulp types and DFM checks

Presets and checks come from the MP knowledge base (`kb/molded-pulp/04-design/01-dfm-rules-by-process-type.md` in yuttana858/MP). Values that source marks as typical industry values are advisory, so every finding is a warning or note, never a block.

| Type | Default wall | Reported range | Draft (min) | Typical tolerance |
| --- | --- | --- | --- | --- |
| Type 1 thick-wall | 6 mm | 5–10 mm | 5° (3°) | ±2 mm |
| Type 2 transfer-molded | 3 mm | 1.5–5 mm (3–5 reviews, 1.5–3 practice) | 4° (3°) | ±1.25 mm |
| Type 3 thermoformed, wet-pressed | 1 mm | 0.7–1.2 mm | 3° (1°) | ±0.5 mm |
| Type 3 dry-pressed | 2 mm | 1.5–3 mm | 3° (2°) | ±0.5 mm |

| Check | Rule |
| --- | --- |
| MP-T1 | Thickness outside the type's reported range |
| MP-D0 / MP-D1 / MP-D2 | No draft; draft below the type minimum; draft above 7° |
| MP-H1 | Form depth above 90 mm (published single-cavity limit) |
| MP-H2 | Form depth greater than the narrowest product footprint (height-to-width above about 1:1) |
| MP-H3 / MP-H4 | Tray taller than the products; achieved depth below the request |
| MP-M1 | Additional material per side too small for the drafted outer wall to reach full depth |
| MP-R1 | Pockets closer than 8 mm at the plateau |
| MP-R2 | Separate products share a pocket (no full-depth rib between them) |
| MP-C1 | Zero clearance |

Densities used for mass estimates (0.3 / 0.45 / 0.9 / 0.8 g/cm³) are indicative presentation values, not certified material data.

## Limits

- Grid: set by the detail tier (square 2^k + 1 grids, at most 2049 per side); larger sheets coarsen automatically within a tier. Display meshes are capped at 1025 per side.
- At most 2,000,000 sensed triangles. Generated objects store at most 40 product references (archive userData limit); larger groups must be re-selected before `pulp.selected.load`.
- Not modelled yet: undercut/split tools, loaded stacking shoulders, snap locks, shrinkage compensation, per-pocket depths and FEA. Lids formed from above follow the product tops (an inverted tray), not a flat cap.

## Develop

`npm install`, `npm test`, `npm run build` in this folder. Root `npm run build_molded_pulp`; website builds emit separate lazy `molded-pulp.module.js/css` assets.
