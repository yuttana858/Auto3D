# Auto3D development log and handoff

Updated 2026-10-09. This is the starting point for project status, completed work, open issues and the next release. Architecture: [agent-project-overview.md](agent-project-overview.md).

## Where we are

Auto3D is an authenticated browser 3D workspace with private user Library storage, account preferences, administration, modeling/layout tools, packaging profiles, cameras and PNG rendering. The frontend uses plain JavaScript/DOM and Three.js. Production runs on Cloudflare Pages Functions with Supabase Auth/PostgreSQL and private Cloudflare R2 objects. Microsoft Entra ID remains the intended replacement for temporary email/password authentication.

| State | Version / identity | Evidence |
| --- | --- | --- |
| Confirmed production | App label **0.27.0**; main commit `c46bbf465ecf555f291431dc4a9bd07a71d281cc` | PR #21 merged; GitHub deployment and Cloudflare canonical deployment both successful |
| Current production deployment | `0d73523a-cff9-4b17-a84e-e09156748715`, 2026-10-09 13:56 UTC | Pages project `auto3d`, production branch `main`, host `auto3d-5av.pages.dev` |
| Consolidated local release | **0.27.1**, not deployed yet | Preference/recovery fixes and release verification described below |

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

## Current 0.27.1 changes

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

## Immediate release checklist

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
3. **Packaging:** curves and vector import, measured board-grade catalog, folding/bend allowance, FEFCO generators and manufacturing validation are future work. Current score lines are metadata; extrusion creates flat solid board, not folded or fluted geometry.
4. **Packaging database readiness:** confirm the profile-only session metadata constraint from `database/packaging-profile-sessions.sql` is applied before relying on account saves of zero-object designs. This local release does not apply SQL.
5. **Polygon quality:** validate real dense textured assets and representative devices; simplification is lossy and seam/topology dependent. Animated rigs/morphs are excluded. Keep preview and Undo; do not promise unchanged appearance or unlimited array performance.
6. **Rendering limits:** 16K output is memory intensive; floor shadows are projected silhouettes, not physically accurate self-shadow/ray tracing. Test representative opaque, transparent and animated models in supported production browsers when rendering code changes.
7. **Storage/share evolution:** keep personal files separate from legacy published/shared paths. Organization lifecycle, owner-authorized publication/revocable sharing and quota/concurrency policy need a deliberate design before broader collaboration features.

## Working rules for the next agent

Read `AGENTS.md`, this log and the architecture overview first. Treat the live deployment commit and tests as evidence; do not infer release success from a merged PR or the old version label. Keep the current batch in one release PR. Preserve unrelated local changes; this checkout contains uncommitted files matching earlier merged work. Publish only reviewed changes on the current main tree.

Use shared application services and strict registry commands for new user actions; synchronize the catalog. Respect login, account isolation and read-only sessions. Never put credentials in documents, browser code, screenshots or logs. Do not replay SQL from `database/history/pr16/`. Update this log after each release with version, commit, deployment result, meaningful tests and remaining issues.
