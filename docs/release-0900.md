# Auto3D 0.90.0 — Auto Pack assembly sequence, motion easing, drop-in accessories, Assign facing

Packaging **1.16.0**, Primary Products 0.15.0, Molded Pulp 0.3.0. Based on main after Auto3D 0.89.0. Not deployed.

## Auto Pack assembly sequence

Auto Pack now plays the order real cartons are packed in. Before, the carton folded around products that never moved, and the pads and partitions appeared instantly. Now:

1. **Lift.** Products rise above the flat blank. With partitions, they spread apart into their cells in the air.
2. **Erect.** The carton folds its walls and closes its bottom. The top flaps stand upright, so the lid is open at 90°: the fold holds at the Auto Pack pose 0.76.
3. **Bottom pad**, then the **front/back pads**, then the **partition layers**, one layer after another. Each lowers into the open carton.
4. **Products** drop in one at a time, lowest layer first and back to front. Up to six products get even slots, slots shorten gently up to 12, and larger counts speed up so the stage stays bounded.
5. **Top pad** lowers on.
6. **Close.** The lid folds shut. A carton set to Open top ends open.

How it works:

- **Planner.** `modules/packaging/src/packsequence.js` (`CreatePackSequence`, `SamplePackSequence`, `ProductDropSlots`) is a pure plan in world millimetres. It refuses a layout where a pad or partition is in a product's drop path, so products only ever move straight down.
- **Playback.** `source/website/autopacksequence.js` (`PackSequencePlayback`) draws each object at its saved packed placement plus the sampled offset. `PackagingWorkspace.AnimateFold` accepts a `sequence` that drives the carton fold, the stage label, per-frame placement and camera bounds.
- **No early flash.** The editor reapplies the in-flight placement after every rebuild (`SessionEditor.motionOverride`), so nothing appears packed before the animation starts.
- **Cancel and failure.** Pause, resume and cancel are unchanged. Cancel or failure leaves products and pieces in their packed placement.
- **One Undo step.** A completed Auto Pack is one Undo step for contents, carton and fold (`SceneHistory.Group`). Before, it was three.
- **Replay.** Folding an Auto Pack carton up from flat replays its sequence from its saved products and tagged pieces. The carton's saved fit ids include the pieces, and replay excludes them.
- **Duration.** The default is 14 s (1–30 s).

## Motion easing (ramp in/out)

New account preference **Motion easing**, in Preferences next to Viewport quality:

- **Smooth** (default): smootherstep.
- **Strong:** quintic in-out, with longer ramps.
- **Linear:** constant speed.

It is server-validated (`motionEasing` in `functions/_lib/accountstorage.js`) and set by agents with `preferences.motion_easing`. It applies to modelling motion only:

- the overall carton fold and unfold timing, which was linear before; each panel still eases within its phase
- the Auto Pack sequence
- array reveal drops
- accessory drop-ins

The landing page and AI previews are unchanged. The shared curve is `modules/packaging/src/easing.js` (`EaseMotion`, `EaseSpan`).

## Accessories drop in

Pads and partitions added from the Accessories tab stay hidden through the rebuild, then lower into place in packing order: bottom, sides, partitions, top. The drops overlap, total at most 1.8 s, and are skipped for reduced motion. The add result reports `dropIn: { animated, seconds }`.

## Assign facing (Model spec)

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

##### Agent commands

- `object.facing.open { objectId? }` and `object.facing.close` show and hide the visual.
- `object.facing.assign { front | up }` uses axis names `+x`, `-x`, `+y`, `-y`, `+z`, `-z` for the side's current world direction.
- `object.facing.turn { degrees: 90 | -90 | 180 }` turns the model.
- `object.facing.mode { front | up }` sets the picking mode.
- `object.facing.inspect` returns whether the tool is active, the model, mode, hovered face, world front/up, the saved facing, and the world size and floor offset.

All of these use the same `FacingTool` (`source/website/facingtool.js`) as the buttons.

##### Not in this release

- Opening the placement visual automatically after import, instead of models appearing directly, is the next step if wanted.
- Using the saved facing in arrays and pallets is also future work.

## Agent commands

- `packaging.auto.sequence.inspect` returns stages and spans, the current stage, fold progress, product drop order and entry height. It is allowed while the viewer is busy.
- `preferences.motion_easing`.
- `object.facing.open/assign/turn/mode/inspect/close`.
- `packaging.auto.generate` defaults to 14 s and describes the sequence and one Undo step.
- The catalog has 394 commands.

## Validation

- `npm test`: 1064 passing. New unit tests:
  - `packsequence.test.js`: stage order, hover and lid-open fold, ending in place, drop order, accelerating slots, drop-path refusal
  - `motion-easing.test.js`
  - `dropin.test.js`
  - `facing.test.js`
  - an Auto Pack integration test for the sequence, one Undo and replay
- `npm --prefix modules/packaging test`: passing. `npm run test_mcp`: passing. Lint is clean.
- Browser tests `autopack-sequence` and `assign-facing` are in the CI suite. `autopack-sequence` covers stage order, the lid open at 0.76 while packing, one Undo restoring the products, accessory drop-in and the easing preference.
- Full local browser suite (93 tests): 92 passed on the first run; `packaging-auto-pack` still expected three Undo steps and now checks one Undo plus Redo, and passes.
- In a real browser, a 3 × 2 product pack with four pads and partitions ran lift → erect → pads → partitions → products one at a time → top pad → close, with no page errors.
