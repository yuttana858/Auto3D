// Corrugated layer stack and score-strip sampling. All dimensions are millimetres.
// This is a visual/kinematic model, NOT calibrated crease mechanics.
export function ValidateBoardStack (input)
{
    if (!input || !Array.isArray (input.layers) || input.layers.length < 3 || input.layers.length % 2 !== 1) { throw new Error ('Board requires alternating outside liner, medium, inside liner.'); }
    let total = 0;
    const layers = input.layers.map ((layer, index) => {
        const expected = index % 2 ? 'medium' : 'liner';
        if (layer.type !== expected || !Number.isFinite (layer.caliperMm) || layer.caliperMm <= 0 || layer.caliperMm > 10) { throw new Error ('Invalid board layer sequence or caliper.'); }
        total += layer.caliperMm;
        return { type : expected, id : String (layer.id || expected + index), caliperMm : layer.caliperMm, startMm : total - layer.caliperMm, endMm : total };
    });
    const flute = input.flute || {};
    if (!Number.isFinite (flute.pitchMm) || flute.pitchMm <= 0 || !Number.isFinite (flute.heightMm) || flute.heightMm <= 0 || !Number.isFinite (flute.axisRadians || 0) || !Number.isFinite (flute.phaseRadians || 0)) { throw new Error ('Invalid directional flute profile.'); }
    return { layers, totalCaliperMm : total, flute : { pitchMm : flute.pitchMm, heightMm : flute.heightMm, axisRadians : flute.axisRadians || 0, phaseRadians : flute.phaseRadians || 0 }, model : 'visual-reference', units : 'mm' };
}

export function FluteWaveAt (board, x, y)
{
    const { flute } = board;
    const crossFlute = -Math.sin (flute.axisRadians) * x + Math.cos (flute.axisRadians) * y;
    const phase = crossFlute * 2 * Math.PI / flute.pitchMm + flute.phaseRadians;
    return { phase, normalizedHeight : Math.cos (phase), crossFluteMm : crossFlute };
}

export function ScoreSurfaceAt (coordinateMm, score)
{
    // Arc-length parameterization: middle score deforms into a circular arc.
    // The two uncreased wings are joined by position AND tangent continuity.
    const width = Number (score.widthMm); const angle = Number (score.angleRadians);
    if (!Number.isFinite (width) || width <= 0 || !Number.isFinite (angle) || Math.abs (angle) > Math.PI) { throw new Error ('Invalid score width or angle.'); }
    const x = Number (coordinateMm); if (!Number.isFinite (x)) { throw new Error ('Invalid sheet coordinate.'); }
    const q = Math.max (0, Math.min (1, (x + width / 2) / width));
    const curvature = angle / width;
    let position;
    if (Math.abs (angle) < 1e-9) { position = [x, 0]; }
    else if (x < -width / 2) { position = [x, 0]; }
    else {
        const s = Math.min (width, x + width / 2);
        const px = -width / 2 + Math.sin (curvature * s) / curvature;
        const py = (1 - Math.cos (curvature * s)) / curvature;
        if (x > width / 2) {
            const tail = x - width / 2;
            position = [px + tail * Math.cos (angle), py + tail * Math.sin (angle)];
        } else { position = [px, py]; }
    }
    const tangentAngle = angle * q;
    return { positionMm : position, tangent : [Math.cos (tangentAngle), Math.sin (tangentAngle)], normal : [-Math.sin (tangentAngle), Math.cos (tangentAngle)], coordinateMm : x, sheetUV : [x, Number (score.sheetYmm || 0)] };
}

