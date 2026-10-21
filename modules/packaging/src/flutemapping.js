export function VisualBoardSpecification (profile)
{
    const board = profile.engineering?.materials.find (m => m.id === profile.engineering.activeMaterialId);
    return { pitchMm : board?.flutePitchMm || 7.7, directionDegrees : board?.fluteDirectionDegrees ?? 90, caliperMm : profile.thickness };
}
export function ExposedEdgeUV (x, y, depth, board)
{
    const angle = board.directionDegrees * Math.PI / 180;
    // The edge image has four waves per tile. Global sheet coordinates keep
    // phase continuous; cuts parallel to flutes show channels, not fake waves.
    return [(-Math.sin (angle) * x + Math.cos (angle) * y) / (4 * board.pitchMm), depth / board.caliperMm];
}
