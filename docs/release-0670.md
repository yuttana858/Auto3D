# Auto3D 0.67.0 / Packaging 1.10.7 / Primary Products 0.15.0 / Molded Pulp 0.1.0

Adds the Molded Pulp module, built on the Primary Products module pattern: an independent package (`modules/molded-pulp`) with its own tests, build and neutral panel, integrated through a host adapter, workspace and panel host. See [modules/molded-pulp/README.md](../modules/molded-pulp/README.md).

## Workflow

Select products (for example a 3 × 2 array of cans, or a toilet), then in the Molded Pulp panel:

1. **Sense selection** reads the grouped products' world-space surfaces in millimetres and reports the footprint (L × W × H) and primary product.
2. Choose **Type 1, Type 2, Type 3 wet-pressed or Type 3 dry-pressed** pulp; thickness and draft follow the type and can be edited.
3. **Generate sheet** places a flat sheet directly under the products: exact footprint plus **Additional length/width**, at the pulp thickness.
4. **Form depth** sets how far up the mold forms the pulp; on a formed tray it re-forms live.
5. **Form tray** pulls the sheet up around the products to the form depth, with clearance, draft and full wall thickness, and lists design-for-manufacture checks from the MP knowledge base.

Each scene change is one Undo step; the sheet and tray replace each other in place. Opening the panel loads the module on demand and changes nothing.

## Agent commands

`ui.molded_pulp`, `pulp.inspect`, `pulp.types.list`, `pulp.configure`, `pulp.sense`, `pulp.sheet.generate`, `pulp.form_depth.set`, `pulp.tray.form`, `pulp.selected.load`, `pulp.reset`.

## Archives and deployment

Generated objects carry `_auto3dMoldedPulp` userData (schema 1), validated on archive and recovery load without loading the module. `version.json` lists `modules.moldedPulp`; deployment verification checks its script and stylesheet hashes.

## Validation

- `npm test`: 875 passing, including 15 Molded Pulp tests (sensing, sheet sizing, pockets, draft, wall thickness, watertight shell, DFM rules).
- `npm run lint`: clean.
- `test/browser/molded-pulp.mjs`: six generated cans → sense → sheet → form depth → form tray → live depth change → Undo, plus lazy loading and no horizontal overflow in the minimal dock.
- Updated Generation-module button lists in the packaging-cleanup, packaging-presets and primary-products browser tests.
- `test/browser/primary-products.mjs` follows the 0.66.0 expand behavior: Expand opens Edit model (the full-viewport modal it waited for no longer exists), so draft edits stay in the docked panel and the pouch step verifies Edit model opens and closes on the selected product.
