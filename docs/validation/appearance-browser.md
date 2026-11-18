# CAD appearance browser evidence

## Browser full suite: FAIL

- Commit: `061b439f31f1910378abe7400593e252b9b23328`
- Started: 2026-11-18T14:37:22.131Z; took 71.0 min
- 89 passed, 1 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| account-storage | pass | 26 |
| accounts | pass | 5 |
| admin-controls | pass | 6 |
| modal-connection | pass | 16 |
| ai-creations | pass | 23 |
| ai-credentials | pass | 12 |
| ai-extended | pass | 46 |
| ai-progress | pass | 9 |
| animation | pass | 18 |
| array-spacing | pass | 21 |
| auth | pass | 9 |
| board-appearance | pass | 26 |
| board-appearance-controls | pass | 18 |
| board-array-buffers | pass | 40 |
| board-database | pass | 75 |
| board-panel-visibility | pass | 33 |
| board-toggle-stability | pass | 28 |
| cad-apply | pass | 29 |
| capture | pass | 21 |
| command-bar | pass | 9 |
| command-design | pass | 10 |
| corrugate-review | pass | 3 |
| decimal-inputs | pass | 14 |
| dimensions | fail | 31 |
| engineering-artwork | pass | 102 |
| engineering-landing | pass | 15 |
| engineering-prompts | pass | 60 |
| errorlogs-panel | pass | 9 |
| feedback | pass | 16 |
| fefco | pass | 73 |
| floor-shadow-compositing | pass | 2 |
| fold-actions | pass | 21 |
| fold-camera-fit | pass | 36 |
| format-libraries | pass | 44 |
| header-save | pass | 16 |
| landing-signin | pass | 21 |
| library-sharing | pass | 19 |
| lighting-isolation | pass | 2 |
| lighting-ui | pass | 27 |
| login-gate | pass | 23 |
| login-updates | pass | 16 |
| material-surface | pass | 86 |
| mcp-access | pass | 21 |
| mcp-consent | pass | 2 |
| messenger-ai-history | pass | 8 |
| messenger-people | pass | 17 |
| mini-presentation | pass | 9 |
| model-spec | pass | 25 |
| module-panels | pass | 31 |
| molded-pulp | pass | 410 |
| multiwall-glue | pass | 25 |
| packaging-cleanup | pass | 74 |
| packaging-effects | pass | 37 |
| packaging-fold-dimensions | pass | 178 |
| packaging-measurements | pass | 105 |
| packaging-module | pass | 72 |
| packaging-presets | pass | 149 |
| packaging-solid-folds | pass | 154 |
| packaging-thumbnail-generation | pass | 6 |
| popup-fonts | pass | 5 |
| preferences-recovery | pass | 35 |
| preview-context-lifecycle | pass | 65 |
| primary-contents | pass | 85 |
| primary-materials | pass | 54 |
| primary-products | pass | 545 |
| primary-profile | pass | 34 |
| primary-realism | pass | 96 |
| render-workspace | pass | 19 |
| rendercore-state | pass | 2 |
| rendering | pass | 24 |
| saved-rsc-materials | pass | 44 |
| scene-presentation | pass | 52 |
| selected-orbit | pass | 45 |
| session-cameras | pass | 13 |
| shadow-controls | pass | 21 |
| surface-relief | pass | 81 |
| transform-panel-move | pass | 24 |
| viewer-performance | pass | 1 |
| viewport-preferences | pass | 24 |
| viewport-quality | pass | 2 |
| workspace-commands | pass | 22 |
| workspace-editing | pass | 13 |
| workspace-optimization | pass | 20 |
| packaging-auto-pack | pass | 104 |
| packaging-auto-styles | pass | 101 |
| animation-video | pass | 40 |
| packaging-auto-pallet | pass | 119 |
| cad-conversion | pass | 43 |
| ai-image-dropzone | pass | 13 |
| packaging-accessories | pass | 79 |

The initial dimensions check lacked the Pages build at startup. The unchanged `node test/browser/dimensions.mjs` passed after `node tools/build_pages.mjs`; the final desktop/mobile `node test/browser/cad-conversion.mjs` passed with the 0.5.0 authored colored GLB and appearance command/UI assertions. No assertions or timeouts were relaxed.
