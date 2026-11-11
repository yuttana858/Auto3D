# Primary product categories and sourced design subset

Research: 2026-11-09. Sources are manufacturer catalogs and technical/category pages, not downloaded proprietary CAD. The 24 presets are original simplified presentation models with illustrative outside dimensions, not replicas, capacity calculations or approved supplier specifications. Images and branded artwork are not copied into Auto3D.

| Category | Research findings | Implemented subset | Primary sources |
| --- | --- | --- | --- |
| Bottles | Suppliers offer round, oval and other shapes in PET/HDPE and glass; shoulder, neck and closure proportions distinguish designs | Round care, sloping Boston-inspired, tall cosmetic, wide-mouth, travel and household rounds | [Berry bottles/vials](https://www.berryglobal.com/en/product/bottles-vials), [O.Berk catalog index](https://www.oberk.com/oberk-site-map) |
| Cans | Steel/aluminum containers vary by body construction, size and ends | Food, low tin, tall utility and wide food presentations | [Silgan cans](https://www.silgancontainers.com/cans/), [Silgan ends](https://www.silgancontainers.com/ends/) |
| Beverages | Standard, sleek and slim can formats; bottle envelopes are also relevant | Four can proportions and an opaque PET bottle | [Ball beverage cans](https://www.ball.com/packaging/beverage-cans), [Cask can specifications](https://www.cask.com/cans/can-tech-specs/) |
| Pouches | Pillow/flat, bottom-gusset, spouted and inverted formats have different construction and dispensing needs | Pillow snack, thin sachet-envelope and large pillow presentations | [Glenroy flexible packaging](https://www.glenroy.com/flexible-packaging/), [stand-up pouches](https://www.glenroy.com/flexible-packaging/stand-up-pouches/), [spouted pouches](https://www.glenroy.com/flexible-packaging/stand-up-pouches/spouted-pouches/) |
| Retail clamshells | Broad stock selection with differing footprints/cavity depths; transparent display is a separate optical requirement | Compact, deep and wide closed two-piece shell envelopes | [Placon retail](https://www.placon.com/retail/), [shallow retail example](https://www.placon.com/product/blisterbox-r697/) |
| Food clamshells | PET and PP are represented in supplier material catalogs; cavity height and footprint vary with use | Deli, bakery and fiber-look takeaway envelopes | [Placon materials](https://www.placon.com/food/materials/), [product catalog](https://www.placon.com/shop/) |

The source relationship is a category reference, not endorsement or product equivalence. Every preset exposes its category source URL and the illustrative-dimension notice through `primary.designs.list`. Numeric values were authored for useful editing examples; they were not extracted as exact supplier specifications. Beverage names do not assert fill volume. Food category membership is not a food-contact or temperature certification.

## Materials

The library separates substrate-inspired visual presets from geometry: HDPE, PP, opaque PET, aluminum, steel, coated and matte metals, matte/gloss/satin film, metallic laminate, soft-touch/lacquer, kraft-look laminate, paperboard and molded-fiber-look surfaces. New finishes drive actual base color (where specified), roughness and metalness in the existing physical-material pipeline. They are editable artistic presets, not measured optical datasets. Label ink stays on separate dielectric label meshes; metallic substrates do not turn the ink metallic.

The original catalog release kept clear glass/PET disabled. Auto3D 0.59.0 adds transmission/IOR/thickness, closed bottle cavities and clear PET clamshells, with renderer/archive/GLB checks; see [the current limits](release-0590.md). Paper and fiber presets approximate finish and color; no fiber microgeometry, measured BRDF, or barrier-performance simulation is claimed.

## Interaction and preservation

Choosing a family or category opens a bottom design drawer; choosing a design updates the draft, and Generate/Apply commits the scene through existing history services. The drawer supports reduced motion, close/Escape and desktop/mobile layouts. Original label resources are retained. A design that cannot fit current physical artwork is rejected before mutation. Cross-family changes with artwork require removing it explicitly; no automatic stretching or silent removal.

Closed clamshell meshes contain separate base/lid cavities with physical shell walls, rounded corners and tapered cavities. They have top/bottom planar artwork (stored using the existing front/back zone identifiers), with corresponding normals. They do not yet articulate or include a modeled hinge, latch, ribs or a supplier-specific flange.

## Remaining build-plan gates

This catalog increment does not complete the entire Primary Products plan. Remaining: absorption tint and optical texture maps; advanced closures; true stand-up/flat-bottom/spouted pouch construction; articulated clamshell hinges and tooling details; physical artwork templates, advanced placement/finishes and independent 3D draft preview. Add designs only when their geometry and label behavior are implemented; do not relabel the pillow generator as a stand-up pouch. The primitive/Boolean track remains separately planned in [primitive-solid-editing-research.md](primitive-solid-editing-research.md).
