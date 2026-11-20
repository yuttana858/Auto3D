# 3Dstudio 0.1.0

Independent primitive solid modeling for Auto3D. No source file in this module
imports Auto3D's engine, website, CAD, Packaging or Primary Products modules.

## Development

From the repository root, `npm ci`, then:

```sh
npm --prefix modules/3dstudio test
npm run build_3dstudio
npm run preview_3dstudio
```

The preview at `http://localhost:8085` is independent of Auto3D's host, accounts
and scene engine. It uses the same panel, graph and local WASM worker. Its
Three.js renderer is preview-only. The package can also install its own declared
development dependencies and run these commands independently.

## Construction and editing

- Cube/box, sphere, rod/cylinder, tube, cone/frustum, torus and capsule.
- Canonical millimeters, Y up, base at Y=0 before local transforms. Displayed
  dimensions can use inches through the neutral host callback.
- Per-primitive dimensions, local position, rotation in degrees, scale, color,
  roughness, metalness and opacity.
- Addition/union, subtraction and intersection. Empty results are rejected;
  disconnected closed volumes are supported.
- A persistent directed graph retains primitive inputs, captured operand
  placement, Boolean operation and suppression state. `rootId` chooses the
  displayed result; `tipId` retains the full construction when viewing an earlier
  step. Editing earlier parameters recomputes their downstream geometry.

The host embeds operand histories in each Boolean result and retains the source
objects, hidden by default. Later edits to a separate source object do not change
an already created result; edit that result's saved primitive steps instead.
Whole scene actions also have ordinary Undo/Redo. Portable saved sessions retain
the authoring graph, including suppressed operations and later steps.

## Neutral API

`src/index.js` exposes `StudioAPIVersion`, `StudioVersion`, primitive descriptors,
strict graph validation/immutable updates, `StudioPanel`, and `StudioWorkerClient`.
The solid kernel remains in its dedicated worker and is loaded on first modeling
operation, not during app startup.

```js
const model = CreatePrimitiveDefinition('tube', {
  outerDiameterMm: 50, innerDiameterMm: 40, heightMm: 100
});
const worker = new StudioWorkerClient();
const mesh = await worker.evaluate(model);
worker.dispose();
```

`EvaluateStudio` is available directly from `src/kernel.js` for Node tests and
other worker hosts. The neutral result contains typed arrays, material provenance,
bounds and measured solid statistics. It contains no host objects.

`StudioPanel` takes neutral callbacks for inspect, units, blocked, create,
updateNode, setTip, boolean, cancel, selectObject and fit. Async edits are pinned
to the selected object/node and an opaque host edit context. The host adapters
live in `source/website/studiopanel.js`, `studioworkspace.js` and `studioadapter.js`.

## Agent interface

The Auto3D command registry and generated MCP catalog expose `ui.3dstudio`,
`studio.primitives.list`, `studio.inspect`, `studio.create`, `studio.node.update`,
`studio.history.inspect`, `studio.history.set_tip`, `studio.boolean` and
`studio.cancel`. Use returned object and node IDs for subsequent edits. Existing
selection, transform, material, export, Undo/Redo and session commands also apply.
Every modeling command shares the UI's transaction service.

New primitives are spaced apart in the host scene. Position a target and cutter
so they overlap before subtraction (the regular move tool or `object.transform`).
Primitive parameters and reported kernel metrics use object-local millimeters;
the scene object's separate position/rotation/scale remain available through the
existing object tools. Inspect the returned graph instead of assuming generated
operand node IDs: Boolean composition remaps colliding IDs.

Advanced host material edits use a bounded palette for temporarily inactive
history surfaces. Rollback, suppression, duplication, recovery and portable
archives retain these finishes and texture sources; resuming uses the same
material and box-projection mapping. This palette is host scene data, not a
dependency of the independent modeling graph.

## Bounds and scope

Definitions are strict JSON: at most 64 nodes and 256 KiB. All retained branches
are validated, including inactive ones. The kernel limits primitive input to
200,000 triangles, each result to 500,000 and total evaluated geometry to
1,000,000. Browser evaluations have a 15-second deadline; cancellation and timeout
terminate the worker and leave the scene unchanged. New requests get a fresh
worker when necessary.

This release supports solids authored in 3Dstudio. Imported meshes, Primary
Products, Packaging and CAD are not converted or baked into its history. Fillets,
sketch constraints, B-rep/STEP authoring, imported-mesh repair, persistent face IDs
and label/UV remapping are future work. Existing session mesh exports remain
available. Curved surfaces are tessellated; segment counts control detail.

## Runtime distribution

Manifold 3.5.5 is pinned as a build dependency. Only its JavaScript factory and
unchanged WASM enter the browser worker; the build rejects unexpected dependency
inputs. Its npm CLI/export tools and their optional native packages are not
distributed. Builds copy notices and license files beside the module assets.
The bundled native dependencies carry their reviewed permissive notices as well
as Manifold's Apache-2.0 license; see `licenses/native-notices.txt` for pinned
upstream sources.
The app manifest hashes the module script, styles, worker and WASM together.
See `THIRD_PARTY_NOTICES.txt` in the build output for bundled attribution.
