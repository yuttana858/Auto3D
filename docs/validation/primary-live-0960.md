# Primary Products 0.96.0 validation

Draft PR [#168](https://github.com/yuttana858/Auto3D/pull/168). Auto3D 0.96.0 / Primary Products 0.16.0 / Packaging 1.18.0 / Molded Pulp 0.3.0. Not deployed.

## Source and assets

- Base: deployed main `66320103aacccb9e3997c58a9c8312f327250f55`.
- Feature implementation: `741bb6d4ae3e6b4725cc7c91edde5351c6137f8b`.
- Existing profile/Cap style fixture updates: `419c29f` (tests only).
- CAD layout runtime: `e7c7f6bb6870c17448bf81636cfa23bacd58c497`. This adds the compact CAD color row and ensures nested board-only fields actually stay hidden in label mode. Its strengthened UI fixture uses production CSS and checks desktop/mobile sizing.
- Material/browser fixtures: `a28d72ab8bf09bebcb9b410bbc1b5ba22f4c9e13`. These wait for automatic label updates, inspect material indices used by the current model, and add a clear-glass studio view. No runtime change.

The development server watches source files. The shared CAD and selected-orbit regressions loaded the CAD-layout runtime assets; an explicit rebuild produced identical hashes for main JS/CSS and both changed module JS/CSS bundles. The earlier profile/contents checks used fixed Pages assets from `741bb6d`; the final materials/realism run uses refreshed Pages assets. Those results are retained below. A subsequent visual review found and fixed the grid-specific refraction omission described next.

## Clear-glass visual correction

Final runtime `d55f4039606357e92f5d3fd4ddf3b12d26b29bec` keeps the grid in Three's opaque transmission buffer using custom alpha blending, preserving its 0.65 opacity and depth behavior. Previously the transparent grid was excluded from that buffer and then occluded by the glass depth, making empty glass look opaque against a plain background. HDRI/background and opaque-checker controls confirmed that the bottle's geometry and material already transmitted real scene detail.

The before/after diagnostic measured the same interior bottle region: zero changed pixels for grid on/off before the fix, 2,329 pixels with RGB delta greater than two after the fix (maximum delta 21), and zero changed pixels for an opaque-bottle control. The approved code changes only grid compositing, not glass opacity or geometry. Final fixture `38b0fc36bb22a20dd75c9282ca503e45cc79ff88` adds grid on/off and opaque-control pixel assertions to the existing integration test using actual application updates.

## Local checks

| Check | Result |
| --- | --- |
| Full app/module Mocha suite | Final serial run: 1,158 passed on `0da13cc` (runtime `d55f403`); original full run also passed on `741bb6d` |
| MCP suite | 73 passed on `741bb6d` |
| ESLint | Passed after the final grid-rendering change |
| License check | Passed; no new dependencies |
| Generated command catalogs | Match the registry |
| Independent Packaging/Primary Products builds | Passed |
| Engine module and TypeScript declarations | Passed |
| Production engine, website and Pages builds | Passed after the final grid-rendering change |

The complete 100-test browser release gate and hosted release CI were not run for this draft. Skipped draft jobs are not test passes. Merge/deployment still needs the release gate in `docs/actions-cost-control.md`.

## Browser results

The reports below preserve original outcomes. The runner labels its selected subset as “full suite”; the command used `--suite full --only ...`, so this is a focused set, not all 100 tests.

Initial actual-app fixture attempts picked an old unused material by name or assumed optional `bottleShape`/`artwork` were already present. They were corrected to inspect active rendered material indices and await committed optional fields. The first completed five-check run passed. Visual inspection then found the nested hidden-field and color-button layout defects, fixed in `e7c7f6b`.

The existing batch's materials/realism failures were caused by their old staged-import assumption: `primary.inspect` can return the documented busy response while the new automatic application is rebuilding the model. The fixtures now retry only that exact busy response, remove redundant Apply actions, and verify the current object's materials. Other errors remain failures.

## Browser full suite: PASS

- Commit: `741bb6d4ae3e6b4725cc7c91edde5351c6137f8b (with uncommitted changes)`
- Started: 2026-11-19T15:19:29.286Z; took 4.8 min
- 5 passed, 0 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| primary-live-integration | pass | 272 |
| primary-live-panel | pass | 5 |
| primary-label-cad | pass | 2 |
| primary-label-cad-ui | pass | 3 |
| primary-label-vectors | pass | 1 |


## Browser full suite: FAIL

- Commit: `e7c7f6bb6870c17448bf81636cfa23bacd58c497 (with uncommitted changes)`
- Started: 2026-11-19T15:25:29.650Z; took 12.4 min
- 5 passed, 2 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| primary-profile | pass | 151 |
| primary-contents | pass | 213 |
| primary-materials | fail | 40 |
| primary-realism | fail | 20 |
| cad-apply | pass | 56 |
| can-collar | pass | 172 |
| selected-orbit | pass | 87 |


## Browser full suite: PASS

- Commit: `a28d72ab8bf09bebcb9b410bbc1b5ba22f4c9e13 (with uncommitted changes)`
- Started: 2026-11-19T15:39:56.901Z; took 9.2 min
- 4 passed, 0 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| primary-live-integration | pass | 290 |
| primary-label-cad-ui | pass | 4 |
| primary-materials | pass | 79 |
| primary-realism | pass | 172 |


## Browser full suite: PASS

- Commit: `0da13ccbca9eb9469b40e11f34753093a430d548 (with uncommitted changes)`
- Started: 2026-11-19T15:54:38.322Z; took 7.0 min
- 2 passed, 0 failed, 0 not run

| Test | Result | Seconds |
| --- | --- | ---: |
| primary-live-integration | pass | 416 |
| floor-shadow-compositing | pass | 3 |

## Final browser verdict and visual evidence

**13 distinct focused browser checks passed** across the retained runs, including the two corrected legacy fixtures. The post-grid integration finished in 416 seconds within its unchanged 600-second limit; floor-shadow compositing also passed. The final application test measured 741 changed interior pixels (maximum delta 14) with clear glass, versus zero with an opaque bottle. Original failed reports are retained above and are not counted as passes.

The committed [glass/label capture](../assets/primary-products-0960/glass-labels.png) shows the grid through the glass wall while the body and cap labels stay opaque. The [cap CAD capture](../assets/primary-products-0960/cap-label-cad.png) shows the shared cut/artwork editor with the corrected controls. These are local Chromium fixtures, not production screenshots.

## Unit timing investigation

The first post-grid full unit run had 1,157 passes and one default two-second Auto Pack audit timeout. An isolated cold run also exceeded that default; with an explicit ten-second test budget it passed in 3.326 seconds. Commit `0da13ccbca9eb9469b40e11f34753093a430d548` changes only this test's budget: it builds two crease rigs and checks seven poses, and all assertions remain intact. A subsequent parallel run had four additional two-second timeouts while the software GPU was active (board appearance, packaging engineering and fold dimensions). No assertions failed. The final normal `npm test` run with Chromium closed passed all 1,158 tests in about one minute. No additional test budgets or assertions were changed. Logs for the earlier timeouts are retained at `/tmp/primary-live-grid-unit.log` and `/tmp/primary-live-final-complete-unit.log`; the clean result is `/tmp/primary-live-serial-final-unit.log`.
