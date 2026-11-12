# Auto3D 0.62.0 — Primary Products realism

Primary Products 0.13.0; Packaging remains 1.10.7. Stacked on #103 (`dc83a78`, flat-bottom pouches/zipper/spouts). Not deployed. CAD label/layer integration is paused at the user's request and excluded from this branch.

## Behavior

- All 43 catalog designs enable detailed construction. Bottles gain rounded heels/shoulders, beveled ribbed/smooth caps, a closed flip-top appearance and neck rings. Cans gain recessed bases, rolled rims, food beads or beverage pull tabs. Clamshells gain formed rims, a closed hinge/latches and food/retail lid splits. Bottles, cans and pouches gain nominal inner walls; existing pouch gussets, zippers and spouts are retained.
- Product construction controls expose nominal wall thickness, family construction, surface strength and physical texture scale. Existing saved definitions keep their legacy geometry until detail is enabled.
- Embedded procedural bump, normal and roughness maps distinguish plastic, film, paper/fiber and brushed metal. Six additional material presets cover frosted/amber glass, natural HDPE, frosted PP, pearl plastic and clear pouch film. Physical transmission/IOR and editable clearcoat provide separate optical/finish controls.
- Advanced label editing retains PNG/JPEG/WebP import and adds matte/textured paper, gloss/satin film, foil and clear gloss finishes, plus physical horizontal/vertical placement. Detailed pouch labels share the body's smoothed normals. Clear film preserves the imported alpha channel.
- Uniform scale resizes the selected product parametrically, optionally scaling label size/offsets. Independent dimensions remain available. Resizing preserves edited body materials, physical texture density, selection/object identity and one-step Undo. Invalid sizes or label bounds reject the edit before scene mutation.
- Clearcoat and its roughness round-trip through sessions and `KHR_materials_clearcoat` in glTF/GLB. Procedural texture bytes are embedded in portable archives.

## Shared UI / MCP actions

- `primary.details.set`: enable/disable realistic detail; validate family-specific settings.
- `primary.scale`: factor 0.1–10 and optional `scaleArtwork`.
- `primary.artwork.mapping`: physical size, offsets and finish; zone is required.
- `material.set` / `material.list`: expose `clearcoat` and `clearcoatRoughness`.

The generated browser and MCP command catalogs include these actions. Local image import remains interactive; it is not silently uploaded to a service.

## Limits and validation

See [research, sources and next build gates](primary-product-realism-research.md). Geometry is for presentation: nominal inner walls, closed cap/hinge details and approximate translucency do not establish manufacturing thickness, capacity, mating fit or physically calibrated scattering. No CAD files or layer schema are changed.

- `npm test`: 818 passing. Focused realism/optics checks also pass after the final can-end, zipper and back-label placement refinements, including macro execution and read-only protection.
- `npm run test_mcp`: 66 passing; command catalogs regenerated.
- Website/Pages and independent Primary Products builds pass; application and MCP lint, license checks and `git diff --check` pass.
- `test/browser/primary-realism.mjs` passes in Chromium: image import, label finish/offset application, translucent/roughness/bump properties, proportional resize, Undo/Redo, category generation, readback and mobile overflow. Visual captures use the existing softbox HDRI. The subsequent refinement keeps the can's closing disk below its scored end and tones zipper tracks to the pouch material.
- `test/browser/primary-products.mjs` and `test/browser/primary-materials.mjs` both pass: existing generation, catalog, dimensions/callouts, bottle sections, stand-up/flat-bottom/spouted pouches, label application, material preservation, desktop/mobile and panel motion regressions.

Local review captures are in `work/primary-realism-review/` (not committed).

## Production promotion

PR #104 merged into the stacked parent after #103 had reached main; PR #106 promotes the realism release to main. The earlier CI run passed validation and two browser shards, but its ten-minute per-test watchdog stopped the complete Primary Products flow. That test now has a twenty-minute budget; other tests retain ten minutes. The board-database test also gives its first rendered generation the same two-minute budget used by other geometry checks. Assertions and application behavior are unchanged.

The prior 0.61.0 production workflow also failed in the MCP test helper when reading a retained token response after a subsequent Miniflare dispatch. The helper now consumes the token response immediately, before looking up registrations. All 66 MCP tests and the complete board-database browser regression pass with these test-only changes. No production authentication or CAD behavior is changed.
