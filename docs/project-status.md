# Auto3D development log and handoff

Updated 2026-10-10. This is the starting point for project status, completed work, open issues and the next release. Architecture: [agent-project-overview.md](agent-project-overview.md).

## Current development release: Auto3D v0.34.0 / Packaging v1.5.0

Remote main includes PR #30 (ebf183d). This update is on feat/solid-fefco-folds; merge and production deployment remain user actions. Report both versions and the new PR number.

HSC (0200), RSC (0201), OSC (0202) and FOL (0203) share CAD-derived finite-caliper panel geometry for both generation and fold/unfold playback. HSC keeps its open top. Outside-face wall hinges preserve cavity dimensions without cutting through adjacent walls. The glue tab receives a caliper clearance before sleeve wrapping. Inner and outer flap pairs fold sequentially; overlapping flaps reserve their separate stack layer before rotating. Open roof flaps lift, stand upright and shift hinge faces before closing, avoiding center-seam overlap. Panel volume, UVs, materials and the original cut/score profile remain intact.

The independent module uses convex-prism solid intersection detection (including the trapezoidal glue tab), permitting surface contact but rejecting positive-volume intersections above 0.00001 mm. Both hosts audit 3,601 route poses before replacing the original (hinges move at most one degree between audit samples), yield for Processing feedback, and check every displayed pose. A detected collision blocks playback or restores the original. Preparation also blocks transient saving/editing and rechecks the account/scene. A nonmutating shared command, `packaging.fefco.folding.check`, returns the route audit and offending panel pairs. The catalog reports CAD/fold support for the four implemented styles; other families remain unavailable.

This is a controlled rigid-panel route with score-compression/stack-clearance approximations. It is a sampled route audit plus per-frame checks, not continuous deformable-board physics or a manufacturing certificate. It checks panels within the generated box, not other scene objects; custom edited paths and generic scaling remain refused. Saved older generated boxes use their original parameters/profile to enter the updated route.

Validation: 529 unit/module tests pass, including all four styles across six dimension/caliper/overlap cases, reverse-route frames, exact fractional-mm prism/mesh coordinates, endpoint equality, volume and cavity/envelope checks, intentional collision detection/blocking, command/schema/macro/read-only behavior, and preflight account-change rollback. Chromium verifies each preset’s solid audit, rendered fold/unfold, exact CAD profile, correct open/closed top and Undo/Redo with healthy WebGL contexts. Standalone HSC generation, dimension edits, folding and pause/cancel also pass. Auto3D deferred loading, current-material/guides archive saves, typed commands, mobile layout and failed-module fetch/retry pass against the built Pages artifact. Lint, 11 backend tests, production licenses, both engine builds, website/Pages and independent module builds pass; local release verification confirms app/module asset hashes and versions. Production audit passes its high-severity threshold, with the existing moderate fflate 0.8.2 advisory unchanged.

## Previous release: Auto3D v0.33.0 / Packaging v1.4.0

Merged as PR #30 (ebf183d), Auto3D v0.33.0 / Packaging v1.4.0.

AI and Packaging tabs display their respective versions. New board objects receive embedded base-color, roughness, metalness, specular-color, normal, bump, AO and height PNGs automatically, including flat sheets and the independent preview. Matte/nonmetallic defaults and zero displacement retain the board shape; sliders can change their effect. Surface and Texture are combined into one compact editor with property cards arranged across the drawer, each pairing an image thumbnail and its controls. Thumbnail dialogs provide a larger preview, original-byte Save, Replace, Remove and collapsed UV mapping controls. A single UV summary opens the detailed layout; normal/bump/off relief selection keeps both source maps.

**Auto texture generator** derives missing maps locally from a base image, or procedural grain when none is present. Regenerate maps rebuilds auxiliary maps while preserving the base image; authored maps and UV placement are preserved by default. AI-generated GLB imports use the same service. Generated maps are adjustable starter approximations, not measurements of a material's physical properties. Existing GLB packed metal/rough maps remain supported; independently generated roughness maps render separately. Reflection images use the physical shader's specular-color slot, avoiding a renderer exception from the older Phong slot. Model rebuilds release shared/inactive surface images without disposing viewer environment maps.

