# Packaging workspace

The **Packaging** header button and object tool open a flat dieline editor. Draw point to point on a snapped grid or enter exact X/Y values, finish open paths, or close outlines. Select paths to assign cut/score and edit individual vertices. Red means cut; blue dashed means score. Mouse wheel zooms; Fit drawing frames the complete design. Enter finishes an open path, Shift+Enter closes an outline, and Escape cancels the staged path before closing the dialog.

All design data is canonical millimeters. UI coordinates, caliper, snap input and path lengths use account display units (mm or inches). SVG always has physical `mm` width/height and an unscaled millimeter viewBox with separate CUT/SCORE groups; Y is flipped only for display. DXF is ASCII R2000 (`AC1015`), `LWPOLYLINE`, `$INSUNITS=4` and separate CUT/SCORE layers. DXF SCORE is a separate blue layer; CAD clients may assign their crease linetype. Exports contain vectors, not a raster image or 3D mesh. Machine software must map layers to its operations.

Board caliper presets are approximate nominal flute values, not ECT/burst strength or supplier grades: E 1.5 mm, B 3 mm, C 4 mm, A 4.8 mm, EB 4.5 mm, BC 7 mm. Enter measured caliper for production. Custom grade labels and thickness are supported through `packaging.board`.

## Geometry

Extrude board adds a new independent solid. Closed cut contours define its outline; containment uses the even/odd rule for holes and islands. Multiple disconnected blanks are supported. Open cut paths, self-crossing outlines and touching/intersecting contours are refused before scene mutation. Internal score paths remain crease metadata and export lines: they neither remove material nor fold geometry. The profile lies on X/Z with thickness along Y; profile positive Y maps to negative world Z. Coordinates and thickness are converted into the existing scene's declared unit. Empty scenes begin in millimeters. Existing unknown scene units cause an explicit error rather than an assumed physical conversion.

A design supports at most 100 paths and 2000 points, bounded coordinates ±100000 mm, and positive caliper up to 100 mm. Straight segments are implemented; curves, vector import, bend allowance, fold simulation, fluted cross-sections and FEFCO generators are future work. Rendering uses a solid board surface, not individual paper/flute meshes.

Original profiles remain attached to extruded boards. **Load selected board profile** restores that design for editing; subsequent extrusion creates a new solid. It does not silently resize an existing board or bake later object transforms/scaling back into the manufacturing dieline. W/L/H scaling remains the generic model transform tool.

## Persistence and undo

`SceneDocument.packaging` stores the current editable design. `object.packagingProfile` stores the validated profile snapshot from extrusion. Session schema v5 gains optional fields for backward compatibility; the validators check them before replacing a document. Model-only archives preserve their selected board's profile but omit unrelated draft state. Both regular packing and the recovery worker preserve profiles. Apply `database/packaging-profile-sessions.sql` to allow zero-object sessions (model archives still require objects); this changes only a metadata count constraint. Profile-only sessions can be saved to account/device Library or `.auto3d`, even before extrusion. Staged unfinished points are not saved; finish the path first.

Path add/edit/delete, name, board caliper, loading a profile and extrusion use the shared scene history. Extrusion preserves original geometry on Undo/Redo. Explicit logout closes the dialog and discards unfinished points. Account isolation, save ownership, API auth and read-only command checks remain in the existing services.

## Agent interface

Every complete operation uses `PackagingWorkspace`, shared by UI and strict registry commands:

- `packaging.open`, `.inspect`, `.name`
- `packaging.path.add`, `.edit`, `.delete`, `.select`
- `packaging.draft.type/point`, `.back`, `.cancel`, `.finish`
- `packaging.board`, `.extrude`, `.load_selected`
- `packaging.view.fit/snap`
- `packaging.export` returns `{ filename, mime, text, units: 'mm' }`; it does not download/publish.
- `packaging.download` explicitly starts a local vector download.
- Existing `ui.save` and `library.account.save` save profile/session archives.

Point and thickness commands default to global display units; `units: 'mm'` makes dimensions independent of preferences. `packaging.inspect` always reports canonical millimeters. `history.undo/redo` apply to profile and scene changes. Commands that open dialogs remain interactive.

```json
{"id":"packaging.path.add","args":{"points":[[0,0],[100,0],[100,60],[0,60]],"type":"cut","closed":true,"units":"mm"}}
{"id":"packaging.path.add","args":{"points":[[50,0],[50,60]],"type":"score","closed":false,"units":"mm"}}
{"id":"packaging.board","args":{"thickness":3.2,"grade":"Measured B flute","units":"mm"}}
{"id":"packaging.extrude","args":{}}
{"id":"packaging.export","args":{"format":"dxf"}}
```

## Lighting regression fixes

PR #21 replaced the floor shadow-map path with independent caster copies and an RGBA silhouette projected along global lighting. It never enables shadow samplers or changes original model alpha/materials. Renderer state restores after mask/reflection captures, including offscreen PNG tiles. Metallic/clearcoat materials receive uniform specular fill alongside diffuse ambient light. Floor shadows do not produce model self-shadow. See [rendering.md](rendering.md) for current behavior; earlier shadow-frustum/BasicShadowMap descriptions are superseded.

## Validation

`test/packaging.test.js` checks physical caliper, watertight solids, holes/disconnected contours, invalid geometry, SVG/DXF scale/layers, unit conversion, schema/read-only handling, archive/recovery round trips and Undo/Redo. `test/scene-effects.test.js` checks diffuse/environment preservation, shader restoration, capture failure state cleanup, floor depth and Phong response. `test/browser/packaging-effects.mjs` exercises drawing, point editing, vector downloads, extrusion, units and default/studio/night HDRI visibility plus shader errors.
