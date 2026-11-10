# Auto3D 0.56.0 — researched product design catalog

Primary Products 0.7.0; Packaging 1.10.5. Not deployed.

Adds six browsing categories and 24 original editable design presets, a bottom slide-up/down selector, category-source metadata, expanded PBR finish presets and closed clamshell geometry with separate base/lid cavities and top/bottom artwork. Selecting designs preserves compatible label resources and rejects incompatible changes before mutation. Generate/Apply, save/recovery and Undo use existing services.

New shared commands: `primary.designs.list`, `primary.designs.open`, `primary.designs.select`. `primary.configure` and `primary.materials.list` also accept clamshells and the expanded material catalog. Both generated catalogs are synchronized.

See [research, sources and remaining gates](primary-product-catalog-research.md). Dimensions are illustrative; optical clear materials, articulated hinges, true gusseted/spouted pouches and other remaining build-plan items are not complete in this release.

Validation after integrating #92: 800 application/module tests and 64 MCP tests pass. Lint, website/Pages build, independent module build and Chromium Primary Products desktop/mobile and Packaging CAD browser regressions pass. Browser coverage includes distinct design cards, drawer animation/close/Escape, clamshell generation, image import/application, invalid-label rejection and existing history/panel workflows. Unit coverage verifies catalog geometry bounds, closed positive-volume shells, strict command macros, artwork preservation and clamshell file/recovery/Undo.

Integration: #93 is merged into #91. PR #91 incorporates main after merged Packaging #92, preserving the CAD workspace/export changes and Primary Products catalog. Auto3D stays at 0.56.0, Primary Products at 0.7.0, and Packaging advances to 1.10.5. Both command catalogs are regenerated from the combined registry.