Generation, relief selection, replacement, removal and missing-UV generation support Undo/Redo. Portable archives/recovery retain all source maps, their transforms and relief mode; GLB export packs independent metal/rough maps and includes active normal, AO, specular-color plus existing bump/height extras. New stable material commands share these services with the UI, with strict inputs, mutation/read-only/account guards, examples and structured results. The command validator supports integer material indices.

Validation: 521 unit/module tests, 17 independent module tests, 11 backend tests and lint pass. Website/Pages, standalone and both engine distribution builds pass; production license checks and the audit high-severity threshold pass (the existing moderate fflate advisory remains; dependency versions are unchanged). Chromium verifies version labels, all automatic box maps, live relief/sliders, combined cards, large preview/save/replace, original-byte downloads, independent roughness/metalness, UV placement, Undo/Redo, portable archives, GLB texture export and dark/mobile layouts. The Packaging browser suite verifies deferred module loading, unfolding, archives/typed commands, mobile, fetch retry and independent standalone HSC dimension edits and folding. Local release verification checks served app/module JS/CSS identity. Production has not been deployed.

## Previous release: Auto3D v0.32.0 / Packaging v1.3.0

Remote main includes PR #28 (01ee6d2), Auto3D v0.31.0 / Packaging v1.2.0. This update is on feat/packaging-cad-unfold; report both versions and the PR number. Production is unchanged until the PR is merged and Pages deploys it.

The left upload/model panel is open on startup; the right begins collapsed. Mobile AI/Packaging opening closes the left panel to preserve usable viewer space. The RSC thumbnail shows a closed shipping box and the initial generator draft is closed.

New-box L/W/H/caliper inputs are enabled before generation and appear before the two-column preset grid. Values stage until a preset or Generate is clicked, validating the full dimension set together. Typed drafts survive refreshes and display-unit changes. All four cards generate using those entered dimensions; strict packaging.fefco.preset accepts the same optional canonical-mm overrides. The selected-object inside/outside/tolerance editor appears when a box is selected and retains live regeneration.

**Animate** now alternates all four selected styles between assembled and the exact saved CAD blank. It reverses top flaps, base and walls, then assembles on the next click. HSC remains open at the top. The camera frames the full sequence so the sheet stays visible. **View dieline in CAD** and selected-profile Open packaging designer use the shared packaging.open_selected action; loading a different drawing is undoable, and opening an already matching drawing adds no history step. Playback synchronizes the active CAD drawing with the selected saved profile; cancellation/failure/Undo restore the previous drawing. Current board materials, physical caliper, tolerance, placement and portable metadata are retained. Geometry stays in the independent module and API v1 remains supported. The existing original-path, unscaled-object and concept-manufacturing limits apply.

Validation: 509 unit/module tests and lint pass; all 13 independent module tests pass. Website/Pages and standalone builds pass. Chromium against the generated Pages artifact verifies all four dimension-first presets, closed RSC defaults/thumbnail, equal desktop/mobile card layouts, left-open startup, exact saved CAD paths in the unfolded endpoint and CAD dialog, reassembly, Pause/Resume, cancellation, busy guards and Undo/Redo. A second browser suite verifies deferred module loading, flat-board textures/guides in portable archives, typed unfolding, mobile layout, module-fetch failure/retry, and standalone HSC unfolding/editing/assembly without Auto3D/account requests. Local release verification confirms v0.32.0 / module v1.3.0 and served app/module JS/CSS hashes (asset digest 2701eaabb025). Production identity was not rechecked and no deployment was performed.

## Previous release: Auto3D v0.31.0 / Packaging v1.2.0

This release merged as PR #28 (01ee6d2), Auto3D v0.31.0 / Packaging v1.2.0. Production identity has not been rechecked during the v0.32.0 task.

All four preset cards share a uniform two-column grid, with style categories shown on each card. Clicking RSC, HSC, OSC or FOL immediately adds and selects a box using the current draft dimensions/caliper. OSC overlap is normalized when necessary. The shared packaging.fefco.preset command uses the same service and records one Undo step per generated box.

The panel replaces the separate unfold/folding buttons with **Animate**. It reads the selected object metadata: a closed box opens its top flaps; an open box closes them; a flat dieline folds into a box. HSC has no top flaps, so its action alternates between the assembled open-top box and flat sheet. Pause/Resume/Cancel and one-step completion Undo remain available. Explicit unfolding is still supported by the shared command and `unfold box` phrase. State and material metadata survive archives; no backend or engine change is needed.

