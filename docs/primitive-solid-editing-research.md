# Primitive creation and Boolean editing — Auto3D research

Research date: 2026-11-09. Proposal, not an enabled feature. Current build: Auto3D 0.55.0 / Primary Products 0.6.0 / Packaging 1.10.4. This increment implements bottle profile controls; primitive/Boolean work below is the next track.

## Recommendation

Start with native primitive creation, then evaluate **Manifold (`manifold-3d`) in a dedicated lazy-loaded Web Worker** for committed union/subtraction/intersection. Keep an ordered editable modifier definition alongside the original Primary Products definition. Regenerate the base product and replay modifiers when its dimensions change. Do not overwrite a parametric bottle with an untracked baked mesh.

This is an architectural recommendation based on the source audit and upstream documentation; no comparative timing or memory benchmark has been run, no Boolean dependency has been installed, and no production Boolean capability is claimed.

## What already exists

- `source/engine/model/generator.js` supplies cuboid, cylinder, cone, sphere and Platonic-solid generators. These are not exposed as a complete editable scene-authoring workflow. Normalize origin/up-axis and units at the host boundary: existing cuboids start at a corner; Primary Products uses base-centered, Y-up, canonical mm.
- Three.js is already pinned in the application and offers box, sphere, cylinder, cone, capsule and torus geometry. Primitive creation does not itself require a CSG dependency. [Three.js geometry documentation](https://threejs.org/docs/#api/en/geometries/BoxGeometry).
- Primary bottle/can bodies, closures and ends are separate closed presentation solids. Their duplicated profile/UV-seam vertices require a topology-aware weld/import path before CSG; retain separate corner attributes for UVs/normals. Existing welded-edge tests are useful fixtures, not proof of a successful kernel import.
- Labels are separate, open surface patches. Exclude them from solid operands. Body, cap and end materials must remain distinct.
- `occt-import-js` is hosted for CAD import; it is not an exposed OpenCascade solid-modeling API. Adding Boolean modeling remains new work.
- Existing object transforms, selection, scene history, archive/recovery and agent commands provide host services to reuse.

## Candidate engines

| Candidate | Verified upstream properties | Auto3D assessment |
| --- | --- | --- |
| Manifold / manifold-3d | Apache-2.0; JS/WASM binding; solid mesh Boolean operations; requires manifold input; supports vertex properties and input-face/material provenance | Preferred first committed-result spike. Validate Auto3D conversion, attribute preservation and resource cleanup before adoption. |
| three-bvh-csg | MIT; directly consumes Three.js brushes, transfers selected attributes and supports material groups; upstream calls it experimental and documents numerical cases where results may fail to be manifold | Useful comparison candidate for interactive preview. Do not silently use it as a fallback for a failed committed solid. |
| OpenCascade.js | Browser/WASM port of the OCCT CAD kernel; documented Boolean modeling examples; website explicitly warns its guides describe a beta API | Consider later if exact CAD topology, analytic surfaces and a real STEP-authoring workflow become product requirements. Larger integration surface than this mesh-based milestone. |

Primary sources: [Manifold upstream](https://github.com/elalish/manifold), [Manifold JS/WASM binding](https://github.com/elalish/manifold/blob/master/bindings/wasm/README.md), [three-bvh-csg API and limitations](https://github.com/gkjohnson/three-bvh-csg), [OpenCascade.js overview](https://ocjs.org/docs/about), [OpenCascade.js Boolean example](https://ocjs.org/docs/getting-started/hello-world). License/package/transitive notices must be verified for the exact pinned artifact before shipping; this comparison adds no dependency. Upstream performance claims are not Auto3D benchmarks.

## Proposed user workflow

1. A **Shapes** tool opens the primitive panel. Start with box, cylinder, sphere and cone; add capsule/torus after the first gates pass.
2. Enter H × W × D or diameter/height in global display units. Create a standalone shape with a saved primitive definition; existing Move/Rotate/Scale and numeric edits work normally. Physical primitive edits rebuild geometry rather than accumulating opaque scale factors.
3. Select a Primary product and a target component, initially **Body**. Choose **Add shape**, **Subtract shape** or **Intersect**. A tinted operand appears with a grid/gizmo and axis locks; subtraction uses a contrasting cutter preview.
4. **Preview** computes without changing the saved scene; **Apply** commits one history step. Escape/Cancel discards the preview. Keep original operands available in the modifier stack, with visible/enabled controls and reorder/delete/edit actions.
5. Changing bottle dimensions replays modifiers in product-local mm. Default cutter placement remains a fixed local position/size. Future anchored placement can explicitly follow a named region; do not silently stretch cutters when the product grows.
6. Example: add a small cylindrical neck boss to a bottle body; subtract a rounded box to create a grip recess; subtract a cylinder from a can body. Clear-wall construction is a separate feature: a solid presentation bottle does not become a realistic hollow container merely because a recess is cut into it.

## Data and module boundary

Create an independent `modules/solid-modeling` package for primitive definitions, kernel adapters and neutral geometry; keep account, engine and DOM integration in host adapters/workspace. Primary Products supplies generated base components to this service, without importing the host or the solid module directly.

Proposed versioned authoring extension (not yet accepted by current archive validators):

```text
base: existing versioned Primary Products definition
modifiers[]:
  id, operation: union | subtract | intersect
  targetComponentId: body
  enabled
  primitive: type + bounded canonical-mm dimensions
  transform: product-local position/rotation/scale
  cutSurfaceMaterial: explicit saved material snapshot
kernel: name + pinned version + mesh tolerance/quality settings
bakedResult: ordinary engine geometry/materials for view-only portability
```

The kernel version is provenance, not a promise of identical topology across future kernel upgrades. Preserve operand definitions and a baked result. Validate migration explicitly before enabling this extension. Duplicate/array instances must detach authoring data on edit. Apply must retain the logical object ID, name, transforms, group placement and visibility; stale edge dimensions must be marked unavailable rather than retargeted to arbitrary new triangle indices. Semantic product dimensions should come from the authored envelope, not incidental CSG edge ordinals.

## Materials and artwork policy

- Preserve source-face material provenance and UVs on unchanged faces. Generate normals deliberately at new cuts; do not smooth across intended hard edges.
- Give newly exposed/cutter-generated faces an explicit material role and planar or cylindrical mapping. Texture-coordinate interpolation alone is not a label-layout solution.
- First Boolean release blocks a modifier that intersects an applied label region, with an actionable reason. Follow with true label clipping/reprojection. Do not leave label patches spanning removed geometry or quietly discard original artwork.
- Keep separate closures/ends out of body operations unless explicitly targeted. Adding a shape may produce disconnected solids; report component count, empty results and whether an operation made no change. Do not equate a multi-solid result with one connected manufacturable part.
- GLB exports the baked visible result/materials; `.auto3d` retains authoring and operands. STL cannot preserve materials or edit history. No new exact STEP/B-rep export claim.

## Worker and operation contract

Load worker and WASM from site-hosted pinned assets only when requested. Transfer bounded mesh buffers; use operation IDs, account/session guards and latest-preview cancellation. A worker timeout terminates/recreates the worker and frees its WASM heap; ordinary completion explicitly releases kernel-owned allocations. Avoid retaining preview geometry in history. One final commit performs geometry replacement, history and dirty-state updates after validation; failure restores the original.

Proposed initial engineering budgets to measure: one target component, 32 modifiers maximum, 200k input triangles, 500k output triangles and a 10-second preview ceiling. These are starting constraints, not measured performance guarantees. Record desktop/mobile cold WASM load, warm operation time, heap high-water mark, triangle growth and repeated-cancel behavior. Run single-threaded first; do not impose cross-origin isolation requirements without testing their effect on existing auth/assets.

## Delivery sequence and acceptance gates

| Increment | Deliverable | Gate |
| --- | --- | --- |
| S0 — conversion spike | Pin a candidate in an isolated experiment; import welded bottle/can body, run three operations, export neutral meshes with provenance | Correct signed volume, closed topology, units, UV/material retention, reported kernel errors and released allocations. Compare candidate engines on the same fixtures; record versions/device/browser. |
| S1 — editable primitives | Shapes panel, box/cylinder/sphere/cone, dimensions, transforms, appearance, save/reopen and Undo | Strict inputs; mm/in and scene-up-axis conversion; read-only/account guards; duplicate isolation; strict commands and macro coverage. |
| S2 — body Boolean workflow | Operand preview, body targeting, Add/Subtract/Intersect, editable stack, Apply/Cancel | No stale async mutation, one Undo, empty/no-op feedback, label-region guard, bounded result and no unexplained material loss. |
| S3 — resilient authoring | Regenerate/replay after product edits, file/recovery/Library and portable export | Reopen offline, edit any operand, Undo/Redo, arrays detach; source dimensions survive or become explicitly stale. |
| S4 — polish | Cut-face materials/UVs, label clipping, more primitive types, snapping/anchors | Matching preview/viewer/GLB; desktop/mobile interaction and measured performance budgets. |

Shared commands to introduce with implementation: `primitives.create/inspect/update`, `solids.preview/cancel/apply`, `solids.modifiers.inspect/update/remove/reorder`. Each must use strict bounded schemas, shared UI services and structured results; successful preview is not a committed edit. Existing object/history/Library commands remain the common workflow.

Fixtures: tangent and coplanar contact; cutter fully outside/inside; complete subtraction; touching/disconnected unions; very thin cuts; extreme accepted dimensions; negative/nonuniform scales; invalid/nonmanifold imports; UV seams/hard normals; component boundaries; labeled body collision; cancellation and memory growth. Reject unsupported inputs without scene mutation instead of automatically repairing or silently changing dimensions.
