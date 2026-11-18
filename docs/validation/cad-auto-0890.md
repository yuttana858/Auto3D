# Auto3D 0.89.0 local release validation

Code commit: `049b6b0e5bb929d4407f808031367afeb55c4654`, tree `e9f5c0f5600395ff1a4d0e06b11dbf209a4fc4fc`. PR #154. Auto3D 0.89.0 / Packaging 1.15.0 / Primary Products 0.15.0 / Molded Pulp 0.3.0; native Cloud 3D Studio stays 0.5.0.

- 1,049 application/module tests passed on the integrated tree; 73 MCP tests passed, including real Workers-runtime isolation/commands. Both lint targets passed.
- Modal bridge, CAD transfer and strict diagnostic workerd tests passed. Alternate backend: 11 tests passed. Production license check and dependency audit passed (zero vulnerabilities; dependency versions are unchanged).
- Engine, engine module, website and Pages builds passed. The engine module emits existing external-import notices for Three.js HDRLoader/Reflector; the website/Pages build includes its resolved bundle as before.
- All 91 distinct browser checks passed across the complete two-shard run and four unchanged isolated reruns. Initial reports remain FAIL below: 87 passed and four timing/timeout failures. No skipped tests or weakened assertions are counted as passing.
- Initial failures: `engineering-artwork` missed the fade window; `molded-pulp` reached the 600-second limit after its fine-detail assertion passed; `primary-contents` timed out waiting for the profile panel; `packaging-auto-pack` observed a completed fold before pausing mid-way. All four passed unchanged when run sequentially without competing browser renders. The rerun took 11.2 minutes. Run renderer-sensitive checks sequentially on this four-core software-renderer workspace to avoid resource contention.
- The integrated desktop/mobile CAD check passed: Parasolid aliases open the converter; actual units trigger submission; measured progress is retained; the finished colored GLB adds with the panel closed; subsequent STEP conversion starts on selection; no manual save/Add; Undo/Redo and geometry-free diagnostics remain intact. Uses public synthetic files and the actual native 0.5.0 calibration GLB, with a mocked owned API. This verifies the client workflow, not acceptance of every private supplier file. The unchanged native 0.5.0 live pipeline evidence is in release-0871.md.
- Workspace reconnections did not terminate the original runners. No customer CAD was downloaded into the agent workspace. No provider, credential, SQL migration or paid SDK was changed.

Commands: shared local dev/Packaging servers, then `node tools/run_browser_suite.mjs --suite full --shard 1/2 --keep-going --report work/cad-auto-browser-full-1.md` and shard `2/2`; rerun with `--only engineering-artwork,molded-pulp,primary-contents,packaging-auto-pack --keep-going --report work/cad-auto-browser-reruns.md`. Reports below are copied verbatim.

## Browser full suite (shard 1/2): FAIL

- Commit: `049b6b0e5bb929d4407f808031367afeb55c4654`
- Started: 2026-11-18T18:10:39.732Z; took 46.2 min
- 44 passed, 2 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| account-storage | pass | 43 |
| admin-controls | pass | 8 |
| ai-creations | pass | 27 |
| ai-extended | pass | 77 |
| animation | pass | 35 |
| auth | pass | 19 |
| board-appearance-controls | pass | 27 |
| board-database | pass | 95 |
| board-toggle-stability | pass | 50 |
| capture | pass | 29 |
| command-design | pass | 15 |
| decimal-inputs | pass | 28 |
| engineering-artwork | fail | 83 |
| engineering-prompts | pass | 62 |
| feedback | pass | 24 |
| floor-shadow-compositing | pass | 3 |
| fold-camera-fit | pass | 60 |
| header-save | pass | 29 |
| library-sharing | pass | 34 |
| lighting-ui | pass | 62 |
| login-updates | pass | 28 |
| mcp-access | pass | 30 |
| messenger-ai-history | pass | 17 |
| mini-presentation | pass | 18 |
| module-panels | pass | 41 |
| molded-pulp-export | pass | 28 |
| packaging-cleanup | pass | 97 |
| packaging-fold-dimensions | pass | 242 |
| packaging-module | pass | 115 |
| packaging-solid-folds | pass | 241 |
| popup-fonts | pass | 11 |
| preview-context-lifecycle | pass | 99 |
| primary-materials | pass | 74 |
| primary-profile | pass | 75 |
| render-workspace | pass | 48 |
| rendering | pass | 46 |
| scene-presentation | pass | 83 |
| session-cameras | pass | 22 |
| surface-relief | pass | 126 |
| viewer-performance | pass | 2 |
| viewport-quality | pass | 3 |
| workspace-editing | pass | 19 |
| packaging-auto-pack | fail | 154 |
| animation-video | pass | 95 |
| cad-conversion | pass | 80 |
| packaging-accessories | pass | 161 |

