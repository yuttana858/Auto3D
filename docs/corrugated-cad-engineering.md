# Corrugated CAD: connected panels, directional medium and artwork

## Scope and coordinate frame
Treat a dieline as a single 2D sheet with a continuous global parameterization (u,v) in millimeters. Keep the uncut material layers connected in sheet coordinates, including score zones. Each fold has a stable shared hinge identity; cuts are explicitly disconnected boundaries. Use the same global sheet UV for outer artwork; do not reset image coordinates per panel, which causes panel seams and artwork duplication.

## Layered stock
A single-wall sheet has outside liner, adhesive contacts, fluted medium, adhesive contacts, and inside liner. Double/triple walls insert intermediate liners and further independent medium layers. Each layer carries independent paper GSM, thickness, machine/cross direction, optical properties, print/coat layers and optional mechanical test data. Render real edge cross-sections from the layer stack; flute waveform is anchored to one sheet-level flute axis and phase, not a generic repeated edge image.

## Dieline topology
- Panel: polygon with material/print region and local transform derived from global sheet UV.
- Edge: cut, full-cut, partial-cut, score, reverse-score, perf, fold, glue-tab/adhesive seam, or undefined.
- Score: shared edge with connected material through the crease and a width/depth/crush field; hinges may bend to signed angles and are not duplicated cuts.
- Flute axis: global direction in sheet coordinates. Preserve across connected flaps and panels after folding.
- Flap/joint: panel geometry and assembly relationship; glue seams connect assemblies by adhesive, not by material continuity.
- Score compensation: account for supplier measured caliper, inside/outside dimensions, score-center position, compressed hinge zone, and bend radius. See FEFCO 0201 dimensional rules.

## Geometry and deformation
Initially use a developable sheet deformation with the neutral surface mapped to a rounded hinge transition (not two intersecting rigid thick slabs). Adjacent panels reference shared boundary nodes, and the inside/outside liners are generated as offsets along the deformed surface normal; stitch at non-cut edges. At creases, compress/redistribute the medium locally while preserving liner continuity. Avoid adding extra inner material when the hinge bends. Model compression and adhesive release as explicit optional failure states, never hidden compensation geometry. Physical prediction needs board-specific orthotropic stiffness, plasticity, score-crush, moisture and bend-moment-vs-angle curves validated experimentally.

## Artwork and material maps
- Artwork: unique image placement in global dieline coordinates and designated outside/inside face; never step-repeat unless deliberately designed in artwork.
- Raw fiber: procedural periodic/noise grain with physical scale and orientation; step-repeat is allowed when no registered artwork exists.
- Flute medium: physical directional waveform, independent surface shading/color/bump; phase/pitch continuous across the sheet and consistent on cut edges.
- Spot gloss: separate UV-registered varnish/clearcoat mask, not the same channel as substrate roughness or metalness.
- Roughness/gloss maps, normals, bump, specular, AO and color maps remain separate and tagged with correct color spaces (color in sRGB, scalar vectors/data maps linear).
- Model editor changes must update renderer and portable session data together; import/export must preserve layer assignment and artwork anchoring.

## Engineering acceptance tests
1. Fold any connected score from 0 to 180 degrees and back: no gap, overlap slab, duplicate liner or UV seam at the score.
2. End-on board rendering shows outside/inside liners and the correct periodic flute in the correct axis, phase and pitch.
3. A single artwork stripe spanning a score remains continuous after folding; artwork is never re-tiled per panel.
4. Physical-paper grain on artwork-free surfaces remains at calibrated scale; interior corrugating medium is not overwritten by outer artwork.
5. Flat-sheet area, layer area, medium take-up, and estimated mass remain consistent across pose changes; fold deformations do not create new sheet area.
6. RSC FEFCO 0201 dimensions are assessed against inside/outside/score-to-score conventions with measured stock/score allowances.
7. Visible cross-section and bend appearance is compared to real samples for A/B/C/E/F and selected double-wall combinations.
8. Gracefully degrade to visual-only simulation without calibrated supplier mechanical parameters; do not advertise load/strength predictions.

## Source trail
- FEFCO flute profiles and take-up: https://www.fefco.org/node/1588
- Fibre Box Association components and board construction: https://www.fibrebox.org/what-is-corrugated
- EngView FEFCO 0201 dimensional rules: https://downloads.engview.com/online_help/7.3/packaging_library/en/Corrugated_Standards_Library/FEFCO_Standards_Library/F_0200/0201/0201_Main_Parameters.htm
- ISO 3037 ECT: https://www.iso.org/standard/80310.html
- TAPPI test index (including score quality and bending): https://www.tappi.org/menus/publications-standards/tappi-publications/standard-specific-interest-group/fiberboard-shipping-containers/

All flute values in the JSON catalog are indicative references; company/supplier values will override them, with provenance and measurement method stored.
