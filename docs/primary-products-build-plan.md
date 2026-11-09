# Primary Products module — build plan

Status: implementation in progress. UI shell is stacked in #63/#62; independent geometry follows in #64 (module 0.2.0). Opaque scene generation/update and versioned persistence are now in development in module 0.3.0; see [the scene increment](release-0490.md). The 0.50.0 increment adds Generate readiness and opaque pillow pouches; advanced bottle/can artwork/glass gates and other pouch types remain incomplete. See [current increment](release-0500.md). No deployment of that increment is implied. See [geometry progress](primary-products-geometry.md).
Created: 2026-11-04. Repository baseline: Auto3D 0.47.3, Packaging 1.10.3.
Proposed package: `@auto3d/primary-products`, initial module version 0.1.0; API version 1.

## 1. Goal and product workflow

Generate dimensionally controlled, reusable 3D models of consumer packaged goods (CPG), then apply realistic PBR surfaces and user-supplied label artwork. A generated product should be useful for package-fit studies, shelf layouts, visualization and rendering in Auto3D, and remain editable after saving/reopening.

The main workflow is:

1. Open **Primary Products** as its own module.
2. Choose a category and preset; enter dimensions in the global mm/in preference.
3. Adjust shape, closure and component options in an independent draft preview.
4. Set component materials and import/place label artwork.
5. **Add to session** creates one logical product object. Later, **Apply changes** replaces that object's generated geometry without changing its ID or placement; one Undo restores the previous product.
6. Duplicate/array, arrange, animate and render using existing Auto3D tools. Save to file, Device Library or owned Account Library through existing explicit save actions.

Opening the panel, choosing a preset or changing a draft must not modify the main scene, submit an AI task or upload a file. Draft preview and session application are distinct actions. Selecting an existing generated product loads its saved definition for editing. Imported products may be decorated, but do not acquire parametric shape controls automatically.

## 2. Categories and reusable geometry

Use **geometry family** and **use case** as separate fields. Beverage is a category/preset filter, not a second bottle or can engine. Material selection is also separate from shape. Present these user-facing categories: Bottles — non-beverage glass/plastic; Cans — non-beverage; Beverages; Pouches; Clamshells — non-food; Clamshells — food.

| Family | First presets and use cases | Shape controls | Separate components |
| --- | --- | --- | --- |
| Bottle | Round personal-care/household bottle; non-beverage glass; beverage PET/glass presets | Body diameter or width/depth, body height, shoulder profile, neck diameter/height, base radius and wall thickness | Body, neck/finish region, cap; optional visual contents later |
| Can | Beverage can; straight-wall food/household can | Diameter, overall height, body height, rim/seam dimensions, lid/end style | Body, top, bottom; simplified beverage pull-tab where applicable |
| Pouch | Flat sachet, pillow pouch, stand-up pouch | Width, total height, filled depth, seal widths, bottom gusset, fill/bulge amount | Front/back film surfaces, seals, gusset; zipper/spout in a later increment |
| Clamshell — non-food | Clear hinged retail pack with rectangular/rounded cavity | Closed width/depth/height, base/lid depths, rim, corner radii, flange and hinge location | Base, lid, hinge region; optional hang tab |
| Clamshell — food | Bakery/produce/deli-style pack | Closed envelope, cavity depths, draft/taper, flange, rib pattern and optional vents | Base, lid, hinge region; food contents are optional imported assets later |

Confirmed first-release priority: **bottles and cans**, selected by the user on 2026-11-04. Start with round non-beverage bottles and beverage/non-beverage cans, proving the shared PBR material and label-artwork workflow end to end. Build pouches and clamshells after that vertical slice passes.

### Geometry contracts

- Store all authoritative dimensions in **millimeters**. Convert inches exactly using 25.4 mm/in at the host boundary.
- For rigid products, default W/D/H means the **closed outside envelope**, with H including the attached closure. Also expose body-only dimensions. For pouches, explicitly distinguish flat blank dimensions from the filled envelope. Opening a clamshell changes its displayed bounds, not its saved closed dimensions.
- Keep commercial size/nominal capacity separate from geometry. A “500 mL” preset is descriptive metadata unless a valid internal cavity and a defined volume calculation support that value. Pouch bulge is a geometric appearance control, not a fill-volume simulation.
- Use base-centered origin, width=X, depth=Z, height=Y in the initial module convention, matching the current Auto3D/Packaging integration. Isolate scene-unit/up-axis conversion in the host adapter; do not bundle a scene-wide Z-up migration into this project.
- Round bottles/cans use revolved profiles. Non-round bottles use rounded-rectangle/oval lofts with explicit shoulder and neck transitions. Pouches use bounded surface patches with controlled bulge and seams. Clamshells use drafted, rounded shells with rims and a defined hinge pivot.
- Preserve stable component IDs/material roles and named artwork zones during regeneration. Validate positive dimensions, minimum wall/seal sizes, shoulder/neck fit, cavity/rim compatibility and valid meshes before replacing the scene object.
- Model walls and base thickness for clear rigid containers. Simplified threads, hinges, seals and ribs are presentation geometry unless a later release explicitly adds engineering-grade construction. No tooling, structural or forming simulation is included in the initial scope.

