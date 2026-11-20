# Auto3D 0.99.0 — 3Dstudio primitive modeling

New **3Dstudio 0.1.0** / Primary Products **0.17.0** / Packaging **1.18.0** /
Molded Pulp **0.3.0**. Stacked with the selection and grouping tools in draft
[PR #173](https://github.com/yuttana858/Auto3D/pull/173), based on main `42be7df`.
This candidate is not deployed.

The tool strip adds **3Dstudio**, using the existing outlined module buttons and
shared minimal/extended/closed panel shell. Generate a cube/box, sphere,
rod/cylinder, tube, cone, torus or capsule. Selecting a saved 3Dstudio model exposes
its dimensions, local placement and material fields; valid changes update that
object live, with Enter committing immediately. New primitives use the app's
automatic spacing and focus; edits preserve object identity and placement.

Select two 3Dstudio solids or choose target/tool objects in the panel, then use
Add/union, Subtract or Intersect. The result captures both editable constructions
and their relative placement. Source objects remain in the session, hidden by
default, and can be kept visible. Cut surfaces retain the cutter's material.

The editable history lets users and agents change earlier primitive dimensions,
local transforms and materials; change or disable a Boolean; display an earlier
step; and resume the full result. Later construction is retained when viewing an
earlier step. Each scene operation also supports Undo/Redo. Saved sessions retain
the complete authoring graph, with strict validation on reopening.
Advanced surface finishes and textures also survive temporarily hidden history
steps, duplication and recovery. Rebuilt surfaces retain the material editor's
box-projection mapping.

Geometry runs in a lazy, local Manifold WASM worker with bounded graph/triangle
sizes, cancellation and a deadline. Failed or stale work cannot commit to a new
account, session or selection. No geometry is sent to a modeling service.

## Agent tools

`ui.3dstudio`, `studio.primitives.list`, `studio.inspect`, `studio.create`,
`studio.node.update`, `studio.history.inspect`, `studio.history.set_tip`,
`studio.boolean`, and `studio.cancel` use the same services as the panel. Both
generated catalogs expose strict input schemas and examples. Inspection and
cancellation remain available during a computation. Existing object selection,
transform, material, export, Undo/Redo and session tools are reusable.

## Module boundary and limits

Geometry, graph authoring, module UI, styling, worker, tests and independent
preview live in `modules/3dstudio`. Auto3D's host adapter handles units, materials,
scene transactions, persistence and account/session guards.

Booleans currently accept 3Dstudio-authored solids. Other modules' models retain
their editing systems. Imported-mesh Booleans, fillets, sketch constraints,
B-rep/STEP authoring and label/UV remapping are not included. Curves use bounded
tessellation; this is not a NURBS authoring release.

Validation: **1,290 app/module tests and 73 MCP tests passed**, plus three focused
browser checks, lint, license checks and both builds. The full browser release
gate remains pending. Evidence and resolved issues are recorded in
[the validation record](validation/3dstudio-0990.md). See the actual app's
[desktop](assets/3dstudio-0990/desktop.png),
[extended](assets/3dstudio-0990/extended.png) and
[mobile](assets/3dstudio-0990/mobile.png) review images.
The previous selection-tool increment is documented in [release-0980.md](release-0980.md).
