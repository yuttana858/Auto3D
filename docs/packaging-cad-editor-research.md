# Packaging CAD / SVG editor research

Updated: 2026-10-06

## Recommendation for Auto3D

Use **SVG as the primary editable 2D packaging document/view format** and maintain a normalized internal packaging-geometry model. Add DXF import/export for converter interoperability. Do not make raw SVG XML the source of truth.

The internal model should own dimensional geometry and packaging semantics:

- units (millimetres internally)
- lines, arcs, polylines, paths and curves
- semantic manufacturing type
- layer
- visibility/lock state
- panel membership
- crease axis
- fold angle and direction
- perforation cut/gap pattern
- board side/material metadata

SVG should then be a view/export representation of that data.

## Browser SVG capability

SVG is a strong fit for Auto3D because modern browsers natively render it and expose SVG elements through the DOM. Auto3D can:

1. parse an uploaded SVG,
2. sanitize it,
3. normalize units and transforms,
4. classify/import vector geometry,
5. render the SVG inline,
6. edit paths/entities interactively,
7. regenerate SVG,
8. save it to disk or embed it in an Auto3D package.

Important import protections:

- remove scripts and event handlers
- reject or sanitize `foreignObject`
- block unexpected external `href`, `url()` and remote resource references
- normalize nested transform matrices
- preserve `viewBox` and dimensional units
- do not infer manufacturing operation from stroke color alone

## Recommended technology stack

### SVGEdit / svgcanvas
MIT licensed browser SVG editor.

Strongest candidate for the interactive editor surface because it already provides selection, transforms, path/node editing, drawing tools and browser embedding.

Auto3D should consume the lower-level editor/canvas capabilities but keep packaging layer types, constraints and fold metadata in its own model.

Source: https://github.com/SVG-Edit/svgedit

### Maker.js
Apache-2.0 JavaScript 2D geometry library from Microsoft.

Useful beneath the UI for:

- exact line/arc geometry
- layers
- chains
- boolean/outline operations
- SVG output
- DXF output
- PDF output
- parametric dielines

Maker.js is particularly attractive for Auto3D because its model/layer structure maps naturally to Cut, Crease and Perf operations.

Source: https://github.com/microsoft/maker.js

### JSCAD
MIT licensed browser/CLI parametric CAD.

Potential future layer for generated structures and 2D-to-3D operations. It is not a finished packaging drawing UI, but is useful for reproducible geometry generation.

Source: https://github.com/jscad/OpenJSCAD.org

### LibreCAD
Traditional open-source 2D CAD. Reads DXF/DWG and writes DXF/DWG/PDF/SVG.

Useful as a reference for CAD commands and interoperability, but its GPL license makes direct embedding into Auto3D unattractive unless that licensing choice is deliberate.

Source: https://github.com/LibreCAD/LibreCAD

## Packaging manufacturing line semantics

Professional packaging CAD systems treat operation type as data rather than merely a color.

Auto3D should initially support:

| Type | Meaning | Suggested display | 3D behavior |
| --- | --- | --- | --- |
| Cut | full cut through board | solid | panel boundary |
| Crease | compression fold line | dashed | fold axis |
| Score | scored/indented rule | dash-dot | optional fold axis |
| Reverse crease | opposite-direction crease | distinct dashed | reverse fold |
| Perforation | alternating cut/gap | short repeating dash | tear/fold capable |
| Cut-crease | alternating cut + crease | custom pattern | mixed hinge/opening |
| Construction | reference only | thin muted | ignored |
| Dimension | measurement/annotation | overlay | ignored |

Do not encode these only as red/blue/yellow strokes. Color is UI. The operation must survive SVG/DXF round trips as metadata/layer/type information.

For perforation, store actual manufacturing parameters such as:

- cut length
- gap length
- repeat pitch
- phase/start state

The SVG `stroke-dasharray` is only a visual representation.

## Professional packaging systems reviewed

