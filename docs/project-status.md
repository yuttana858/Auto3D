# Auto3D development log and handoff

## External viewing production activation (2026-10-21)

PR #38 is merged and Auto3D 0.37.1 / Packaging 1.7.1 is deployed at commit `c8b26ed3d91b101db95ac774efa95146d9f60395`. Cloudflare and Supabase connector access is restored. Applied the reviewed `audience_library_sharing` migration (production history version `20261021205006`, corresponding to source migration `20261020223655`), configured a securely generated server-only secret and enabled the production audience flag while preserving existing Supabase settings and the private R2 binding. Legacy PIN sharing remains disabled.

Live database checks confirm RLS, service-role-only tables and invoker RPCs without anonymous/authenticated execution grants. A rolled-back synthetic reservation verifies wrong-code rejection, correct-code access with downloads disabled, and revocation. No saved user model was shared or modified. Deployment run [39593084553](https://github.com/yuttana858/Auto3D/actions/runs/39593084553), attempt 2, successfully deployed and verified matching production bundles. Canonical deployment `c8a5932c-c950-44e1-9f14-08075d62e530` confirms both audience environment bindings and readiness=true. Direct production HTTP/mobile testing from this workspace remains blocked by its destination network policy; local anonymous mini-viewer/code/QR tests and isolated database throttle/expiry checks passed previously. A real owner-created link and physical mobile-device check remain outstanding. Supabase advisors report expected no-policy INFO notices for these service-only tables; the pre-existing [leaked-password protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) is unrelated to this activation.

## White-viewer follow-up to PR #38 (2026-10-21)

The user clarified that surface-panel interaction turns the main viewer white and hides the box. This exact failure has not reproduced locally on the patch: actual-checkbox and slider tests check rendered pixels after off/on, maximum bow/softness/compression, grain regeneration and intermediate-fold toggles. Both ordinary lighting and enabled shadows/ambient/model+floor reflections remain rendered with zero white-canvas frames, no console errors, no shader failures and no context loss. The user's affected scene/version and newest error log remain needed to establish the production cause.

A separate resource issue was found and corrected: identical static array boxes now share immutable GPU display geometry, instead of duplicating it per instance. Editing one box detaches its buffers without modifying the others. Existing lighting/shadow diagnostics now include geometry, texture, program and draw-call counts to help investigate the white-screen report. These are additional hardening changes to the open PR #38, not a confirmed diagnosis of the user's white-screen event. Validation: 626 unit/module tests, lint, both engine builds, website/independent Packaging/Pages builds pass. The 20-box Chromium resource test holds at 63 geometries and 32 textures through repeated edits, with no context loss.


## Board surface stability patch: Auto3D 0.37.1 / Packaging 1.7.1 (2026-10-21)

Opened as [PR #38](https://github.com/yuttana858/Auto3D/pull/38), based on merged PR #37, commit `176b5f8`. The Enable board surface and geometry-control path previously rebuilt the full scene, reloaded textures and recreated/audited saved fold previews. It now replaces only the selected object's GPU buffers, preserving other objects, material instances, camera and current preview pose. Disabled surfaces restore rigid panel buffers. Full-operation edit/history locks prevent overlapping mutations; failures restore the prior display/profile. Paper grain stays an independent material setting and retains the material refresh path.

Fold preview material lookup now uses original document material indices, and crease triangles use the same stable material-sorted order as the converter, limiting each crease to three draw groups. Canonical CAD, measurements and array placement remain unchanged. Tests cover repeated toggles, resource disposal, history, error rollback, saved previews and lock behavior. Local gates: 625 unit/module tests, 11 backend tests, lint, both engine builds and website/independent Packaging/Pages builds pass. A real viewer probe passes six toggles on a four-box array at fold pose 0.23, retaining camera, CAD, placements, Undo/Redo and WebGL context; the repeated Chromium check also passes after the draw-group refinement. No merge or deployment of this patch has occurred.


## Release candidate: Auto3D 0.37.0 / Packaging 1.7.0 (2026-10-21)

Opened as [PR #37](https://github.com/yuttana858/Auto3D/pull/37) on `feat/packaging-surfaces-sharing-037`, based on deployed PR #36 (`e356db1`). Includes the accumulated board surfaces/material tools, fold slider and timeline Actions, fold/array cameras, render workspace, Library Add/groups and protected audience-link implementation. See [release-037.md](release-037.md). API v1 is retained.

Fresh release gates pass: 620 unit/module tests, 11 backend tests, lint, license checks, zero reported production dependency vulnerabilities, engine and engine-module builds, website, independent Packaging and Pages builds. Earlier isolated PostgreSQL and Chromium evidence is detailed below; PR CI now repeats effective database permission/throttling tests. The PR is for review only: no merge, production deployment, database migration or sharing-secret/flag activation has occurred. Cloudflare connector access remains unavailable. Prior entries describe their development-time version labels.


## Realistic board surface (local, 2026-10-20 America/Chicago)

Automatic restrained panel bowing, score-filleting strength and compressed cut shoulders now live in optional `presentationMeshes`, separate from canonical mesh coordinates and collision solids. The viewer, fold preview, audience mini viewer and independent Packaging preview share the kernel. Original engine coordinates still drive CAD, object-size fields, quantities, archives/mesh exports and exact array spacing. Supported generated boxes and custom extruded contours (including holes) receive display treatment; unsupported edited generator paths and arbitrary imports retain their canonical display.

Packaging → Realistic board surface supplies Enable, Panel bow, Fold softness, Cut compression and Paper grain controls, with shared strict `packaging.appearance.inspect/update` commands. Validated settings persist in the profile; updates and generated-map changes have Undo/Redo and rollback/account/read-only guards. Default outer/inner/exposed/wrapped materials are independently editable. Seamless periodic fibre noise replaces the regular grain pattern; exposed flute UV phase remains tied to global sheet direction and pitch. Authored print/normal/impression/varnish maps and UV transforms are retained. See [board-surface-appearance.md](board-surface-appearance.md).

Validation: 620 unit/module tests pass, plus focused surface validation after strict-key hardening. Lint, website, independent Packaging and Pages builds pass. Real Chromium checks cover generated surface on/off, exact CAD comparison, Undo/Redo and intermediate/open fold poses; a separate actual-control check passes after expanding the surface section and waiting for its asynchronous update. The first combined UI probe waited on a collapsed section and the first control probe polled while the viewer was busy; their test waits were corrected. The final checks distinguish those harness failures from implementation behavior. No release/PR/deployment is prepared, and labels remain Auto3D 0.36.0 / Packaging 1.6.0. Cloudflare reconnection is still pending.


## Array animation review (local, 2026-10-20 America/Chicago)

Reviewed row/layer order, accelerating drop timing, current-view camera continuity, full-array framing, exact canonical placements, group navigation, manual camera takeover, pause/resume, Undo/Redo and cancellation. Twelve focused tests pass, including two new integration checks of the actual reveal routine: its first frame retains the current camera, display drops do not alter canonical transforms, and completion/cancellation restore matrices and camera listeners. The complete real-viewer scene-presentation regression passes after the fold Action integration. No animation implementation changes were necessary in this review. The animation remains unreleased. Cloudflare connector read access still returns an internal error; production access is not restored.


## Local follow-up: sharing, Library Add, groups and fold Actions (2026-10-20)

Not deployed. Audience sharing now gives every saved Library card a Share entry, mandatory four-digit code, generated link and automatic QR. Account/device/published items use independent private snapshots; owners can list/revoke links. The anonymous mini viewer challenges for the code. Production remains disabled until the new migration, server secret and feature flag are configured; no live model was published. Local handler, browser and isolated PostgreSQL permission/throttling/quota checks pass. See [audience-sharing.md](audience-sharing.md); AR is an assessed follow-up, not implemented.

Library Add now appends atomically with selection, fresh group/action IDs and Undo/Redo, reports download/conversion errors and times out stalled requests. Asynchronous Three.js conversion exceptions now reject instead of leaving loading unresolved. Local fixture import passes; the actual REDCON archive could not be retrieved because the available network policy blocks its R2 endpoint, so the bottle itself remains unverified. Array and ordinary groups collapse in both model lists. Splash “Model viewer” text is removed; the deprecated HDR loader alias is replaced.

Rounded score connections use separate inner/outer curves, board-aware visual radii and exposed caps, with exact CAD kept separate. The Packaging panel now has a manual fold slider in place of the large generation button; preset cards remain. Advance animation has an Action button and a saved deterministic Fold/unfold track with reversible seeking, validation and Undo. See [scene-presentation.md](scene-presentation.md). A local Chromium check confirms manual and timeline poses while CAD dimensions remain unchanged; a separate close-up isolates actual procedural crease geometry.

Latest validation: 609 unit/module tests, 11 backend tests, lint, website/independent Packaging/Pages builds pass. The Library-sharing Chromium workflow passes again after Action integration, covering Add/Undo, groups, codes/QR and the anonymous mobile viewer. The scene-presentation workflow passed before Action additions; the new fold-Action browser check also passes. App/module labels remain 0.36.0/1.6.0. No new release or deployment is prepared. The earlier production Library-save report remains unresolved.


Updated 2026-10-20. This is the starting point for project status, completed work, open issues and the next release. Architecture: [agent-project-overview.md](agent-project-overview.md).

## Unreleased: surface finishes, scene presentation and rendering

The current working tree adds corrugated grain/flute bump composition, emboss/deboss image masks, spot-varnish masks over roughness/specular maps, and shared UV/effect controls inside texture-thumbnail preview dialogs. Height/displacement cards and controls are hidden while legacy archive data remains readable. Mask placement, alpha/polarity, settings and original/generated textures persist with Undo/Redo. Stable `material.surface.*`, `material.texture.inspect/mapping` commands and the generated catalog expose the same services. See [surface-relief.md](surface-relief.md).

Fold seams now use smooth circular reference arcs with tangent-preserving corrections for deliberate rail shifts, compressed inner fillets and corrugated exposed strip caps. Pitch, caliper, score width and score/flute alignment influence the reference radius. Generated default liner relief and all exposed-edge texture phases use engineering material flute pitch/direction in global dieline coordinates. Custom relief/placement preserves authored UVs rather than automatically rotating artwork. CAD points, rigid collision prisms and Measurement-layer calculations remain separate. See [corrugated-dimensions-and-creases.md](corrugated-dimensions-and-creases.md).

Fold/unfold displays its start pose before swapping renderers, eases into sweep framing, follows the selected box and settles at the endpoint without a final fit jump. Advance Animation auto-fit Off preserves manual framing; authored camera keys override auto-fit and play across the configured range. Viewport interaction relinquishes camera control. Arrays optionally reveal copies by sequential accelerating drops, with full-array camera easing, playback controls and atomic cancellation. Original mesh coordinates define exact array placement; decorative crease skins are excluded from bounds. Both paths block transient saves. See [scene-presentation.md](scene-presentation.md).

The Render workspace now opens on render/queue actions, showing tile previews, progress and session thumbnails. Foreground Render uses the main scene; cooperative background jobs permit viewport navigation while blocking scene edits. Completed images open in a separate pan/zoom window; selected deletion/Clear release images and windows. Queue data clears on account/session replacement. Strict shared render commands and catalog entries cover the same actions. See [rendering.md](rendering.md).

Validation: 590 unit/module tests, 11 backend tests and lint pass. Website and independent Packaging builds pass. Chromium passes the combined texture-window UV, emboss/deboss and varnish upload workflow, Undo/Redo, exact CAD/measurement comparison, worker archive restoration, hidden Height card and mobile layout. The full material browser regression also passes, including inactive-bump GLB metadata. Render browser checks pass for real Screen/4K PNGs, previews/progress, background navigation, popout pan/zoom and Agent view controls, selection/delete/Clear, responsive queue layout, pixel agreement and renderer-state restoration after success/cancellation/failure. The expanded fold/array browser workflow passes after the final framing refinements: automatic/manual cameras, exact CAD and array placement, accelerating drops, full-array framing above the command bar, pause/resume, grouping, Undo/Redo and cancellation. App/module version labels remain 0.36.0/1.6.0; no new release, PR or deployment has been prepared. Prior Library-save diagnostics and Bump activation-button edits remain in this working tree; the reported production Library failure has not been reproduced or resolved.

## Follow-up: Library saving and relief controls (in progress)

PR #36 is merged and deployed at commit `e356db1512824eaf8aa92864e5348655003233c5` (Auto3D 0.36.0 / Packaging 1.6.0). A reported User Library save failure remains under investigation: local Chromium tests using the actual personal Library handlers accept generated packaging archives with Measurement-layer data through both the command and Save dialog. Production R2 binding and database permissions have been checked; these checks do not establish that the reported production save works. Capture the user's exact save status/error before assigning a root cause.

The user reports console errors without a visible save error. Local diagnostics changes now include HTTP status in account Library errors, identify the failed save stage in the dialog, and write sanitized error/stack details to the console (also captured by the existing Error logs service). Preview creation has its own progress message rather than appearing as an upload. Lint and 16 account-storage/diagnostic tests pass. These changes are not deployed; the actual console messages are still needed to diagnose the production failure.

The material card now offers **Use Bump relief** or **Use Normal relief** beside an inactive relief slider, through the existing `material.relief` implementation with Undo/Redo and edit guards. A normal map takes precedence over bump in the renderer, so only the selected relief technique's strength is editable. This is a UI clarification; CAD dimensions and material defaults are unchanged. The change is local and has not been deployed.

Validation: lint and 23 focused material/account-storage tests pass. The full suite passed 562 tests with one existing folding-route audit exceeding its 15-second timeout during concurrent browser work; that audit passed separately in 11 seconds. Chromium confirms the new activation button enables Bump and preserves slider Undo/Redo and portable archive data. The broader surface browser script initially failed its GLB inactive-bump metadata assertion (`extras.swAuto3D.bumpTexture`). The export path now retains the inactive bump map; the full desktop/mobile material browser regression passes as recorded above. The production Library-save report remains unresolved.

## Release candidate: Auto3D v0.36.0 / Packaging v1.6.0

Baseline is merged PR #35, commit `c4629c9`. The release is prepared in [PR #36](https://github.com/yuttana858/Auto3D/pull/36), branch `feat/packaging-measurements-036`. Production deployment was requested on 2026-10-20; merge and live asset verification follow the existing GitHub Actions workflow. App/package/version labels are aligned at 0.36.0 and Packaging 1.6.0, with API v1 retained.

Packaging Designer adds a dedicated **Measurement layer** tab and a selected-box shortcut. Per-dimension Auto, Manual and Parametric modes operate on canonical CAD point distances, independently selecting score/inside/outside basis, target and score-tolerance override. Formula labels, purple CAD leaders and worst-case tolerance bands remain independent of renderer meshes, camera and display smoothing. Generated box edits rebuild CAD and matching scene geometry atomically; custom segments move endpoints and coincident vertices. Parametric conflicts, scaling, malformed references and invalid material records are rejected. Undo/Redo and portable archives retain records and targets.

The per-design material database supports duplication/activation, measured caliper/variation, liner and medium paper calipers, grade/fibre/grammage, flute pitch/direction, tooling/conditioning, inside/outside allowance factors, score/process tolerances, provenance and calibration status. It is portable profile data, not a remotely synchronized organization-wide material catalog. 0201 inside factors start from scoped FEFCO Recommendation 101 guidance; outside gains and other styles require explicit converter values. Zero default tolerances are unspecified reference inputs, not promises of zero manufacturing variation. Existing legacy fit-reserve controls remain for older profiles; engineering-linked objects direct editing to the Measurement layer.

The rendering module adds separate rounded crease surfaces between known shared score rails, following both panels during animation. They bridge display clearances while leaving canonical paths and rigid collision prisms unchanged. Cut slots remain open. Optional `visualMeshes` preserve API-v1 compatibility; Auto3D and standalone hosts display/update them. Standalone preview adds a CAD/formula view beside the 3D model. Individual paper mechanics, arbitrary imported folding, a general constraint solver and manufacturing certification remain outside scope.

Documentation: [corrugated-dimensions-and-creases.md](corrugated-dimensions-and-creases.md). The searchable knowledge API adds `dimensionalEngineering`, source links and scoped tolerance guidance. Shared strict commands cover opening/toggling the layer, dimension inspection/edits, and material updates/activation/duplication; the generated command catalog is synchronized.

Validation: 563 unit/module tests, 11 backend tests, lint, production licenses and moderate-threshold dependency audit pass (zero reported production vulnerabilities). Website, independent module and Pages builds pass. Chromium verifies CAD-derived dimensions, independent Manual/Parametric material changes, continuous rendered folds, and material/target preservation through fold/unfold playback. Chromium also verifies a 390 px mobile Measurement layout without horizontal overflow and repeated standalone material/target edits with an independent CAD view. Local Pages asset hashes and app/module versions are verified. Local release gates were repeated successfully on 2026-10-20. Production rollout and verification are tracked in PR #36.

## Previous release: Auto3D v0.35.0 / Packaging v1.5.0

Main baseline is PR #34, commit `5ecde44`, Auto3D v0.34.0. This candidate is prepared in an isolated checkout as [PR #35](https://github.com/yuttana858/Auto3D/pull/35); application deployment remains pending PR review/merge.

The reviewed share-service permission migration was staged on PostgreSQL 17, applied to Supabase on 2026-10-11, and verified. Browser roles cannot call legacy share RPCs or access share-link/code metadata; the Pages service role retains access. Account-gated sharing remains in place. PIN/public sharing is not enabled: the throttle migration and server readiness configuration still need a separate verified rollout. The candidate rejects creation of unavailable PIN links, bounds share JSON requests to 4 KB, validates fields and excludes query tokens from upstream error logs. fflate is patched to 0.8.3 and production audits now gate moderate advisories.

Preferences adds account-saved Auto/Fast/Quality viewport resolution. Auto uses at most DPR 2 while idle and at most DPR 1 during camera movement/object dragging, restoring idle resolution after 250 ms without new movement. Fast uses at most DPR 1; Quality uses native DPR. Camera events coalesce into one requested display frame. All geometry, textures, saved files and final PNG render dimensions stay authoritative. Stable commands: `preferences.viewport.quality` and `preferences.viewport.quality.inspect`.

Single-pass shadow caster/floor materials remove redundant draws: the 80,000-triangle probe drops from 240,004 to 160,002 submitted triangles with shadows and 480,010 to 320,006 with shadows plus floor reflection. These are draw-work reductions, not an FPS guarantee. Browser checks confirm 200 camera updates use one display frame, Auto restores idle resolution, and Fast/Quality produce identical final PNG pixels. No automatic destructive decimation was introduced. Static mask caching and non-destructive preview LOD remain follow-up work.

The top bar adds Save immediately before Library, opening the existing save dialog with Account Library selected. `ui.save` accepts optional `destination: "account"` for the same flow; its existing file-default behavior is retained.

Deployment now runs lint, license, moderate production audit, unit and backend gates before publishing. The mini-viewer bundle joins the asset digest/version manifest and its HTML/bundle identity is verified. The intentionally heavy FEFCO generation test has a 15-second timeout; default timeouts remain unchanged. Packaging geometry/API/version are unchanged. Array adds W/L/H edge spacing in account display units (model units for unknown source units), shared by preview, alternating layers and `object.array`. OSC/FOL thumbnails now distinguish partial and full flap overlap. Box generation reports progress and errors in the catalog, prevents duplicate clicks, and texture notifications request a coalesced frame. The exact rounded inch defaults generate successfully; the reported production thumbnail failure has not been reproduced in a clean scene.

Validation: 553 unit/module tests, 11 backend tests, lint, production audit/licenses and website/Pages/both engine builds pass. Desktop/mobile preferences/auth and original-geometry/final-PNG browser checks pass. Limitations: see [stability-security-release.md](stability-security-release.md). The live schema fix is complete; the viewer/UI/dependency/deployment changes take effect only after this candidate is merged and deployed.

## Previous release: Auto3D v0.34.0 / Packaging v1.5.0

Merged through PR #34; baseline main is `5ecde44`. The following describes the v0.34.0 implementation and its original validation.

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
