# Auto3D 0.60.0 — stand-up pouches

Primary Products 0.11.0. Packaging remains 1.10.7. Based on main after merged PR #101 (0.59.1). Not deployed.

## Change

- **Pouch style.** Pouches have a **Construction** of *Pillow (flat seals)* or *Stand-up (bottom gusset)*, stored as an optional `pouchShape { style : 'standup', gussetMm }`. Pillow pouches have no `pouchShape`, so existing drafts and saved products are unchanged.
- **Geometry.** A stand-up pouch opens into a flat elliptical base whose depth is the filled depth (L). Up to the gusset fold line it keeps the full depth, then tapers smoothly to the flat top seal band (8% of the height). It stands on its base. The mesh is closed and outward-facing at the supported extremes, and its bounds are exactly W × L × H. `quality` reports `construction : 'filled-standup-presentation'`, `gusset : 'bottom'`, `gussetMm` and `freeStanding : true`.
- **Gusset height** is the fold line on the front panel: 3 mm up to the filled depth, and at most 35% of the height. It defaults to half the depth. Resizing a stand-up pouch keeps the gusset inside the new limit instead of rejecting the resize. Stand-up pouches need a filled depth of at least 10 mm.
- **Labels.** Front and back label zones sit above the gusset fold and below the top seal, and conform to the actual tapered surface.
- **Catalog.** Five stand-up designs in the **Pouches** drawer: snack, coffee (kraft-look), mini, refill and foil. The design thumbnails and the profile drawing show the gusset fold and top seal.
- **Names.** Generated objects are named by construction, for example *Stand-up pouch* or *Oval bottle*, instead of the family name.

## Agent commands

`primary.configure` accepts `pouchShape` as `null` or `{ style : 'pillow' | 'standup', gussetMm }`. `null` or `pillow` returns to a pillow pouch. `primary.designs.generate` accepts the new design ids `standup-snack`, `standup-coffee`, `standup-mini`, `standup-refill` and `standup-foil`.

## Not included

Zippers, spouts, tear notches, flat-bottom (box) pouches, and fill or flexible-film simulation.

## Validation

- `npm run lint` passes.
- `npm test` passes.
- The Primary Products module tests pass (23). New tests check:
  - stand-up meshes are closed, outward-facing and correctly bounded at the extremes;
  - the base is flat and full depth, and the panel tapers;
  - label zones sit inside the gusset and top-seal limits;
  - gusset validation and clamping on resize.
- The `primary-products` browser test generates `standup-snack` from the Pouches drawer and checks:
  - the object name and the callouts;
  - the Construction select and Gusset height field;
  - a live Enter resize that clamps the gusset;
  - switching back to a pillow pouch.