The independent module exports pure FefcoPreset and FefcoAnimationPlan helpers. API v1 is retained; optional preset/animation host capabilities support the new controls with legacy-host generation fallback. Folding begins at the current pose, rather than resetting every assembled box to flat. Manufacturing and caliper corrections retain the prior concept limits.

Validation: 507 unit/module tests and lint pass; 13 independent module tests also pass. Website/Pages and standalone builds pass. Chromium against the generated Pages artifact verifies all four preset cards generate immediately, equal-size desktop/mobile two-column layouts, automatic RSC opening/closing, pause/resume, edit busy guards, cancel restoration and Undo/Redo. Release verification confirms app/module versions and served JS/CSS hashes locally. Chromium also verifies deferred module requests, explicit unfolding, texture/guide archive round trips, typed commands, fetch failure/retry, and standalone HSC generation/unfolding/dimension edits/pausable folding without Auto3D or account APIs.

## Previous release: Auto3D v0.30.0 / Packaging v1.1.0

The v0.30.0 release was prepared against PR #26 (c33b202), the independent Packaging/unfold release v0.29.0 / module v1.0.0, on feat/packaging-fold-dimensions-dark-viewer. It merged as PR #27. Production identity has not been rechecked during the v0.31.0 task.

Dark startup and account preference restoration align a conflicting built-in Light viewer preset with Dark appearance. Explicit custom colors, scenic presets and HDRI remain selected. Browser verification checks actual viewer pixels on startup and reload.

The Packaging panel places editable selected-box dimensions above the FEFCO catalog. Inside minimum usable dimensions and outside maximum envelope are reversible inputs, accounting for caliper, actual flap layer counts and an explicit tolerance reserve. Edits regenerate the selected box or flat sheet after a short debounce, preserving ID, placement, board materials and Undo/Redo; tolerance survives archives. Dimensions are canonical millimeters, displayed using account units. Generic object scaling must be reset first.

The independent module adds rigid score-hinge folding from flat sheet through open box to closed box, with progress, Pause/Resume and Cancel controls. HSC remains open at the top. Ordinary editing and saving are blocked during transient playback. Completion commits a dimensionally generated box as one Undo step; cancellation or failure restores the original with no history entry. The hinge preview is a concept sequence, without collision detection, bend radii or converter-specific tooling allowances; custom edited paths and scaled objects are rejected.

Validation for v0.30.0: 502 unit/module tests and lint pass; website/Pages and independent module builds pass. Chromium verifies dark startup/reload, custom color retention, editable dimensions, folding stages and controls, Undo/Redo, cancellation, HSC and mobile layout. Preference/recovery browser coverage also passes. The generated Pages artifact passes the new browser workflow and release verification for app/module versions and served JS/CSS hashes. The standalone preview passes generation, unfolding, editable dimensions, folding pause/cancel/completion without Auto3D/account API requests; lazy-loading and fetch failure/retry also pass. Engine and backend code are unchanged.

## Previous release: Auto3D v0.29.0 / Packaging v1.0.0

The generator, extrusion, material textures, catalog UI and styles now live in the independent modules/packaging package. Its neutral mesh/profile/material API has no Auto3D imports, and it has its own build, tests and standalone preview (localhost:8082). Auto3D retains a scene/history/auth adapter and lightweight archive validation, loading module geometry/UI on demand. Saved scenes use ordinary engine geometry/materials. Build cache identity and release verification include the separate module JS/CSS.

**Unfold selected box** / `unfold box` replaces a generated folded box with its saved flat concept dieline, preserving the current dominant board/edge materials and textures. Red cuts, dashed blue scores and physical caliper are visible. Undo/Redo restores object/order/selection and the previous drawing; archives/recovery preserve flat state, textures and guides. The action uses generator dimensions, refuses generic object scaling and arbitrary imported meshes, and does not claim manufacturing allowances or general hinge animation.

Validation: 484 unit/module tests pass, including compilation checks for both dependency boundaries, material preservation, watertight flat-board volume, units, commands/macros, failure rollback and archive/recovery. Lint, website/Pages and standalone module builds pass; local Chromium verifies deferred module requests, RSC unfolding, textures/guides in file saves, Undo/Redo, typed commands, mobile layout, the standalone module without Auto3D/account APIs, and module-fetch failure/retry. The module browser suite also passes against the generated Pages artifact; deployment verification confirms app/module versions and served JS/CSS hashes locally. Backend tests (11) and production-license checks also pass. Production audit passes its high-severity threshold, with the existing moderate fflate 0.8.2 advisory still reported; dependency versions are unchanged. See packaging-module.md and modules/packaging/README.md.