## 3. Independent module architecture

Follow the independent Packaging pattern described in [module-panels.md](module-panels.md) and [modules/packaging/README.md](../modules/packaging/README.md).

```text
modules/primary-products/
  package.json
  src/
    index.js                 # neutral public API/version
    definition.js            # schema/defaults/validation
    presets.js               # category/preset catalog
    generators/              # bottle, can, pouch, clamshell
    materials.js             # component presets and PBR definitions
    artwork.js               # zones, physical placement and composition
    panel.js                 # module-owned controls
    primary-products.css
  preview/                   # independent Three.js preview host
  test/                      # independent geometry/material/artwork tests
  tools/                     # standalone build/preview

source/website/
  primaryproductsadapter.js  # neutral meshes/materials -> engine scene
  primaryproductsworkspace.js# draft, selection, atomic apply/history
  primaryproductspanel.js    # lazy loader and shared panel registration
```

- Register `primary-products` with `ModulePanels`; use its Minimal/Extended/Close shell, mobile behavior and shared typography. Keep content out of AIWorkspace and Packaging.
- The independent package must not import `source/engine`, `source/website`, account APIs or browser application state. Its preview must build/run without Auto3D or sign-in.
- Keep schema validation lightweight; lazy-load generators, panel UI, texture composition and previews. Reuse existing renderer/material services where their contracts fit. Do not copy private Packaging helpers into the new module or introduce cross-module imports just for convenience.
- Proposed neutral API: `ValidateProductDefinition`, `ListProductPresets`, `CreatePrimaryProduct`, `GetArtworkZones`, `UpdateArtworkPlacement`, `ExportArtworkTemplate`.
- Generator results carry `apiVersion`, canonical units, normalized definition, components, neutral meshes, material roles, artwork-zone mappings and embedded resources. They must not contain engine objects, credentials or remote signed URLs.
- Auto3D owns scene conversion, account/read-only enforcement, Undo/Redo, Library saves, archive migration and agent registration. No new database table or product-management backend is needed for the first release.

## 4. Product definition and persistence

Persist a versioned definition independently of generated triangles:

| Field | Purpose |
| --- | --- |
| `schemaVersion`, `generatorVersion`, `presetId` | Validate/migrate data; identify geometry behavior |
| `family`, `useCase`, `name` | Geometry selection and user-facing categorization |
| `dimensions`, `shape`, `closure` | Canonical-mm inputs and component options |
| `materialAssignments` | Role-to-material mapping with complete saved property snapshots |
| `artworkZones`, `artworkAssignments` | Stable zone IDs, embedded resource references, physical size/placement and finish masks |
| `resources` | Original supported artwork bytes, MIME/type and content hash |
| optional `metadata` | SKU/brand/variant/nominal capacity; no inventory or compliance workflow |

Add the definition as validated optional per-object session data. Continue saving ordinary baked geometry, material maps and textures so the model can be viewed without loading its generator. Preserve both original artwork and composed maps; an expired external URL must never prevent reopening.

A parameter edit regenerates from the saved definition, preserving object identity, transforms, name, visibility, group membership and compatible component material/artwork assignments. If the new shape invalidates a label zone, present a specific conflict and require correction; do not silently drop artwork. Apply is atomic and creates one history step. Arrays may share immutable geometry/resources; editing a copy detaches it without changing siblings.

Use existing `.auto3d`, Device Library and Account Library flows. Extend archive validation/migrations explicitly; do not assume old readers understand new authoring fields. Ordinary GLB should retain visible geometry/materials/artwork; restoration of parametric authoring from GLB is optional and must not be promised for generic importers.

## 5. PBR materials and rendering

Assign materials by component role, rather than one material for the entire SKU. Starting presets:

