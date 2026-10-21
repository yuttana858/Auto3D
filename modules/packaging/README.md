# Packaging module v1.7.0

A separate package for FEFCO 0200–0203 boxes, canonical-mm dielines, physical board extrusion, kraft textures, catalog controls and flat-sheet unfolding. It can be developed or copied to a separate repository without Auto3D source. Its only runtime dependencies are Three.js and fflate, under MIT licenses.

From the Auto3D repository root:

```bash
npm run build_packaging
npm run test_packaging
npm run preview_packaging
```

For a standalone checkout of this folder, install Node.js 22+, run `npm install`, then `npm run build`, `npm test` or `npm run preview`. Preview serves localhost:8082, watches source/CSS changes and has no login, backend, cloud storage or Auto3D dependency. The standalone UI supports generating, unfolding, dimension editing and folding playback. Auto3D provides history/saving through its host adapter.

## Source and build

| File | Responsibility |
| --- | --- |
| src/profile.js | Archive-safe profile validation, contours, bounds, calipers and SVG/DXF |
| src/fefco.js | FEFCO dimensions, validation and original concept layouts |
| src/geometry.js, mesh.js | Folded boxes, connected flat boards and neutral mesh data |
| src/dimensions.js | Inside/outside fit reserve and caliper/layer math |
| src/folding.js, solid.js, foldplayback.js | CAD-mapped rigid panel poses, finite-caliper surface checks and pausable playback clock |
| src/material.js | Embedded PNG kraft grain and corrugated-edge textures |
| src/catalog.js, panel.js, packaging.css | Categories, original thumbnails and host-driven controls |
| preview/ | Independent Three.js viewer and module host |
| test/ | Tests with no Auto3D imports |

The build produces dist/packaging.module.js (ES module), packaging.module.css, module.json and a standalone preview. Auto3D copies only module assets into its website build. Module JavaScript/CSS are loaded on demand. The app imports lightweight pure validation/layout code for archive checks and commands; geometry, PNG generation and catalog UI remain outside its startup bundle. Root boundary tests enforce these rules.

## API v1

```js
import { CreateFefcoBox, UnfoldFefco } from './src/index.js';
const box = CreateFefcoBox({ code: '0201', length: 400, width: 300, height: 250, thickness: 3, closure: 'closed' });
const flat = UnfoldFefco(box.parameters, box.profile);
```

Returned data has apiVersion, units=mm, parameters, profile, materials and meshes. Meshes contain arrays of vertices/normals/UVs, per-triangle index lists and material IDs, and indexed line guides. Texture buffers are ArrayBuffers with PNG name/MIME. No engine classes or host identifiers are returned. A host converts coordinates into its scene units, maps material roles (liner, edge, cut, score), and can replace liner/edge definitions with the current material. UnfoldFefco retains the supplied saved profile; it does not use an unrelated editable draft. CreateBoard also accepts validated custom profiles.

FefcoPanel takes a narrow host object with inspect(), configure(changes), generate(), unfold(), factor(), run(action), blocked() and canUnfold(). factor() converts displayed values to millimeters; the host handles account permissions, selection, errors, asynchronous execution, history and saving. The independent preview is an example host; Auto3D’s PackagingWorkspace.PanelHost() is another.

Both package.json and PackagingModuleVersion in src/index.js must identify the same release; tests check this. API changes require an explicit PackagingAPIVersion change and adapter compatibility review.

## Scope

These are original parametric concept layouts using FEFCO identifiers, not an imported complete database or supplier-certified tooling drawings. Unfolding and rigid score-hinge playback support generated FEFCO boxes. They do not infer folds from arbitrary imported meshes or calculate bend radii or converter-specific production allowances. Corrugation is an edge texture; individual flute geometry is not modeled. The current neutral-material API is designed for the common kraft liner/edge roles.

## Dimensions and folding in v1.1.0

FefcoDimensions(parameters, tolerance) reports nominalInside, nominalOutside, inside minimum and outside maximum in mm. The tolerance is an explicit fit reserve per overall dimension: inside = nominalInside − tolerance; outside = nominalOutside + tolerance. Length/width add two board calipers; height adds actual base/top flap layer stacks. ResolveFefcoDimensions(parameters, target, basis, tolerance) reverses this math and validates the result. The assembled envelope excludes open flap sweep.

CreateFefcoFoldRig(parameters, savedProfile) partitions the original blank into rigid board panels. FefcoFoldPose(rig, progress) returns neutral matrices and stages; FefcoFoldFrame can bake the frame into neutral geometry. FoldPlayback provides Start, Pause, Resume, Stop and Inspect with an injectable clock. Hosts apply matrices during playback and commit CreateFefcoBox with the target closure on completion for the generated physical cavity/envelope. HSC keeps its open top. As of v1.5.0, generation uses the same CAD-derived endpoint solids as playback.

Optional API-v1 panel capabilities add dimensions(), dimensionMode(), updateDimensions(), dimensionsBlocked(), animate(), playback(), control() and canAnimate(). Existing hosts remain compatible with these controls disabled. Dimension edits debounce for 250 ms; Auto3D serializes regeneration, preserves selected IDs/materials/placement, and records Undo. Its transient fold preview blocks saving/editing; cancellation restores the original, and completion records one Undo step. Geometry, UI and playback remain independent of the Auto3D engine.

## Presets and Animate in v1.2.0

The four equal-size preset cards form a two-column grid, retaining style categories inside each card. Clicking a card immediately generates its style using current draft dimensions and caliper. FefcoPreset(input, code) validates the preset and repairs OSC overlap when necessary; the optional panel host preset(code) capability shares this action with Auto3D commands. Legacy hosts use configure + generate.