## Application overview and earlier production evidence

Auto3D is an authenticated browser 3D workspace with private user Library storage, account preferences, administration, modeling/layout tools, packaging profiles, cameras and PNG rendering. The frontend uses plain JavaScript/DOM and Three.js. Production runs on Cloudflare Pages Functions with Supabase Auth/PostgreSQL and private Cloudflare R2 objects. Microsoft Entra ID remains the intended replacement for temporary email/password authentication.

| State | Version / identity | Evidence |
| --- | --- | --- |
| Confirmed production | App label **0.27.0**; main commit `c46bbf465ecf555f291431dc4a9bd07a71d281cc` | PR #21 merged; GitHub deployment and Cloudflare canonical deployment both successful |
| Current production deployment | `0d73523a-cff9-4b17-a84e-e09156748715`, 2026-10-09 13:56 UTC | Pages project `auto3d`, production branch `main`, host `auto3d-5av.pages.dev` |
| Historical 0.27.1 release | Preference/recovery fixes, merged in PR #22 | Release verification described below; subsequent production identity has not been rechecked in this task |

A successful merge and a visible app version are different checks. Earlier feature PRs retained 0.27.0, so the old label does not prove deployment failed. PR #21 did not contain the later recovery/preference work. The six most recent Cloudflare production deployments were successful and not skipped; there is no evidence that many small PRs broke those deployments. The user's unchanged fill appearance remains a production-browser issue until the loaded release and diagnostics are confirmed.

## Completed implementation work

These features are present in the codebase with regression coverage. This inventory does not assert that every historical user request was individually retested against production.

| Area | Work completed | Reference |
| --- | --- | --- |
| Login and access | Mandatory approved-account login; persistent secure cookie sessions; explicit logout returns to the gate and prevents automatic re-entry; password eye; request-account flow | [temporary-auth.md](temporary-auth.md) |
| Administration | Approved admin account; requests/approval, revoke and reset controls; restricted obscured console route; obsolete admin route retired | [temporary-auth.md](temporary-auth.md) |
| Personal storage | Per-user R2 archives/thumbnails; Supabase owner metadata; account Library save/list/open/rename/move/delete; account preference synchronization and device isolation | [account-storage.md](account-storage.md) |
| Legacy Library | PR #16 reconciliation uses current authentication and preserves published R2/legacy Storage reads and verified shares; historical SQL archived | [pr16-reconciliation.md](pr16-reconciliation.md) |
| Model editing | Editable upper W/L/H, proportional scaling, live percentage/dimension updates; global mm/inches; compact context menu; Ctrl/Command additive selection | [polygon-optimization.md](polygon-optimization.md) |
| Layout and optimization | Compact arrays, alternate-layer 45/90/180 rotation, auto grouping, shared geometry, worker-based polygon preview/apply/cancel and Undo | [polygon-optimization.md](polygon-optimization.md), [rendering.md](rendering.md) |
| Workflow feedback | Import/upload/unsupported-format messages; array progress; bounded per-account tab error logs in Preferences | [error-logs.md](error-logs.md) |
| Commands and macros | Search/category organization, collapsible advanced tools, visual macro design; strict shared UI/agent commands and generated catalog | [agent-interface.md](agent-interface.md) |
| Agent screenshots | Agent-accessible viewport/workspace capture with bounded output; sensitive dialogs/input fields omitted; no automatic chat transmission/upload | [agent-screen-capture.md](agent-screen-capture.md) |
| Packaging foundation | Point-to-point cut/score profiles, exact units/snapping, SVG/DXF exports, board caliper and solid extrusion, profile persistence/history | [packaging-module.md](packaging-module.md) |
| Cameras/rendering | FOV and saved cameras, session persistence, timeline camera entry; screen/HD/4K/16K tiled PNG, model-only alpha and queue/cancel | [session-cameras.md](session-cameras.md), [rendering.md](rendering.md) |
| PR #21 rendering fixes | Metallic/clearcoat specular fill; independent floor-shadow projection, renderer state restoration; symmetric account-dialog buttons | [PR #21](https://github.com/yuttana858/Auto3D/pull/21) |