- Glass: clear/tinted/frosted.
- Plastics: opaque HDPE/PP, clear/tinted PET, translucent plastic, glossy/matte closures.
- Metals: aluminum and steel with separate coated/printed regions and end/seam materials.
- Films: matte/gloss flexible plastic and metallic laminate.
- Labels: matte/gloss paper, white film, clear film and direct print; foil/spot finishes can follow the first working artwork slice.

Expose base color, roughness, metalness, normal/bump strength, opacity/alpha mode, AO and relevant texture maps. Where supported, expose transmission, IOR, thickness/attenuation and clearcoat. Unsupported fields must be disabled or explicitly marked; never persist a control that has no rendering effect.

**Required renderer audit before committing to clear-pack quality:** the current engine exposes ordinary PBR/opacity fields, but transmission/IOR/thickness must be traced through engine material definitions, cloning, Three.js conversion, the material editor, recovery/session archives and GLB import/export. Implement and test missing links. Opacity alone is not an adequate clear-glass/PET solution. Compare main viewer, module preview and exported GLB against the same material fixtures.

Use sRGB for artwork/base color and linear data for roughness, metalness, normals and masks. Handle channel packing explicitly on GLB export. Give clear packs sensible wall geometry and labeled draft quality settings; measure transmission/reflection costs before choosing mobile defaults. Reuse the app's HDRI/lighting controls rather than adding an independent lighting model.

## 6. Label art and surface decoration

Artwork is an editable layer associated with a named physical zone, independent of body geometry and body PBR settings.

### First release

- PNG, JPEG and WebP import with original bytes retained. PNG/WebP alpha supports nonrectangular designs.
- Front/back rectangular labels and cylindrical wrap labels for bottles/cans; pouch front/back and clamshell top/bottom zones follow their family release.
- Physical width/height and seam gap in mm/in; horizontal/vertical placement, rotation, scale, repeat and fit/cover behavior. Show the selected zone and a seam/registration guide in preview.
- Offer “preserve artwork proportions” by default. Report distortion or clipping rather than silently stretching a label over a shoulder, taper or gusset.
- Keep two explicit resize policies: preserve physical label dimensions or refit to the updated zone. Default to preserving physical size and flag an invalid fit before Apply.
- Separate substrate and ink behavior: opaque ink/white underprint must not accidentally inherit an aluminum body's metalness. Transparent areas on clear film reveal the body, not a white rectangle.
- Save physical placement, source art, substrate, composed texture and finish settings together; replacing artwork retains its mapping unless explicitly reset.

### Following increments

- Per-zone SVG templates in physical millimeters, with printable bounds and separately named trim/safe/bleed guides. User-editable bleed values are required; no printer-ready certification is implied.
- Sanitized SVG artwork import, rasterized deterministically. Reject scripts, external resources and oversized/invalid image data. PDF/AI/EPS and printer color-management workflows are deferred.
- Spot gloss/matte, metallic/foil, emboss/deboss appearance and white-ink masks. Keep these visual layers separate from authoritative dimensions.
- Shrink sleeves and irregular curved labels after dedicated UV/distortion validation. Do not advertise automatic distortion compensation in the first release.

Choose compositing into compatible material maps as the first portable strategy. Use additional label geometry only where required (for example a paper edge or separate film). Avoid coplanar z-fighting and ensure preview, archives and exported GLB agree. Preserve separate maps/material regions when a portable flattened result cannot represent the requested finish.

## 7. UI and agent contracts

Minimal mode: category/preset, dimensions, Generate/Preview, selected-product edit controls, Materials, Artwork and Add/Apply. Extended mode: larger draft preview with shape, material and artwork controls, using the shared module shell. Changing modules, collapsing panels and resizing must preserve drafts and scene state.

Every user-facing action needs a stable strict command using the same service as the UI. Proposed names (not implemented yet):

| Command | Behavior |
| --- | --- |
| `ui.primary_products` | Open the panel; no generation |
| `primary.presets.list`, `primary.inspect` | Read presets/current definition, dimensions and component/zone IDs |
| `primary.configure`, `primary.preview` | Validate/update draft and preview it without adding scene objects |
| `primary.generate`, `primary.update` | Create a session object or atomically rebuild the selected generated object |
| `primary.material.set` | Change a component-role surface with history |
| `primary.artwork.open` | Open an interactive local file picker; return `opened`, not “uploaded” |
| `primary.artwork.assign`, `primary.artwork.mapping`, `primary.artwork.remove` | Use an already imported resource ID and named zone; validate before mutation |
| `primary.artwork.template` | Return/download a dimensioned zone template |

