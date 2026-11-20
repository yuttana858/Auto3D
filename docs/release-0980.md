# Auto3D 0.98.0 — Rectangle selection and grouping tools

Primary Products **0.17.0** / Packaging **1.18.0** / Molded Pulp **0.3.0** are unchanged. Draft [PR #173](https://github.com/yuttana858/Auto3D/pull/173), based on main `42be7df70b0537a235aa999e2c50a761ea682364` (merged PR #172). This candidate is not deployed.

## Select multiple objects

The tool strip and context menu add **Rectangle select (B)** beside Select. Drag a rectangle with the left mouse button to select intersecting object bounds. Shift/Ctrl adds to the selection; Alt subtracts. Escape cancels a drag and closes the tool. Normal clicks still select objects, and right-drag orbit, wheel zoom and Space-pan remain available.

Selection uses projected bounds, including objects behind other objects. Hidden geometry is excluded from the hit test. A hit on a group member selects the whole group, including its hidden members; the group's visibility is not changed. The rectangle uses a cyan outline with light/dark contrast. It cancels safely if the camera, viewport, document, account or displayed models change during a drag.

## Group and ungroup

**Group (Ctrl+G)** and **Ungroup (Ctrl+Shift+G)** are available in the tool strip, context menu and object list. Group operates on whole existing groups so no partial memberships are left behind. Groups use the existing single-level model: grouping several groups combines their members into one group. Ungroup removes all group metadata from all members and keeps every object in place.

**Ungroup array** sits beside Array and also appears in the object list and context menu. It removes grouping from the selected arrays, making copies independently selectable. It preserves copies, transforms, materials, labels and animation tracks, and leaves ordinary groups unchanged. Existing legacy array names remain recognized, while an explicitly ordinary group named “Can array” is treated as an ordinary group.

Group changes have one Undo step and restore group metadata and selection on Undo/Redo. Group membership continues to save in portable sessions. Group mutation is unavailable in read-only or busy sessions.

## Agent commands

- `selection.set`: replace/add/subtract a list of object IDs, expanding groups by default.
- `selection.rectangle.mode` and `selection.rectangle.inspect`: control and inspect the interactive tool.
- `selection.rectangle`: select through normalized viewport coordinates `x1`, `y1`, `x2`, `y2` in 0–1, with replace/add/subtract and optional `expandGroups: false` for individual members.
- `object.group` and `object.ungroup`: existing commands now use whole-group transactions.
- `object.array.ungroup`: dissolve only selected array groups.

UI and commands share the same selection/grouping services. Both generated command catalogs are synchronized. Validation and release-gate status are recorded in [the validation record](validation/selection-tools-0980.md), PR and project log.

## Review image

[Two selected models grouped in the main viewer](assets/selection-tools-0980/group-selection.png), captured from the real browser regression.
