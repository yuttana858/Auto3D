# Primary Products 0.5.0

Independent bottle/can/pillow-pouch UI and neutral geometry package, API 1. No Auto3D engine, account or Packaging imports. Auto3D integrates its lazy module bundle through separate host adapter/workspace services.

`CreatePrimaryProduct(draft, {segments: 64})` returns indexed component meshes (flat position/normal/UV/index arrays), canonical-mm bounds and physical front/back/wrap zones. Tessellation is bounded to multiples of four from 16–128. Bottle components: body/cap. Can components: body/top/bottom. Base-centered origin, Y-up; outside height includes the closure. `GetArtworkZones(draft)` describes cylindrical zones on the straight body. Body UVs are profile coordinates; separate label patches supply the artwork UVs.

`ProductDefinition(draft)` and `ValidateProductDefinition(value)` provide strict versioned authoring metadata. File/recovery validation can import this lightweight file without loading geometry or UI.

Shapes are closed presentation solids without hollow walls, threads, detailed seams or pull tabs. Not for capacity or engineering claims. The Auto3D host enables opaque scene generation and atomic update/Undo; glass generation remains blocked pending transmission/hollow-wall work. The profile drawing is illustrative. Local label artwork now maps onto generated surfaces through the host; the independent 3D draft preview remains future work.

The module-owned panel receives inspect/configure/reset/generate/update/loadSelected/units/blocked functions from a neutral host. Applying changes rebuilds component surfaces from draft settings; the UI explains this. Drafts survive panel changes within the account, and reset when accounts change.

Standalone: `npm install`, `npm test`, `npm run build` in this folder. Root `npm run build_primary_products` and website builds emit separate lazy JS/CSS assets.

See [the build plan](../../docs/primary-products-build-plan.md) and [scene increment](../../docs/release-0490.md).

Pouches use `DefaultProductDraft("pouch")`, with widthMm, heightMm and depthMm (filled outside envelope). Material is opaque plastic; labels are front/back zone descriptors. Round products retain diameterMm. `Generate` availability follows host editor readiness without rebuilding draft controls. See [0.50.0](../../docs/release-0500.md).

Category material presets expose real PBR defaults through `ListProductMaterials`. `ValidateProductArtwork` validates physical zones; `CreateLabelMesh` creates conforming patches. Authoring definitions may include up to two bounded image descriptors. Original bytes remain in embedded material maps supplied by the host. The panel receives artworkOpen/artworkMapping/artworkRemove/artworkPreview callbacks. Dimensions use one H × W × D row, with linked round W/D and a native material color swatch. See [0.52.0](../../docs/release-0520.md).
