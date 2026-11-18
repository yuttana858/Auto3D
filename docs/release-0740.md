# Auto3D 0.74.0 — level right-drag orbit (integrated release)

PR #134 also carries #128 (AI and Library usability, see [release-0730.md](release-0730.md)) and #132 (Messenger daily history, see [release-0711.md](release-0711.md)), so the three share one CI run and one merge.

Primary Products 0.15.0, Packaging 1.10.7 and Molded Pulp 0.1.0 are unchanged. Based on main after #133 (0.72.0). Numbered after the 0.73.0 draft (#128).

## Change

- **Right-drag is a level turntable orbit.** In the main viewer, right-drag now orbits without any camera roll or tilt.
  - Left/right turns the view around the scene's up axis.
  - Up/down raises or lowers the view over or under the model. It stops 1° short of straight up or straight down, so the view never flips.
  - The camera's up is kept on the scene up axis. A camera that was tilted before (for example by a Free orbit touch drag) is levelled on the first right-drag.
  - The scene up axis follows **Up vector** and **Flip up**, including Z-up scenes.
- **Selected models.** With a model selected, the orbit pivots around the model's center as before. The eye and the view center move together, so the current framing and zoom are kept and the view does not snap onto the model. With nothing selected, it orbits the view center.
- **Unchanged.**
  - Holding X, Y or Z while dragging still rotates around that axis.
  - Left-drag, middle-drag pan, Space + left-drag pan, wheel zoom and touch gestures are unchanged.
  - The **Fixed up vector / Free orbit** toolbar choice now affects only touch orbit; right-drag is always level.
- The mini viewer uses the same navigation, so its right-drag is level too.

## Agent commands

No new commands. The `camera.orbit.focus_selected` description now says that the right-drag orbit stays level.

## Validation

- `npm run lint` passes.
- `npm test` passes. A new `navigation-orbit-level` suite (6 tests) checks:
  - no roll while turning, with the distance and height kept;
  - the up/down limit with no roll;
  - a tilted camera is levelled;
  - a selected pivot keeps the framing, also in Free orbit mode;
  - Z-up and flipped scenes;
  - right-drag uses the level orbit, while a held axis key keeps axis rotation.
- Browser tests:
  - `selected-orbit` now asserts that the camera up stays on the scene up axis after horizontal, diagonal and post-pan right-drags. The pivot and framing checks are unchanged.
  - `primary-profile`, `workspace-commands` and `workspace-editing` pass.
