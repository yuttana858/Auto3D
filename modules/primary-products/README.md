# Primary Products 0.13.0

Independent bottle/can/pouch/closed-clamshell UI and neutral geometry package, API 1. No Auto3D engine, account or Packaging imports. Auto3D integrates its lazy module bundle through separate host adapter/workspace services.

`CreatePrimaryProduct(draft, {segments: 64})` returns indexed component meshes (flat position/normal/UV/index arrays), canonical-mm bounds and physical front/back/wrap zones. Tessellation is bounded to multiples of four from 16–128. Basic bottle components are body/cap; basic can components are body/top/bottom. Detailed construction adds the components described below. Base-centered origin, Y-up; outside height includes the closure. `GetArtworkZones(draft)` describes cylindrical zones on the straight body. Body UVs are profile coordinates; separate label patches supply the artwork UVs.

`ProductDefinition(draft)` and `ValidateProductDefinition(value)` provide strict versioned authoring metadata. File/recovery validation can import this lightweight file without loading geometry or UI.

Legacy definitions retain their original geometry. Optional `details` adds nominal inner walls, shaped shoulders and closures, can seams/tabs, and clamshell rim/hinge/latch components. Hinges and caps are shown closed; threads and articulation remain future work. Not for capacity or engineering claims. The Auto3D host enables scene generation and atomic update/Undo; clear glass/PET use physical transmission with closed presentation cavities. The profile drawing is illustrative. Local label artwork now maps onto generated surfaces through the host; the independent 3D draft preview remains future work.

The module-owned panel receives inspect/configure/reset/generate/update/loadSelected/units/blocked functions from a neutral host. Applying changes rebuilds component surfaces from draft settings; the UI explains this. Drafts survive panel changes within the account, and reset when accounts change.

Standalone: `npm install`, `npm test`, `npm run build` in this folder. Root `npm run build_primary_products` and website builds emit separate lazy JS/CSS assets.

See [the build plan](../../docs/primary-products-build-plan.md) and [scene increment](../../docs/release-0490.md).

Pouches use `DefaultProductDraft("pouch")`, with widthMm, heightMm and depthMm (filled outside envelope). Material is opaque plastic; labels are front/back zone descriptors. Round products retain diameterMm. `Generate` availability follows host editor readiness without rebuilding draft controls. See [0.50.0](../../docs/release-0500.md).

Category material presets expose real PBR defaults through `ListProductMaterials`. `ValidateProductArtwork` validates physical zones; `CreateLabelMesh` creates conforming patches. Authoring definitions may include up to two bounded image descriptors. Original bytes remain in embedded material maps supplied by the host. The panel receives artworkOpen/artworkMapping/artworkRemove/artworkPreview callbacks. Dimensions use one H × W × D row, with linked round W/D and a native material color swatch. See [0.52.0](../../docs/release-0520.md).

Optional `bottleShape` contains all four canonical-mm fields: `neckDiameterMm`, `shoulderHeightMm`, `neckHeightMm`, `capHeightMm`. Missing shape data retains the original proportional profile. Explicit profiles keep a straight body of at least 20% overall height and a cap within the body diameter. Labels are bounded to the remaining straight body; incompatible existing labels block draft mutation. See [0.55.0](../../docs/release-0550.md).

The catalog contains 43 original illustrative designs across bottles, cans, beverages, pouches and unified clamshell browsing. The API is exposed through `ProductCategories`, `ListProductDesigns` and `ProductDesign`. The panel accepts catalog/selectDesign callbacks and opens an animated bottom drawer. Clamshells use the rectangular envelope fields and top/bottom art, stored as front/back zone IDs. See [catalog research](../../docs/primary-product-catalog-research.md) for sources, design limits and material presets.

Clamshell browsing is unified under the fourth Product card (`clamshells`), with legacy food/retail command filters retained. Label controls mount inside the host advanced material editor; `Apply label artwork` preserves custom body surfaces. Glass/PET presets use a closed inner bottle envelope with varying shoulder/neck thickness, not an engineering finish. The host persists transmission/IOR/thickness through rendering, archives and GLB/glTF. See [0.59.0](../../docs/release-0590.md).

## Realistic construction and surfaces (0.13.0)

All 43 catalog presets enable optional `details`: `wallMm`, `textureStrength` (0–1), `textureScaleMm` (1–100), plus family-specific `shoulder`, `closure`, `canStyle` or `shellStyle`. `ValidateProductDetails` validates explicit edits and clamps nominal wall thickness on size changes. Set `details: null` to retain the basic construction. Canonical dimensions remain the outside envelope. Walls at tight seams are presentation approximations, not a manufacturing offset solver.

`ScaleProductChanges(draft, factor)` scales dimensions, bottle profiles and pouch fitments; nominal walls remain fixed subject to fit. Host `primary.scale` optionally scales artwork dimensions and offsets, preserves object identity and edited body materials, and creates one Undo step. The neutral panel receives `setDetails` and `scaleProduct` callbacks.

`ProductSurfaceMaps` returns deterministic, embedded bump/normal/packed-roughness PNG maps with a bounded cache. Physical texture tiling is supplied by the host adapter. The module depends on `fflate` only for portable PNG encoding. Material presets add frosted/amber glass, natural HDPE, frosted PP, satin pearl plastic and clear pouch film. The host persists clearcoat and clearcoat roughness in archives and glTF.

Artwork descriptors accept `finish`, `offsetXmm` and `offsetYmm`. Finish options are matte/textured paper, gloss/satin film, foil and clear gloss film. Transparent artwork preserves its existing alpha; this does not remove a white background. Existing image import remains in the advanced material editor. No CAD layer/schema integration is included while that system is being rolled out.

See [0.62.0](../../docs/release-0620.md) and [reference research and follow-up gates](../../docs/primary-product-realism-research.md).
