const Sources = [
    { id : 'fefco-101', authority : 'FEFCO', title : 'Recommendation 101: internal dimensions (July 2006)', url : 'https://www.fefco.org/sites/default/files/documents/RECOMMENDATIONS__101.pdf', access : 'public recommendation; principally 0201 cases' },
    { id : 'pmmi-fba-rsc-2018', authority : 'PMMI / FBA', title : 'B155-TR2.1-2018: RSC tolerances', url : 'https://admin.fibrebox.org/wp-content/uploads/2025/07/B155_TR2-1_RSC_Containers_2018_Edition.pdf', access : 'public, non-normative technical report with limited scope' },
    { id : 'iso-3034', authority : 'ISO', title : 'ISO 3034:2011: single sheet thickness', url : 'https://www.iso.org/standard/51266.html', access : 'public abstract; full procedure requires complete standard' },
    { id : 'tappi-827', authority : 'TAPPI', title : 'T 827: box blank dimensioning', url : 'https://imisrise.tappi.org/TAPPI/Products/01/T/0104T827.aspx', access : 'public abstract; full method required for procedure' },
    { id : 'tappi-829', authority : 'TAPPI', title : 'T 829: score quality', url : 'https://imisrise.tappi.org/TAPPI/Products/01/T/0104T829.aspx', access : 'public abstract' },
    { id : 'tappi-402', authority : 'TAPPI', title : 'T 402: conditioning and test atmospheres', url : 'https://imisrise.tappi.org/TAPPI/Products/01/T/0104T402.aspx', access : 'public abstract' },
    { id : 'esko-board-allowance', authority : 'Esko', title : 'Adding a Board: inside loss / outside gain', url : 'https://docs.esko.com/docs/en-us/ArtiosCAD/21.11/userguide/en-us/common/ac/task/ta_ac_10_AddingABoard.html', access : 'public documentation; half-caliper convention is a starting value' },
    { id : 'corrugated-creasing-research', authority : 'Thakkar et al. / Eindhoven University of Technology', title : 'Experimental and numerical investigation of creasing in corrugated paperboard', url : 'https://research.tue.nl/en/publications/experimental-and-numerical-investigation-of-creasing-in-corrugate/', access : 'public research abstract; DOI 10.1080/14786430802342576' },
    { id : 'fefco-code', authority : 'FEFCO', title : 'FEFCO Code – Design style library for corrugated board products, 12th edition', url : 'https://www.fefco.org/technical-information/fefco-code', access : 'public summary/index' },
    { id : 'fefco-code-pdf', authority : 'FEFCO', title : 'FEFCO Code, 12th edition (2022)', url : 'https://www.fefco.org/sites/default/files/files/FEFCO%20Code_WEB%287%29.pdf', access : 'copyrighted reference; do not reproduce drawings wholesale' },
    { id : 'fefco-production', authority : 'FEFCO', title : 'Corrugated board production', url : 'https://www.fefco.org/node/1588', access : 'public' },
    { id : 'fefco-testing', authority : 'FEFCO', title : 'Testing methods & recommendations', url : 'https://www.fefco.org/node/534', access : 'public index' },
    { id : 'fefco-cfq', authority : 'FEFCO', title : 'Common Footprint Quality standard', url : 'https://www.fefco.org/technical-information/common-footprint-quality-standard-cfq', access : 'public' },
    { id : 'fba-corrugated', authority : 'Fibre Box Association', title : 'What is Corrugated', url : 'https://www.fibrebox.org/what-is-corrugated', access : 'public' },
    { id : 'fba-handbook', authority : 'Fibre Box Association', title : 'Fibre Box Handbook', url : 'https://www.fibrebox.org/fibre-box-handbook', access : 'commercial reference; metadata only' },
    { id : 'fba-ect', authority : 'Fibre Box Association', title : 'ECT Application and Reference Guide', url : 'https://store.fibrebox.org/products/ect-application-and-reference-guide-1', access : 'commercial reference; metadata only' },
    { id : 'fba-walmart', authority : 'Fibre Box Association / Walmart', title : 'Corrugated Board Specifications / Automation Packaging Standards', url : 'https://www.fibrebox.org/assets/2025/09/Walmart_Corrugated-Board_Specifications_Automation_Packaging_Standards.pdf', access : 'public reference table; retailer-specific, not universal design law' },
    { id : 'pca-profiles', authority : 'Packaging Corporation of America', title : 'Profiles with a Purpose', url : 'https://www.packagingcorp.com/resource-hub/beyond-the-box/profiles-with-a-purpose/', access : 'public' },
    { id : 'boxblanks-cad', authority : 'Box Blanks', title : 'Parametric FEFCO dieline generator and API', url : 'https://boxblanks.com/', access : 'generated site dielines may be used commercially; API output follows API terms/attribution' },
    { id : 'freeboxtemplate-cad', authority : 'Free Box Template', title : 'Free parametric corrugated dielines', url : 'https://www.freeboxtemplate.com/', access : 'site states templates are free for personal and commercial projects; verify per-template terms before redistribution' },
    { id : 'packagingworkbench', authority : 'stoneproof-tech', title : 'PackagingWorkbench for FreeCAD', url : 'https://github.com/stoneproof-tech/PackagingWorkbench', access : 'LGPL-2.1-or-later; parametric FEFCO 0201, 0301, 0713 and DXF dieline export' },
    { id : 'rhino-packaging-toolkit', authority : 'DDR68', title : 'Rhino Packaging Toolkit', url : 'https://github.com/DDR68/Rhino_Packaging_Toolkit', access : 'MIT; open-source parametric packaging generators and prepress utilities' },
    { id : 'd0427-reference', authority : 'bikinon', title : 'd0427 FEFCO 0427 DXF generator', url : 'https://github.com/bikinon/d0427', access : 'no repository license found; reference-only, do not copy code into Auto3D' },
];

