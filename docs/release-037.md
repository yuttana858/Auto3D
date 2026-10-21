# Auto3D 0.37.0 / Packaging 1.7.0

[PR #37](https://github.com/yuttana858/Auto3D/pull/37) release candidate; not merged or deployed. Packaging API v1 is retained.

- Realistic board presentation: independent visual bow, cut compression and curved score surfaces; separate outer/inner/exposed/wrapped textures; canonical CAD, measurements and array spacing remain exact.
- Texture-window UV, rotation, tiling, emboss/deboss and spot-varnish masks, with portable state and Undo. Height card hidden while legacy data stays readable.
- Manual fold slider and deterministic timeline Fold/unfold Actions; smooth fold and accelerating array cameras, playback controls and hidden bounds during folding; collapsible array/group navigation.
- Main-scene render workspace with progress, session history, previews, pan/zoom image windows and cooperative background rendering. Background jobs allow camera navigation but lock scene edits.
- Library Add appends atomically with Undo/Redo and surfaces asynchronous conversion failures. Save diagnostics identify stages and sanitized errors. The actual REDCON archive remains unverified because its R2 endpoint is blocked from this environment; the earlier production save report remains unresolved.
- Every saved Library item has a Share entry for mandatory four-digit-code mini-viewer links and QR codes, independent snapshots, owner revocation and throttled challenges.

Sharing remains disabled until the separately reviewed migration, server-only `AUTO3D_AUDIENCE_SECRET`, existing R2 binding and `AUTO3D_AUDIENCE_SHARING_READY=true` are configured. This PR does not apply production SQL, configure secrets/flags, publish a model or enable the legacy PIN endpoint. Follow [audience-sharing.md](audience-sharing.md). AR is assessed only, not implemented.

Validation before PR: 620 unit/module tests, 11 backend tests, lint, website/independent Packaging/Pages builds, isolated PostgreSQL 17 permission/throttling/quota checks, and documented Chromium workflows for materials, sharing/import/groups, folding/arrays, Actions, rendering and board-surface controls. Fresh release-label gates also pass, including both engine builds, license checks and zero reported production dependency vulnerabilities; CI includes database access checks on both PRs and production deployment.
