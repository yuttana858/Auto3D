# Auto3D 0.97.0 — Live scale and automatic product placement

Packaging **1.18.0** / Primary Products **0.17.0** / Molded Pulp **0.3.0**.

Based on main `5c74f93145d0ffa5dedf9101189677e3776d8d83`, which includes merged PR #168. This development batch is not deployed.

## Manual controls

Dimension, shape, construction and label-mapping fields continue to update the selected Primary Products object after a brief typing pause, or immediately on Enter/blur. Uniform scale now works the same way and no longer needs Apply scale. Typing 125%, then 130%, produces 130% of the original editing size. It does not compound the two percentages. Selection, display-unit changes, Undo and external dimension edits reset the scale baseline to 100%.

Pending percentages are serialized and coalesced, with the latest value retained. Invalid values stay editable without changing the model. Each completed resize retains Undo, artwork scaling preferences, object identity, placement and edited materials. Selection and account/session checks prevent queued changes from reaching a different object. With no matching selected product, controls prepare the next generation.

## New model placement

New Primary Products, including catalog-card and agent generation, are placed beside existing models along world X. The first object keeps its normal origin. The gap is at least 10 mm or 10% of the new model's world width, whichever is larger, converted to the session's units.

Placement uses the current objects' full geometry bounds, including imported child transforms, rotation, nonuniform scale and hidden objects. Removed objects do not reserve space. Existing objects stay in place, and Undo/Redo restores the recorded new position. Live updates keep their original placement; they do not continually rearrange the scene.

This batch applies automatic placement to Primary Products. Standalone Packaging, imported files and fitted Auto Pack/pulp/accessory assemblies keep their existing placement behavior. An animated obstacle's current displayed pose is included when available; future animation poses are not reserved.

## Shared commands and validation

`primary.generate` and `primary.designs.generate` use the same placement path as the panel. `primary.scale` accepts optional `objectId` to reject a stale selection; its public relative factor range remains 0.1–10. Both command catalogs are regenerated from the registry.

Validation results are recorded in the PR and project log. The full browser release gate remains separate from focused development checks; draft/skipped workflows do not count as passing validation.
