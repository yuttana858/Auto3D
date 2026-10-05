# Auto3D

Auto3D is a branded, self-hostable browser 3D viewer based on [Online3DViewer](https://github.com/kovacsv/Online3DViewer). It includes the upstream viewer engine and web app, with Auto3D branding and self-hosted share/embed links.

## Run locally

Install the npm dependencies, then run `npm start`. The server at `http://localhost:8080/website/index.html` watches source changes and automatically rebuilds the development viewer. Browser caching is disabled. Refresh after the watcher reports a successful build; save your session first to retain edits. The header displays the application version, currently **v0.23.0**.

## Hosting

The pre-transition build is hosted on Cloudflare Pages at `https://auto3d-5av.pages.dev`. Source code is private on `main`.

Production deployment is automated by `.github/workflows/cloudflare-pages.yml`. It builds the static site into `build/pages` and uploads it with Wrangler. Same-origin `/api/*` routes are served by Cloudflare Pages Functions. No purchased domain is required for this temporary hosting path.

The v0.21.0 engineering hardening baseline is documented in `docs/pretransition-readiness.md`, with privacy/network behavior in `docs/privacy-network-boundary.md`.

## Lighting and materials

The left panel has collapsible Session objects, Materials and Lighting sections. Select a model part to inspect its assigned surface materials. The advanced editor opens below the viewer with surface controls, texture previews, tiling/offset/rotation controls and a UV0 layout. Edits affect parts sharing a material within that object. Save a `.auto3d` session to retain materials, textures, object placement, visibility, animation data and view settings across refreshes.

## Object editing and library

Uploads and files dropped directly onto the main viewer append objects to the current session. Selecting multiple standalone model files in one upload imports each model as a separate session object while still making selected sidecar files available to the importers. **Update** replaces the selected object's source geometry while retaining its placement. The viewer tool strip supports Select (V), Move (W), Rotate (E), Scale (R), Duplicate (Ctrl+D), visibility (H), Focus (F), Delete, and Undo/Redo for object edits. Transform tools provide a gizmo and numeric fields. Undo applies to object and placement edits; material controls are saved in the session but do not use that history.

GLB/glTF models with embedded clips have independent Play/Pause, clip selection, timeline, Reset and speed controls. Skeletal and morph animations are retained in portable sessions and GLB/glTF exports. Include referenced binary/texture files when uploading a glTF. Animation extensions requiring additional decoders may show an unavailable-animation message while retaining a static preview. Mesh-format exports use the engine's static geometry.

The top-right menu now includes **Library**, **Export**, **Preferences** and **Full screen**, with Full screen kept last. Library opens shared models and device saves, with categories Primary products, Retail shelf, Pallets and Accessories. Cards include thumbnails: **Open** replaces the workspace; **Add** appends its objects; **Share** creates a persistent viewer link for a shared save. Library **Share** creates a dedicated read-only mini Auto3D viewer link for internal or external recipients. Links can optionally expose a `.auto3d` download control and can require a 4-digit access code. The mini viewer adapts to desktop/tablet/mobile layouts and reuses Auto3D touch navigation (drag to orbit, pinch to zoom and two-finger drag to pan). Legacy shared views remain supported. Device saves remain in IndexedDB and are never uploaded automatically.

The browser now accesses shared content only through same-origin `/api/library/*` routes. The temporary Cloudflare Pages Function reads the existing Supabase library server-side; Supabase configuration and direct database/storage requests have been removed from the browser bundle. Shared browsing and view-only links remain available; Device library, crash-recovery checkpoints and portable `.auto3d` files remain fully supported.

The provider-neutral Auto3D Library API is implemented under `backend/`. Its privileged publishing and administrative deletion endpoints are protected by Microsoft Entra ID application roles; browser publishing remains disabled until GIS supplies the corporate Entra application registration and Azure runtime. The browser will depend on the Auto3D Library API rather than Supabase-specific authentication or database operations so the service can migrate to Azure Database for PostgreSQL and Azure Blob Storage without rewriting the editor. The target architecture and migration goal are documented in `docs/backend-architecture.md` and `GOAL.md`. Database migrations are recorded under `supabase/migrations`.

No user models are included in the static site. Shared-library publishing is temporarily disabled during the corporate identity migration. A view-only link hides editing controls; recipients still receive the model data required to render it.

Preferences offers Light/Dark appearance, Metric (mm) or Standard (in) dimensions, and About. Models with no declared length unit display model units. GLB/glTF coordinates use meters. Unit preferences change dimension labels, not geometry.

Lighting offers a default world-locked dome environment whose horizon follows the model ground plane, plus eight locally bundled 1K Poly Haven HDRIs, with brightness, rotation and elevation controls. Physical surfaces use prefiltered image-based lighting; Phong surfaces use a diffuse light probe integrated from the same HDR data. The horizon background and ground grid remain independent. Asset licenses and sources are in `website/assets/hdri/NOTICE.md` and `sources.json`; generate previews with `node tools/prepare_hdri_previews.mjs`.

Default lighting includes Standard, Dark, Light, Sunset and Outdoor background presets. Standard follows the app theme; explicit presets retain their colors across theme changes. Background, horizon and grid preferences are saved in cookies. Horizon and ground-grid controls live in Lighting. The viewer's X/Y/Z world indicator follows the camera orientation, including orbit, roll and up-axis changes.

## Supported formats

- **Import:** 3dm, 3ds, 3mf, amf, bim, brep, dae, fbx, fcstd, gltf/glb, ifc, iges, step, stl, obj, off, ply, wrl.
- **Export:** 3dm, bim, gltf/glb, obj, off, stl, ply.

Some formats are provided by separate libraries. Dependencies are listed in `package.json` and their licenses apply independently.

## Upstream and licensing

The upstream [Online3DViewer source](https://github.com/kovacsv/Online3DViewer) and [developer documentation](https://kovacsv.github.io/Online3DViewer) are useful references. The upstream project by Viktor Kovacs is distributed under the MIT License. Auto3D retains the upstream [LICENSE.md](LICENSE.md) and required copyright notice. The production dependency license inventory is recorded in `THIRD_PARTY_NOTICES.md` and enforced by CI; corporate legal/policy approval remains separate from the engineering check.


### v0.23 viewer and units

Selected objects retain their textured/material appearance and are indicated with a fine bounding box. The transform Scale mode exposes physical **Size** fields in the global unit preference when the source model declares units; unknown-unit models continue to use scale multipliers. Metric/standard units persist in the local user-profile preference and update dimensions and size fields immediately. Cross-device account synchronization is intentionally deferred until corporate identity is connected.

The main toolbar places **Save session file** directly beside **Open**, while **Export** is also available in the right-side header.