## Historical 0.27.1 changes

- Account preferences share one in-flight load per identity and apply the complete saved viewport before rendering. Cookie/previous-account defaults do not win a race against account settings. Logout invalidates stale reads and queued writes.
- Appearance changes preserve an explicit custom background. Viewport updates render as a batch. Saved RGB/alpha components use integers accepted by the server.
- Preferences has **Recover unsaved session**. UI and agent restoration share validation, account ownership and empty/editable-workspace checks. A restored checkpoint remains on the device until an explicit full-session save.
- Invalid checkpoints show their precise validation error and record it in error logs. Existing invalid archives are not silently deleted or claimed repaired. The user's earlier message, “Unable to restore last close session,” is insufficient to identify that checkpoint's underlying error.
- Forgot Password is re-enabled after a failed sign-in. This is separate from the user's reported unsaved-session recovery issue.
- App header/Preferences identify **v0.27.1**; Preferences also identifies the build. `app.version.inspect`, `preferences.viewport.inspect` and `session.recovery.inspect/open/restore` expose bounded agent diagnostics and shared actions.
- `version.json` and HTML build metadata identify the deployed commit. Asset invalidation includes the recovery worker. HTML and un-fingerprinted bundles revalidate, and the version manifest is no-store.
- After upload, deployment verification checks the expected commit, HTML references and actual application bundle hash before reporting release success.

## Validation log

Local verification for this consolidated work:

- 454 unit tests passed, including preference-load deduplication, stale-account rejection, valid/invalid recovery, read-only/occupied-workspace checks, strict commands/macros and deployment identity/hash failures.
- Lint and production website/Pages build passed.
- Local production artifact passed the same manifest/HTML/bundle verification used after deployment.
- Browser recovery, repeated against the generated production artifact, created a real worker/IndexedDB checkpoint, restored the model and edited position after two consecutive reloads and preserved an explicit light viewport with dark UI appearance.
- Browser textured-metallic helmet check: sampled brightness increased from approximately 132 to 249 with fill; enabling floor shadows kept model brightness approximately 249. This is local Chromium evidence, not confirmation of the user's production browser.
- Prior account-storage and login browser checks passed account isolation/persistence and desktop/mobile account-button behavior. Rerun targeted checks when those paths change.

Tests and sandbox assets belong in `work/`; they are not user Library data. Development URL: `http://127.0.0.1:8080/website/index.html`. The generated production artifact is `build/pages`; the local production test server uses port 8081. The sandbox mocks account APIs for browser tests; it does not modify live users, send recovery mail or apply database migrations.

## Lighting visibility investigation — development branch

The user reports that Reflect models and Shadows remove the model and disabling the toggles does not bring it back. A textured helmet remains visible in local Chromium during ordinary toggles; the user's browser/GPU failure is not yet reproduced directly.

A verified reflection-capture failure path can leave the renderer targeting a cubemap face because Three.js CubeCamera restores its render target and XR/mipmap state only on success. The development fix restores these in a finally block, retains baseline materials after a failed capture, and exposes the capture error through existing lighting diagnostics. This prevents that failure from redirecting subsequent viewport draws. It is not yet proof that both reported toggles are resolved on the user's device.

Regression coverage includes a failed cubemap pass while floor shadows are enabled, restored display output, successful retry, original model/material state, and actual UI toggles under Default and HDRI lighting. Validation: 456 unit tests, lint and website build pass; local Chromium passes UI combinations in Default and packaged HDRI lighting plus injected capture failure and tiled render checks. Captured offscreen errors are included in the Error logs error filter. Work remains on a review branch; no production deployment is authorized by this investigation.

## Workspace controls update — review branch

The workspace now starts with both side panels, all left sections and Details collapsed. Right-click model tools share the tool strip's underlying actions and disabled states, including array, floor placement, replacement, undo/redo, save/export and panel access.

Busy model operations show a modal **Processing..** spinner and the current operation message. Arrays display completed copy counts and continue yielding between copies. The modal closes on completion or failure; this adds visual feedback, not a higher model-size/object limit or a cancellation promise.

The AI panel has **AI** and **Packaging** tabs, reserves space for the tool strip and wraps text on narrow screens. Packaging moves off the top header into its tab, which opens the existing full designer and provides SVG/DXF downloads. AI generation still requires an explicitly configured provider/request.

