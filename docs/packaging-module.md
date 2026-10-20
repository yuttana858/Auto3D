# Packaging workspace

The right panel’s **Packaging** tab contains the FEFCO catalog and **Open packaging designer**. The model tool strip and right-click Packaging action open this tab. The designer opens a flat dieline editor. Draw point to point on a snapped grid or enter exact X/Y values, finish open paths, or close outlines. Select paths to assign cut/score and edit individual vertices. Red means cut; blue dashed means score. Mouse wheel zooms; Fit drawing frames the complete design. Enter finishes an open path, Shift+Enter closes an outline, and Escape cancels the staged path before closing the dialog.

All design data is canonical millimeters. UI coordinates, caliper, snap input and path lengths use account display units (mm or inches). SVG always has physical `mm` width/height and an unscaled millimeter viewBox with separate CUT/SCORE groups; Y is flipped only for display. DXF is ASCII R2000 (`AC1015`), `LWPOLYLINE`, `$INSUNITS=4` and separate CUT/SCORE layers. DXF SCORE is a separate blue layer; CAD clients may assign their crease linetype. Exports contain vectors, not a raster image or 3D mesh. Machine software must map layers to its operations.

Board caliper presets are approximate nominal flute values, not ECT/burst strength or supplier grades: E 1.5 mm, B 3 mm, C 4 mm, A 4.8 mm, EB 4.5 mm, BC 7 mm. Enter measured caliper for production. Custom grade labels and thickness are supported through `packaging.board`.

## Geometry

Extrude board adds a new independent solid. Closed cut contours define its outline; containment uses the even/odd rule for holes and islands. Multiple disconnected blanks are supported. Open cut paths, self-crossing outlines and touching/intersecting contours are refused before scene mutation. Internal score paths remain crease metadata and export lines: they neither remove material nor fold geometry. The profile lies on X/Z with thickness along Y; profile positive Y maps to negative world Z. Coordinates and thickness are converted into the existing scene's declared unit. Empty scenes begin in millimeters. Existing unknown scene units cause an explicit error rather than an assumed physical conversion.

A design supports at most 100 paths and 2000 points, bounded coordinates ±100000 mm, and positive caliper up to 100 mm. Straight segments are implemented; curves, vector import, bend allowance, fold simulation, individual fluted cross-sections and general fold simulation remain future work. Rendering uses a solid board surface, not individual paper/flute meshes.

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

## FEFCO first set — v0.28.0

