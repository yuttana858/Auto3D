# Auto3D

Auto3D is a branded, self-hostable browser 3D viewer based on [Online3DViewer](https://github.com/kovacsv/Online3DViewer). It includes the upstream viewer engine and web app, with Auto3D branding and self-hosted share/embed links.

## Run locally

Auto3D supports temporary email/password sign-in with administrator-created Supabase Auth accounts. The login appears below the logo after the startup animation and remains available through the header's Sign in / Account button. Device and file workflows can be used without signing in. Setup and security details are in [docs/temporary-auth.md](docs/temporary-auth.md). Cloud Library publishing remains disabled pending ownership/authorization implementation.

Install the npm dependencies, then run `npm start`. The server at `http://localhost:8080/website/index.html` watches source changes and automatically rebuilds the development viewer. Browser caching is disabled. Refresh after the watcher reports a successful build; save your session first to retain edits. The header displays the application version, currently **v0.53.0**.

## Hosting

The pre-transition build is hosted on Cloudflare Pages at `https://auto3d-5av.pages.dev`. Source code is private on `main`.

Production deployment is automated by `.github/workflows/cloudflare-pages.yml`. It builds the static site into `build/pages` and uploads it with Wrangler. Same-origin `/api/*` routes are served by Cloudflare Pages Functions. No purchased domain is required for this temporary hosting path.

The v0.21.0 engineering hardening baseline is documented in `docs/pretransition-readiness.md`, with privacy/network behavior in `docs/privacy-network-boundary.md`.

## Lighting and materials

The left panel has collapsible Session objects, Materials and Lighting sections. Select a model part to inspect its assigned surface materials. The advanced editor opens below the viewer with surface controls, texture previews, tiling/offset/rotation controls and a UV0 layout. Edits affect parts sharing a material within that object. Save a `.auto3d` session to retain materials, textures, object placement, visibility, animation data and view settings across refreshes.

## Object editing and library

Uploads and files dropped directly onto the main viewer append objects to the current session. Selecting multiple standalone model files in one upload imports each model as a separate session object while still making selected sidecar files available to the importers. **Update** replaces the selected object's source geometry while retaining its placement. The viewer tool strip supports Select (V), Move (W), Rotate (E), Scale (R), Duplicate (Ctrl+D), visibility (H), Focus (F), Delete, and Undo/Redo for object edits. Transform tools provide a gizmo and numeric fields. Undo applies to object and placement edits; material controls are saved in the session but do not use that history.

GLB/glTF models with embedded clips have independent Play/Pause, clip selection, timeline, Reset, speed and Loop controls in a dedicated Animation section. Skeletal and morph animations are retained in portable sessions and GLB/glTF exports. Include referenced binary/texture files when uploading a glTF. Animation extensions requiring additional decoders may show an unavailable-animation message while retaining a static preview. Mesh-format exports use the engine's static geometry.

The top-right menu now includes **Library**, **Export**, **Preferences** and **Full screen**, with Full screen kept last. Library opens shared models and device saves, with categories Primary products, Retail shelf, Pallets and Accessories. Cards include thumbnails: **Open** replaces the workspace; **Add** appends its objects; **Share** creates a persistent viewer link for a shared save. Library **Share** creates a dedicated read-only mini Auto3D viewer link for internal or external recipients. Links can optionally expose a `.auto3d` download control and can require a 4-digit access code. The mini viewer adapts to desktop/tablet/mobile layouts and reuses Auto3D touch navigation (drag to orbit, pinch to zoom and two-finger drag to pan). Legacy shared views remain supported. Device saves remain in IndexedDB and are never uploaded automatically.

The browser now accesses shared content only through same-origin `/api/library/*` routes. Cloudflare Pages Library/share Functions require server-side `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; no prototype credential fallback is used by those routes. `/api/health` verifies metadata-table access and reports database readiness without exposing credentials. Supabase configuration and direct database/storage requests have been removed from the browser bundle. Shared browsing and view-only links remain available; Device library, crash-recovery checkpoints and portable `.auto3d` files remain fully supported.

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


### v0.24 model data and placement tools

Selecting a session object adds an editable **Model size** section to Model Data. Dimensions use the global preference and map **W = X, L = Z, H = Y**. Editing a dimension changes the corresponding object scale. A **User data** section accepts custom name/value metadata and stores it with the portable Auto3D session.

The object tool strip now includes **Array**, **Drop to floor**, and **Fit to screen**. Array creates a W/L/H grid from the selected object's current world bounding box so adjacent bounding envelopes touch without overlapping. Drop to floor honors the current X/Y/Z up vector and flipped-up state.

Right-clicking a model selects its session object and exposes object actions including Focus, Array, Drop to floor, Duplicate, visibility and Delete. Right-clicking empty viewer space exposes Fit to screen. Mesh isolation remains available where applicable.


### v0.25 interaction, HDRI, reflections and shadows

Desktop viewer navigation is now **left-click select, middle-drag pan, right-drag orbit**. A short right-click still opens the object/empty-space context menu; a right-drag suppresses that menu on release.

HDRI presets are cataloged through the same-origin `/api/environments` endpoint. Current 1K HDR files are the low-resolution **preview** tier in the public `auto3d-hdri` Supabase Storage bucket with CDN caching. Each environment also has a reserved high-resolution **render** path for future assets. The application falls back to the packaged preview HDR if the CDN copy is unavailable.

Lighting now includes global environment-reflection intensity, optional realtime model reflections, optional planar floor reflection and intensity, and global shadows/floor-shadow intensity. Realtime model reflections use a cube capture and floor reflection uses Three.js `Reflector`, so both remain opt-in render passes.

Each session model has independent **Cast shadows** and **Receive shadows** controls. Cast + Receive enables normal self-shadowing; a casting model can shadow any receiving model. These flags persist in `.auto3d` schema v4.

Material-list hover identifies the material on the model and selecting a material flashes the surface white briefly. Material, current session, session-model, and Device Library names can be renamed from the UI. Shared Library names remain read-only until authenticated publishing identity is available.

Ctrl/Cmd+Z uses the session-wide history stack for object operations plus the new material, naming, shadow, HDRI and reflection edits. Focused text fields retain native text undo.


### v0.25.2 regression recovery and Library folders

- Default environment uses a camera-centered, world-oriented dome so the horizon remains locked to the selected ground/up plane while orbiting.
- Packaged 1K HDRI previews and thumbnails are authoritative. Supabase environment metadata can provide future high-resolution render assets, but an API/CDN outage cannot remove the built-in HDRI choices.
- Recovery checkpoints are validated across Blob, ArrayBuffer and typed-array storage forms. Restore/Discard closes the recovery prompt on the first click, and a successfully restored checkpoint is consumed so it does not loop on the next reload.
- Global reflection multiplies each material's Reflective setting. Roughness, metalness, specular, normal/bump, AO and texture maps remain material-specific.
- Selecting an assigned texture card, texture-map selector entry, or texture preview flashes the affected material white briefly for visual identification.
- Device Library now supports nested category/project folders, manual add/rename/delete folder operations, moving saved items between folders, individual delete, and multi-select bulk delete.
- Deleting a folder preserves saved models by moving them to its parent folder or Uncategorized. Existing flat categories migrate automatically into the folder tree.
- Save Session now offers existing nested folders plus a New category/project option.


### v0.26 animation and model preview

- Model Data starts collapsed by default to maximize the central viewer.
- A compact interactive model preview sits above Model Data when the panel is expanded.
- GLB/glTF animation source bytes remain embedded in portable `.auto3d` files. Animation clip, timeline position, speed and loop preference persist with the session; playback reopens paused.
- Session regression coverage verifies model textures, physical reflection properties, HDRI/background/light/reflection/shadow view settings and embedded animation resources survive a portable session round trip.

### Advance animation

The left Animation section contains embedded GLB/glTF clip controls and an **Advance animation** button. The button opens a bottom panel with separate **Scene state** (object placement) and **Camera positioning** tracks. Both tracks share a draggable red playhead. Capture scene state or camera keyframes at the current time, choose Smooth, Linear or Step tweening, and use the beginning/end markers to select the playback range. Markers can be dragged, adjusted with arrow keys, or entered in seconds. Play and Loop use that range; Reset returns to its beginning.

Scene and camera keyframes, interpolation, playhead, range markers and original embedded animation resources are retained in portable `.auto3d` sessions and Device Library saves. Reopened sequences start paused. Shared publication remains an explicit user action. The bottom material editor and Advance animation panel open separately to keep the viewer usable.

Development and production viewer builds include `o3dv.recovery.js` and local Draco decoder files. Keep these beside the viewer bundle when hosting the site. Recovery and library/file saves pack and compress in a worker; recovery waits for dragging or playback to stop. Subsequent transform-only recovery checkpoints reuse the worker's geometry snapshot. Initial snapshot cloning and model import still have CPU/memory costs on very large assets.

Run `npm test` for session, animation, range, command-validation and interaction regressions. For the browser smoke test, start `npm start` in another terminal and run `npm run test_browser_animation`. It uses a fresh Chromium profile and an original skeletal/morph fixture to check playback, both tracks, worker recovery and Device Library save/reopen. Set `BROWSER_EXECUTABLE` if Chromium is installed elsewhere; `AUTO3D_TEST_URL` selects another local site build.

## Packaging module

Packaging v1.3.0 is an independent package in [modules/packaging](modules/packaging/README.md). Its generators, textures and catalog UI load on demand. Use `npm run preview_packaging` for the standalone preview at http://localhost:8082, `npm run build_packaging` for its own build, and `npm run test_packaging` for its independent tests. Select a generated box in Auto3D and type `unfold box` to view the flat kraft dieline. Enter new-box dimensions above the preset cards, then click a card to generate immediately. **Animate** unfolds the selected box to its saved CAD dieline or assembles its flat sheet. **View dieline in CAD** opens that exact cut/score drawing.

Auto3D v0.30.0 starts Dark appearance with a dark viewer even if a conflicting Light preset was saved. Custom colors and HDRI remain explicit choices. Packaging v1.1.0 adds selected-box **Box dimensions** above its FEFCO catalog: edit Inside/Outside L/W/H, board caliper and tolerance to regenerate the box or flat sheet with Undo. **Animate** provides visible progress, Pause/Resume and Cancel; HSC remains open at the top. These concept folds and fit reserves require converter-specific tooling checks before production.

### Personal Meshy keys (0.47.3)

Preferences → AI connections → Manage Meshy key supports private masked entry, encrypted account storage, balance testing and removal. Keys are not stored in browser persistence or project files. Production and preview use separate private credential buckets and encryption secrets. See [secure Meshy key setup](docs/meshy-api-keys.md).

### Primary Products draft panel (0.48.0)

Primary Products appears below Packaging in the module tool rail. Compact and extended panels provide bottle/can draft dimensions, surface settings and label zones, with shared open/close animation and reduced-motion support. This is the UI shell: the profile is illustrative, and model generation/artwork placement come next. See [Primary Products UI](docs/primary-products-ui.md).