The single **Animate** button uses FefcoAnimationPlan(parameters, state) to choose its current/target poses. Closed top flaps open; open flaps close; flat sheets assemble into a box. HSC alternates between assembled/open-top and flat because it has no top flaps. The optional animation() host capability supplies the button tooltip. Pause/Resume/Cancel retain the existing playback contract. Auto3D still exposes explicit unfolding through its shared command and typed phrase.

## CAD unfolding and dimension-first presets in v1.3.0

Generation dimensions appear before the catalog cards, enabled before a model exists. Input is staged until generation, so users can change L and W together without rejecting a temporarily invalid pair or losing typed values during refresh. Cards pass preset(code, changes) with the complete canonical-mm dimension/caliper/closure set; OSC overlap repair validates the target style. New hosts accept optional changes in generate(changes); legacy hosts without preset use configure with the complete values followed by generate(). The initial RSC is closed and its thumbnail shows a closed box. The selected-object inside/outside/tolerance editor appears after generation.

FefcoAnimationPlan now toggles every supported style between assembled and flat. An open-top-flap box starts from its saved open pose; the next animation assembles a closed RSC/OSC/FOL or open-top HSC. The rig and flat endpoint use the selected object's original saved cut/score profile. Hosts frame the whole sequence to keep the blank visible. Optional designer() opens the saved drawing in the host CAD editor; standalone preview omits this host-only control. In Auto3D, cancellation restores the prior drawing, and completion/Undo/Redo synchronize drawing, geometry and metadata together. API v1 is retained.

Surface map generation (v1.4.0): GenerateSurfaceTextureSet derives eight embedded PNGs from RGB surface pixels. ProceduralSurfacePixels provides a local fallback. BoardMaterials supplies matte liner/flute defaults with editable roughness, metalness, specular-color, normal, bump, AO and height maps. Displacement defaults to zero. The maps approximate surface detail locally and preserve the independent module boundary.

## Solid surface folding in v1.5.0

All implemented styles (0200 HSC, 0201 RSC, 0202 OSC, 0203 FOL) map to the original CAD cut/score blank. HSC has no roof flaps. Generation and animation use the same rigid finite-caliper solids and assembled endpoint. Each panel carries a convex collision prism; canonical coordinates are restored after extrusion to avoid float32 drift on long fractional-mm blanks.

Outside score-face hinges wrap the sleeve, with one caliper reserved for its glue seam. Inner flaps close before outer flaps. Overlap layers are reserved before rotation; outward-open roof flaps first lift and stand upright before switching hinge faces and folding inward. These caliper-sized score/stack translations approximate crushed/flexible crease regions; individual paper bending is not simulated.

`FefcoFoldContacts(rig, pose)` reports positive-volume intersections in mm, permitting touching surfaces within 0.00001 mm. `FefcoFoldPose` checks its resulting pose and throws with the offending pair before a host displays intersecting panels. `await InspectFefcoFold(rig, optionalYieldCallback)` audits 3,601 poses covering the complete route (maximum one degree per hinge between samples), returning `{clear, code, samples, angularStep, units, tolerance, intersections}` plus the first blocked progress/stage if necessary. Auto3D and the standalone preview audit before replacing the original, yield processing feedback, and restore the original on playback failures. Auto3D exposes the same audit through `packaging.fefco.folding.check`.

Detection covers this generated box’s panels, including its trapezoidal joint. It does not test unrelated scene objects, renderer displacement or arbitrary edited/imported meshes. The route audit is sampled, with exact checks at displayed poses; it is not a continuous collision solver or certified tooling calculation. Original CAD paths and unscaled parameters remain required for folding.


## Engineering measurements and visual continuity in v1.6.0

`engineering.js` evaluates dimensions from actual saved CAD points with independent Auto / Manual / Parametric modes, score / inside / outside basis, tolerance overrides, allowance factors and worst-case intervals. `EngineeringPanel` uses a neutral inspect/update/run host. Optional validated `profile.engineering` persists a per-design material database and dimension references. `EditEngineering`, `ScoreForTarget`, and `DrivePathDimension` provide pure editing primitives; hosts atomically regenerate matching generated objects and reject incompatible constraints.

`CreaseVisualMeshes(rig, pose)` returns separate presentation meshes for known shared scores. `FefcoFoldPose` and `FefcoFoldFrame` include these as `visualMeshes`; `CreateFefcoBox(input, optionalSavedProfile)` retains board specifications. Hosts display them alongside `meshes` and update their buffers during playback. They are excluded from rigid collision solids and authoritative CAD measurements. Editable visual crease width controls bounded rounding; constituent paper calipers and flute pitch remain material/visual metadata, not an inferred mechanical law. Existing API-v1 consumers may ignore optional visual meshes.

Auto3D exposes the controls under Packaging Designer → Measurement layer. The independent preview shows CAD, dimensions/formulas and the rendered box together. See [the engineering contract](../../docs/corrugated-dimensions-and-creases.md) for formula scope, calibration, limits and references. Existing generator inputs and legacy fit-reserve dimensions remain backward compatible; once the Measurement layer is saved, edit engineering targets there rather than through the legacy fit editor.

## Realistic board surfaces in v1.7.0

Optional presentation meshes add restrained panel bowing, score fillets and compressed cut shoulders without modifying CAD or collision meshes. Four independent outer/inner/exposed/wrapped material roles use seamless procedural textures and global flute registration. The neutral panel exposes saved visual controls; Auto3D adds timeline Actions, texture effect controls and strict shared commands. See [board-surface-appearance.md](../../docs/board-surface-appearance.md). API v1 remains compatible.
