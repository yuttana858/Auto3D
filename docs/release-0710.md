# Auto3D 0.71.0 — Assign facing (Model spec phase 2)

Packaging remains 1.10.7, Primary Products 0.15.0 and Molded Pulp 0.1.0. Based on main after Auto3D 0.70.0 (#127). Not deployed.

## What it does

**Assign facing** is a new button under the Model spec preview, next to Rotate, Update and ×. It shows a placement visual for the selected model:

- a glowing, transparent blue **ground rectangle** around the model's footprint
- a blue **Front** arrow along the ground and a green **Up** arrow
- a highlight on the face of the model's bounding box under the pointer: blue in Front mode, green in Up mode

A hint bar over the viewer has **Front** / **Up** mode buttons, **⟲ 90°** / **⟳ 90°** turn buttons and **Done**. Escape also finishes. Choosing another selection, or none, ends the tool. Clicks that miss the model still orbit and select as usual. Clicks on the model's bounds assign that face and keep the selection.

Rules:

- **Front.** Clicking a face in Front mode turns the model so that face points to the world front. The world front is toward the default camera: +Z when Y is up, −Y when X or Z is up. The viewer's up vector, including flipped up, is respected.
- **Up.** Shift+click, or Up mode, turns the clicked face to world up.
- **Smallest turn.** The tool uses the smallest rotation. A side face becomes Front with a turn about up. The back face makes a half turn about up, never upside down. Making the top or bottom the Front tips the model.
- **Placement.** The model turns about its bounds centre and is then set on the floor. Rotations within 0.0001° of a whole degree are snapped (a quarter turn is stored as −90, not −89.999999).
- **Undo.** Each assignment or turn is one Undo step that restores both the transform and the saved facing.
- **Saved facing.** The model's local front and up axes are saved as `userData._auto3dFacing` (for example `{"front":"+x","up":"+y"}`), so later tools (arrays, pallets, labels) can know its front.

Shift is now passed to viewer click handlers along with Ctrl and Meta (`navigation.js`).

## Agent commands

- `object.facing.open { objectId? }` and `object.facing.close` show and hide the visual.
- `object.facing.assign { front | up }` uses axis names `+x`, `-x`, `+y`, `-y`, `+z`, `-z` for the side's current world direction.
- `object.facing.turn { degrees: 90 | -90 | 180 }` turns the model.
- `object.facing.mode { front | up }` sets the picking mode.
- `object.facing.inspect` returns whether the tool is active, the model, mode, hovered face, world front/up, the saved facing, and the world size and floor offset.

All of these use the same `FacingTool` (`source/website/facingtool.js`) as the buttons. The catalog has 335 commands.

## Not in this release

- Opening the placement visual automatically after import, instead of models appearing directly, is the next step if wanted.
- Using the saved facing in arrays and pallets is also future work.

## Validation

- `npm test`: 880 passing, including new `facing.test.js` for axis names, world frame and smallest-turn maths. `npm run test_mcp`: 72 passing. `npm run lint` is clean.
- The click-modifier unit test now includes `shiftKey`.
- New `assign-facing` browser test (added to the CI suite) covers:
  - starting from the Model spec button
  - a Front assignment that swaps W/L and keeps the model on the floor and snapped to −90°
  - an Up assignment that tips the model
  - Undo and Redo of both, including the saved facing
  - turns by button and command, and invalid input
  - a real viewer click on a face, which keeps the selection
  - Up mode, Escape, and ending on selection change
- `model-spec`, `workspace-editing`, `workspace-commands`, `selected-orbit`, `dimensions`, `transform-panel-move` and `decimal-inputs` pass locally.
