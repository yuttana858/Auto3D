const Sources = [
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
    { id : 'svg-edit', authority : 'SVG-Edit', title : 'SVGEdit browser vector editor', url : 'https://github.com/SVG-Edit/svgedit', access : 'MIT; browser-native SVG editing engine with reusable svgcanvas component' },
    { id : 'makerjs', authority : 'Microsoft', title : 'Maker.js parametric 2D geometry', url : 'https://github.com/microsoft/maker.js', access : 'Apache-2.0; browser/Node line-arc geometry with layers and SVG/DXF/PDF export' },
    { id : 'jscad', authority : 'JSCAD', title : 'OpenJSCAD browser parametric geometry', url : 'https://github.com/jscad/OpenJSCAD.org', access : 'MIT; modular browser/CLI parametric 2D and 3D geometry' },
    { id : 'librecad', authority : 'LibreCAD', title : 'LibreCAD 2D CAD', url : 'https://github.com/LibreCAD/LibreCAD', access : 'GPLv2 project; reads DXF/DWG and writes DXF/DWG/PDF/SVG; desktop reference/editor rather than embeddable web component' },
    { id : 'pacdora-dieline', authority : 'Pacdora', title : 'Dieline to 3D and online packaging design', url : 'https://www.pacdora.com/tools/dieline-to-3d-mockup', access : 'commercial web service; accepts SVG/DXF cut and crease lines and assigns fold direction/animation' },
    { id : 'impact-cad', authority : 'Arden Software', title : 'Impact packaging CAD', url : 'https://www.ardensoftware.com/products/impact-for-designers/', access : 'commercial packaging CAD; parametric standards, cut/crease/perf palettes, 3D folding and manufacturing tools' },
    { id : 'artioscad-lines', authority : 'Esko', title : 'ArtiosCAD line types and layer classes', url : 'https://docs.esko.com/docs/en-us/artioscadenterprise/18/userguide/pdf/ACE18_UserGuide.pdf', access : 'commercial packaging CAD documentation; line-type taxonomy reference' },
    { id : 'packmage-cad', authority : 'Packmage', title : 'Packmage CAD and browser packaging structure tools', url : 'https://www.packmage.com/Cad', access : 'commercial packaging CAD/browser generator; parametric structures, 3D proofing, step-and-repeat' },
    { id : 'engview', authority : 'EngView', title : 'EngView packaging design suite', url : 'https://www.engview.com/en/engview/products/designer-standard', access : 'commercial packaging CAD; parametric drafting, packaging libraries and 3D visualization' },
];

