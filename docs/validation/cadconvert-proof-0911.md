# Auto3D 0.91.1 private reader proof — validation

Application 0.91.1 / Packaging 1.16.1 / Primary Products 0.15.0 / Molded Pulp 0.3.0. Native service 0.5.0, experimental proof adapter 0.1.0. Runtime PR #163; Cloud 3D Studio #24 (proof), #26 (failure classification), #27 (manual-only cleanup).

## Hosted release checks

- Reviewed head `fdb8b0c3d8253a82aee9567c8318d07357953717`, tree `f4eb32cda20914941464bb22078e5bd80e4c2093`. CI [44427952565](https://github.com/yuttana858/Auto3D/actions/runs/44427952565): validation and browser smoke passed.
- Runtime merge `4a769df484ad7b2b74bbc97057b1a8b00aacd0f6`. Deployment [44429356940](https://github.com/yuttana858/Auto3D/actions/runs/44429356940), job 135242438445: passed, including production version/bundle, landing/login, credential boundaries and live MCP discovery. The workflow confirmed served version 0.91.1 and that exact build.
- The normal hosted invocation passed 1,074 app/module tests, 73 MCP tests and 11 backend tests. Includes the new proof capability workerd test, existing conversion/modal runtime tests, owned-job/lease SQL, lint, licensing/audit, engine/website builds and MCP packaging.
- A redundant anonymous workspace HTTP probe could not reach the public app because this execution network's proxy returned a tunnel 403; it is not counted as a passed live probe. Production verification above ran from the trusted deployment runner.

## Local security and public geometry checks

Workerd checks passed: controller authentication, read-only streaming, fixed source length/hash, job/owner/origin/units/expiry binding, modified-source/account revocation, expired capabilities and denial of publication. No job writes occur in the proof path.

Initial 0.90.1 candidate: 1,064 app/module tests passed. After integrating main 0.91.0: 1,073 passed with one 2-second packaging-test timeout. A default isolated file run passed that test but hit another 2-second packaging timeout; the unchanged file passed all 16 tests with 10-second local headroom. Normal hosted `npm test` subsequently passed all 1,074 with its normal limits. Local MCP, backend, runtime, lint, licensing, production audit and website/Pages builds passed.

The native suite passed 98 tests (two optional public-build integrations skipped in that invocation); six targeted proof tests including both integrations passed separately. Pinned GNU and portable static-musl builds passed. The public reference passed source coverage, mesh closure and independent OpenCASCADE dimension/volume comparison, including all five explicit source units. Upstream bundled vendor appearance assets are excluded and finish inference is disabled.

## Actual private source proof

| Check | Public reference in Modal | Retained private source |
| --- | --- | --- |
| Transfer integrity | Passed | Passed |
| Required face coverage | Passed | Failed during tessellation |
| Closed mesh | Passed | Not run after rejection |
| Independent dimensions | Passed | Not run after rejection |
| Production fallback | Disabled | Disabled |

Hosted [44429856978](https://github.com/yuttana858/Cloud-3D-Studio/actions/runs/44429856978) completed the initial proof; [44431311677](https://github.com/yuttana858/Cloud-3D-Studio/actions/runs/44431311677) classified the failure as `mesh_face_failure`. A larger triangle cap alone does not address failed faces. These runs establish a working private transfer and evaluation path, not successful supplier conversion or a corrupt source file.

The original failed job remains at one conversion attempt, zero diagnostic attempts and its original expiry. Customer CAD, mesh intermediates and raw logs stayed inside private storage/temporary Modal directories. Public Actions logs contain fixed enum checks; the private project name and job identifier were checked absent. No customer CAD was downloaded to the execution workspace or Actions runner. The initial automatic request and push trigger have been removed; later private tests require an explicit job ID in a manual workflow. No new SDK subscription or billing-plan change.

## Broader local browser evidence

The initial standard-port invocation reached an older development server and is excluded. A subsequent snapshot initially retained an older compiled development bundle and is also excluded. The final isolated snapshot uses ports 18080/18082; all 411 production source files match the reviewed tree above, and only local URL/listen ports were changed in the browser harness. The served development bundle was verified as SHA-256 `38acb02221ec08b91d4181e01fe0d1b520dbd4d5aa9d9f26a13f57f26bd13be3`, including the current macro commands.

All **93 distinct checks passed across two complete shards and unchanged reruns**. The initial complete shards were 45/47 and 44/46; they are not described as clean single-run passes.

| Run | Passed | Failed | Notes |
| --- | --- | --- | --- |
| Full shard 1/2 | 45 | 2 | Artwork mid-wipe assertion; Molded Pulp 600-second limit |
| Full shard 2/2 | 44 | 2 | Missing Pages build for video fixture; missing MCP worker build for consent fixture |
| Animation video rerun | 1 | 0 | Rebuilt the expected Pages assets; test unchanged |
| MCP consent rerun | 1 | 0 | Rebuilt the expected worker assets; test unchanged |
| Quiet sequential artwork + Molded Pulp | 2 | 0 | No concurrent graphics tests; unchanged tests passed in 101 and 415 seconds |

No frontend logic or test assertions were changed to obtain these results. The initial parallel Molded Pulp pass had a 11,751 ms longest main-thread task; the quiet run observed 5,797 ms for Fine and 6,131 ms for Ultra. These are measurements under the software GPU, not a production performance guarantee. The earlier excluded shared-port/old-bundle attempts are setup failures and provide no release-validation credit.

The raw complete reports below retain their original `FAIL` labels and `unknown` Git field because the isolated snapshot has no Git metadata. The explicit source/tree comparison above binds their source to the reviewed release.

### cadconvert-proof-shard1.md

## Browser full suite (shard 1/2): FAIL

- Commit: `unknown`
- Started: 2026-11-19T00:21:22.707Z; took 60.7 min
- 45 passed, 2 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| account-storage | pass | 41 |
| admin-controls | pass | 7 |
| ai-credentials | pass | 20 |
| ai-image-dropzone | pass | 17 |
| animation | pass | 33 |
| array-spacing | pass | 21 |
| auth | pass | 9 |
| board-appearance | pass | 38 |
| board-array-buffers | pass | 58 |
| board-panel-visibility | pass | 65 |
| cad-apply | pass | 55 |
| capture | pass | 33 |
| command-design | pass | 79 |
| decimal-inputs | pass | 23 |
| engineering-artwork | fail | 27 |
| engineering-prompts | pass | 69 |
| feedback | pass | 22 |
| floor-shadow-compositing | pass | 2 |
| fold-camera-fit | pass | 61 |
| header-save | pass | 27 |
| library-sharing | pass | 27 |
| lighting-ui | pass | 60 |
| login-updates | pass | 37 |
| mcp-access | pass | 39 |
| messenger-ai-history | pass | 15 |
| mini-presentation | pass | 17 |
| model-spec | pass | 44 |
| molded-pulp | fail | 600 |
| multiwall-glue | pass | 54 |
| packaging-auto-pack | pass | 258 |
| packaging-auto-styles | pass | 134 |
| packaging-effects | pass | 43 |
| packaging-measurements | pass | 235 |
| packaging-presets | pass | 233 |
| packaging-thumbnail-generation | pass | 11 |
| preferences-recovery | pass | 51 |
| primary-contents | pass | 143 |
| primary-products | pass | 616 |
| primary-realism | pass | 100 |
| rendercore-state | pass | 2 |
| saved-rsc-materials | pass | 53 |
| selected-orbit | pass | 47 |
| shadow-controls | pass | 21 |
| transform-panel-move | pass | 26 |
| viewport-preferences | pass | 24 |
| workspace-commands | pass | 22 |
| workspace-optimization | pass | 21 |


### cadconvert-proof-shard2.md

## Browser full suite (shard 2/2): FAIL

- Commit: `unknown`
- Started: 2026-11-19T00:21:23.938Z; took 47.4 min
- 44 passed, 2 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| accounts | pass | 10 |
| ai-creations | pass | 33 |
| ai-extended | pass | 69 |
| ai-progress | pass | 11 |
| animation-video | fail | 34 |
| assign-facing | pass | 86 |
| autopack-sequence | pass | 120 |
| board-appearance-controls | pass | 26 |
| board-database | pass | 91 |
| board-toggle-stability | pass | 45 |
| cad-conversion | pass | 74 |
| command-bar | pass | 16 |
| corrugate-review | pass | 5 |
| dimensions | pass | 70 |
| engineering-landing | pass | 25 |
| errorlogs-panel | pass | 16 |
| fefco | pass | 103 |
| fold-actions | pass | 36 |
| format-libraries | pass | 66 |
| landing-signin | pass | 35 |
| lighting-isolation | pass | 3 |
| login-gate | pass | 30 |
| material-surface | pass | 111 |
| mcp-consent | fail | 1 |
| messenger-people | pass | 25 |
| modal-connection | pass | 39 |
| module-panels | pass | 51 |
| molded-pulp-export | pass | 29 |
| packaging-accessories | pass | 94 |
| packaging-auto-pallet | pass | 150 |
| packaging-cleanup | pass | 116 |
| packaging-fold-dimensions | pass | 271 |
| packaging-module | pass | 169 |
| packaging-solid-folds | pass | 211 |
| popup-fonts | pass | 7 |
| preview-context-lifecycle | pass | 116 |
| primary-materials | pass | 110 |
| primary-profile | pass | 51 |
| render-workspace | pass | 34 |
| rendering | pass | 35 |
| scene-presentation | pass | 71 |
| session-cameras | pass | 19 |
| surface-relief | pass | 107 |
| viewer-performance | pass | 2 |
| viewport-quality | pass | 3 |
| workspace-editing | pass | 19 |


### cadconvert-proof-quiet.md

## Browser full suite: PASS

- Commit: `unknown`
- Started: 2026-11-19T01:22:51.580Z; took 8.6 min
- 2 passed, 0 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| engineering-artwork | pass | 101 |
| molded-pulp | pass | 415 |


