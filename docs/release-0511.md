# Auto3D 0.51.1 / Packaging 1.10.4 / Primary Products 0.4.0

Follow-up to PR #85 (0.51.0), which merged before its last commit and before the new browser CI job finished.

## Self-hosted format libraries (carried over from the PR #85 branch)

- Draco-compressed glTF uses the Draco decoder the site already ships under `/o3dv/draco/` (from three.js) instead of `draco3d` from cdn.jsdelivr.net.
- Rhino `.3dm` import and export use `rhino3dm` 8.17.0 (MIT), copied to `/o3dv/libs/rhino3dm/` at build time with its license notice and pinned as a development dependency.
- The engine keeps its CDN defaults for npm consumers and gains `SetExternalLibraryUrl`/`GetExternalLibraryUrl`; the site switches to its own copies at startup.
- STEP/IGES/BREP/FreeCAD (`occt-import-js` 0.0.22, LGPL-2.1) and IFC (`web-ifc` 0.0.68, MPL-2.0) are hosted under `/o3dv/libs/` as unmodified files with their license texts and source notices, as approved by the project owner. Nothing loads from cdn.jsdelivr.net any more, so the CSP no longer allows it.
- `'unsafe-eval'` remains in the CSP: removing it was tested and stops the app before sign-in.
- `format-libraries` imports Draco glTF, 3DM, STEP and IFC with the CDN blocked, using an original 20 mm STEP cube and a minimal IFC4 wall as fixtures. The same four imports pass on the production Pages build served with its CSP.

## Agent view commands wait for the camera

`view.focus`, `view.fit` and `camera.activate` started an animated camera move and returned immediately, so a camera keyframe, capture or inspect issued next could record the camera before it moved. They now return after the move settles; if animation frames are paused (for example in a background tab) the move jumps to its destination after 3 s. The interactive UI keeps its animation. The engine navigation gains `WaitForCameraMovement` and `FinishCameraMovement`.

## Browser CI job

The first CI run of the `browser` job failed five tests:

- `library-sharing` and `mini-presentation` need the production mini viewer, `primary-products` needs the Pages build and `mcp-consent` needs the built MCP workers. The job now builds the production site, Pages output and MCP workers as well as the dev site.
- `primary-products` (and `mcp-access`, which runs in the MCP workflow) had a comment added in 0.51.0 that also commented out the wait for sign-in; fixed.
- `animation` captured a camera keyframe before `view.focus` finished moving the camera; fixed by the command change above.

The second CI run failed two different tests, both reproduced locally under parallel load:

- `board-panel-visibility`: board-surface controls could look enabled while the editor was busy after a fold scrub, and `SessionEditor.Run` ignores actions while busy, so the click was dropped silently and the checkbox reverted. Packaging 1.10.4 refreshes those controls on every busy-state change and shows a wait message if a change still arrives while busy.
- `scene-presentation`: the test inspected and paused the array reveal in separate round trips; a slow runner finished the 6 s reveal in between. It now inspects and pauses in one page task, as its cancellation step already did.

Both pass in two stress rounds (three board tests and two scene tests in parallel). The full CI list (`test/browser/ci-suite.txt`, now including `format-libraries`) passes locally from a clean build, run serially as in CI.
