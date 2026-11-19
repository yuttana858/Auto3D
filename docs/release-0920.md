# Auto3D 0.92.0 — Can collar and CAD shape tools

Packaging **1.17.0**, Primary Products 0.15.0, Molded Pulp 0.3.0. Based on main after Auto3D 0.91.1. Not deployed.

## Can collar (Accessories)

The Accessories tab has a new **Can collar** section. It adds a paperboard carrier over a selected group or array of upright cans; for a six-pack, array one can 3 × 2.

- **Rim sensing.** Each can's top rim is sensed from its geometry (`SenseCanRim`), so library, imported and Primary Products cans all work. The sensor finds:
  - the rim radius (widest point in the top of the can)
  - the rim underside
  - the neck under it

  A can whose top is not wider than its neck is refused ("No rim to tuck under"). So are cans of different rim sizes and cans standing at different heights.
- **Holes and tabs.** Each can gets a round hole split into tabs by radial V relief slits.
  - The tab tips reach **Tuck under rim** inside the rim (default 1.5 mm).
  - The collar's top face meets the rim underside, so the tabs tuck under the rim.
  - The slits end **Reliefs past rim** beyond the rim (default 3 mm), so the tabs can flex over it. They always leave at least 1.5 mm of board between neighbouring holes.
  - Tabs per can are automatic (about one every 11 mm, 8–24), or 4–48 by choice.
- **Outline.** A rounded rectangle, **Edge margin** beyond the relief rings (default 5 mm). By default the corners follow the corner cans; a corner radius can be set instead.
- **Board.** SBS 24 pt, CUK 24 pt (default), CUK 28 pt, Kraft 32 pt or Molded fiber 1.2 mm.
- **In the scene.** The collar is a CAD board profile like the other accessories, grouped with the cans. It lowers onto them with the usual drop-in and is one Undo step.
  - Its measurement layer shows the overall length and width, the tab-tip diameter and the relief diameter.
  - It opens in the CAD designer and exports as SVG, EPS or DXF.
  - A second collar for the same cans is refused.
- **Display.** The collar is shown flat. In real use the tabs bend up as it is pressed on; the board does not show that bend yet.

The planner is pure: `modules/packaging/src/cancollar.js` (`SenseCanRim`, `CreateCanCollarPlan`, `CollarBoards`). The host part is `source/website/cancollarworkspace.js` (`CanCollarWorkspace`, at `packaging.canCollar`).

## CAD shape tools

The CAD designer has a new **Shape tools** section (round corners, circle, relief hole). It uses the shared `modules/packaging/src/cadshapes.js`, the same code the collar is built with:

- **Round selected corners.** Replaces the corners of the selected closed outlines with tangent arcs, for convex and concave corners. A radius too big for a corner shrinks to half its shorter edge. One Undo step.
- **Add circle.** A closed circular path centred on Point X / Y.
- **Add relief hole.** A round cut hole with tabs and V relief slits (tab radius, relief radius, tabs).

## Agent commands

- `packaging.accessories.collar.inspect` and `packaging.accessories.collar`. Options: `boardId`, `tuckMm`, `reliefMm`, `marginMm`, `cornerRadiusMm`, `tabs`, `notchWidthMm`.
- `packaging.path.round_corners`, `packaging.path.circle` and `packaging.path.relief_hole`.

## Validation

- `npm --prefix modules/packaging test`: 103 passing. New `cancollar.test.js` covers:
  - fillet geometry and area
  - concave corners and shrinking a radius that does not fit
  - circles and relief holes
  - rim, underside and neck sensing
  - refusing non-round models and models with no rim
  - six-pack plan size, holes, web and measurement layer
  - the point budget for 24 cans
- `npm test`: 1080 passing.
- Browser test `can-collar` is in the CI suite. It covers:
  - a standard beverage can arrayed 3 × 2
  - inspect, then Add can collar from the panel
  - grouping, one Undo and Redo
  - the CAD profile (7 paths)
  - refusing a duplicate collar
  - the shape tools
