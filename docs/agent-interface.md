# Auto3D command interface v1

Open **Preferences → Commands and macros** to search the catalog, inspect argument schemas, execute commands, compose ordered macros and save them locally or download JSON. The static machine-readable catalog is `assets/commands.json`.

The running app exposes `window.Auto3D`:

```js
Auto3D.catalog('material');
await Auto3D.execute('scene.inspect', {});
await Auto3D.execute('object.transform', { objectId: 'id-from-inspect', position: [1, 0, 0] });
await Auto3D.runMacro({version: 1, steps: [
  {id: 'copy', command: 'object.duplicate', arguments: {}},
  {id: 'move', command: 'object.transform', arguments: {
    objectId: {$ref: 'copy.id'}, position: [2, 0, 0]
  }}
]});
Auto3D.cancelMacro();
```

Command results use `{ok, command, result}` or `{ok:false, command, error:{code,message}}`. Macro results contain completed steps and the failing step when applicable. Execution is serialized. Macro inputs are validated before execution where possible; references resolve against prior step results. Macros stop at the first failure, retain completed changes, and support cancellation between steps. There is no automatic rollback. Object history commands can undo supported object edits; material and view commands do not record history.

Coordinates use source model units, rotations use degrees, and scale is dimensionless. Object IDs come from `scene.inspect`. Material indices come from `material.list`. Commands opening save/library/editor dialogs report that the panel opened; they do not mean the user saved or published anything. Shared viewers reject scene mutations. Macro storage is local to the browser and origin; downloaded macros are portable JSON.


## Account commands

`material.surface.relief` builds visual corrugated grain/flutes and optional image-mask emboss/deboss through the same service as the texture window. `material.surface.varnish` masks roughness and reflectivity while preserving original finish maps. Both accept partial saved settings and an optional local base64 mask, record one Undo step, and preserve CAD geometry and measurements. `material.list` includes saved settings and mask names. See [surface-relief.md](surface-relief.md) for appearance units, UV placement, mask polarity and portability.

The indexed texture-window tools are `material.texture.preview` (interactive only), `material.texture.inspect` (image name, UV and effect state), and `material.texture.mapping` (partial tiling, offset and degree rotation edits). Preview reports which effect tools are available for its slot. Image replacement/download/removal remain `material.texture`, `material.texture.save` and `material.texture.remove`. Read-only and account guards apply through the shared services; malformed values are rejected before mutation.

`packaging.fefco.camera` sets the session's Advance Animation fold-camera auto-fit setting. `camera.current.inspect` reads the actual live camera during fold/array playback. `object.array` accepts `animate`, `duration` (1–15 seconds) and `autoFit`; it awaits the complete reveal. `object.array.playback` and `object.array.playback.inspect` bypass the pending command queue so pause/resume/cancel and progress inspection remain available. See [scene-presentation.md](scene-presentation.md). These creation-time animations do not create exported animation clips.

`auth.inspect` reports the signed-in identity without session tokens. `auth.open` opens the interactive account dialog; it does not complete sign-in. `auth.sign_out` signs out and is marked as a mutation, so shared read-only contexts reject it. Commands/macros never accept email/password credentials. Temporary Supabase email/password setup is documented in `temporary-auth.md`.

## Knowledge access

Connected agents can query Auto3D's curated corrugated-paper packaging knowledge without loading the full dataset into every prompt:

```js
await Auto3D.execute('knowledge.paper_packaging', {
  query: 'FEFCO 0201 C flute stacking strength'
});

await Auto3D.execute('knowledge.paper_packaging_section', {
  section: 'flutes'
});
```

The same information is available as public read-only JSON:

- `GET /api/knowledge/paper-packaging`
- `GET /api/knowledge/paper-packaging?q=...`
- `GET /api/knowledge/paper-packaging?section=...`

The paper-packaging knowledge base separates box structure, board/material construction and performance. It includes source provenance and engineering limitations so an agent can surface assumptions instead of presenting a FEFCO code or flute letter as a guaranteed strength rating.

## MCP / plugin adapter contract

The MCP pilot bridge at `/mcp` relays authorized commands to a specifically paired live viewer session; a remote server cannot directly reach a browser's `window` object. OAuth grants require explicit read access, with `auto3d.write` for command-catalog discovery and execution. MCP exposes a compact tool list, then category/search results with schemas and pagination, followed by validated command invocation. The bridge preserves schemas/results, account/session identity, existing authorization and read-only checks, and explicit server-side authorization for account/admin actions. Never expose arbitrary JavaScript execution or credentials as a command.

## Visual command workspace

Preferences contains the Light/Dark appearance selector; the main toolbar no longer duplicates it. Commands and macros has a searchable category/subcategory tree, collapsible account inspection and macro builder, and typed argument controls. Visual steps show plain-language array W/L/H counts and move/rotate/scale values. Expand a step to edit it, apply Update step, or reorder/remove it. JSON, result references and exports remain in Advanced. Changes entered in Advanced require Apply code to visual steps before running or saving.