const Knowledge = {
    id : 'paper-packaging.corrugated.v1',
    name : 'Auto3D Corrugated Paper Packaging Knowledge Base',
    updated : '2026-10-06',
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
    cadReferences : [
        { style : 'FEFCO 0201 / RSC', formats : ['DXF', 'SVG', 'PDF', 'JSON'], source : 'Box Blanks', parametric : true, verifiedAgainstPublishedPlate : true, licenseUse : 'commercial generated output allowed; preserve API attribution when API terms require it', url : 'https://boxblanks.com/fefco/0201/' },
        { style : 'FEFCO 0200 / HSC', formats : ['DXF', 'SVG', 'PDF'], source : 'Free Box Template', parametric : true, licenseUse : 'site states free for personal/commercial projects', url : 'https://www.freeboxtemplate.com/corrugated/half-slotted-container-fefco-0200/' },
        { style : 'FEFCO 0427 / hinged-lid tray', formats : ['DXF', 'SVG', 'PDF'], source : 'Free Box Template', parametric : true, licenseUse : 'template page explicitly permits commercial dieline use', url : 'https://www.freeboxtemplate.com/corrugated/tray-with-hinged-lid-fefco-0427/' },
        { style : 'FEFCO 0201, 0301, 0713', formats : ['FreeCAD parametric model', 'DXF export'], source : 'PackagingWorkbench', parametric : true, licenseUse : 'LGPL-2.1-or-later; use as external/reference implementation unless license obligations are intentionally accepted', url : 'https://github.com/stoneproof-tech/PackagingWorkbench' },
        { style : 'mixed ECMA/FEFCO packaging generators', formats : ['Rhino 7/8 IronPython geometry'], source : 'Rhino Packaging Toolkit', parametric : true, licenseUse : 'MIT', url : 'https://github.com/DDR68/Rhino_Packaging_Toolkit' },
        { style : 'FEFCO 0427', formats : ['DXF generator source'], source : 'bikinon/d0427', parametric : true, licenseUse : 'no license located; reference behavior only, do not redistribute/copy implementation', url : 'https://github.com/bikinon/d0427' }
    ],
    svgCad : {
        recommendation : 'Use SVG as Auto3D\'s primary editable 2D packaging interchange/view format, while preserving DXF import/export for converter workflows. Keep a normalized internal geometry model rather than editing raw SVG strings directly.',
        browserCapability : [
            'Modern browsers render SVG natively and allow inline SVG elements to be selected, transformed and edited through the DOM.',
            'An SVG file can be parsed with DOMParser, normalized into Auto3D geometry, edited, regenerated as SVG XML and saved as a Blob/download or persisted inside an .auto3d archive.',
            'SVG viewBox, physical width/height units and transform matrices must be normalized so dimensional CAD data is not accidentally rescaled.',
            'SVG is well suited to cut/crease/perforation display because semantic operations can be stored as group/layer IDs, data attributes, classes, stroke patterns and metadata while the underlying geometry remains vector.',
            'Imported SVG must be sanitized: remove scripts/event handlers, foreignObject, unsafe external href/url references and unexpected embedded content before inserting it into the live DOM.'
        ],
        proposedInternalModel : {
            units : 'mm',
            primitives : ['line', 'polyline', 'polygon', 'path', 'circle', 'arc', 'bezier'],
            entities : ['cut', 'crease', 'score', 'reverse-crease', 'perforation', 'cut-crease', 'construction', 'dimension', 'annotation', 'bleed', 'artwork-safe-area'],
            requiredFields : ['id', 'type', 'geometry', 'layer', 'visible', 'locked'],
            packagingFields : ['ruleType', 'foldAngle', 'foldDirection', 'panelIds', 'creaseAxis', 'perfPattern', 'boardSide', 'manufacturingNotes']
        },
        svgLayerConvention : [
            { id : 'CUT', semantic : 'through cut / knife', suggestedDisplay : 'solid stroke', exportNote : 'do not rely on color alone; preserve semantic layer/type metadata' },
            { id : 'CREASE', semantic : 'crease/fold line', suggestedDisplay : 'dashed stroke', exportNote : 'may carry fold angle/direction metadata for 3D' },
            { id : 'SCORE', semantic : 'score rule', suggestedDisplay : 'dash-dot or distinct pattern', exportNote : 'score can differ from crease in manufacturing treatment' },
            { id : 'PERF', semantic : 'perforation rule', suggestedDisplay : 'short repeating dash/gap', exportNote : 'store cut:gap pitch/pattern separately from visual dasharray' },
            { id : 'CUT_CREASE', semantic : 'alternating cut and crease combination', suggestedDisplay : 'custom repeating pattern', exportNote : 'manufacturing semantics must survive DXF/CFF2 conversion' },
            { id : 'CONSTRUCTION', semantic : 'non-manufacturing reference geometry', suggestedDisplay : 'thin muted stroke', exportNote : 'exclude from manufacturing output unless explicitly requested' },
            { id : 'DIMENSIONS', semantic : 'dimension and annotation geometry', suggestedDisplay : 'non-production overlay', exportNote : 'keep separate from knife/crease geometry' }
        ],
        editFunctions : [
            'pan/zoom/grid/snap',
            'select/multi-select/marquee',
            'move/rotate/mirror/scale',
            'node/vertex editing and bezier handles',
            'line/arc/rectangle/polyline tools',
            'trim/extend/split/join',
            'offset/parallel line',
            'fillet/chamfer',
            'align/distribute',
            'measure/dimension',
            'layer/type reassignment',
            'perf pattern editor',
            'crease fold-angle/direction editor',
            'undo/redo and change history',
            'SVG save-as plus DXF export'
        ],
        implementationCandidates : [
            { tool : 'SVGEdit svgcanvas', fit : 'best starting point for browser SVG selection/path editing/UI primitives', license : 'MIT', caution : 'adapt as an editor surface, but keep packaging semantics in Auto3D data model rather than coupling them to SVGEdit internals', sources : ['svg-edit'] },
            { tool : 'Maker.js', fit : 'strong geometry/export layer for exact lines/arcs, layer organization, DXF/SVG/PDF generation and programmatic parametric dielines', license : 'Apache-2.0', caution : 'imports SVG path data rather than arbitrary full SVG documents; use Auto3D parser for complete file ingestion', sources : ['makerjs'] },
            { tool : 'JSCAD', fit : 'useful for parametric generation and future 2D-to-3D packaging solids/panels', license : 'MIT', caution : 'not a ready-made Illustrator-style editor', sources : ['jscad'] },
            { tool : 'LibreCAD', fit : 'excellent desktop reference for 2D CAD behavior and DXF/SVG conversion', license : 'GPLv2', caution : 'not appropriate to embed directly into Auto3D without accepting GPL obligations', sources : ['librecad'] }
        ],
        sources : ['svg-edit', 'makerjs', 'jscad', 'librecad']
    },
    manufacturingLineTypes : {
        principle : 'Packaging CAD should treat manufacturing operation as semantic data, not merely a stroke color. Professional systems distinguish cut, crease, score, perforation, cut-crease and multiple specialty rules because those operations drive tooling, make-ready and 3D folding behavior.',
        types : [
            { id : 'cut', function : 'separates material completely', threeD : 'panel boundary unless joined elsewhere', manufacturing : 'knife/cutting rule' },
            { id : 'crease', function : 'compresses/forms a hinge without cutting through', threeD : 'primary fold axis', manufacturing : 'creasing rule/channel' },
            { id : 'score', function : 'surface indentation or score treatment', threeD : 'may behave as fold depending board/process setup', manufacturing : 'professional systems may map score differently from crease' },
            { id : 'reverse-crease', function : 'crease in opposite board direction', threeD : 'fold-direction metadata required', manufacturing : 'separate rule/palette in packaging CAD' },
            { id : 'perforation', function : 'alternating cut/gap for tear or fold behavior', threeD : 'may optionally act as fold axis', manufacturing : 'store explicit cut length, gap length and phase/pitch' },
            { id : 'cut-crease', function : 'alternating cut and crease segments', threeD : 'hinge plus weakening/opening behavior', manufacturing : 'must retain sequence rather than flattening to generic dashed line' },
            { id : 'construction', function : 'design/reference geometry only', threeD : 'ignored', manufacturing : 'excluded from knife output' }
        ],
        professionalReference : 'ArtiosCAD and Impact both use typed manufacturing geometry rather than simple visual colors. Impact exposes internal palette types such as Cut, Crease, Cut_crease, Perf, Score and Rev_crease; ArtiosCAD assigns line types to appropriate manufacturing/main layers.',
        foldMetadata : 'Professional packaging tools can map crease/perforation palettes to 3D folding and attach fold angles to individual entities. Auto3D should mirror this model by storing fold angle/direction on semantic crease/perf entities.',
        sources : ['impact-cad', 'artioscad-lines']
    },
    onlineDesignTools : [
        { name : 'Pacdora', category : 'browser packaging design', strengths : ['SVG/DXF dieline upload', 'cut/crease interpretation', 'fold direction and animation', 'large parametric dieline library', 'graphics/mockup workflow'], lessonForAuto3D : 'tight 2D dieline to 3D folding loop; require explicit cut/crease semantics', sources : ['pacdora-dieline'] },
        { name : 'Packmage', category : 'packaging CAD + browser generator', strengths : ['large template library', 'L/W/H/caliper parametrics', '2D structure to 3D', 'folding line definition', 'step-and-repeat'], lessonForAuto3D : 'board caliper and dimensional basis belong in the geometry generator; nesting/step-and-repeat is a later manufacturing feature', sources : ['packmage-cad'] },
        { name : 'Arden Impact', category : 'professional packaging CAD/CAM', strengths : ['FEFCO/ECMA standards', 'dynamic constraints', 'cut/crease/perf/score palettes', '3D animation', 'rule length/area/weight/waste calculations', 'nesting', 'machine output'], lessonForAuto3D : 'semantic rule types, constraints and costing/material metrics are core packaging-CAD concepts', sources : ['impact-cad'] },
        { name : 'EngView', category : 'professional packaging CAD', strengths : ['parametric + conventional drafting', 'packaging design libraries', '3D proofing', 'folding sequences', 'web-shareable 3D'], lessonForAuto3D : 'combine parametric standards with editable drafting rather than forcing every design to remain template-driven', sources : ['engview'] },
        { name : 'SVGEdit', category : 'open-source browser vector editor', strengths : ['selection', 'drawing primitives', 'path editing', 'browser embedding', 'SVG load/edit/save'], lessonForAuto3D : 'good editor-canvas foundation if packaging layers and constraints remain Auto3D-owned', sources : ['svg-edit'] },
        { name : 'Maker.js', category : 'open-source browser geometry engine', strengths : ['exact 2D line/arc models', 'layers', 'boolean/outline utilities', 'SVG/DXF/PDF output'], lessonForAuto3D : 'good parametric/export engine underneath a custom packaging UI', sources : ['makerjs'] },
        { name : 'JSCAD', category : 'open-source parametric browser CAD', strengths : ['reproducible JavaScript geometry', '2D and 3D', 'browser/CLI'], lessonForAuto3D : 'candidate for generated structure/panel operations rather than interactive vector editing', sources : ['jscad'] },
        { name : 'LibreCAD', category : 'open-source desktop 2D CAD', strengths : ['DXF/DWG read', 'DXF/DWG/PDF/SVG write', 'traditional CAD primitives'], lessonForAuto3D : 'reference UX for precision CAD commands and DXF interoperability; license makes direct embedding unattractive', sources : ['librecad'] }
    ],
    cadInterfaceConcept : {
        layout : {
            topBar : ['file name', 'undo/redo', 'units', 'snap', '2D/3D split toggle', 'validate', 'save', 'export'],
            leftRail : ['select', 'line/polyline', 'arc', 'rectangle', 'trim', 'extend', 'offset', 'fillet', 'dimension', 'text', 'crease', 'perforation'],
            center : 'large 2D vector canvas with rulers, grid, page/blank boundary and semantic manufacturing colors/patterns',
            rightPanel : ['entity properties', 'geometry coordinates', 'manufacturing type', 'fold angle/direction', 'perf pattern', 'layer visibility/lock', 'board/material'],
            bottomTimeline : 'optional packaging fold timeline using Auto3D keyframes; panel/crease events align with the native animation engine',
            secondary3D : 'dockable live folded preview synchronized with 2D crease semantics'
        },
        workflow : [
            'Open SVG/DXF or choose FEFCO template',
            'normalize all geometry to mm and classify imported strokes/layers',
            'repair/assign Cut, Crease, Perf, Score and Construction semantics',
            'edit dimensions and geometry with snapping/constraints',
            'define panels and fold directions/angles',
            'preview/fold in 3D',
            'validate open paths, duplicate rules, non-manufacturing entities and ambiguous line types',
            'save editable Auto3D packaging document and export SVG/DXF'
        ]
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
    Knowledge.onlineDesignTools.forEach ((item, index) => add ('online-design-tool', String (index), item));
    Knowledge.manufacturingLineTypes.types.forEach ((item) => add ('manufacturing-line-type', item.id, item));
    Knowledge.svgCad.implementationCandidates.forEach ((item, index) => add ('svg-cad-tool', String (index), item));
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
        const allowed = new Set (['terminology', 'fefco', 'papers', 'flutes', 'multiwall', 'performance', 'referenceGrades', 'cadReferences', 'svgCad', 'manufacturingLineTypes', 'onlineDesignTools', 'cadInterfaceConcept', 'selectionGuidance', 'agentRules', 'sources']);
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
