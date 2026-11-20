# Auto3D 0.98.0 — Smooth molded pulp (NURBS Phase 2) and real-world cans

Packaging **1.18.0** / Primary Products **0.18.0** / Molded Pulp **0.4.0**.

Based on main `42be7df` (0.97.0, merged #172). Not deployed. Companion: Cloud 3D Studio 0.6.0 ([Cloud-3D-Studio#25](https://github.com/yuttana858/Cloud-3D-Studio/pull/25), draft), which thickens the smooth product surface into the tool side locally; the owned cloud thicken job is not part of this release.

## Molded Pulp 0.4.0: smooth trays from NURBS

The formed heightfields stay the internal review model (sensing, checks, Draft display). From it, each tray now gets a smooth product-side surface (`modules/molded-pulp/src/nurbs/`, details in [molded-pulp-nurbs.md](molded-pulp-nurbs.md)):

- **Lofted walls.** Each pocket wall is one cubic surface through its outlines at increasing height, within the wall tolerance of the review surface. The outer skirt is one closed wall with rounded plan corners; side features such as stacking lugs are kept.
- **Domed and recessed bases.** A pocket over a can's domed (beverage) or recessed (food) base gets a fitted floor band from the wall to a small flat cap, tangent at both ends and smooth across its seam.
- **Every crease rounded.** Pocket floors, rims and the skirt top use tangent blends; planes for floors, caps and the plateau share their edges exactly.
- **Shown in the viewer.** At Standard detail or finer the refined tray is displayed from this surface (watertight, both sides), replacing the saw-toothed walls of the review mesh. Draft detail, and trays where a smooth surface cannot be built yet (pockets that merge below the plateau), keep the review mesh; `metrics.display` says which and why.
- **Smooth STEP export.** Panel *Export smooth surface (STEP)* / `pulp.export { format: 'surface-step' }` writes the product side as an AP214 open shell in mm, for thickening into the tool side (Cloud 3D Studio). A plateau strip between a pocket and the skirt that is too narrow for the rim fillets gets more extra material automatically (reported as `raisedExtraMm`; the scene is unchanged); strips between two pockets shrink the rims instead (`limitedRimMm`).
- **Edge and corner radius.** New live draft settings `edgeRadiusMm` and `cornerRadiusMm`, defaulting to 0.25 in (6.35 mm). Knowledge-base checks (mp-des-dfm-checklist-and-rule-tables G-04/G-05): MP-RD1 edges below 3 mm (Type 1: below the wall), MP-RD2 corners below 6 mm in pockets deeper than 30 mm, MP-RD3 edges not above the wall (sharp on the tool side), MP-RD4 rims limited by a narrow plateau.
- **Rounded sheets.** Flat sheets have rounded plan corners in the viewer and an exact closed STEP solid (planes, flat sides and corner faces), valid in OpenCASCADE.

Measured on six 355 ml beverage cans and six 300 × 407 food cans (Type 2, 35 mm): walls and floors within 0.25–0.31 mm of the review surface; the exported surface thickens at 3 mm in Cloud 3D Studio to one valid solid with every wall sample passing and volume within 1% of area × thickness.

## Primary Products 0.18.0: real-world cans

`CanProfile` sets each style's real construction from D × H, shared by the mesh and label zones: two-piece beverage cans (tapered base, standing ring, ~10 mm spherical dome, necked 202-style end with countersunk lid, tab, rivet and score), three-piece food cans (double seams, beaded body inside them, countersunk ends with expansion rings) and tins. Catalog sizes follow standard cans (355 ml standard and sleek, 250 ml slim, 500 ml tall, 300 × 407, 401 × 411). Detailed can label zones cover the printed wall.

## Agent access

`pulp.configure` takes `edgeRadiusMm` and `cornerRadiusMm`; `pulp.export` adds `surface-step`. The generated browser and MCP catalogs are synchronized.

## Validation

Recorded in the PR: unit (root, Molded Pulp, Primary Products), MCP, lint, the Molded Pulp browser tests and the full local browser suite at the PR head. Full release CI remains a separate gate before merge and deployment.
