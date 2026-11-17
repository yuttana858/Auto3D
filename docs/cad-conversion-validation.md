# CAD conversion release validation — Auto3D 0.79.0

Code tree: `7a6e28df82d017e1b4c3a6ced19e47cf4da85da3` (GitHub source commit `c0ce8b67377060d857d5625e043d8af587e8575a`), with documentation-only profile record `19b273d2f7bed34afef2d24fbd878e1dc0babfe0`. Includes main through #140 (`751f03f`). Packaging 1.12.0 / Primary Products 0.15.0 / Molded Pulp 0.1.0.

- 970 application/module tests pass with the normal timeout (49 seconds in the final quiet run). A preceding run under concurrent software rendering hit two 2-second timeouts; both passed on isolated rerun, and the complete final run passed without changing assertions or timeouts.
- 72 MCP tests, application/MCP lint, backend tests, production license checks, zero-vulnerability production audit and engine/module/website/Pages builds pass.
- Actual workerd checks pass for server-only Vault authentication, credentialed-redirect refusal, known-length R2 streams, SHA-256 enforcement, immutable replay, capability authorization, account revocation and complete-manifest publication.
- Hosted Supabase service-role fixtures pass ownership, idempotency, quotas, single-claim, superseded-attempt, null-lease, cancellation and retry-budget checks. Every fixture write rolled back; browser table/function privileges are denied.
- Cloud 3D Studio 0.3.0 live native/gateway proof passed in run 44131313665. The 0.3.1 controller/live-canary follow-up passes 52 local tests; hosted canary is tracked separately.

## Browser coverage

The initial full run recorded 85 passed / 1 startup-splash timeout. The unchanged four-style folding test passed on isolated rerun (152 s), as did the updated AI progress flow. The new Image to 3D drop-zone test passed separately after integrating main. The combined coverage below includes every currently declared full-suite test. Initial checks preceded portions of main integration; targeted checks cover the changed AI/Auto Pack/CAD paths afterward. The existing Modal credential desktop/mobile checks also pass separately.

87 distinct full-suite checks covered, with a passing result for every check.

| Check | Final result | Seconds |
| --- | --- | ---: |
| account-storage | pass | 27 |
| accounts | pass | 6 |
| admin-controls | pass | 6 |
| modal-connection | pass | 17 |
| ai-creations | pass | 21 |
| ai-credentials | pass | 12 |
| ai-extended | pass | 47 |
| ai-progress | pass | 9 |
| animation | pass | 19 |
| array-spacing | pass | 20 |
| auth | pass | 11 |
| board-appearance | pass | 33 |
| board-appearance-controls | pass | 19 |
| board-array-buffers | pass | 27 |
| board-database | pass | 59 |
| board-panel-visibility | pass | 34 |
| board-toggle-stability | pass | 28 |
| cad-apply | pass | 28 |
| capture | pass | 21 |
| command-bar | pass | 9 |
| command-design | pass | 10 |
| corrugate-review | pass | 3 |
| decimal-inputs | pass | 14 |
| dimensions | pass | 45 |
| engineering-artwork | pass | 102 |
| engineering-landing | pass | 15 |
| engineering-prompts | pass | 46 |
| errorlogs-panel | pass | 9 |
| feedback | pass | 16 |
| fefco | pass | 77 |
| floor-shadow-compositing | pass | 2 |
| fold-actions | pass | 21 |
| fold-camera-fit | pass | 40 |
| format-libraries | pass | 45 |
| header-save | pass | 19 |
| landing-signin | pass | 22 |
| library-sharing | pass | 18 |
| lighting-isolation | pass | 3 |
| lighting-ui | pass | 28 |
| login-gate | pass | 24 |
| login-updates | pass | 16 |
| material-surface | pass | 87 |
| mcp-access | pass | 22 |
| mcp-consent | pass | 2 |
| messenger-ai-history | pass | 10 |
| messenger-people | pass | 17 |
| mini-presentation | pass | 10 |
| model-spec | pass | 26 |
| module-panels | pass | 32 |
| molded-pulp | pass | 68 |
| multiwall-glue | pass | 26 |
| packaging-cleanup | pass | 104 |
| packaging-effects | pass | 38 |
| packaging-fold-dimensions | pass | 183 |
| packaging-measurements | pass | 113 |
| packaging-module | pass | 75 |
| packaging-presets | pass | 159 |
| packaging-solid-folds | pass | 152 |
| packaging-thumbnail-generation | pass | 7 |
| popup-fonts | pass | 5 |
| preferences-recovery | pass | 42 |
| preview-context-lifecycle | pass | 108 |
| primary-contents | pass | 87 |
| primary-materials | pass | 58 |
| primary-products | pass | 569 |
| primary-profile | pass | 35 |
| primary-realism | pass | 107 |
| render-workspace | pass | 19 |
| rendercore-state | pass | 2 |
| rendering | pass | 25 |
| saved-rsc-materials | pass | 46 |
| scene-presentation | pass | 52 |
| selected-orbit | pass | 44 |
| session-cameras | pass | 12 |
| shadow-controls | pass | 21 |
| surface-relief | pass | 89 |
| transform-panel-move | pass | 24 |
| viewer-performance | pass | 2 |
| viewport-preferences | pass | 24 |
| viewport-quality | pass | 2 |
| workspace-commands | pass | 21 |
| workspace-editing | pass | 14 |
| workspace-optimization | pass | 20 |
| packaging-auto-pack | pass | 47 |
| packaging-auto-pallet | pass | 131 |
| cad-conversion | pass | 30 |
| ai-image-dropzone | pass | targeted |