export function SampleConnectedScore (board, score, { segments = 32, spanMm = null } = {})
{
    if (!Number.isInteger (segments) || segments < 4 || segments > 1024) { throw new Error ('Invalid score segment count.'); }
    const width = Number (score.widthMm);
    const span = spanMm === null ? width * 2 : Number (spanMm);
    if (!Number.isFinite (span) || span < width) { throw new Error ('Score span must contain the crease.'); }
    const samples = [];
    for (let i = 0; i <= segments; i++) {
        const x = -span / 2 + i * span / segments;
        const pose = ScoreSurfaceAt (x, score);
        const layers = board.layers.map (layer => {
            const a = pose.positionMm.map ((value, j) => value + pose.normal[j] * layer.startMm);
            const b = pose.positionMm.map ((value, j) => value + pose.normal[j] * layer.endMm);
            return { id : layer.id, type : layer.type, inner : a, outer : b };
        });
        samples.push ({ x, sheetUV : [x, Number (score.sheetYmm || 0)], tangent : pose.tangent, layers, flutePhase : FluteWaveAt (board, x, Number (score.sheetYmm || 0)).phase });
    }
    return { model : 'connected-score-visual-prototype', samples, layers : board.layers.map (layer => layer.id), artwork : { uvMode : 'global-dieline', repeat : false }, medium : { directional : true, pitchMm : board.flute.pitchMm } };
}

export function ReferenceSingleWallStack (caliperMm, { fluteHeightMm = null, pitchMm = 7.7, fluteAxisRadians = 0 } = {})
{
    if (!Number.isFinite (caliperMm) || caliperMm <= 0) { throw new Error ('Invalid measured board caliper.'); }
    // Provisional layer spacing for CAD display only, not constituent paper caliper.
    const facing = caliperMm * 0.08;
    const core = caliperMm - 2 * facing;
    return ValidateBoardStack ({
        layers : [
            { id : 'outside-liner', type : 'liner', caliperMm : facing },
            { id : 'directional-medium', type : 'medium', caliperMm : core },
            { id : 'inside-liner', type : 'liner', caliperMm : facing }
        ],
        flute : { pitchMm, heightMm : fluteHeightMm || core, axisRadians : fluteAxisRadians, phaseRadians : 0 }
    });
}

export function SheetArtworkUV (xMm, yMm, artwork)
{
    const { originMm = [0, 0], sizeMm, face = 'outside' } = artwork || {};
    if (!Array.isArray (sizeMm) || sizeMm.length !== 2 || sizeMm.some (value => !Number.isFinite (value) || value <= 0)) { throw new Error ('Valid artwork dimensions required.'); }
    if (!Number.isFinite (xMm) || !Number.isFinite (yMm) || !['outside', 'inside'].includes (face)) { throw new Error ('Invalid artwork registration.'); }
    return { uv : [(xMm - originMm[0]) / sizeMm[0], (yMm - originMm[1]) / sizeMm[1]], face, wrap : 'clamp', repeat : false };
}