`macro.design.edit` and the UI share `EditMacro` in `macrodesign.js`. It edits a supplied definition without running commands and preserves existing step IDs/references. Reordering can make a reference point to a future step; the runtime rejects that reference instead of guessing. Actual runs still use CommandRegistry's preflight, authorization, read-only checks and sequential execution. Saved macros remain local to this browser.

For an open → array → add pallet → move sequence, use `library.account.open` with an owned saved model, `object.array` (2 W, 3 L, 6 H), another Library open with Append enabled for a saved pallet, then `object.transform`. The Library selector lists owned item names. There is no built-in pallet generator. Commands opening interactive dialogs do not wait for the user's eventual file selection and should be run separately.

Current workspace commands include selection.transform (global display units by default), object.select additive/single, object.group/ungroup, object.scaling.proportional/percent, polygon.preview/preview_array/apply/cancel, ui.polygons and ui.array. polygon.cancel interrupts a running worker rather than waiting behind the execution queue; auth/schema validation still applies. See polygon-optimization.md for preview, quality limits, group persistence and array memory behavior. admin.users/revoke/restore and interactive admin.reset_password use the verified server account controls; auth.verify rechecks session validity. No reset password is accepted in agent arguments or returned in results.

Packaging commands share `PackagingWorkspace` with the dieline UI: `packaging.open/inspect/name`, `packaging.path.add/edit/delete/select`, `packaging.draft.type/point/back/cancel/finish`, `packaging.board/extrude/load_selected`, `packaging.view.fit/snap`, and `packaging.export/download`. Coordinates and thickness accept explicit `units: "mm"`; inspection and vector exports use canonical millimeters. `packaging.export` returns vector contents; `packaging.download` starts a local download. `ui.save`/`library.account.save` preserve completed profiles even without a 3D object. Staged unfinished points are not saved. See `packaging-module.md` for geometry validation, holes, board caliper, persistence and folding limits. `lighting.effects` sets reflection/shadow flags through the same service as the Lighting panel.

## Screenshots for agent chat

`capture.image` returns PNG image content for the viewport or visible workspace. Forward `result.content` as image blocks to the chat tool result. The Commands panel provides preview/download. See [agent-screen-capture.md](agent-screen-capture.md) for the authorized Playwright adapter, privacy filters, limits and connection requirements.

`lighting.shadow.inspect` reports effective model visibility (including hidden parents), cast/receive counts, floor opacity/depth writes, WebGL context loss and failed shader diagnostics. It is read-only and accepts no arguments. Use it before/after a shadow toggle when investigating device-specific rendering failures.


## Bottom command bar

Use the bottom input for supported phrases, such as `array model 4x4x6`, `fit`, `undo`, `move model`, or `run macro Layout`. Arrays use W × L × H (X × Z × Y); the original counts and 1,000-object session limit still apply. Type `commands` or click Commands & macros to browse the full strict catalog and build/save macros. Semicolons sequence phrases, with validation before execution. A runtime failure stops subsequent steps and retains completed changes. Nested macros are not supported.

`commands.text` accepts only `{text}` and returns structured completed steps through the shared registry. Each dispatched action still enforces authentication, read-only and busy state. Activation uses `object.tool`. `ui.ai.packaging` opens the Packaging tab; `packaging.open` opens the interactive designer. File picker/save/export commands open dialogs and do not claim that a file operation or publication completed.


FEFCO v0.28.0 adds `packaging.fefco.catalog/inspect/configure/generate`. Configuration changes temporary generation settings; generation creates a folded box and concept cut/score profile with Undo. All dimensions and caliper in these commands are millimeters, independent of account display units. Catalog lists four supported slotted styles and the planned families. The bottom bar also accepts `generate rsc 400x300x250 mm` and `create hsc 400x300x250` (internal L×W×H). See [packaging-module.md](packaging-module.md).


Auto3D v0.29.0 adds `packaging.fefco.unfold` with optional objectId. It replaces a generated folded box with its stored concept dieline, current dominant board/edge material and CUT/SCORE guides. Undo/Redo restores both scene object and active profile; archives preserve flat state. Scaled objects, arbitrary imported meshes and already-flat objects are rejected. `unfold box` and `unfold model` use this same command; generation and unfolding can be sequential macro steps using result objectId references. Packaging implementation now lives in the independently built modules/packaging package (v1.0.0), loaded on demand.

Auto3D v0.30.0 / Packaging v1.1.0 adds these strict shared commands:

| Command | Input and behavior |
| --- | --- |
| packaging.dimensions.inspect | Reports selected box dimensions, nominal values, allowances and tolerance in mm |
| packaging.dimensions.basis | `{basis: "inside"}` or `"outside"`; changes displayed measurement basis |
| packaging.dimensions.update | Optional objectId, basis, length/width/height, thickness and tolerance; regenerates selected geometry with stable ID and Undo |
| packaging.fefco.animate | Optional objectId and duration (1–30 seconds); starts flat → open → closed playback and returns started/objectId/duration/stages |
| packaging.fefco.playback | `{action: "pause"}`, `"resume"` or `"cancel"`; controls active playback |
| packaging.fefco.playback.inspect | Reports state, progress, stage and objectId; poll for completed/cancelled/failed |