## Browser full suite (shard 2/2): FAIL

- Commit: `049b6b0e5bb929d4407f808031367afeb55c4654`
- Started: 2026-11-18T18:10:39.719Z; took 59.1 min
- 43 passed, 2 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| accounts | pass | 11 |
| modal-connection | pass | 33 |
| ai-credentials | pass | 20 |
| ai-progress | pass | 12 |
| array-spacing | pass | 27 |
| board-appearance | pass | 42 |
| board-array-buffers | pass | 40 |
| board-panel-visibility | pass | 51 |
| cad-apply | pass | 50 |
| command-bar | pass | 21 |
| corrugate-review | pass | 15 |
| dimensions | pass | 66 |
| engineering-landing | pass | 23 |
| errorlogs-panel | pass | 13 |
| fefco | pass | 93 |
| fold-actions | pass | 28 |
| format-libraries | pass | 56 |
| landing-signin | pass | 37 |
| lighting-isolation | pass | 5 |
| login-gate | pass | 48 |
| material-surface | pass | 136 |
| mcp-consent | pass | 3 |
| messenger-people | pass | 23 |
| model-spec | pass | 42 |
| molded-pulp | fail | 600 |
| multiwall-glue | pass | 53 |
| packaging-effects | pass | 67 |
| packaging-measurements | pass | 241 |
| packaging-presets | pass | 222 |
| packaging-thumbnail-generation | pass | 12 |
| preferences-recovery | pass | 54 |
| primary-contents | fail | 42 |
| primary-products | pass | 818 |
| primary-realism | pass | 104 |
| rendercore-state | pass | 2 |
| saved-rsc-materials | pass | 44 |
| selected-orbit | pass | 43 |
| shadow-controls | pass | 20 |
| transform-panel-move | pass | 23 |
| viewport-preferences | pass | 23 |
| workspace-commands | pass | 21 |
| workspace-optimization | pass | 20 |
| packaging-auto-styles | pass | 100 |
| packaging-auto-pallet | pass | 129 |
| ai-image-dropzone | pass | 12 |

## Browser full suite: PASS

- Commit: `049b6b0e5bb929d4407f808031367afeb55c4654`
- Started: 2026-11-18T19:10:47.284Z; took 11.2 min
- 4 passed, 0 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| engineering-artwork | pass | 91 |
| molded-pulp | pass | 400 |
| primary-contents | pass | 83 |
| packaging-auto-pack | pass | 99 |

## Hosted release verification

PR #154 merged as `6bdb3c321cfcf9f97bf29739fdd521969e44cba6` (tree `3565dee68d2fd8e7f1b811a79e4a7b6c48bb0b99`, only validation documentation added after the tested code). [CI 44380198211](https://github.com/yuttana858/Auto3D/actions/runs/44380198211) passed both validation and the 11-check browser smoke job. [Production deployment 44381827086](https://github.com/yuttana858/Auto3D/actions/runs/44381827086), attempt 1 / job 135075871425, passed all steps, including the actual served version and asset hashes, landing/login routes, credential authentication boundary and live MCP discovery/authentication. Auto3D 0.89.0 is live. No native image, database migration or provider/SDK credentials changed.
