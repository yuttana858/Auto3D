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