### Arden Impact
Commercial structural packaging CAD/CAM. Key ideas worth copying conceptually:

- FEFCO / ECMA parametric standards
- interactive/dynamic constraints
- Cut, Crease, Cut-Crease, Perf, Score and Reverse Crease palette types
- rule length / material area / weight / waste calculations
- nesting
- 3D folding and animation
- manufacturing and machine outputs

Impact's palette system confirms that packaging line semantics should be first-class entity data.

### Esko ArtiosCAD
Commercial packaging CAD. ArtiosCAD uses typed line definitions assigned to manufacturing/main layers. Its documented line model includes Cut, Crease, generic perf and other specialty rules.

This reinforces using semantic entity types plus layer classes.

### EngView
Commercial packaging design suite combining parametric standards with conventional drafting and 3D visualization.

Important product lesson: Auto3D should not force all packaging to remain template-driven. Users should be able to start from a FEFCO generator and then edit the actual dieline.

### Packmage
Packaging CAD plus browser structure tools.

Important concepts:

- L/W/H and caliper inputs
- parametric structure generation
- 2D-to-3D preview
- folding-line definition
- step-and-repeat / nesting

### Pacdora
Browser packaging workflow. Its dieline-to-3D tool accepts SVG/DXF with cut and crease geometry, then lets the user assign fold direction and animation.

Important Auto3D lesson: the packaging module should keep the 2D editor and live 3D fold preview tightly synchronized.

## Proposed Auto3D Packaging CAD interface

### Main layout

**Top command bar**
File / style name, Undo, Redo, units, grid/snap, 2D/3D split, Validate, Save, Export.

**Left drawing rail**
Select, line/polyline, arc, rectangle, trim, extend, offset, fillet, dimension, text, Cut, Crease and Perforation tools.

**Center canvas**
Large SVG/CAD canvas with:

- rulers
- origin
- grid
- snapping
- sheet/blank bounds
- pan/zoom
- semantic line styles
- editable vertices/handles
- selected-panel highlighting

**Right properties**
Selected entity information:

- X/Y coordinates
- length/radius/angle
- entity manufacturing type
- layer
- fold angle
- fold direction
- perforation pattern
- visibility/lock
- board/material information

**Dockable 3D preview**
Continuously folds the current dieline according to crease metadata.

**Bottom timeline**
Uses Auto3D's native animation system for erection sequences and camera animation.

## Initial implementation phases

### Phase 1 — SVG viewer/editor foundation

- upload/open SVG
- sanitized inline rendering
- pan/zoom/rulers/grid
- select/move/rotate
- line/path/node editing
- layers
- semantic Cut / Crease / Perf assignment
- Save SVG / Save Auto3D
- undo/redo

### Phase 2 — packaging CAD geometry

- millimetre coordinate system
- snap endpoints/midpoints/intersections
- line/arc/polyline drawing
- trim / extend / split / join
- offset
- fillet/chamfer
- dimensions
- DXF import/export
- validation

### Phase 3 — folding intelligence

- panel detection
- crease axes
- fold angle and direction
- panel parent/child hierarchy
- live 3D preview
- erection sequence keyframes

### Phase 4 — production tooling

- perforation pattern editor
- cut/crease combined rules
- blank size/area
- cut length/crease length
- nesting / step-and-repeat
- production checks
- converter-specific export profiles

## Validation checks to build

Before a dieline can be marked production-ready, Auto3D should be able to flag:

- open cut contours
- overlapping/duplicate rules
- zero-length entities
- self-intersections
- ambiguous manufacturing types
- crease endpoints that do not meet panel boundaries
- disconnected panels
- invalid perf pitch
- construction lines accidentally marked as Cut
- missing units
- non-uniform imported transforms
- geometry outside sheet/blank bounds

The immediate recommended implementation is **SVGEdit/svgcanvas for interaction + Auto3D packaging semantics + Maker.js for exact 2D geometry and DXF/SVG export**.
