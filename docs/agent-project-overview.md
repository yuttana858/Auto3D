# Auto3D: agent project overview

Updated 2026-10-09. Start with [project-status.md](project-status.md) for the development log, deployed commit, local release, validation and TODO list. This document describes the current application; earlier proposed R2/auth architecture has been superseded by the implemented account routes.

## Product and stack

Auto3D is a browser 3D viewer/editor derived from MIT-licensed Online3DViewer. It imports CAD/mesh files, assembles multi-object scenes, edits transforms/materials, controls environments/lighting, creates arrays, previews polygon reduction, plays embedded animation and authors scene/camera timelines. It saves portable `.auto3d` sessions, private account Library entries and device-local entries. Packaging adds cut/score vector profiles, solid board extrusion, and the first FEFCO 02-series generators (0200–0203) for folded kraft boxes. Render queues produce screen/HD/4K/16K PNGs, including model-only alpha output.

The frontend uses JavaScript ES modules, imperative DOM, Three.js, fflate, Pickr and CSS. There is no React app. esbuild bundles the website and two workers; rollup/TypeScript produce engine distribution artifacts. CI targets Node 22. The separate Node backend is an alternate implementation, not the deployed Pages API.

Current production: Cloudflare Pages Functions, private Cloudflare R2 objects, Supabase Auth/PostgreSQL account metadata. Temporary approved-account email/password login is implemented. Microsoft Entra ID is a future migration; the Node Entra verifier does not mean browser Entra sign-in exists.

## Architecture

```mermaid
flowchart TD
    UI[Website / SessionEditor] --> Scene[SceneDocument / engine / Three.js]
    UI --> Archive[Portable archive / recovery worker]
    Archive --> Local[Account-scoped IndexedDB / file download]
    UI --> Auth[AuthService / login gate]
    UI --> Personal[AccountLibrary / Preferences]
    Personal --> Pages[Pages Functions / session middleware]
    Auth --> Pages
    Pages --> Identity[Supabase Auth]
    Pages --> Metadata[Supabase PostgreSQL]
    Pages --> R2[Private R2 archives / thumbnails]
    UI --> Legacy[CloudLibrary / published shares]
    Legacy --> Pages
    Pages --> Compat[Legacy Supabase Storage compatibility]
    Alternate[Separate Node backend] --> Entra[Entra JWT verifier / LibraryService]
```

| Area | Main entry points | Responsibility |
| --- | --- | --- |
| Bootstrap | `source/website/index.js`, `website/index.html` | Creates website/services, command API, error logs and login gate |
| Viewer | `website.js`, engine `viewer/` | Imports, UI panels, camera/navigation, viewport and rendering |
| Editing | `sessioneditor.js`, `scenedocument.js` | Objects/selection, transforms, arrays/groups, history, dirty state and read-only shares |
| Archive/recovery | `sessionarchive.js`, `sessionrecovery*.js` | Session schema/migrations/validation, worker packing, checkpoints |
| Identity/admin | `authservice.js`, `authgate.js`, `authpanel.js`, `accountadmin.js`; `functions/api/auth/`, `accounts/` | Approved login, session/logout/revocation and admin workflows |
| Account storage | `accountlibrary.js`, `modellibrary.js`; `functions/api/personal/`, `_lib/accountstorage.js` | Owned R2 files/metadata, account/device Library UI |
| Preferences | `preferences.js`, `settings.js`; `functions/api/preferences.js` | Global units, appearance/viewport and account synchronization |
| Legacy published Library | `cloudlibrary.js`; `functions/api/library/`, `share/` | Published items, R2/legacy reads and verified share access |
| Effects | `lightingpanel.js`, engine `sceneeffects.js`, `floorshadow.js` | HDRI/reflections, ambient fill, isolated floor shadows |
| Cameras/rendering | `sessioncameras.js`, `camerapanel.js`, `renderingpanel.js`, `renderqueue.js`, `rendercore.js` | Named views/FOV and tiled PNG queues |
| Animation | `sessionanimation.js`, `sessiontimeline.js`, `advanceanimation.js` | Embedded clips and scene/camera keyframes |
| Optimization | `polygonoptimizer.js`, `polygoncore.js`, `polygonworker.js`, `arraylayout.js` | Bounded static-mesh simplification and array layout |
| Packaging | `packagingcore.js`, `packagingworkspace.js`, `fefcocore.js`, `fefcocatalog.js`, `fefcopanel.js` | Canonical-mm profiles, SVG/DXF, board extrusion/history, categorized FEFCO thumbnails and folded box generation |
| Commands/diagnostics | `agentcommands.js`, `commandregistry.js`, `macrodesign.js`, `agentcapture.js`, `errorlogs.js` | Shared agent actions, strict schemas/macros, bounded capture/logs |
| Alternate backend | `backend/server.mjs`, `library-service.mjs`, `auth/entra-jwt.mjs`, `adapters/supabase.mjs` | Separate Node Library API; does not serve as Pages' internal service |
| Release | `.github/workflows/cloudflare-pages.yml`, `tools/build_pages.mjs`, `verify_deployment.mjs` | Build, deploy and check production version/HTML/bundle |

Paths without a directory in this table are under `source/website/` unless identified as engine/backend/tools.

## Critical data flows

