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

## MCP / plugin adapter contract

This is an in-page execution API, not a deployed MCP server or a ChatGPT plugin connection. A future authenticated bridge should expose catalog search, execute, runMacro, and cancelMacro as MCP tools and relay them to a specific live viewer session. It must preserve schemas/results, session identity, read-only enforcement, and explicit authorization for publication. A remote server cannot directly reach a browser's `window` object without this bridge. Never expose arbitrary JavaScript execution or credentials as a command.
