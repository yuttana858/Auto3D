# Auto3D 0.98.0 validation

Draft [PR #173](https://github.com/yuttana858/Auto3D/pull/173). Runtime and test commit: `edf33a214f4ebdf500fd35ec8d7394ed956d679a`, based on merged main `42be7df`. Subsequent changes only record documentation and the review image.

Versions: Auto3D 0.98.0 / Primary Products 0.17.0 / Packaging 1.18.0 / Molded Pulp 0.3.0.

## Passed locally

- `npm run lint` and `npm run lint_mcp`.
- `npm test`: **1,205 passing**.
- `npm run test_mcp`: **73 passing**, including synchronized browser and MCP command catalogs.
- `npm run check_licenses`.
- `npm run build_dev` and `npm run build_website`.
- `node test/browser/selection-groups.mjs`: actual rectangle dragging, additive/subtractive selection, Escape cancellation without moving the camera, normal selection/context menu after leaving the tool, whole-group selection, toolbar and keyboard grouping, strict shared commands, array ungrouping and Undo/Redo.
- `node test/browser/workspace-editing.mjs`: context-menu consistency, orbit suppression, existing controls and inch/mm dimension editing.
- `node test/browser/workspace-commands.mjs`: clean startup, shared context tools, 4 × 4 × 6 array feedback/Undo, saved macros and desktop/mobile module panels.
- `git diff --check`.

Unit coverage includes perspective/orthographic projection, clipping at camera planes, hidden and occluded geometry, nested transforms, pointer cancellation, stale account/document/model guards, flat-group membership, portable archive round trips, preservation of unrelated metadata and history rollback.

Independent review caught an inactive rectangle listener cancelling unrelated navigation clicks. The fix cancels the click detector only for a drag owned by the rectangle tool, with unit and real-browser regression coverage. The first full run also caught the command-name heuristic treating `selection.set` as a document mutation; the contract now explicitly recognizes that selection remains available in read-only sessions, matching `object.select` and `selection.clear`. The complete final suite passed.

Browser checks run sequentially after the CPU test suite to avoid software-renderer contention. [Review image](../assets/selection-tools-0980/group-selection.png) shows two grouped models and a third independent model in the actual app.

## Remaining release gate

The full browser suite has not been run for this batch. The PR remains draft to consolidate Actions spending; skipped draft jobs are not passing validation. This candidate has not been deployed.
