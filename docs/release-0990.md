# Auto3D 0.99.0 — Label dielines and product CAD with label regions

Packaging **1.18.0** / Primary Products **0.19.0** / Molded Pulp **0.4.0**.

Stacked on the 0.98.0 candidate ([#174](https://github.com/yuttana858/Auto3D/pull/174)). Not deployed. Complements 0.96.0's label CAD (artwork and cut paths edited in the shared CAD editor): the dieline is the print template around that artwork, and the product STEP carries the label zones into CAD.

## Label dielines

`LabelDieline` builds the flat print template of a label zone from the same zones as the 3D label:
- **Layers:** trim (cut), bleed, safe area, a wrap's glue overlap, and centre and seam guides.
- **Notes:** where the label sits on the product.
- **Overlap defaults:** 6 mm on paper and film wraps; none on direct-printed beverage cans.

A 300 × 407 food can's wrap comes out at 238.2 × 103.3 mm, the standard label for that can.

Exported as SVG (named layers, mm) or DXF (AutoCAD 2000, mm, layers BLEED, TRIM, SAFE, OVERLAP, GUIDES, NOTES): panel *Dieline SVG* / *Dieline DXF*, `primary.label.dieline` (svg, dxf or json).

Artwork designed to the bleed box is imported with `bleedMm` (`primary.artwork.mapping`); the bleed is cropped so the trim fills the label. Cylinder labels sit on the zone's body radius (inside a three-piece can's seams).

## Product CAD with label regions

*Product STEP* / `primary.export.step` downloads the current can as one exact STEP solid in mm (AP214):
- **Geometry:** a solid of revolution of planes, cylinders and cones, from its real construction (`CanOutline` from `CanProfile`).
- **Label regions:** each label zone is split out exactly at its heights (and, for front and back, its angles) as faces named `Label <zone>` in a label colour. By default these are the zones with applied artwork.
- **Body colour:** the product colour.

The files read back in OpenCASCADE as valid solids with exact dimensions and both colours. Bottles, pouches and clamshells are refused for now.

## Agent access

New: `primary.export.step`, `primary.label.dieline`. `primary.artwork.mapping` takes `bleedMm`. Catalogs synchronized.
