# Auto3D 0.97.0 validation

Draft [PR #172](https://github.com/yuttana858/Auto3D/pull/172). Runtime and test commit: `ea53dd43bb0b7f317132e847e1d48ed771ceb3b8`, based on merged main `5c74f93`. Subsequent changes only record documentation/results.

Versions: Auto3D 0.97.0 / Primary Products 0.17.0 / Packaging 1.18.0 / Molded Pulp 0.3.0.

## Passed locally

- `npm run lint` and `npm run lint_mcp`.
- `npm test`: **1,179 passing**.
- `npm run test_mcp`: **73 passing**, with regenerated browser/MCP command catalogs.
- `npm run check_licenses`.
- `npm run build_dev` and `npm run build_website`.
- `node test/browser/primary-live-placement.mjs`: real app inputs change rendered geometry without creating another object; 125% then 130% uses one baseline; selecting an older model targets only that model; new generation clears rotated/scaled/transformed obstacles; Undo/Redo restores the recorded placement.
- `node test/browser/primary-live-panel.mjs`: live fields/scale, invalid-number and geometry validation messages, stale selection, coalesced edits, profile inputs, CAD entry controls and mobile overflow.
- `git diff --check`.

Unit tests cover scene-unit conversion, hidden/nested/animated obstacles, removed geometry, first-model anchoring, scale coalescing, failed updates and account/document replacement including reused saved object IDs. Browser checks run after the CPU tests to avoid software-renderer contention. The initial new browser harness stopped on the expected transient viewer-busy response; its bounded polling now retries only that response, and both checks passed afterward. An initial restricted test invocation could not bind its loopback fixture server; the complete permitted run passed.

Independent code review found and resolved nested UI actions clearing validation errors, and queued edits crossing a reopened session with identical object IDs.

## Remaining release gate

The full browser suite has not been run for this batch. The PR remains draft to avoid repeated Actions spending; skipped draft jobs are not passing validation. This candidate has not been deployed. Automatic placement is scoped to newly generated Primary Products; future animation poses are not reserved.