export function CreateCorrugatedSample (options = {})
{
    // A bounded, renderable specimen in the same X/Y/-Z frame as CAD board
    // meshes. Air gaps remain empty; medium is a thin corrugated paper sheet.
    const { widthMm = 80, lengthMm = 80, caliperMm = 3, outsideLinerMm = 0.24, insideLinerMm = 0.24, mediumPaperMm = 0.18, flutePitchMm = 7.7, fluteAxisRadians = 0, samplesAcross = 64, samplesAlong = 16 } = options;
    const values = [widthMm, lengthMm, caliperMm, outsideLinerMm, insideLinerMm, mediumPaperMm, flutePitchMm, fluteAxisRadians];
    if (values.some (v => !Number.isFinite (v)) || widthMm <= 0 || lengthMm <= 0 || widthMm > 1000 || lengthMm > 1000 || caliperMm < 0.5 || caliperMm > 15 || Math.min (outsideLinerMm, insideLinerMm, mediumPaperMm, flutePitchMm) <= 0 || outsideLinerMm + insideLinerMm + mediumPaperMm >= caliperMm || !Number.isInteger (samplesAcross) || !Number.isInteger (samplesAlong) || samplesAcross < 4 || samplesAcross > 512 || samplesAlong < 2 || samplesAlong > 128) {
        throw new Error ('Use finite specimen dimensions, real paper calipers and bounded resolution.');
    }
    const inner = insideLinerMm;
    const outer = caliperMm - outsideLinerMm;
    const middle = (inner + outer) / 2;
    const amplitude = (outer - inner - mediumPaperMm) / 2;
    const flute = { pitchMm : flutePitchMm, heightMm : outer - inner, axisRadians : fluteAxisRadians, phaseRadians : 0 };
    const board = { flute };
    const materialDefinitions = [
        { role : 'outside-liner', name : 'Outside liner', color : [204, 174, 131], roughness : 0.92, metalness : 0 },
        { role : 'fluted-medium', name : 'Directional corrugating medium', color : [171, 133, 84], roughness : 0.98, metalness : 0 },
        { role : 'inside-liner', name : 'Inside liner', color : [197, 165, 120], roughness : 0.94, metalness : 0 }
    ];
    const meshes = [];
    const addLayer = (name, material, elevation) => {
        const data = { name, vertices : [], normals : [], uvs : [], triangles : [], lines : [] };
        // Each interface is a single, continuous indexed grid. The side caps
        // are explicit and share vertices along the cut perimeter.
        const index = (i, j, side) => (j * (samplesAcross + 1) + i) * 2 + side;
        for (let j = 0; j <= samplesAlong; j++) {
            for (let i = 0; i <= samplesAcross; i++) {
                const x = widthMm * i / samplesAcross;
                const z = lengthMm * j / samplesAlong;
                const [low, high] = elevation (x, z);
                for (const y of [low, high]) {
                    data.vertices.push ([x, y, -z]);
                    data.uvs.push ([x / widthMm, z / lengthMm]);
                }
            }
        }
        const face = (a, b, c) => {
            const p = data.vertices[a], q = data.vertices[b], r = data.vertices[c];
            const u = q.map ((v, i) => v - p[i]), v = r.map ((n, i) => n - p[i]);
            const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
            const length = Math.hypot (...cross) || 1;
            const index = data.normals.length;
            for (let i = 0; i < 3; i++) { data.normals.push (cross.map (value => value / length)); }
            data.triangles.push ({ vertices : [a, b, c], normals : [index, index + 1, index + 2], uvs : [a, b, c], material });
        };
        const quad = (a, b, c, d) => { face (a, b, c); face (a, c, d); };
        for (let j = 0; j < samplesAlong; j++) {
            for (let i = 0; i < samplesAcross; i++) {
                const a = index (i, j, 1), b = index (i + 1, j, 1), c = index (i + 1, j + 1, 1), d = index (i, j + 1, 1);
                quad (a, d, c, b);
                quad (index (i, j, 0), index (i + 1, j, 0), index (i + 1, j + 1, 0), index (i, j + 1, 0));
            }
        }
        for (let i = 0; i < samplesAcross; i++) {
            quad (index (i, 0, 0), index (i, 0, 1), index (i + 1, 0, 1), index (i + 1, 0, 0));
            quad (index (i + 1, samplesAlong, 0), index (i + 1, samplesAlong, 1), index (i, samplesAlong, 1), index (i, samplesAlong, 0));
        }
        for (let j = 0; j < samplesAlong; j++) {
            quad (index (0, j + 1, 0), index (0, j + 1, 1), index (0, j, 1), index (0, j, 0));
            quad (index (samplesAcross, j, 0), index (samplesAcross, j, 1), index (samplesAcross, j + 1, 1), index (samplesAcross, j + 1, 0));
        }
        meshes.push (data);
    };
    addLayer ('Outside liner', 0, () => [outer, caliperMm]);
    addLayer ('Fluted medium', 1, (x, z) => {
        const center = middle + amplitude * FluteWaveAt (board, x, z).normalizedHeight;
        return [center - mediumPaperMm / 2, center + mediumPaperMm / 2];
    });
    addLayer ('Inside liner', 2, () => [0, inner]);
    return { apiVersion : 1, units : 'mm', materials : materialDefinitions, meshes, layerStructure : ['outside-liner', 'fluted-medium', 'inside-liner'], flute, artworkMapping : { coordinates : 'global-dieline-mm', repeat : false }, specimen : true, physicalValidation : 'visual-only-unqualified' };
}
