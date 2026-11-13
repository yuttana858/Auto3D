# Auto3D 0.69.2 — movable Object transform panel

Packaging remains 1.10.7, Primary Products 0.15.0 and Molded Pulp 0.1.0. Based on main after Auto3D 0.69.1 (#126). Not deployed.

The floating **Object transform** panel (Position, Rotation and Size for the selected model) can be moved anywhere over the viewer.

- **Dragging:** drag its title bar, which shows a grip and a hover highlight.
- **Keyboard:** focus the title and use the arrow keys (10 px) or Shift+arrow (50 px).
- **Reset:** double-click the title or press Home to return it to the default top-right position.
- **Stays visible:** the panel is kept inside the viewer when it is dragged, when the window resizes and when it reappears.
- **Remembered:** the position is kept on this device (`localStorage`) and restored after a reload. If storage is unavailable, the panel still works and starts at the default position.

The drag logic is a reusable `FloatingPanel` helper (`source/website/floatingpanel.js`).

New agent command `ui.transform_panel.position` (`{ x?, y?, reset? }`) reads, moves or resets the panel through the same function, and returns `{ moved, x, y, visible }`. It rejects only one of x/y, or reset combined with x/y. The catalog has 326 commands.

## Validation

- `npm test`: 877 passing. `npm run test_mcp`: 72 passing. `npm run lint` is clean.
- New `transform-panel-move` browser test (added to the CI suite) covers:
  - dragging, and staying inside the viewer
  - arrow and Shift+arrow steps
  - command validation and moves
  - typing a decimal after moving the panel
  - the position surviving a reload
  - double-click and command reset
- `decimal-inputs`, `workspace-editing`, `workspace-optimization`, `workspace-commands`, `selected-orbit` and `dimensions` pass locally.
