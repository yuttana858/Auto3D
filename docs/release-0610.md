# Auto3D 0.61.0 — flat-bottom pouches, zippers and spouts

Primary Products 0.12.0. Packaging remains 1.10.7. Based on main after merged PR #102 (0.60.0). Not deployed.

## Change

- **Flat-bottom (box) pouches.**
  - **Construction** now offers *Flat-bottom (box)* next to *Pillow* and *Stand-up*.
  - The bag keeps a full rectangular W × L section with flat side gussets and a flat base, so it stands squarely.
  - Above 62% of the bag height, the side gussets fold in towards the flat top seal.
  - Flat-bottom pouches need a filled depth of at least 20 mm.
- **Reclosable zipper.**
  - Any pouch style can have a zipper. A raised press-to-close track runs across the front and back panels just below the top seal, inset from the side seals.
  - Each track is its own closed component that follows the panel surface.
  - Front and back label zones end below the zipper.
  - Zipper pouches need a height of at least 60 mm.
- **Spout.**
  - Stand-up and flat-bottom pouches can have a **center** or **corner** spout: a neck through the top seal and a screw cap.
  - **Spout diameter** is 5 mm up to a limit set by L, W and H (at most 40 mm). It defaults to 12 mm.
  - The overall height H includes the spout and cap, so the W × L × H callouts still measure the whole product.
  - Resizing reduces the spout to fit the new limit instead of rejecting the resize.
- **Storage.**
  - These options are stored in `pouchShape { style, gussetMm?, zipper?, spout? }`.
  - A plain pillow pouch still has no `pouchShape`, so existing drafts and saved products are unchanged.
  - A pillow pouch with a zipper is stored as `{ style : 'pillow', zipper : true }`.
- **Generated output.**
  - `quality` reports `construction`, `gusset` (`false`, `'bottom'` or `'box'`), `freeStanding`, `zipper` and `spout`.
  - Object names describe the build, e.g. *Flat-bottom pouch with zipper* or *Stand-up pouch with spout*.
- **Catalog.** Five more Pouches designs:
  - zipper stand-up pouch;
  - flat-bottom coffee bag;
  - flat-bottom large bag;
  - spouted drink pouch;
  - corner-spout refill.
- **Drawings.** The design thumbnails and the profile drawing show the base and gusset lines, the zipper track and the spout. One outline function draws them all.

## Agent commands

`primary.configure` accepts `pouchShape` with:

- `style` (`pillow`, `standup` or `flatbottom`);
- `gussetMm` (stand-up only);
- `zipper` (boolean);
- `spout` (`null`, or `{ position : 'center' | 'corner', diameterMm }`; stand-up and flat-bottom only).

`primary.designs.generate` accepts the new ids `zip-snack`, `flat-bottom-coffee`, `flat-bottom-petfood`, `spouted-drink` and `spouted-refill`.

## Not included

Tear notches, hang holes, seal-width controls, side-gusset (quad-seal) bags, angled corner spouts, molded threads and fill simulation.

## Validation

- `npm run lint` passes.
- `npm test` passes.
- The Primary Products module tests pass (25). New tests check that:
  - every body, zipper and spout component is closed, outward-facing and inside W × L × H, including at the size extremes;
  - the body height leaves room for the spout;
  - the flat-bottom base and side gussets are flat;
  - label zones end below the zipper;
  - invalid options are rejected and the spout is clamped on resize.
- The `primary-products` browser test generates the flat-bottom coffee bag and the corner-spout refill. It checks:
  - the object names and the H callout;
  - the Construction, Reclosable zipper, Spout and Spout diameter controls;
  - that a spout on a pillow pouch is rejected.