The categorized catalog provides original thumbnails and generators for **0201 RSC**, **0200 HSC**, **0202 OSC**, and **0203 FOL**, following identifiers in the [FEFCO 12th edition](https://www.fefco.org/technical-information/fefco-code). RSC and HSC are priority entries; regular, half-slotted and overlap designs have separate groups. Family 02 is available; other families are marked coming later. This is a curated first set, not a complete imported FEFCO database. Drawings and textures are generated locally with original code, with no dependency on an AI provider.

Internal dimensions use **L × W × H**, with W=X, L=Z and H=Y. Fields display account units; command parameters always use millimeters. Dimensions are bounded to 20–10000 mm, length must be at least width, and measured caliper is 0.5–15 mm and at most one eighth of width/height. 0202 overlap must be positive and smaller than width. RSC flap depth is width/2; OSC is (width+overlap)/2; FOL is width. HSC has base flaps and no top flaps. Other styles allow open or closed top flaps.

Generation adds a complete selectable model with separate watertight board panels, layered closure flaps, an inside glue joint, deterministic embedded PNG kraft grain and a corrugated edge texture. Edge texture represents visible flute detail; it is not individually modeled flute geometry. Scene units must be known; an empty scene begins in mm. The generated box is one arrayable session object.

Generation replaces the active dieline with a connected cut outline and crease paths. The profile is a concept drawing: supplier bend, slot, joint and tooling allowances must be confirmed before manufacturing. Editing that profile does not refold the generated box. Generation parameters are saved as bounded JSON in object.userData._auto3dFefco, and the validated profile is attached as packagingProfile. Normal session, selected-model, duplicate/instance and recovery paths preserve them and embedded textures. **Load selected board profile** restores the profile and its generator settings; generating again creates a new box. Undo/Redo adds/removes the model and restores the previous active drawing together.

Shared commands: packaging.fefco.catalog, packaging.fefco.inspect, packaging.fefco.configure (draft settings only), and packaging.fefco.generate. Example:

```json
{"id":"packaging.fefco.generate","args":{"code":"0201","length":400,"width":300,"height":250,"thickness":3,"closure":"open"}}
```

The bottom command bar accepts `generate rsc 400x300x250 mm` and `create hsc 400x300x250`. Explicit 0200–0203 codes are also accepted. Other generator settings use the currently configured draft values. The same generator runs from UI, commands and macros with authentication, busy, read-only and object-limit checks. No remote upload is triggered.

Validation: test/fefco.test.js covers style identity, watertight panels, crease outlines, flap closure geometry, units, invalid parameters, command/macro access, rollback, archive/recovery textures and Undo/Redo. test/browser/fefco.mjs covers catalog thumbnails, HSC/RSC generation, open/closed flaps, saved archive data, input validation, inches and the mobile panel.

## Independent module and unfolding — Auto3D v0.29.0 / Packaging v1.0.0

The generator is now in **modules/packaging**, with its own package, source, geometry/material API, catalog UI/CSS, tests, build and standalone preview. It has no imports from Auto3D’s engine or website. Auto3D’s packagingadapter.js converts neutral canonical-mm meshes/materials to existing engine objects; PackagingWorkspace owns authentication, selection, history and saving. Lightweight profile validation remains shared for archives. Generator geometry, textures and catalog UI load on demand in separate packaging.module.js/CSS assets, keeping module growth outside the main startup bundle. The repository still contains both packages; no separate GitHub repository was created.

Select a generated folded FEFCO box and choose **Unfold selected box**, or type `unfold box`. The action replaces that object with a connected flat board using its stored packagingProfile (not an unrelated current drawing), preserves its current dominant liner/edge materials and embedded textures, and adds red CUT and dashed blue SCORE lines. The sheet is flat on X/Z, with board thickness on Y. Position, visibility and shadow flags are retained; its orientation becomes the canonical flat layout. The box’s generator dimensions and caliper determine the concept drawing. Generic object scaling must be reset before unfolding, so a stretched mesh is not mistaken for a manufacturing-size design. Arbitrary imported models and already-flat sheets are rejected.

Undo restores the original folded object, ordering, selection and the previously active profile. Redo restores the flat sheet. Flat state is stored as object.userData._auto3dPackagingState=flat; ordinary .auto3d/model/recovery archives retain metadata, current materials, textures and line guides. SVG/DXF remain physical-mm vector exports with CUT/SCORE layers. Dielines still require converter/tooling allowance verification; this action is a parameter/profile-based unfold. The supported score-hinge animation added in v1.1.0 is described below.

The strict shared command `packaging.fefco.unfold` accepts an optional objectId, supports macros/result references and reports the new/replaced IDs, style, flat state, caliper and profile path count. UI and commands use the same service with auth/read-only/busy checks and failure rollback.

Independent development commands:

```bash
npm run build_packaging
npm run test_packaging
npm run preview_packaging
# http://localhost:8082 — standalone module preview
```

Root website/dev builds also build/watch the module. Pages artifacts contain separate module JS/CSS; both hashes participate in cache identity and deployment verification. The standalone preview is not deployed with Auto3D. Boundary regressions compile both packages to verify the app startup excludes module geometry/material/UI and the module excludes Auto3D imports.

## Packaging v1.1.0: editable dimensions and folding

After creating or selecting a generated box, **Box dimensions** appears above the FEFCO catalog in the right panel. Select Inside (minimum usable) or Outside (maximum envelope), then edit L/W/H, board caliper or tolerance. Inputs use account mm/inches; inspection and command values use mm. Regeneration follows a 250 ms debounce and preserves selected object ID, placement and current board materials, with Undo/Redo. Flat sheets regenerate their cut/score layout as well. Reset generic object scaling before editing physical dimensions.

The explicit tolerance is a fit reserve per overall dimension: minimum inside = nominal cavity − tolerance; maximum outside = nominal assembled envelope + tolerance. Outside L/W include two calipers; outside H includes actual base/top flap stacks for the selected style and dimensions. Switching the basis preserves the model; editing either basis reverses this math. Tolerance is stored in existing object metadata and survives portable archives. It does not claim a supplier-certified manufacturing allowance. Open flaps are excluded from assembled dimensions.

**Animate flat → open → closed**, or `animate box`, starts a six-second score-hinge sequence. Supported generated boxes and unedited saved dielines form rigid walls, close the base, hold open, then close the top. HSC stays open at the top. Pause/Resume and Cancel remain available while ordinary editing/saving is blocked. Cancellation restores the original without adding history; completion commits an assembled box as one Undo step. Transient panels cannot be archived or exported.

The module owns neutral panel poses and a pausable clock; the host applies Three.js matrices, permissions and history. Playback uses nominal score hinges, without collision detection, bend radii or converter-specific crease allowances. Completion uses the physical box generator for its cavity/envelope. Arbitrary imported models, scaled objects and custom edited profiles are rejected.

Shared commands: `packaging.dimensions.inspect/basis/update`, `packaging.fefco.animate`, `packaging.fefco.playback` and `packaging.fefco.playback.inspect`. Animation starts asynchronously; poll inspection for completion. Pause/resume/cancel bypass the ordinary busy queue but retain authentication/read-only checks.

## Packaging v1.2.0: preset cards and automatic Animate

Preset cards now form one equal-size, two-column grid, with RSC/HSC on the first row and OSC/FOL on the second. Style categories remain on the cards. Each click immediately generates and selects that preset with current draft dimensions/caliper and one Undo step; OSC overlap is repaired if the previous style had an incompatible value.

The single **Animate** button replaces the separate unfold/fold controls. Saved box metadata determines the action: closed → open top flaps, open → closed top flaps, flat → assembled box. HSC has no top flaps, so it alternates assembled → flat → assembled. Undo/Redo and archives preserve the resulting state. Explicit `unfold box` / packaging.fefco.unfold remain available for a full dieline. UI and agent commands share PackagingWorkspace; the standalone host uses the same independent pure planning helpers.

packaging.fefco.preset accepts a strict supported code and completes generation. packaging.fefco.animate now returns its selected action and stages on startup; playback.inspect reports the action while playing and after completion. Pause/Resume/Cancel remain available while ordinary edits and transient saves are blocked. No storage schema changes are needed.

## Packaging v1.3.0: dimension-first creation and CAD assembly

The left panel is open on app startup. The RSC card depicts a closed shipping box and the fresh draft starts closed. New-box L/W/H/caliper fields appear before all four preset cards and remain enabled before generation. They stage values until a card or Generate is clicked; validation uses the complete dimension set. Selected-box inside/outside dimensions and tolerance remain available after generation.

Animate fully unfolds the selected RSC, HSC, OSC or FOL into the exact saved flat CAD profile, then assembles it on the next click. The rig moves walls, base and top flaps along the generated score hinges, with no HSC top flaps. Playback frames the entire sequence so the flat blank stays visible. View dieline in CAD opens the selected box's saved cut/score drawing; the general designer action also loads a selected packaging profile. Completion, Undo/Redo and cancellation keep the active drawing synchronized. Geometry remains in the independent module; original-path/unscaled-object and concept-manufacturing limits still apply.

## Automatic surface maps — app v0.33.0 / module v1.4.0

The neutral module exports GenerateSurfaceTextureSet, ProceduralSurfacePixels and EncodeRGBTexture, using deterministic portable RGB PNGs. Board materials include independent roughness/metalness, specular-color, normal, bump, AO and height maps in addition to the current kraft/flute base images. These are local starter approximations derived from luminance and gradients, with restrained matte nonmetallic defaults. No provider, remote image service or Auto3D dependency is required. The standalone preview uses the same definitions.

Auto3D loads the helper on demand for Auto texture generator, preserving authored maps and placement unless auxiliary regeneration is requested. Base color remains authored even when regenerating. New maps inherit existing placement; wholly unmapped meshes receive box projection. One history entry covers the map bundle and generated UVs. Separate source maps and relief choice persist in portable sessions/recovery.

Commands: material.textures.generate (index **or** objectId; optional overwrite), material.relief, material.texture.preview (interactive), material.texture.save, material.texture.remove, material.uv.preview (interactive), material.uv.generate. Existing material.texture now supports independent roughnessMap replacement. Numeric data maps remain linear; the application's existing color pipeline is retained.

## HSC and solid folding — app v0.34.0 / module v1.5.0

All four available presets now use a common CAD-rig geometry for generation and animation: 0200 HSC (open top), 0201 RSC (meeting outer flaps), 0202 OSC (partial overlap) and 0203 FOL (full overlap). Texture UVs follow the original sheet and the current material maps are preserved. The assembled endpoint is identical to a newly generated box; flat completion retains its cut/score guides.

Finite-caliper convex surface tests include containment and the actual glue-tab shape. Wall hinges use the outside board face. Glue/score clearances and sequential inner/outer flap layers prevent the former corner and closing-lid intersections. Both hosts inspect the full route before scene replacement, yielding a Processing status; every displayed pose is checked too. A failed preflight leaves the source untouched, and a playback error restores it with no history step. During preparation the original remains visible and saving/editing are blocked. Account changes abort preparation.

`packaging.fefco.folding.check` is a strict, nonmutating command for the selected box or an optional objectId. It works in read-only sessions and macros, returns clear/sample count/tolerance and offending panel pairs, and creates no history entry. The route samples 3,601 poses with at most one degree of hinge motion between samples and a 0.00001 mm contact tolerance. This covers the four generated presets; unavailable families are still planned. It is a sampled rigid-panel clearance model with score-compression approximations, not continuous flexible-board physics, external-scene collision detection or manufacturing certification.


## Measurement layer and material specifications — v0.36.0 / module v1.6.0

Open the CAD designer and choose **Measurement layer**, or use **Open Measurement layer** for the selected box. Purple dimension leaders read exact canonical CAD points; each dimension independently selects Auto, Manual or Parametric and score, inside or outside basis. Apply a numerical target to drive the CAD. Parametric targets remain fixed as the active board changes; Manual targets drive once and show a mismatch after later changes; Auto always follows geometry. Each row shows its formula and propagated tolerance interval.

The expandable Material database holds editable, duplicable per-design records. Apply measured board caliper, paper component calipers, flute/pitch, process tolerances and independent L/W/H inside/outside factors. Records and measurement modes survive session/recovery archives and Undo/Redo. Changing specifications rebuilds a matching selected box/board; merely loading an unrelated drawing does not modify scene objects. Generic endpoint driving preserves exactly coincident vertices but is not a general constraint solver. Existing edited-path and scaling restrictions apply.

Shared commands: `packaging.measurements.open`, `packaging.layer`, `packaging.measurements.inspect`, `packaging.measurements.visible`, `packaging.measurements.update`, `packaging.materials.update`, `packaging.materials.activate`, `packaging.materials.duplicate`. Read-only commands do not mutate data; mutation commands validate inputs, use account/session guards and record history. Knowledge commands accept the new `dimensionalEngineering` section.

The 3D module adds bounded rounded crease joins as separate visual meshes. Exact CAD dimensions and collision prisms remain independent. In-app measurement annotations are not cut/score toolpaths; vector exports remain canonical CAD (formatted to six decimal millimetres). Manufacturing allowances require converter calibration. Full formulas, references and limitations: [corrugated-dimensions-and-creases.md](corrugated-dimensions-and-creases.md).
