# Primary Products geometry increment — module 0.2.0

Stack: #63 (independent UI) → #62 (host panels, Auto3D 0.48.0) → this increment. Auto3D stays 0.48.0; Packaging stays 1.10.3. No deployment or scene-generation claim is implied.

Phase 0 now supplies bounded, neutral round-bottle/can meshes, stable component IDs, outside-envelope bounds and front/back/wrap physical zone descriptors. Validation covers welded closed topology, triangle winding/normals, nondegenerate faces, positive signed volume, extreme dimensions and input isolation. These are solid presentation shapes; hollow glass, closure detail, real artwork and scene insertion remain outstanding.

## Rendering audit checkpoint

`source/engine/model/material.js` PhysicalMaterial stores metallic/roughness/specular fields but has no transmission/IOR/thickness definition or equality support. `source/engine/threejs/threeconverter.js` creates MeshPhysicalMaterial but does not assign those clear-pack properties. `source/engine/export/exportergltf.js` exports metallic/roughness but does not implement the required clear-pack extensions. Creating a Three.js physical shader alone is insufficient. Do not enable the draft glass choice as a claim of actual clear rendering.

Next: define and test clear-pack properties through cloning, archives/recovery, Three.js conversion, import/export and editor before glass quality is accepted. Build a hollow-wall reference fixture and compare fixed-lighting preview/viewer/GLB results. Then integrate opaque bottle/can geometry through an adapter with atomic history and saved authoring definitions; add real preview, presets and stable generation/update commands. Label zone descriptors here are preparatory; source images, physical mapping and portable composition remain a separate slice.

## GitHub Actions cost policy

CI and MCP validation jobs skip draft PRs, then run on `ready_for_review` and subsequent changes to ready PRs. Manual dispatch remains available. MCP verification cancels superseded runs, matching main CI. Existing ready PR checks and production deployment validation remain enabled. Draft skipping takes effect once this workflow change is merged; existing #62/#63 remain ready and retain their validation.

Use local module/build checks while iterating and push reviewable batches. Stacking alone does not reduce Actions usage: each ready PR can still trigger its own run.
