# Auto3D 0.55.0 — Primary Products bottle profile editing

Primary Products 0.6.0; Packaging remains 1.10.4. Based on main after merged PR #90; not deployed.

Bottles now expose neck diameter, shoulder height, neck height and cap height in global mm/in units. Overall height continues to include the cap; the straight body uses the remaining height. The generated body/cap and illustrative profile use these values. Cans and pouches retain their existing controls.

Explicit profile inputs are finite/bounded, retain at least 20% height for the body, and keep the cap within the outside diameter. Old saved definitions without optional shape data retain the original proportional profile. Explicit shapes store absolute mm dimensions; reducing the overall envelope must still leave a valid profile.

Straight-body artwork zones adapt to the profile. Original label dimensions remain fixed; an incompatible shape change fails before draft/scene mutation, with a resize/remove message. Apply uses the existing atomic rebuild/history service, preserving object identity, transforms and duplicate isolation. Shape data survives file/recovery and selected-product reload. The existing strict `primary.configure` command exposes the same four-field shape object; catalogs are synchronized. `primary.inspect` reports effective profile dimensions, including derived straight-body height, even for legacy proportional bottles.

Research on primitive creation and add/subtract/intersect editing is in [primitive-solid-editing-research.md](primitive-solid-editing-research.md). It recommends a worker-based Manifold evaluation, reusable native primitives and persistent editable modifiers. This release adds no Boolean library or enabled Boolean UI. Clear glass, hollow walls, detailed threads, independent 3D draft preview and exact CAD/STEP authoring remain pending.

Validation: 791 application/module tests, 64 MCP tests, lint, independent Primary Products build and website/Pages builds pass. Chromium verifies all four shape fields, mm/in display, generated-product reload, identity-preserving rebuild and Undo, plus existing materials, artwork, module transitions and mobile layouts. No Boolean dependency or benchmark is included.