const Knowledge = {
    id : 'paper-packaging.corrugated.v1',
    name : 'Auto3D Corrugated Paper Packaging Knowledge Base',
    updated : '2026-10-18',
    scope : 'Corrugated fibreboard packaging, FEFCO style families, board construction, flute profiles, material specifications, strength/performance metrics, and design-selection guidance.',
    limitations : [
        'Use this knowledge as design guidance, not as a substitute for converter drawings, certified board data, transport regulations, lab testing, or customer-specific packaging specifications.',
        'A FEFCO style code describes the structural form of a package; it does not define board grade, dimensions, liner/medium composition, ECT, burst, BCT, moisture resistance, print, closure, or manufacturing tolerance.',
        'FEFCO drawings and full standards remain copyrighted. Auto3D stores facts, classifications, engineering metadata, and source links, not a reproduced style catalog.',
        'Performance values depend strongly on paper grade, grammage, fibre source, flute geometry, converting quality, humidity, print/coating, box dimensions, score quality, stacking pattern, pallet condition, and duration of load.'
    ],
    terminology : [
        { term : 'containerboard', definition : 'Paperboard components used to make corrugated board; principally linerboard and corrugating medium.', sources : ['fba-corrugated'] },
        { term : 'linerboard', definition : 'Flat facing sheet bonded to corrugated medium. Common European categories include kraftliner and testliner.', sources : ['fefco-production'] },
        { term : 'corrugating medium / fluting', definition : 'Paper formed into waves/flutes and bonded to liners, usually with starch adhesive.', sources : ['fefco-production', 'fba-corrugated'] },
        { term : 'single face', definition : 'One corrugated medium bonded to one liner.', sources : ['fefco-production', 'fba-corrugated'] },
        { term : 'single wall', definition : 'One corrugated medium between two liners; also called double face.', sources : ['fefco-production', 'fba-corrugated'] },
        { term : 'double wall', definition : 'Two corrugated mediums separated by a center liner, with outer liners on both faces; five paper plies total.', sources : ['fefco-production', 'fba-corrugated'] },
        { term : 'triple wall', definition : 'Three corrugated mediums with four liners; seven paper plies total.', sources : ['fefco-production', 'fba-corrugated'] },
        { term : 'take-up factor', definition : 'Area of flat corrugating medium consumed per unit area of finished corrugated board. Higher flute arches generally require more medium.', sources : ['fefco-production'] }
    ],
    fefco : {
        edition : 12,
        editionYear : 2022,
        currentReference : 'FEFCO describes the 12th edition as the current design-style library and notes that it added more than one hundred designs, including a retail/e-commerce series.',
        dimensionConvention : {
            order : 'L × W × H',
            units : 'mm',
            basis : 'internal dimensions unless otherwise specified',
            length : 'longer dimension at the opening',
            width : 'shorter dimension at the opening',
            height : 'dimension from opening to base',
            climate : 'FEFCO 12th-edition guidance references measurement under standard climatic conditions around 23 °C and 50% RH.'
        },
        families : [
            { series : '01', name : 'Commercial rolls and sheets', use : 'Raw corrugated rolls/sheets rather than erected cases.' },
            { series : '02', name : 'Slotted boxes', use : 'Typically one-piece cases with manufacturer joint and top/bottom flaps; efficient transit/shipping structures.' },
            { series : '03', name : 'Telescopic boxes', use : 'Two or more pieces where lid and/or bottom telescope over a body; useful for variable-height, protective, or presentation applications.' },
            { series : '04', name : 'Folder boxes and trays', use : 'Usually one-piece die-cut structures with hinged walls/cover; can integrate tabs, handles and displays.' },
            { series : '05', name : 'Slide boxes', use : 'Sleeves, liners and sliding components moving relative to one another.' },
            { series : '06', name : 'Rigid boxes', use : 'Structures with separate end pieces and body, typically requiring stitching or analogous assembly.' },
            { series : '07', name : 'Ready-glued cases', use : 'One-piece cases delivered glued/flat and erected by setting up; suitable for rapid packing.' },
            { series : '08', name : 'Retail and e-commerce packaging', use : 'Series added in the 12th edition for retail/e-commerce-oriented designs.' },
            { series : '09', name : 'Interior fitments', use : 'Pads, liners, partitions, dividers and other internal components.' }
        ],
        representativeStyles : [
            { code : '0201', family : '02', commonName : 'Regular slotted container / regular slotted case', designIntent : 'General-purpose, material-efficient shipping case. Specify dimensions, board grade, joint and closure separately.', caution : 'FEFCO code alone does not guarantee stacking or burst strength.' },
            { code : '0203', family : '02', commonName : 'Full-overlap style slotted case', designIntent : 'Uses overlapping outer flaps; often selected when extra top/bottom panel reinforcement is desired.', caution : 'Actual performance improvement must be verified for the board, product and load case.' },
            { code : '0427', family : '04', commonName : 'Folder / mailer-style family member', designIntent : 'Die-cut folder format frequently used for parcel/e-commerce presentation and protection.', caution : 'Use the official FEFCO drawing or converter CAD definition for exact geometry.' },
            { code : '0713', family : '07', commonName : 'Ready-glued / crash-lock style family member', designIntent : 'Rapid erection from a pre-glued flat case.', caution : 'Commercial naming varies; confirm exact official drawing/version before generating production CAD.' }
        ],
        sources : ['fefco-code', 'fefco-code-pdf']
    },
    papers : {
        linerTypicalGsm : { min : 90, max : 200, note : 'Typical range reported in FEFCO European production data; actual commercial grades extend beyond this range.' },
        mediumTypicalGsm : { min : 90, max : 150, note : 'Typical range reported in FEFCO European production data; actual grades vary.' },
        boardTypicalRangeGsm : { minText : '<300', maxText : '>900', note : 'FEFCO notes finished corrugated board can range from below 300 to above 900 g/m².' },
        linerClasses : [
            { name : 'Kraftliner', fibre : 'Predominantly virgin kraft fibre or kraft-based construction', characteristics : ['high strength potential', 'good moisture robustness relative to many recycled liners', 'used for demanding outer liners'], caution : 'Performance is grade-specific, not guaranteed by the word kraft alone.' },
            { name : 'Testliner', fibre : 'Recycled-fibre-based liner family, sometimes with kraft top layers', characteristics : ['cost/material efficiency', 'broad print/appearance grades', 'widely used in transport packaging'], caution : 'Strength/moisture properties vary significantly by grade and furnish.' }
        ],
        mediumClasses : [
            { name : 'Semi-chemical fluting', characteristics : ['high stiffness/crush potential', 'used where flute performance is prioritized'] },
            { name : 'Recycled fluting', characteristics : ['widely available', 'resource-efficient', 'performance depends strongly on furnish and basis weight'] }
        ],
        sources : ['fefco-production']
    },
    flutes : [
        { code : 'A', nominalFluteHeightMm : 4.8, flutesPerMeter : 110, approximateFlutesPerFoot : 33, takeUpFactor : [1.50, 1.55], relativeProfile : 'large', strengths : ['cushioning', 'bending stiffness', 'vertical compression potential'], tradeoffs : ['thicker board', 'coarser print surface', 'higher medium consumption'], suitableFor : ['fragile products', 'applications favoring cushioning or thickness'], sources : ['fefco-production', 'fba-corrugated', 'pca-profiles'] },
        { code : 'B', nominalFluteHeightMm : 2.4, flutesPerMeter : 150, approximateFlutesPerFoot : 47, takeUpFactor : [1.30, 1.35], relativeProfile : 'medium-fine', strengths : ['flat crush resistance', 'good die-cut/scoring behavior', 'good print surface relative to larger flutes'], tradeoffs : ['less cushioning than A/C', 'lower board thickness'], suitableFor : ['retail cases', 'canned/self-supporting goods', 'die-cut work'], sources : ['fefco-production', 'fba-corrugated'] },
        { code : 'C', nominalFluteHeightMm : 3.6, flutesPerMeter : 130, approximateFlutesPerFoot : 38, takeUpFactor : [1.40, 1.45], relativeProfile : 'medium-large', strengths : ['general-purpose balance of stacking, cushioning and converting'], tradeoffs : ['less fine-print fidelity than E/F', 'thicker than B/E'], suitableFor : ['general transit packaging', 'regular slotted cases'], sources : ['fefco-production', 'fba-corrugated'] },
        { code : 'E', nominalFluteHeightMm : 1.2, flutesPerMeter : 290, approximateFlutesPerFoot : 90, takeUpFactor : [1.20, 1.35], relativeProfile : 'microflute', strengths : ['print surface', 'compact thickness', 'die-cut detail'], tradeoffs : ['less cushioning and vertical column depth than larger flutes'], suitableFor : ['retail packaging', 'small parcels', 'high-graphics corrugated'], sources : ['fefco-production', 'fba-corrugated'] },
        { code : 'F', nominalFluteHeightMm : 0.8, flutesPerMeterApprox : 410, approximateFlutesPerFoot : 125, takeUpFactorGroupF_G_N : [1.15, 1.25], relativeProfile : 'very fine microflute', strengths : ['folding-carton-like surface', 'very compact profile', 'fine print/detail'], tradeoffs : ['limited cushioning', 'requires suitable converting setup'], suitableFor : ['small consumer packs', 'retail presentation'], sources : ['fefco-production', 'fba-corrugated', 'pca-profiles'] },
        { code : 'G/N', nominalFluteHeightMmRange : [0.5, 0.8], flutesPerMeterRange : [400, 550], takeUpFactor : [1.15, 1.25], relativeProfile : 'ultra-fine microflute', strengths : ['very thin corrugated construction', 'print/presentation'], tradeoffs : ['supplier-specific profile availability', 'not interchangeable merely by letter'], suitableFor : ['specialty retail and lightweight presentation packaging'], sources : ['fefco-production'] }
    ],
    multiwall : {
        rule : 'Approximate multiwall caliper can be estimated by adding flute heights, then allowing for liner thickness and process compression. FEFCO quality guidance notes multiwall thickness is calculated by addition of flute heights; actual caliper must be measured/specified.',
        commonCombinations : [
            { code : 'BC', nominalFluteCoreSumMm : 6.0, character : 'Common heavy-duty double wall; combines B flat-crush/converting qualities with C stacking/cushioning.' },
            { code : 'EB', nominalFluteCoreSumMm : 3.6, character : 'Lower-profile double wall; combines microflute print surface with B-flute robustness.' },
            { code : 'AC', nominalFluteCoreSumMm : 8.4, character : 'Thick double wall emphasizing cushioning and structural depth; availability varies.' }
        ],
        warning : 'Do not infer ECT/BCT from flute combination alone. Paper grades and grammages can make two boards with the same flute combination perform very differently.',
        sources : ['fefco-production']
    },
    performance : {
        structuralPrinciples : [
            'Flutes separate liners, increasing section depth and bending rigidity; the flute arches also contribute cushioning and crush behavior.',
            'Larger flute profiles generally favor cushioning and vertical compression strength; smaller profiles generally favor graphics, compactness and fine converting.',
            'Box stacking strength depends on combined-board edge strength, board bending stiffness, box perimeter/dimensions, score and slot quality, manufacturer joint, openings/hand holes, humidity, load duration and pallet/unit-load conditions.'
        ],
        metrics : [
            { id : 'ECT', name : 'Edge Crush Test', measures : 'Force required to cause compressive failure of a specimen loaded on edge.', relevance : 'Primary combined-board indicator used when stacking/compression performance is important; commonly reported in lb/in or kN/m.', caution : 'ECT is not the same as finished-box BCT and cannot alone predict field performance.' },
            { id : 'BCT', name : 'Box Compression Test', measures : 'Maximum compressive load sustained by an erected box between platens.', relevance : 'Direct measure of empty-container compression resistance and a key stacking design input.', caution : 'Lab BCT must be derated/validated for humidity, duration, palletization, handling and product support.' },
            { id : 'Burst', name : 'Burst / Mullen', measures : 'Pressure required to rupture corrugated board with a diaphragm.', relevance : 'Indicator of resistance to rupture/puncture-like loading and an established carrier/specification system.', caution : 'Burst and ECT characterize different failure modes; neither should be substituted blindly for the other.' },
            { id : 'FlatCrush', name : 'Flat Crush', measures : 'Resistance of flutes to crushing when board is compressed through its thickness.', relevance : 'Important for maintaining caliper, cushioning and print/converting quality.', caution : 'Particularly sensitive to flute profile, medium and corrugating/converting damage.' },
            { id : 'Cobb', name : 'Water absorptiveness / Cobb', measures : 'Water absorbed by paper/board over a specified area and time.', relevance : 'Useful for evaluating moisture/water uptake where wet handling or cold-chain exposure matters.', caution : 'A Cobb value is not a complete prediction of wet box compression performance.' },
            { id : 'Adhesion', name : 'Pin adhesion / glue-bond strength', measures : 'Strength of the bond between flute tips and liners.', relevance : 'Weak bonding can undermine ECT, BCT and durability even when component papers are strong.' }
        ],
        fefcoTestReferences : [
            { number : 4, subject : 'Bursting strength' },
            { number : 5, subject : 'Puncture resistance' },
            { number : 6, subject : 'Flat crush resistance' },
            { number : 7, subject : 'Water absorptiveness (Cobb)' },
            { number : 8, subject : 'Edgewise crush resistance' },
            { number : 9, subject : 'Water resistance of glue bond' },
            { number : 11, subject : 'Adhesion strength of glue bond' },
            { number : 50, subject : 'Compression resistance of corrugated fibreboard containers' },
            { number : 51, subject : 'Vertical impact/drop test' }
        ],
        environmentalEffects : [
            'Paper strength and box compression performance are moisture-sensitive. Validate packaging at the humidity/temperature conditions expected in storage and distribution.',
            'FEFCO style dimension guidance uses a controlled reference climate; production drawings should account for board caliper and material behavior.',
            'Long-duration stacking is different from short BCT testing: creep and humidity can reduce usable stacking capacity over time.',
            'Pallet overhang, misalignment and non-uniform support can reduce effective compression strength; unit-load design must be considered together with box design.'
        ],
        sources : ['fba-corrugated', 'fba-ect', 'fefco-testing', 'fefco-cfq']
    },
    referenceGrades : {
        note : 'The following values are examples from a publicly distributed Walmart/FBA packaging specification. They are useful reference points, not universal minimums. Always apply the governing carrier, customer and regional specification.',
        singleWall : [
            { maxGrossWeightLb : 65, maxOutsideSumIn : 75, minBurstPsi : 200, minECTLbPerIn : 32 },
            { maxGrossWeightLb : 80, maxOutsideSumIn : 85, minBurstPsi : 250, minECTLbPerIn : 40 },
            { maxGrossWeightLb : 95, maxOutsideSumIn : 95, minBurstPsi : 275, minECTLbPerIn : 44 },
            { maxGrossWeightLb : 120, maxOutsideSumIn : 105, minBurstPsi : 350, minECTLbPerIn : 55 }
        ],
        doubleWall : [
            { maxGrossWeightLb : 80, maxOutsideSumIn : 85, minBurstPsi : 200, minECTLbPerIn : 42 },
            { maxGrossWeightLb : 100, maxOutsideSumIn : 95, minBurstPsi : 275, minECTLbPerIn : 48 },
            { maxGrossWeightLb : 120, maxOutsideSumIn : 105, minBurstPsi : 350, minECTLbPerIn : 51 },
            { maxGrossWeightLb : 140, maxOutsideSumIn : 110, minBurstPsi : 400, minECTLbPerIn : 61 },
            { maxGrossWeightLb : 160, maxOutsideSumIn : 115, minBurstPsi : 500, minECTLbPerIn : 71 },
            { maxGrossWeightLb : 180, maxOutsideSumIn : 120, minBurstPsi : 600, minECTLbPerIn : 82 }
        ],
        tripleWall : [
            { maxGrossWeightLb : 240, maxOutsideSumIn : 110, minPunctureInOzPerIn : 700, minECTLbPerIn : 67 },
            { maxGrossWeightLb : 260, maxOutsideSumIn : 115, minPunctureInOzPerIn : 900, minECTLbPerIn : 80 },
            { maxGrossWeightLb : 280, maxOutsideSumIn : 120, minPunctureInOzPerIn : 1100, minECTLbPerIn : 90 },
            { maxGrossWeightLb : 300, maxOutsideSumIn : 125, minPunctureInOzPerIn : 1300, minECTLbPerIn : 112 }
        ],
        sources : ['fba-walmart']
    },
    dimensionalEngineering : {
        continuity : 'A score/crease is continuous board with local crushing and bending, not an empty gap. Perforations retain bridges between actual cuts. Slots, full cuts and manufacturer joints retain their intended geometry.',
        authority : 'Canonical CAD points and measured board specifications determine dimensions. Visual crease meshes, display smoothing, perspective, textures and animation never determine engineering measurements.',
        terms : { allowance : 'Intentional nominal CAD correction for folding/assembly.', tolerance : 'Permitted production variation about a nominal dimension.', clearance : 'Intentional space for product fit or assembly.' },
        formulas : [
            { id : 'inside-loss', expression : 'I = S - A_I; S = I_target + A_I', scope : 'Allowance bookkeeping; A_I must match the board, fold, orientation and style.', sources : ['fefco-101', 'esko-board-allowance'] },
            { id : 'outside-gain', expression : 'O = S + A_O; S = O_target - A_O', scope : 'Allowance bookkeeping; outside gain is independent and must include the relevant layer arrangement.', sources : ['esko-board-allowance'] },
            { id : 'fefco-101', expression : 'L_i = S_L - t; W_i = S_W - t; H_i = S_H - 2t', scope : 'Recommendation 101 measurement procedure, primarily 0201 flap-type cases. Not a universal style or closure rule.', sources : ['fefco-101'] },
            { id : 'worst-case-tolerance', expression : 'T_D = T_S + abs(c) * T_t + T_process for D = S + c*t', scope : 'Engineering worst-case bound, not a standard-prescribed universal tolerance. Avoid double-counting process variation.', sources : [] }
        ],
        rscToleranceReference : { panelScoreToScoreMm : 1.5, overallFlatSheetMm : 3, inchValues : ['1/16', '1/8'], note : 'Report lists soft metric equivalents; these apply to flat measurements, not automatically to finished inside dimensions.', scope : 'B/C singlewall RSCs, 150–275 psi burst or 26–44 lb/in ECT, panel dimensions 4–25 inches, automatic packaging machinery. Non-normative technical report; not universal manufacturing limits.', source : 'pmmi-fba-rsc-2018' },
        materialInputs : ['measured combined-board caliper and variation', 'liner and medium paper calipers/composition', 'flute profile, pitch, direction', 'score tooling, width/depth and process', 'conditioning/moisture', 'fold angle, closure and layer stack', 'converter-calibrated inside loss and outside gain'],
        rules : ['Flute height excludes facings and is not finished board caliper.', 'Take-up factor accounts for medium paper consumption; never multiply CAD dimensions by it.', 'Default 0201 inside factors [1,1,2] are a FEFCO reference, not converter certification.', 'Default outside factors are zero until entered; zero is absence of a calibrated correction, not proof that inside and outside sizes are equal.', 'Measure caliper using the applicable complete ISO/TAPPI method; do not infer strength or caliper from flute letter alone.', 'Auto measures CAD; Manual drives a dimension once; Parametric holds a target through material changes. Each dimension has its own basis and tolerance.'],
        sources : ['fefco-101', 'pmmi-fba-rsc-2018', 'iso-3034', 'tappi-827', 'tappi-829', 'tappi-402', 'esko-board-allowance', 'corrugated-creasing-research']
    },
    cadReferences : [
        { style : 'FEFCO 0201 / RSC', formats : ['DXF', 'SVG', 'PDF', 'JSON'], source : 'Box Blanks', parametric : true, verifiedAgainstPublishedPlate : true, licenseUse : 'commercial generated output allowed; preserve API attribution when API terms require it', url : 'https://boxblanks.com/fefco/0201/' },
        { style : 'FEFCO 0200 / HSC', formats : ['DXF', 'SVG', 'PDF'], source : 'Free Box Template', parametric : true, licenseUse : 'site states free for personal/commercial projects', url : 'https://www.freeboxtemplate.com/corrugated/half-slotted-container-fefco-0200/' },
        { style : 'FEFCO 0427 / hinged-lid tray', formats : ['DXF', 'SVG', 'PDF'], source : 'Free Box Template', parametric : true, licenseUse : 'template page explicitly permits commercial dieline use', url : 'https://www.freeboxtemplate.com/corrugated/tray-with-hinged-lid-fefco-0427/' },
        { style : 'FEFCO 0201, 0301, 0713', formats : ['FreeCAD parametric model', 'DXF export'], source : 'PackagingWorkbench', parametric : true, licenseUse : 'LGPL-2.1-or-later; use as external/reference implementation unless license obligations are intentionally accepted', url : 'https://github.com/stoneproof-tech/PackagingWorkbench' },
        { style : 'mixed ECMA/FEFCO packaging generators', formats : ['Rhino 7/8 IronPython geometry'], source : 'Rhino Packaging Toolkit', parametric : true, licenseUse : 'MIT', url : 'https://github.com/DDR68/Rhino_Packaging_Toolkit' },
        { style : 'FEFCO 0427', formats : ['DXF generator source'], source : 'bikinon/d0427', parametric : true, licenseUse : 'no license located; reference behavior only, do not redistribute/copy implementation', url : 'https://github.com/bikinon/d0427' }
    ],
    surfacePresentation : {
        authority : 'Auto3D rendering behavior; visual controls are not manufacturing tolerances or certified tooling specifications.',
        relief : 'A bump map combines paper grain, flute impressions and a signed artwork mask for emboss/deboss. It affects lighting, not CAD vertices, measured caliper or silhouettes.',
        masking : 'Alpha-weighted light/dark masks support independent raised/recessed relief and spot varnish. Varnish blends roughness/specular response while retaining ink and original finish maps.',
        foldRadii : 'Known shared score rails use smooth circular arcs with endpoint corrections for stack offsets. Caliper, score width, flute pitch and score/flute orientation influence a visual compressed radius; exposed strip caps use corrugated-edge shading. Not a calibrated constitutive board model.',
        boardAppearance : 'Optional visual-only panel bow, score fillet softness, cut-edge compression and paper grain are stored separately from CAD dimensions. Four independent outer/inner/exposed/wrapped liner material roles use seamless procedural paper textures and sheet-registered flute edges. These are bounded appearance heuristics, not predicted production stress or converter allowances.',
        foldControls : 'A normalized visual fold slider and timeline fold/unfold Actions evaluate procedural poses independently of canonical CAD. Action spans persist in sessions and support backward/forward seeking; overlapping spans on the same box are rejected. Visual radii are presentation heuristics, not manufacturing allowances.',
        fluteRegistration : 'Generated maps and exposed edges retain global dieline coordinates during folding. Edge texture phase is sampled perpendicular to the material flute axis. Custom relief/UV artwork opts out of automatic map relinking.',
        interaction : 'Texture thumbnails open UV, rotation, tiling and relevant mask tools. Height/displacement cards are hidden; legacy archive data is retained.',
        rendering : 'Foreground Render opens the right render workspace with tile preview, progress and session thumbnails. Background render keeps camera navigation available while scene edits pause; queued camera snapshots remain unchanged. Completed images open in a pan/zoom window. Selected deletion and Clear queue release images; nothing uploads automatically.',
        animations : 'Fold auto-fit eases into and out of the motion. Array creation reveals copies by accelerating sequential drops and frames the final arrangement. Advance camera keyframes override auto-fit; viewport interaction relinquishes camera control.',
        commands : ['material.texture.inspect', 'material.texture.mapping', 'material.texture.preview', 'material.surface.relief', 'material.surface.varnish', 'packaging.fefco.camera', 'object.array', 'object.array.playback', 'object.array.playback.inspect', 'camera.current.inspect', 'render.now', 'render.queue.inspect', 'render.queue.start', 'render.queue.open', 'render.image.view', 'render.queue.delete', 'render.queue.clear']
    },
    selectionGuidance : [
        { need : 'lowest-cost general transit case', consider : ['FEFCO 0201', 'C or B single wall', 'ECT/BCT sized to stacking and distribution'], validate : ['gross weight', 'case dimensions', 'pallet pattern', 'humidity', 'compression test'] },
        { need : 'fragile product / cushioning', consider : ['A or C flute', 'double wall if compression and puncture loads are high', 'interior fitments from FEFCO 09 family'], validate : ['shock/drop test', 'flat crush', 'product resonance/cushioning study'] },
        { need : 'high graphics / compact retail pack', consider : ['E/F/microflute', 'folder styles in FEFCO 04', 'white-top liner where appearance matters'], validate : ['print method', 'score cracking', 'die-cut tolerance', 'flat crush after printing'] },
        { need : 'heavy stacked load', consider : ['higher-ECT board', 'double/triple wall where justified', 'B/C or BC combinations', 'RSC/full-overlap/telescope structure depending product'], validate : ['finished-box BCT', 'creep/humidity derating', 'pallet support and overhang', 'warehouse stack duration'] },
        { need : 'e-commerce mailer', consider : ['FEFCO 04 or 08 family', 'E/B or EB where presentation and durability are both needed', 'right-size dimensions'], validate : ['drop/impact', 'closure/tamper performance', 'returnability', 'parcel handling environment'] },
        { need : 'wet/cold-chain produce', consider : ['CFQ/common-footprint concepts where applicable', 'moisture-resistant liner/coating systems', 'stackable tray geometry'], validate : ['Cobb/water absorption', 'wet BCT', 'bottom deflection', 'cold-chain humidity', 'recyclability requirements'] }
    ],
    agentRules : [
        'Ask for product mass, L×W×H, fragility, stacking height/load, pallet pattern, distribution mode, humidity/wet exposure, print requirements, assembly method and regional/customer standard before making a final packaging recommendation.',
        'Treat flute letter as geometry, not strength grade.',
        'Treat ECT and burst as different properties; do not convert between them without a validated specification or empirical correlation for the exact board family.',
        'For compression-critical designs, prefer a target finished-box BCT with environmental/unit-load safety factors over selecting board from ECT alone.',
        'When generating geometry from a FEFCO code, reference the official drawing/version rather than inventing flap proportions from the four-digit number.',
        'Before production release, require converter CAD/dieline confirmation and physical testing appropriate to the use case.'
    ],
    sources : Sources
};