`animate box` and `fold box` invoke the same action. Inside values are minimum usable dimensions; outside values are maximum assembled envelope after explicit tolerance reserve. Board caliper and actual flap-layer stacks are accounted for; open flap sweep is excluded. Generic scaling must be reset. Animation does not block its command until completion, so a subsequent ordinary mutating macro step is rejected as busy until playback finishes. Playback control and inspection remain available while busy, with authorization enforced. Completed folding records one Undo step; cancellation restores the original. See packaging-module.md for concept/tooling limits.

Auto3D v0.31.0 / Packaging v1.2.0 adds `packaging.fefco.preset` with required code 0200/0201/0202/0203. It immediately adds/selects a box using current draft dimensions/caliper, normalizes OSC overlap as needed and records Undo, sharing the catalog-card action. `packaging.fefco.animate` now chooses from saved object state and returns action/stages: closed → open top flaps, open → closed top flaps, flat → assembled box. HSC alternates assembled/flat because it has no top flaps. `packaging.fefco.playback.inspect` reports the current action. The existing explicit unfold command and phrase remain available. Authorization, strict schemas, busy guards, completion history and cancellation semantics are retained.

Playback inspection uses `finishing`, `cancelling` or `restoring` while the host commits/restores scene geometry. `completed`, `cancelled` or `failed` are final states after this work has settled. Poll the final state before another mutating macro step.

## Auto3D v0.32.0 / Packaging v1.3.0: saved CAD animation

`packaging.fefco.preset` accepts optional length/width/height/thickness/overlap/closure overrides in canonical millimeters, validates them together, then generates one box and one Undo entry. Catalog inputs stage until generation. `packaging.fefco.animate` toggles selected assembled → flat and flat → assembled across all four styles, using that object's saved profile. HSC remains open at the top. The asynchronous start/inspect/control contract is unchanged; cancellation restores the original object and drawing. `packaging.open_selected` loads the selected saved profile with Undo if it differs from the current drawing, then opens the interactive CAD dialog. An already matching profile adds no history entry; opening the dialog does not resize the 3D object. The panel's View dieline in CAD action and selected-object Open packaging designer use this shared service.

Render workspace actions share the UI queue: `render.now` captures/starts the main viewer scene and opens the right panel; `render.queue.start` and `render.now` accept `background: true` for camera navigation while edits pause. Both return immediately; poll `render.queue.inspect`. `render.queue.open {id}` opens an interactive image popout with pan/zoom (browser popup permission applies). `render.image.view {id, action}` inspects or controls its pan/zoom (fit, actual, zoom with factor, pan with deltaX/deltaY). `render.queue.delete {ids}` releases selected images/windows; `render.queue.clear {all: true}` empties the queue and cancels active tiles, while `all: false` removes finished jobs only. Thumbnails and images remain local to the open session and are omitted from structured inspection.

Saved Library sharing: `library.share.open/create/list/revoke` covers the code-protected mini viewer and snapshot lifecycle. Create explicitly uploads/copies a saved item and returns a four-digit code/link; QR uses the URL only. Source is account/device/published. The server feature is disabled until its dedicated migration/secret/flag rollout. `library.saved.open` shares Library Open/Add guards; `scene.groups.inspect` and `scene.group.expand` control array/group dropdowns without changing geometry. See [audience-sharing.md](audience-sharing.md).

Fold presentation adds `packaging.fefco.scrub` (normalized visual pose, optional final commit), `packaging.fefco.scrub.inspect`, `animation.action.open` (opens the interactive Action dialog), `animation.action.add` and `animation.action.delete`. Actions are deterministic timeline spans, not asynchronous one-shot triggers. `animation.timeline.inspect` includes the saved action records; `animation.timeline.seek` evaluates their poses in either direction. Canonical CAD remains unchanged. See [scene-presentation.md](scene-presentation.md).

`packaging.appearance.inspect` reads the selected packaging surface preset; `packaging.appearance.update` edits enabled/panelBow/foldSoftness/cutCompression/paperGrain through the same service as Packaging → Realistic board surface. Settings are visual-only, persisted in the profile, guarded by account/read-only checks and reversible with Undo. Original CAD, dimension targets, array spacing and authored masks stay independent. See [board-surface-appearance.md](board-surface-appearance.md).

## Personal Meshy credential management

`ai.connection.open` opens the private interactive dialog; it does not save a key. Credentials must be entered by the user and cannot be supplied in command or macro arguments. `ai.connection.inspect` reports only `saved` and `available` flags. `ai.connection.test` checks the saved/admin connection via Meshy's balance endpoint without generation. `ai.connection.remove` deletes only the current account's saved credential; it does not revoke the key at Meshy. Open/remove respect read-only sessions. The key field is cleared after submission, on close and on account change; captures exclude the entire dialog.