Use existing object, history, export and Library commands where possible. Do not add duplicate versions of those workflows. Synchronize generated command catalogs when implementation lands. MCP exposure must follow the actual released connector policy: scope, account, pairing, read-only and external-action approval requirements remain enforced. This plan does not assume the in-progress MCP edit expansion is already deployed.

## 8. Build phases and exit gates

| Phase | Deliverable | Exit gate |
| --- | --- | --- |
| 0 — Contracts and rendering spike | Schema/API, unit/origin conventions, independent scaffold; one round bottle; clear/opaque material and one label-zone fixture | Confirm visible clear-pack behavior, label physical scale and portable resource strategy before finalizing renderer work |
| 1 — Bottle/can vertical slice | Round non-beverage bottle + cap; beverage/non-beverage can presets; PBR roles; front/back/wrap artwork; main-app adapter, Undo, commands, file save and GLB | Generate, label, resize, apply, Undo, save/reopen and export using actual UI and shared services |
| 2 — Bottle and beverage breadth | Oval/rounded-rectangle bottles, shoulder/neck options, glass/PET presets, more closures, artwork templates and finish polish | Material/UV/label regions survive shape changes; defined dimensional envelopes and exported appearance match fixtures |
| 3 — Pouches | Flat, pillow and stand-up geometry; seals/gussets; front/back artwork; bounded fill appearance | No invalid/self-crossing surfaces at supported extremes; label placement is stable; dimensions clearly distinguish flat/filled states |
| 4 — Food and non-food clamshells | Separate preset sets on one shell generator; base/lid/rim/hinge; clear/opaque surfaces and top/bottom artwork | Closed envelope and articulated open state are distinct; saved hinge state and artwork survive reopen/export where supported |
| 5 — Release hardening | Library/array/render scenarios, migration coverage, accessible/mobile controls, performance tuning and documentation | Representative desktop/mobile fixtures pass; all delivered actions have commands; no startup-loading or cross-module regressions |

Validation starts in Phase 0 and continues in every phase; Phase 5 is the final release pass. Release working family increments rather than waiting for the entire catalog. Estimate later phases after the first vertical slice establishes geometry, material and preview costs.

## 9. Acceptance and performance checks

- Reference fixtures for each preset: dimensions/bounds within a declared tolerance (initial target 0.01 mm for rigid-envelope fixtures), correct normals/UVs and valid mesh topology; mm/in conversion round trips preserve size.
- Label tests: physical size, aspect ratio, alpha edges, seam gap, body-vs-ink roughness/metalness, no mirrored/backward art and deterministic resize behavior.
- Material tests: main preview, application viewer and GLB have consistent glass/plastic/metal/label appearance under fixed HDRI/cameras; test clear objects against both light/dark backgrounds and other transparent objects.
- Persistence: original art and all authoring fields survive file, recovery and Library round trips without network access. Older ordinary sessions still load. Invalid/future definitions fail before scene replacement, while baked view-only geometry remains usable where the archive contract permits it.
- Editing: Apply, duplicate/array, Undo/Redo and account/session switches preserve object identity and prevent stale async results. Capture original GLB/artwork bytes where imported; source imports stay explicitly nonparametric.
- Performance targets to benchmark, not guarantees: roughly 20,000 triangles for common bottle/can defaults and 60,000 for more complex packs; 1K previews/2K default artwork maps, with explicit higher-resolution export. Share immutable resources across arrays, bound image decoding and cancel superseded previews. Record device, browser, draw calls, memory and generation time; do not rely on triangle count alone.
- Security: bounded image sizes, SVG sanitization, no external texture fetch without an explicit import workflow, no keys in definitions, account-scoped saves and no implicit cloud uploads. Validate before geometry/material mutation; failures roll back.

## 10. Decisions to confirm before implementation

1. First-family priority is confirmed: bottles and cans. Select the initial bottle/can reference presets and their dimensions.
2. Supply a small reference set for target silhouettes, closures and label layouts, including dimensions; decide which branded artwork is available for testing.
3. Confirm whether initial clear-pack quality needs true transmission/refraction or an explicitly labeled lower-cost preview tier. The renderer spike must establish what is deliverable on target devices.
4. Confirm whether to prioritize parametric closures/shape breadth or advanced artwork finishes after the first working slice.

Deferred by default: exact molded threads/standards, certified capacity/strength/tooling calculations, fluid/flexible-material simulation, arbitrary scan-to-parametric reconstruction, comprehensive shrink-sleeve compensation, printer color management, food contents, and a new SKU/inventory backend. These can be separately scoped after the core modeling and artwork workflow is proven.