function tokenize (value)
{
    return String (value || '').toLowerCase ().split (/[^a-z0-9]+/).filter ((token) => token.length > 1);
}

function score (value, tokens)
{
    const text = JSON.stringify (value).toLowerCase ();
    let total = 0;
    for (const token of tokens) {
        if (text.includes (token)) { total += token.length > 4 ? 2 : 1; }
    }
    return total;
}

function searchKnowledge (query)
{
    const tokens = tokenize (query);
    if (!tokens.length) { return []; }
    const candidates = [];
    const add = (type, id, value) => {
        const relevance = score (value, tokens);
        if (relevance > 0) { candidates.push ({ type, id, relevance, data : value }); }
    };

    Knowledge.fefco.families.forEach ((item) => add ('fefco-family', item.series, item));
    Knowledge.fefco.representativeStyles.forEach ((item) => add ('fefco-style', item.code, item));
    Knowledge.flutes.forEach ((item) => add ('flute', item.code, item));
    Knowledge.performance.metrics.forEach ((item) => add ('performance-metric', item.id, item));
    Knowledge.selectionGuidance.forEach ((item, index) => add ('selection-guidance', String (index), item));
    Knowledge.dimensionalEngineering.formulas.forEach ((item) => add ('dimensional-formula', item.id, item));
    add ('dimensional-engineering', 'corrugated-measurements', Knowledge.dimensionalEngineering);
    add ('surface-presentation', 'visual-corrugated-finishes', Knowledge.surfacePresentation);
    Knowledge.terminology.forEach ((item) => add ('term', item.term, item));
    candidates.sort ((a, b) => b.relevance - a.relevance);
    return candidates.slice (0, 12);
}

