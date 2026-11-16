# Auto3D 0.72.0 — add several AI models at once, Mesh dropdown in Details

Primary Products remains 0.15.0, Packaging remains 1.10.7 and Molded Pulp remains 0.1.0. Based on main after #130 (0.71.0).

## Change

- **Add several models at once.** When creations are checked in Latest creations, the selection bar has **Add selected** (adds every checked 3D model to the current session) and **New session** (opens them together in one new session tab). Checked images are skipped and reported; the buttons are disabled when no checked item is a 3D model. One message over the main viewer tracks the batch: "Downloading 2 of 3 · …", then "Added 3 models to the session". If one model fails, the message reports how many were added before the error.
- **Mesh dropdown in Details.** Format, Vertices, Lines and Triangles, and the **Optimize polygons…** button, now sit in a collapsible **Mesh** row. It is closed by default and its summary shows the format and triangle count, for example *Mesh · SESSION · 29,355 triangles*. The open or closed state is kept while you select other objects. The summary updates when the session editor recounts an edited object.

## Agent commands

New:
- `ai.creations.import { ids, target : current | new }` adds several creations in one batch.
- `ui.details.mesh { open }` opens or closes the Mesh dropdown.

## Validation

- Unit tests cover the batch add: order, skipped images, a single new session, and a partial failure that reports the models already added.
- The browser test `ai-creations.mjs` now also covers:
  - **Add selected** with a model, a model and an image (2 added, image skipped);
  - `ai.creations.import` with target `new` (one new tab with both models);
  - the closed Mesh dropdown with its triangle summary, and opening and closing it with `ui.details.mesh`.
- `workspace-optimization.mjs` now opens the Mesh dropdown before clicking **Optimize polygons…**, which is inside it. It failed before that change and passes after it.
