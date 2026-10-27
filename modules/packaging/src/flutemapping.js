// One phase convention for exposed-edge maps and actual medium specimens.
export function FlutePhaseAt (x, y, pitchMm, axisRadians, phaseRadians = 0)
{
    return (-Math.sin (axisRadians) * x + Math.cos (axisRadians) * y) * 2 * Math.PI / pitchMm + phaseRadians;
}
export function VisualBoardSpecification (profile)
{
    const board = profile.engineering?.materials.find (m => m.id === profile.engineering.activeMaterialId);
    return { flute : board?.flute || 'Custom', pitchMm : board?.flutePitchMm || 7.7, directionDegrees : board?.fluteDirectionDegrees ?? 90, caliperMm : profile.thickness, outsideLinerMm : board?.outsideLinerMm ?? profile.thickness * .08, insideLinerMm : board?.insideLinerMm ?? profile.thickness * .08, mediumPaperMm : board?.mediumPaperMm ?? profile.thickness * .06 };
}
export function ExposedEdgeUV (x, y, depth, board)
{
    const angle = board.directionDegrees * Math.PI / 180;
    // The edge image has four waves per tile. Global sheet coordinates keep
    // phase continuous; cuts parallel to flutes show channels, not fake waves.
    return [(-Math.sin (angle) * x + Math.cos (angle) * y) / (4 * board.pitchMm), depth / board.caliperMm];
}
