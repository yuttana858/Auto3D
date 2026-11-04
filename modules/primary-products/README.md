# Primary Products UI 0.2.0

Independent draft-panel package for Auto3D's planned CPG modeling module. This first increment supplies bottle/can selection, canonical-mm dimensions, draft surface/label-zone controls and an illustrative SVG profile. The independent API now generates closed presentation meshes; the application panel does not yet consume them, apply actual PBR shaders, accept artwork files or add scene objects. Add to session is intentionally disabled and labeled accordingly.

The host uses the shared ModulePanels compact/extended/closed shell and opt-in motion. Drafts survive panel changes within an account; account changes reset them. The module has no Auto3D engine, account or Packaging imports. Its neutral host supplies `inspect`, `configure`, `reset`, `units` and `blocked` functions; `PrimaryProductsPanel(host, parent)` owns all content and CSS. Public API version 1 and package version 0.2.0 are separate from the app and Packaging versions.

Run `npm install`, `npm test` and `npm run build` in this folder for a standalone checkout. In the full repository, `npm run build_primary_products` produces its own dist assets; website builds copy a separate JS/CSS bundle into their primary-products directory. No module content or module-owned CSS is loaded merely by initializing the app; lightweight state validation is the only startup import.

See [the build plan](../../docs/primary-products-build-plan.md) for the planned generators, real PBR materials, artwork, persistence and exports.

## Geometry API (0.2.0)

`CreatePrimaryProduct(draft, {segments: 64})` returns independent indexed component meshes (flat position/normal/UV/index arrays), versioned definition, canonical-mm bounds and named artwork zones. Segments are bounded to multiples of four from 16 through 128. Bottle components are `body`/`cap`; can components are `body`/`top`/`bottom`. Origin is base-centered and Y-up. `GetArtworkZones(draft)` describes straight-body front/back/wrap physical zones; wrap width is circumference. Actual artwork mapping/composition is not implemented; mesh UVs are profile coordinates, not a finished label layout.

These are closed solids for silhouette/adapter development, without hollow walls, threads, seams or a pull tab. Quality flags explicitly describe these limits. They are unsuitable for clear-glass rendering or engineering/capacity claims. Scene generation remains disabled until adapter/history/persistence and material work are delivered.