function response (data, status = 200)
{
    return new Response (JSON.stringify (data, null, 2), {
        status,
        headers : {
            'Content-Type' : 'application/json; charset=utf-8',
            'Cache-Control' : 'public, max-age=3600',
            'Access-Control-Allow-Origin' : '*',
            'X-Content-Type-Options' : 'nosniff'
        }
    });
}

export function onRequestGet (context)
{
    const url = new URL (context.request.url);
    const section = url.searchParams.get ('section');
    const query = url.searchParams.get ('q');

    if (query) {
        return response ({
            knowledgeBase : { id : Knowledge.id, name : Knowledge.name, updated : Knowledge.updated },
            query,
            results : searchKnowledge (query),
            safety : Knowledge.limitations
        });
    }

    if (section) {
        const allowed = new Set (['terminology', 'fefco', 'papers', 'flutes', 'multiwall', 'performance', 'referenceGrades', 'cadReferences', 'dimensionalEngineering', 'surfacePresentation', 'selectionGuidance', 'agentRules', 'sources']);
        if (!allowed.has (section)) { return response ({ error : 'Unknown knowledge section.' }, 404); }
        return response ({
            knowledgeBase : { id : Knowledge.id, name : Knowledge.name, updated : Knowledge.updated, scope : Knowledge.scope },
            section,
            data : Knowledge[section],
            limitations : Knowledge.limitations,
            sources : Sources
        });
    }

    return response (Knowledge);
}
