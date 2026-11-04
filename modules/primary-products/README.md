# Primary Products UI 0.1.0

Independent draft-panel package for Auto3D's planned CPG modeling module. This first increment supplies bottle/can selection, canonical-mm dimensions, draft surface/label-zone controls and an illustrative SVG profile. It does not generate geometry, apply actual PBR shaders, accept artwork files or add scene objects. Add to session is intentionally disabled and labeled accordingly.

The host uses the shared ModulePanels compact/extended/closed shell and opt-in motion. Drafts survive panel changes within an account; account changes reset them. The module has no Auto3D engine, account or Packaging imports. Its neutral host supplies `inspect`, `configure`, `reset`, `units` and `blocked` functions; `PrimaryProductsPanel(host, parent)` owns all content and CSS. Public API version 1 and package version 0.1.0 are separate from the app and Packaging versions.

Run `npm install`, `npm test` and `npm run build` in this folder for a standalone checkout. In the full repository, `npm run build_primary_products` produces its own dist assets; website builds copy a separate JS/CSS bundle into their primary-products directory. No module content or module-owned CSS is loaded merely by initializing the app; lightweight state validation is the only startup import.

See [the build plan](../../docs/primary-products-build-plan.md) for the planned generators, real PBR materials, artwork, persistence and exports.