**Startup:** install diagnostics and services, restore the secure server session, load the signed-in account's preferences, initialize its Library, then unlock the UI. Explicit logout invalidates client restoration and the server session, returns to login and closes active work. Client gates supplement server enforcement; do not rely on hidden buttons to protect data. Background settings are distinct from Appearance theme. Explicitly opened sessions can restore their saved view/lighting.

**Import/edit:** engine importers create model data; SessionEditor adds objects to SceneDocument and renders converted Three.js objects. Keep engine geometry, rendered objects, selection, history, dirty state and serialized data consistent. Unknown source units stay model units rather than being guessed.

**Save/open:** UI and account commands use the same archive preparation. Account saves write owned R2 archive/thumbnail objects and Supabase metadata through Pages; Device saves use IndexedDB; file saves download `.auto3d`. Open validates bytes before replacing/appending the scene. Full-session save clears the unsaved checkpoint; recovering an unsaved scene retains its checkpoint until saved. Worker bundles must deploy beside the main website bundle.

**Ownership:** private Library APIs authenticate and scope metadata/files to the actor, including thumbnails. DeviceLibrary uses `sw-auto3d-library-<account id>` for signed-in accounts; the unsuffixed legacy database is not automatically claimed. Reserved recovery/folder records are omitted from ordinary item lists. Account switching must invalidate queued work and remove stale lists/blob URLs.

**Published sharing:** `CloudLibrary` handles legacy published/shared data; it is separate from AccountLibrary. Its disabled publication destination is not the personal save path. PR #16 reconciliation preserves R2 and legacy Storage reads, published-status filtering, share verification and private/no-store binary responses behind current API gates. Do not restore obsolete parallel auth/admin routes. Historical SQL under `database/history/pr16/` is archival, not a migration runner.

**3D effects:** metallic fill contributes specular radiance as well as diffuse illumination. Floor shadows use independent projected caster copies and an RGBA mask; original model opacity/materials are untouched. These are floor silhouettes, not physically accurate self-shadow. Capture/render failures must restore renderer targets, viewports, visibility, camera and lighting.

**Manufacturing profiles:** packaging coordinates/caliper are canonical millimeters; account units only affect display/input. SVG/DXF are vector outputs with separate cut/score groups/layers. Score paths do not fold the solid. Nominal caliper presets are not supplier-certified strength grades. Extrusion creates an independent flat solid with a stored profile.

## Contracts and boundaries

- Session schema is version 5; optional camera/packaging/object fields remain backward compatible. Animation reopens paused. Preserve reachable geometry, materials, textures, playback metadata and physical units.
- Supabase URL and privileged keys are server-side configuration. Browser code must not receive service keys, raw tokens or passwords in logs/captures. R2 objects remain private.
- Current routes include `/api/auth/*`, `/api/accounts/*`, `/api/personal/items`, `/api/preferences`, legacy `/api/library/items` and verified `/api/share/*`. Health/database readiness is distinct from authenticated UI health.
- Account administration stays on the restricted current console route. An obscured route is not an authorization boundary; server admin verification is required.
- The separate Node API has different role/publication semantics. Its Entra verifier does not establish personal ownership for the deployed Pages application.
- Email delivery/custom SMTP and Entra migration remain open work. Do not assume the password recovery UI means SMTP delivery is configured.
- Polygon optimization is lossy and excludes animated rig/morph topology. Preview and Undo are required. Dense models/arrays and 16K output remain device-memory constrained.

## Agent development and release checks

Read root `AGENTS.md`. Every new user action must have a strict command using shared application services, category/description/example, mutation flag and structured result. Commands opening a dialog report that interaction, not a completed save/upload. Respect account and read-only gates, await completion and validate before mutation. Keep `website/assets/commands.json` synchronized. `window.Auto3D` exposes catalog/execute/runMacro/cancelMacro; it is an in-page API, not a deployed MCP server.

```bash
npm ci
npm start
# http://localhost:8080/website/index.html
npm test
npm run lint
npm run check_licenses
npm run audit_prod
npm --prefix backend test
npm run build_website
node tools/build_pages.mjs
```

Run targeted browser tests for changed flows. Current regressions include `test/browser/auth.mjs`, `account-storage.mjs`, `preferences-recovery.mjs`, `lighting-ui.mjs`, `lighting-isolation.mjs`, packaging, cameras and rendering tests. Browser fixtures mock account APIs; they do not prove production credentials/email/schema readiness. Release gates and local evidence are logged in [project-status.md](project-status.md).

Production host: `https://auto3d-5av.pages.dev`. Pages deploys `main`. Release 0.27.1 adds `version.json`, HTML build metadata and `app.version.inspect`; the deployment workflow checks the served version and JavaScript hash after upload. Update version, release notes, commit and verification result together. Preserve unrelated dirty local files and publish only reviewed changes on the current remote main tree.

## Further reading

[Temporary authentication](temporary-auth.md) · [Account storage/preferences](account-storage.md) · [PR16 reconciliation](pr16-reconciliation.md) · [Agent commands](agent-interface.md) · [Agent capture](agent-screen-capture.md) · [Error logs](error-logs.md) · [Polygon optimization](polygon-optimization.md) · [Packaging](packaging-module.md) · [Cameras](session-cameras.md) · [Rendering](rendering.md) · [Cloudflare deployment](cloudflare-pages.md)
