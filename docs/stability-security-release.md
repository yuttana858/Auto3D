# Stability and security candidate: Auto3D 0.35.0 / Packaging 1.5.0

Prepared 2026-10-11 from main `5ecde44` (PR #34). Packaging keeps version 1.5.0 for this unmerged candidate; catalog illustrations and feedback are updated. The application candidate is [PR #35](https://github.com/yuttana858/Auto3D/pull/35), pending review/merge/deployment; the narrow database permission fix was staged, applied and verified independently.

## Completed

- Top-bar Save appears immediately before Library and opens the existing account-default save dialog. `ui.save` supports optional account/file destination; its existing file default is retained.

- Share metadata and legacy share creation/verification RPCs are service-role-only. The migration explicitly removes table and column grants and obsolete policies. PostgreSQL 17 staging checks actual anon/authenticated denials and service-role creation plus correct/wrong code verification. Live read-only role tests and effective privilege checks confirm browser denials and retained service access. No production test shares or user rows were created.
- Share request bodies are bounded to 4 KB with strict field/type checks. PIN link creation fails before database writes when protection readiness is missing. Upstream logs omit query strings. Account/session-gated Pages access is retained; this release does not enable anonymous or PIN sharing.
- fflate 0.8.3 resolves GHSA-px8p-9vwx-vf98. Production audits now fail at moderate severity, with zero known findings in the candidate.
- Preferences has Auto/Fast/Quality display modes, persisted per account and available through strict shared-service commands. Older account records default to Auto. Auto uses DPR ≤2 idle and DPR ≤1 during camera movement/dragging, restoring idle quality after 250 ms. Camera event draws coalesce per animation frame. Quality uses native DPR; Fast uses DPR ≤1.
- Authoritative geometry/textures are unchanged. Saves, exports and PNG rendering retain originals; display DPR does not change requested PNG dimensions. No polygon Apply/automatic decimation occurs.
- Transparent double-sided shadow caster/floor materials render in a single pass. The 80,000-triangle probe reduces shadow-mode submitted triangles from 240,004 to 160,002, and shadow+reflection from 480,010 to 320,006. Opaque model pixels are unchanged by shadow controls. Draw counters are deterministic; the probe is not an FPS claim for user hardware.
- Deploy-on-main validates lint, licenses, moderate production audit, unit and backend tests before publishing. The mini-viewer joins asset hashes, cache-versioned HTML and release verification. The intentional multi-style FEFCO generation test gets 15 seconds; other default test timeouts remain unchanged.

## Validation

- 553 unit/module tests pass with the normal npm test command; 11 backend tests pass.
- Lint, licenses, production dependency audit, website/Pages and both engine builds pass. Engine module build retains its existing external Three.js-addon warnings.
- Chromium: single-pass floor capture draw counts, metallic fill, opaque model/shadow isolation, injected capture-failure restoration and shadow-inclusive tiled PNG agreement pass.
- Chromium: 200 camera updates coalesce into one display frame, movement/idle DPR transitions pass, final PNG pixels are identical in Fast and Quality, and model geometry stays identical.
- Compiled Pages artifact: desktop/mobile selector, preference save/reload/account isolation and sign-in/logout UI tests pass. Release verifier checks main/mini/Packaging HTML and asset identities.
- Security advisors: server-only RLS tables intentionally have no browser policies; leaked-password protection remains a configuration warning. See https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

## Follow-up

PIN-throttling SQL and server readiness configuration still require a separate tested rollout. Do not enable the flag merely because legacy grants are now closed. Stage request concurrency/lockout/expiry tests and improve token/account-level abuse limits before enabling it. SMTP and Entra remain separate account-system work.

Static floor-mask caching, non-destructive preview LOD/instance sharing and GPU profiling on representative large scenes remain planned. An LOD implementation must retain original scene data and restore final-quality geometry/effects for every render, including cancellation/failure. Existing user-triggered polygon Apply is an authoring mutation and must not implement automatic preview quality.

Additional audit follow-up: mini-viewer initialization/conversion error overlay and retry cleanup, restrictive CSP rollout, 16K memory stress tests. No claim of a completed penetration test or sustained frame rate on user hardware is made.

October 13 UI follow-up in PR #35: top-bar Save before Library, unit-aware W/L/H array gaps (including previews/alternating layers), distinct OSC/FOL overlap thumbnails, inline box progress/errors and duplicate-click protection. The supplied inch defaults are valid. A clean-scene browser probe confirms generation; failure with the user's existing scene still needs verification after deployment. Texture-load redraws coalesce through the viewer request queue.
