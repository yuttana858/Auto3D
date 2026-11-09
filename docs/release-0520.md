# Auto3D 0.52.0 — Primary Products materials and real label art

Primary Products 0.5.0 / API 1; Packaging remains 1.10.3. Based on the main repair release 0.51.0. Not deployed.

## Dimensions and surface controls

Dimensions share one H × W × D row. For round bottles/cans, W and D both edit the canonical diameter and stay linked; pouches retain independent width/depth. Units follow the global mm/in setting. The material dropdown has an adjacent small color swatch: activating it opens the browser color picker. Both material/color changes remain draft edits until Generate or Apply.

Independent category presets define rendered metalness and starting roughness: bottles have opaque plastic/HDPE/PP/opaque PET; cans have aluminum/steel/painted/matte metal; pouches have opaque plastic/matte film/gloss film/metallic laminate. Roughness remains editable and is saved. Clear glass remains unavailable; the selectable working presets do not imply transmission or hollow-wall support. Surface roles keep closures/end pieces separate from the body.

## Artwork workflow

Choose Front/Back or round-product Wrap, then **Import label image**. The local picker supports PNG, JPEG and WebP, up to 4 MiB and 4096 × 4096 pixels. File signatures and dimensions are bounded before browser decoding; SVG/remote URLs are not imported. New labels fit the physical zone while preserving image proportions; width/height can then be edited in global units. Replacing an image retains that zone's physical size. Generate creates the decorated object; Apply updates the selected product in one history step.

Artwork uses a surface-conforming patch with independent dielectric material, so opaque ink does not become metallic on a can/foil body and alpha reveals the underlying surface. Cylindrical labels follow the straight body, with the seam behind a front-facing wrap. Pouch patches clip the actual body triangles, retaining surface shape rather than projecting onto an approximate plane. The small surface offset avoids z-fighting. Panel profiles remain illustrative; the generated scene uses actual texture maps.

At most two front/back labels or one wrap are supported. Remove conflicting labels explicitly before switching to wrap or changing product family. Product resizes that would invalidate physical fit fail before mutation. Placement is centered in its zone; arbitrary offsets/rotation, finish masks, clear films, printing templates and curved-surface distortion compensation remain future work.

## Persistence and portable export

A bounded versioned definition stores label descriptors/resource hashes alongside existing parameters. Original source bytes live in ordinary embedded material diffuse maps, avoiding unbounded image data in per-object text metadata. Reloading a selected generated product resolves those resources from its baked materials; missing sources fail explicitly. File, recovery, duplicates and existing explicit Library saves retain original bytes without external URLs. Replacement/clear/import operations are scoped to the draft/account, reject stale asynchronous results, and do not upload or submit paid tasks.

GLB/glTF export includes image pixels and independent label materials. JPEG is declared with the standard `image/jpeg` MIME type; WebP uses the required `EXT_texture_webp` texture-source extension, also supported on reimport. Clients without WebP extension support need PNG/JPEG labels. Generic GLB does not promise parametric authoring restoration.

## Commands

Existing configure/generate/update commands share the UI services. New commands: `primary.materials.list`, `primary.artwork.open` (interactive picker, returns opened rather than imported), `primary.artwork.mapping` (canonical mm), and `primary.artwork.remove`. Inspection returns descriptors, never source bytes. Command catalogs are regenerated for the app and MCP. The existing account, read-only, busy-state, save and remote-action boundaries remain enforced.

Validation: 766 app/module tests, 64 MCP tests, 11 backend tests, both linters and website/Pages builds pass. Chromium checks one-line dimensions, linked round W/D, color swatch changes, actual local image picking, foil vs dielectric label materials, physical-fit rejection and desktop/mobile layout. A captured main-viewer fixture shows the imported artwork on the actual 3D pouch. File/recovery/reload/GLB tests retain source pixels and definitions, including after renaming a material. Container tests cover JPEG MIME and WebP extension declarations/reimport.
