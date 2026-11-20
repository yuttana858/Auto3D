# Primary Products panel — Auto3D 0.96.0 / Primary Products 0.16.0

Primary Products uses the shared module rail and Minimal, Extended and Close controls. The panel contains catalog selection, dimensions, product construction, materials and label controls. The main viewer shows the generated product; profile drawings remain references. Mobile and extended layouts reuse the same controls and host services.

Selecting a generated product loads its saved definition. Valid dimension, material, glass and cap edits update that selected product after a short debounce; Enter or blur flushes numeric edits. Incomplete numeric input stays in the field until it is valid. The host serializes rebuilds and retains the latest pending values, so rapid edits do not overwrite newer input. A completed burst can be undone together. Replacement preserves object identity, position, rotation, scale, compatible edited surfaces and label placement. Invalid geometry or labels fail before replacement.

Without a matching selected generated product, controls configure a draft for Generate. Opening the panel does not generate a model, upload artwork or save remotely. Live edits preserve the current camera; **Fit selected** explicitly frames the selected product. Account/read-only/session guards and stale-selection checks apply to UI and commands. Changing accounts clears the draft and cancels queued live/CAD work.

## Glass and cap controls

New bottle defaults and bottle catalog presets use glass, including round, oval and rounded-rectangle bodies. Saved explicit plastic/PET and other material choices are retained. Glass geometry has an open mouth, inner and outer walls, a rim and a solid base; the separate cap has its own cavity and material.

The controls expose glass wall/base presets and custom thickness, tint/opacity, IOR and tint distance. Nominal lightweight, standard and heavy wall/base pairs are 1.2/2.4, 2/4 and 3/6 mm, subject to geometry fit limits. Cap controls expose PP/HDPE/aluminum/steel, color, wall thickness and smooth/ribbed/flip-top styling. These are bounded presentation models, not certified tooling or capacity calculations. Existing static contents controls remain available.

## Labels and linked CAD

Available label buttons come from `GetArtworkZones`. Bottle bodies support front/back labels or one wrap; a circular `cap-top` label can coexist with either arrangement. Cans retain front/back/wrap, pouches front/back, and clamshell top/bottom use their existing `front`/`back` IDs. Physical size, offsets and paper/film/foil finish remain in the shared artwork controls. Cap label fit is checked against the printable disc.

**Design in CAD** opens the existing CAD modal for that zone. The label uses cut outlines and an artwork layer, with the shared point editor, shape tools, color editing and SVG/DXF/EPS exports. Board-generation and crease controls are hidden in label mode. A new body label starts with a rectangular cut outline; a new cap label starts with a circular outline. The unrelated Packaging document is preserved.

Compatible SVG shapes become editable paths; curves are flattened with a bounded 0.025 mm approximation. Text, images and unsupported SVG styling can become a disclosed, simplified trace with up to eight colors and adaptive 128-to-8-pixel sampling. Partial transparency is thresholded. The modal reports approximation details so the user can review the result before Apply. Tracing does not preserve font editability or promise lossless photographic detail. Normal image/text/SVG label import remains supported.

Opening or editing CAD leaves the existing 3D label unchanged. **Apply to 3D** renders the edited artwork through the cut outline, preserving label dimensions, offsets and finish, then updates a linked selected product through the normal artwork transaction. A draft without a selected target is staged for Generate. Undo restores the previous source and appearance; closing CAD leaves the current model intact. Applied CAD paths and their PNG material survive file/recovery reopen. Generic GLB/glTF carries the baked label appearance.

CAD profiles allow 100 paths/2,000 points; conversion uses at most 80 artwork paths/1,800 points. Combined editable artwork metadata is limited to 240,000 characters. SVG import remains self-contained and bounded to 64 KiB; images remain bounded to 4 MiB with decoded-size checks. Stale conversions, account/document changes and read-only transitions reject before applying artwork.

## Commands

| Command | Behavior |
| --- | --- |
| `ui.primary_products`, `ui.module.mode` | Open and manage the shared module panel |
| `primary.inspect`, `primary.designs.list` | Read current product state and catalog |
| `primary.configure` | Validate a draft without an implicit rebuild |
| `primary.live.configure` | Apply controls to a matching selected product; otherwise configure a draft |
| `primary.generate`, `primary.update` | Generate or explicitly rebuild a product |
| `primary.profile.update` | Apply validated profile, wall, glass or cap changes |
| `primary.fit` | Frame the selected generated product |
| `primary.artwork.open/text/svg/mapping/remove/apply` | Import or edit label artwork through shared services |
| `primary.label.cad.open/inspect/apply` | Open, inspect and apply linked label CAD |
| `packaging.path.*`, `packaging.paths.assign`, `packaging.artwork.style` | Edit the active shared CAD document |

The local image picker returns `opened`, not a completed import. File, Device Library and Account Library saves remain explicit existing actions. Command schemas, units, mutation flags and account/read-only checks are shared with the UI.

## Ownership and validation

`modules/primary-products` owns state, geometry, construction, artwork validation, panel/profile UI and CSS. It imports neither Auto3D host code nor Packaging. `primaryproductspanel.js`, `primaryproductslive.js`, `primaryproductsworkspace.js`, `primaryproductsartwork.js` and `primarylabelcad.js` own lazy loading, selected-object transactions and the shared CAD binding. Packaging 1.18.0 owns the neutral artwork path/export contract; the host CAD editor supplies its UI.

The module builds independently. Focused Chromium scripts cover live controls (`primary-live-panel.mjs`), SVG/raster conversion (`primary-label-vectors.mjs`), CAD/import services (`primary-label-cad.mjs`) and the real shared CAD modal (`primary-label-cad-ui.mjs`). Module and host tests cover shell/cap geometry, fit, path budgets, textures, archive/recovery and Undo. These fixtures do not imply production deployment; the release record tracks integrated validation.

The original draft-only 0.48.0 panel and opaque 0.49.0 generation were earlier increments; see [the build plan](primary-products-build-plan.md) for their historical scope.
