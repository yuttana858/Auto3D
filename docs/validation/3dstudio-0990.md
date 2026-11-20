# 3Dstudio 0.99.0 validation

Runtime commit: `d54e61b4ed9a5e2953e179edda139244f26e573b`.
Auto3D 0.99.0 / 3Dstudio 0.1.0 / Primary Products 0.17.0 /
Packaging 1.18.0 / Molded Pulp 0.3.0. Draft PR #173; not deployed.

## Automated checks

- Full app/module suite: **1,290 passed** on the finished runtime.
- MCP suite: **73 passed**; command catalogs synchronized and all nine new tools
  are discoverable. Remote inspection and cancellation bypass queued modeling
  work while retaining account, connection, tab and permission guards.
- App/MCP lint, production dependency audit and license review passed. The
  production npm audit reported **0 vulnerabilities**.
- Final development, production and Pages builds passed, including separately
  served module UI, styles, worker and WASM.
- Independent module build/preview passed. Tests enforce the host/module
  boundary, lazy UI/kernel loading, exact worker dependency inputs and digest
  changes for every separately served JS/CSS/worker/WASM artifact.

Kernel tests execute the actual pinned Manifold WASM, covering all seven
primitives, closed topology, volume, normals, hollow tube/torus construction,
Boolean operations, source-face materials, multi-axis transforms, Float32
precision rejection, triangle budgets, native resource cleanup, cancellation,
timeout and stale worker messages.

Host tests cover identity/placement/group metadata, units, advanced PBR and UVs,
inactive material palettes, rollback/resume, duplication, normal and recovery
archives, malformed data rejection, rendering failure rollback, retryable
Undo/Redo, and stale account/document/selection guards. A regression uses the
real timeline normalizer to distinguish renderer defaults from concurrent edits.

## Browser checks

All three focused browser scripts passed with real application rendering:

- `3dstudio`: all primitive cards; Generate; live mm/in dimensions; invalid
  values and correction; independent placement; real subtraction geometry;
  upstream history edits; rollback/resume and suppression; Undo/Redo; portable
  save/reopen followed by editing; derived tube wall thickness; minimal,
  extended and mobile layouts. Passed again after fixing the unit suffix wrap.
- `workspace-commands`: startup, shared tool rail and context controls,
  96-object array feedback/Undo, macros and desktop/mobile module panels.
- `selection-groups`: rectangle selection, add/subtract/cancel, ordinary and
  context selection, grouping shortcuts/buttons, array ungroup and Undo/Redo.

The independent preview also passed with a strict self-only CSP permitting
`wasm-unsafe-eval` without `unsafe-eval`: all seven primitives, local versioned
worker/WASM requests, curved subtraction, live earlier-step editing,
rollback/resume, and visual review of smooth curves/crisp cuts.

Review images from the real app: [desktop](../assets/3dstudio-0990/desktop.png),
[extended](../assets/3dstudio-0990/extended.png),
[mobile](../assets/3dstudio-0990/mobile.png).

## Issues found and resolved

An initial browser run rejected first Generate because rendering normalizes
missing animation arrays to empty arrays. The fingerprint now treats these
equivalent defaults consistently without relaxing selection/session checks.
The complete browser flow passed afterward.

One intermediate full-suite run loaded a build-boundary test before its final
path-normalization fix and failed that assertion. The corrected assertion keeps
the exact dependency restrictions; its combined build tests and the final
full 1,290-test run passed afterward.

## Release status

The full browser release suite remains pending. These are focused development
checks, not a claim that the full merge/deployment gate passed. Keep the PR in
draft to batch Actions spending. Main and production were not changed.