The bottom command bar supports `array model 4x4x6` (W=X, L=Z, H=Y), `move model`, `rotate model`, `scale model`, `select model`, `duplicate model`, `hide model`, `show model`, `delete model`, `drop model to floor`, `fit`, `focus`, `undo`, `redo`, `add model`, `update model`, `export`, `library`, `save`, `ai`, `packaging`, `commands` and `macros`. Semicolons sequence supported phrases; `run macro Name` runs a saved local macro. Up/Down recalls successful commands. This is a bounded phrase parser, not arbitrary code or an unrestricted natural-language agent. All actions pass through the existing strict registry, with authentication/read-only/busy checks and macro prevalidation. Nested macros are rejected. Dialog actions still require user interaction.

New registry commands are documented in the generated catalog: commands.text, object.tool, ui.commands, ui.ai, ui.ai.packaging, ui.add_model, ui.update_model and ui.export.

Validation: 464 unit tests, lint and website/Pages build; Chromium covers clean startup, context/strip parity, a real 96-object array with processing feedback and undo, saved macro execution, validation failures, and desktop/mobile AI/Packaging panels. Large real-world model performance still depends on geometry, textures and the user's GPU. These changes are prepared for review and are not deployed by this branch.

## Historical 0.27.1 release checklist

- [x] Confirm PR #21 merge and production deployment identity directly in GitHub/Cloudflare.
- [x] Consolidate preference, recovery, diagnostics and version/build fixes locally.
- [x] Pass unit/lint/build and local recovery/metallic rendering checks.
- [x] Complete the final browser check against the generated production artifact, including restored object transforms.
- [x] Prepare one combined 0.27.1 release change set. The GitHub release PR records the head commit and current CI status; passing CI is required before release.
- [ ] Merge/release once approved, then verify production `version.json`, HTML and served bundle through the workflow.
- [ ] Confirm the user's tab displays v0.27.1 and the new build before assessing any remaining fill/shadow behavior.
- [ ] Inspect the user's existing recovery validation error in the new diagnostics if it remains disabled. Preserve its checkpoint before any destructive troubleshooting.

## Open decisions and follow-up work

1. **Recovery email delivery:** custom SMTP is not configured/verified. The requested corporate sender needs an approved mail service/domain setup. Do not assume an unapproved personal/corporate mailbox can provide SMTP. Production email/reset delivery needs an end-to-end test after configuration.
2. **Identity migration:** design and implement Microsoft Entra sign-in behind the existing account/auth boundary, including approved-user mapping, admin roles, logout/revocation and Library ownership migration. Avoid a parallel login/admin system.
3. **Packaging:** 0200–0203 generators and unfolding are implemented in the separate module. Curves/vector import, additional FEFCO families, measured board grades, folding/bend allowances and manufacturing validation remain future work. Score guides do not animate hinges, and individual flute geometry is not modeled.
4. **Packaging database readiness:** confirm the profile-only session metadata constraint from `database/packaging-profile-sessions.sql` is applied before relying on account saves of zero-object designs. This local release does not apply SQL.
5. **Polygon quality:** validate real dense textured assets and representative devices; simplification is lossy and seam/topology dependent. Animated rigs/morphs are excluded. Keep preview and Undo; do not promise unchanged appearance or unlimited array performance.
6. **Rendering limits:** 16K output is memory intensive; floor shadows are projected silhouettes, not physically accurate self-shadow/ray tracing. Test representative opaque, transparent and animated models in supported production browsers when rendering code changes.
7. **Storage/share evolution:** keep personal files separate from legacy published/shared paths. Organization lifecycle, owner-authorized publication/revocable sharing and quota/concurrency policy need a deliberate design before broader collaboration features.

## Working rules for the next agent

Read `AGENTS.md`, this log and the architecture overview first. Treat the live deployment commit and tests as evidence; do not infer release success from a merged PR or the old version label. Keep the current batch in one release PR. Preserve unrelated local files and development screenshots under work/. Publish only reviewed changes on the current main tree.

Use shared application services and strict registry commands for new user actions; synchronize the catalog. Respect login, account isolation and read-only sessions. Never put credentials in documents, browser code, screenshots or logs. Do not replay SQL from `database/history/pr16/`. Update this log after each release with version, commit, deployment result, meaningful tests and remaining issues.
