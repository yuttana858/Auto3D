# Corrugated CAD dimensions, Measurement layer and visual creases

Updated 2026-10-18. Implements the agreed separation between engineering CAD and appearance. See also [packaging-module.md](packaging-module.md) and [paper-packaging-knowledge.md](paper-packaging-knowledge.md).

## Authoritative model

CAD points, score center distances and material specifications are canonical millimetres. Display units, camera perspective, renderer vertex precision, textures, crease bridges and animation are presentation. Never measure a rendering bounding box to produce a production dimension. Vector cut/score exports continue to use CAD points. An engineering allowance is not an open strip between panels.

A crease/score preserves continuous material. A perforation preserves bridges between cuts; a full cut/slot stays open. A manufacturer joint is separately assembled and may overlap. The implemented 0200–0203 generators currently have cut/score paths, not a general perforation authoring system.

## Dimensional formulas and scope

Let S be the flat score distance, t measured combined-board caliper, A_I inside loss and A_O outside gain. I=S-A_I; O=S+A_O. Driving an inside target gives S=I_target+A_I; driving an outside target gives S=O_target-A_O. The implementation supports independent L/W/H factors: A=factor×t. A converter can enter effective factors for a particular material/process; these are not inferred from constituent grammage.

[FEFCO Recommendation 101 (July 2006)](https://www.fefco.org/sites/default/files/documents/RECOMMENDATIONS__101.pdf) primarily addresses 0201 cases and specifies I_L=S_L-t, I_W=S_W-t, I_H=S_H-2t with its stated measurement procedure. Default inside factors are therefore [1,1,2] only for an identified 0201. Other constructions start with custom zero factors. Outside factors start at zero, explicitly indicating that no calibrated correction has been entered. Enter converter values before relying on exterior targets; zero does not establish physical equality of inside/outside dimensions. Driving an inside/outside target with a zero factor requires explicit user-confirmed calibration; otherwise enter a converter factor first. Score-distance targets remain available.

[Esko board documentation](https://docs.esko.com/docs/en-us/ArtiosCAD/21.11/userguide/en-us/common/ac/task/ta_ac_10_AddingABoard.html) stores inside loss and outside gain separately, generally starting at half a caliper per contribution. This does not define every box's height/closure correction. No universal K-factor, minimum bend radius or metal-sheet bend-deduction formula is asserted here.

For D=S+c*t the conservative bound is T_D=T_S+abs(c)*T_t+T_process. This is an engineering propagation rule, not a prescribed universal manufacturing limit. The UI shows the interval [D-T_D,D+T_D]. Clearance and the older selected-box fit reserve remain separate concepts. Avoid counting process variation twice.

[PMMI/FBA B155-TR2.1-2018](https://admin.fibrebox.org/wp-content/uploads/2025/07/B155_TR2-1_RSC_Containers_2018_Edition.pdf) gives flat-panel ±1/16 inch (listed as 1.5 mm) and overall-flat-sheet ±1/8 inch (listed as 3 mm). Scope: B/C singlewall RSCs, burst 150–275 psi or ECT 26–44 lb/in, 4–25 inch panels, automated packaging machinery. It is expressly non-normative. These values are reference data, not prefilled acceptance criteria for all flutes and styles.

## Material database

The Measurement layer keeps up to 32 editable board records in the profile: ID/name, flute/construction, measured caliper and variation, outside/inside liner and medium paper calipers, fibre/grade and grammages (0 means unknown), flute pitch/direction, score process and conditioning, visual score width, default score tolerance, residual process tolerance, three inside and three outside factors, provenance and user-declared calibration status. Duplicate a record to keep alternatives. Activate a record to apply it to the design. This is a portable per-design material database, not an organization-wide remotely synchronized catalog.

Paper calipers must fit within combined-board thickness. They are not stacked as solid medium: the fluting region includes air. Flute height excludes facings. Take-up factor measures paper consumption and never scales a panel. Initial paper calipers are visual placeholders; replace them with measured supplier data. [FEFCO production data](https://www.fefco.org/lca/dscription-of-production-system/corrugated-board-production) explains the distinction. Caliper measurement: [ISO 3034](https://www.iso.org/standard/51266.html); blank measurement: [TAPPI T 827](https://imisrise.tappi.org/TAPPI/Products/01/T/0104T827.aspx); score quality: [T 829](https://imisrise.tappi.org/TAPPI/Products/01/T/0104T829.aspx); conditioning: [T 402](https://imisrise.tappi.org/TAPPI/Products/01/T/0104T402.aspx). Full test methods are needed to execute the procedures.

## Measurement layer

Each measurement references two actual CAD points, with independent mode, basis, target and score-tolerance override. Generated drawings initialize L, W and H; custom drawings initialize up to 24 segment dimensions. Profile validation bounds references, values and record counts. A dangling reference is rejected. Auto reads CAD without a target. Manual applies an entered target once. Parametric holds the target as material specifications change. Basis can be score/CAD, inside or outside. Value labels and tolerance bands report the current calculation; a stale manual target is flagged rather than silently replacing the measured number.

Generated-box edits rebuild the original parametric CAD blank and selected solid atomically, preserving ID, placement, surfaces, history and saved material records. Custom-path edits move the driven endpoint and coincident vertices. Conflicting parametric constraints are rejected; this is not a general geometric constraint solver. CAD path edits that change supported generator geometry disable its original fold route, as before. Generic scaled objects cannot be edited as manufacturing dimensions.

Save/recovery archives include optional `profile.engineering` through existing profile serialization. Older profiles remain valid. SVG/DXF cut/score coordinates stay authoritative; the in-app Measurement overlay is a display layer and does not add toolpaths. Measurements and material metadata are available through shared commands and portable session files.

## Visual crease engine

`CreaseVisualMeshes` creates liner-colored surfaces between matching rails of adjacent panels along known score lines. Endpoints follow both panels during folding, bridging the visual clearances used for stack accommodation. Only known shared score connections are bridged; flap slots and cut edges remain open. Visual meshes are returned separately from rigid panel solids. Collision checks and route audits continue to inspect the original rigid panels; appearance surfaces are not added to those engineering prisms.

These are lightweight interpolated visual joins, not calibrated strain, fibre failure, delamination, paper bending or constitutive simulation. Their job is to remove see-through score gaps. Rendering can therefore look connected while authoritative dimension numbers remain unchanged. Numerical engineering accuracy means faithful CAD/formula evaluation, not a manufacturing certification without measured allowances and sample validation.
