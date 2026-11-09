# Auto3D 0.53.0 — source-linked model dimensions

Primary Products remains 0.5.0 (API 1); Packaging remains 1.10.4. Based on the merged material/artwork PR #86. Not deployed.

## Using the tool

The right tool strip now has **Dimensions · drag an edge**, after Scale. Activate it, press on a visible model edge or CAD segment, drag perpendicular to pull out an aligned bracket and release. Preview does not mutate the scene; release commits one undoable annotation. Existing bracket labels/lines can be dragged to reposition. Escape cancels the current preview and closes the tool. Normal model selection/manipulation and the older two-point Measure tool remain separate, mutually exclusive workflows.

The left **Meshes** panel is renamed **Layers**. After the first annotation, a **Dimensions** row appears above the model tree. Its eye button hides/shows the whole Dimensions layer; expanding the row lists values and delete buttons. Visibility, creation, movement and deletion support Undo/Redo. New dimensions reveal a previously hidden layer; Undo restores its former visibility.

## Authoritative geometry

Flat Packaging drawings use references to canonical path ID/segment index, independent of dashed score guides or presentation meshes. Values and endpoint positions follow edits to those actual CAD points. Placed dimensions also reflect object transforms; inspection exposes the original CAD length in mm separately from the placed length. This is an associative annotation, not a new driving CAD constraint: edit geometry through the existing CAD/Measurement services.

Other static 3D objects use canonical engine mesh edge endpoints and instance transforms. Coplanar triangulation diagonals are excluded; explicit line segments, boundary edges and creases of at least 25 degrees can be selected. Values are true 3D lengths rather than projected screen distances and update with transforms and compatible geometry changes. References retain object identity/local mesh ordinal, mesh name and topology fingerprint; CAD references track path size. Deleted/rebuilt incompatible references are marked unavailable rather than silently retargeted. Hidden source objects/parts hide their annotations, which return with the source/Undo.

Vertex-less analytic curves, radius/angle dimensions and articulated GPU/skeletal visual poses are not supported. Use a static model or the real flat CAD drawing; a folded visual preview does not masquerade as an edited CAD path. Imported tessellation supports feature-edge measurements but does not acquire parametric CAD constraints. Very dense meshes (over 200,000 triangles or one million vertices) require simplification before interactive edge extraction.

## Presentation and persistence

Annotations track the viewer camera and viewport. Bracket offset is stored in bounded CSS pixels for stable readability; it never changes the measured physical length. Paired opaque dark/light strokes and white-on-dark labels with a light border retain contrast against light/dark themes, model surfaces and image backgrounds. The overlay draws over scene surfaces instead of disappearing behind them.

The annotation data and layer visibility persist in `.auto3d` files and recovery. Model-only archives filter to selected source objects. Ordinary older files default to an empty visible layer. Annotation creation/edits enforce account, read-only, busy and session guards; stale drags are canceled across session/account changes. No backend, secret or database change is introduced.

These are viewport annotations; they are not baked into GLB/STL geometry or the existing canvas-only production render/export pipeline. Model insertion/merge workflows do not automatically remap annotation IDs to new objects. Those integration/export features are separate follow-ups.

## Agent services

Shared UI/command services: `dimensions.tool`, `dimensions.inspect`, `dimensions.edges` (paged canonical anchors and world endpoints), `dimensions.add`, `dimensions.offset`, `dimensions.delete`, `dimensions.layer.visible`. Schemas, numeric/string bounds, examples, mutation flags and app/MCP catalogs are synchronized. Reference anchors are validated before committing; up to 500 annotations are supported per session. Read-only sessions can display existing dimensions; saved-layer edits require an editable session.

Validation: 775 app/module tests, 64 MCP tests, 11 backend tests, application/MCP lint and website/Pages builds pass. Browser tests perform actual edge drags and existing-bracket repositioning on a 3D model, verify no preview mutation, layer eyes, scaling, units, Escape, deletion/Undo and mobile layout, and drag an actual unfolded FEFCO CAD line to a path-linked bracket. Dark/light and CAD screenshots were reviewed. Geometry tests exclude tessellation diagonals; reference tests cover CAD edits, stale topology, file/recovery, read-only denial and account/session cancellation. Macro tests resolve newly created annotation IDs into later edits. An existing 15-second folding audit timed out while Chromium was generating CAD in parallel, then passed in the sequential suite without increasing its timeout.

## Main integration after PR #87

Conflict resolution retains Auto3D 0.53.0, Primary Products 0.5.0 and main's Packaging 1.10.4. Both the new dimension commands and main's settled view.focus/view.fit/camera.activate behavior are preserved. Main's locally hosted format libraries, CSP and browser CI fixes remain intact. The dimensions browser test is now part of the CI browser list. Updated validation: 781 app/module tests, 64 MCP tests, 11 backend tests, both linters, engine/ESM/website/Pages builds, and the dimension plus Primary Products browser regressions pass.
