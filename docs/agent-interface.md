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

This is an in-page execution API, not a deployed MCP server or a ChatGPT plugin connection. A future authenticated bridge should expose catalog search, execute, runMacro, and cancelMacro as MCP tools and relay them to a specific live viewer session. It must preserve schemas/results, session identity, read-only enforcement, and explicit authorization for publication. A remote server cannot directly reach a browser's `window` object without this bridge. Never expose arbitrary JavaScript execution or credentials as a command.

## Visual command workspace

Preferences contains the Light/Dark appearance selector; the main toolbar no longer duplicates it. Commands and macros has a searchable category/subcategory tree, collapsible account inspection and macro builder, and typed argument controls. Visual steps show plain-language array W/L/H counts and move/rotate/scale values. Expand a step to edit it, apply Update step, or reorder/remove it. JSON, result references and exports remain in Advanced. Changes entered in Advanced require Apply code to visual steps before running or saving.

`macro.design.edit` and the UI share `EditMacro` in `macrodesign.js`. It edits a supplied definition without running commands and preserves existing step IDs/references. Reordering can make a reference point to a future step; the runtime rejects that reference instead of guessing. Actual runs still use CommandRegistry's preflight, authorization, read-only checks and sequential execution. Saved macros remain local to this browser.

For an open → array → add pallet → move sequence, use `library.account.open` with an owned saved model, `object.array` (2 W, 3 L, 6 H), another Library open with Append enabled for a saved pallet, then `object.transform`. The Library selector lists owned item names. There is no built-in pallet generator. Commands opening interactive dialogs do not wait for the user's eventual file selection and should be run separately.

Current workspace commands include selection.transform (global display units by default), object.select additive/single, object.group/ungroup, object.scaling.proportional/percent, polygon.preview/preview_array/apply/cancel, ui.polygons and ui.array. polygon.cancel interrupts a running worker rather than waiting behind the execution queue; auth/schema validation still applies. See polygon-optimization.md for preview, quality limits, group persistence and array memory behavior. admin.users/revoke/restore and interactive admin.reset_password use the verified server account controls; auth.verify rechecks session validity. No reset password is accepted in agent arguments or returned in results.

Packaging commands share `PackagingWorkspace` with the dieline UI: `packaging.open/inspect/name`, `packaging.path.add/edit/delete/select`, `packaging.draft.type/point/back/cancel/finish`, `packaging.board/extrude/load_selected`, `packaging.view.fit/snap`, and `packaging.export/download`. Coordinates and thickness accept explicit `units: "mm"`; inspection and vector exports use canonical millimeters. `packaging.export` returns vector contents; `packaging.download` starts a local download. `ui.save`/`library.account.save` preserve completed profiles even without a 3D object. Staged unfinished points are not saved. See `packaging-module.md` for geometry validation, holes, board caliper, persistence and folding limits. `lighting.effects` sets reflection/shadow flags through the same service as the Lighting panel.

## Screenshots for agent chat

`capture.image` returns PNG image content for the viewport or visible workspace. Forward `result.content` as image blocks to the chat tool result. The Commands panel provides preview/download. See [agent-screen-capture.md](agent-screen-capture.md) for the authorized Playwright adapter, privacy filters, limits and connection requirements.

`lighting.shadow.inspect` reports effective model visibility (including hidden parents), cast/receive counts, floor opacity/depth writes, WebGL context loss and failed shader diagnostics. It is read-only and accepts no arguments. Use it before/after a shadow toggle when investigating device-specific rendering failures.
