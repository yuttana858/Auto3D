// Closed B-rep of a pulp shell from its two B-spline faces (shell.js): top and bottom faces plus four ruled sides that
// share the faces' perimeter curves exactly. Neutral data (no STEP, no three.js) so the solid modeling module can reuse it.
//
// Orientation, derived in the forming frame (proper rotations to world keep it): a face (S(u, v)) has normal ∂u × ∂v.
// Top S(x, z) → −y, outward +y: reversed. Bottom → −y, outward −y: same. Sides are S(s along the perimeter in the face's
// parameter direction, t from top to bottom): z-min side → −z (same), z-max → −z (reversed), x-min → +x (reversed),
// x-max → +x (same). Each loop runs counter-clockwise in its face's parameter space and is reversed for reversed faces, so
// every edge is used once in each direction.

function Row (face, b) { const out = []; for (let a = 0; a < face.countU; a++) { out.push (b * face.countU + a); } return out; }
function Column (face, a) { const out = []; for (let b = 0; b < face.countV; b++) { out.push (b * face.countU + a); } return out; }

// Point indices refer to the face's control net; a ruled side refers to the top and bottom nets ('t' / 'b' prefix).
export function ShellBrep (shell)
{
    const { top, bottom } = shell, U = top.countU, V = top.countV;
    const corner = (face, a, b) => ({ face, index : b * U + a });
    const vertices = {
        T00 : corner ('t', 0, 0), T10 : corner ('t', U - 1, 0), T11 : corner ('t', U - 1, V - 1), T01 : corner ('t', 0, V - 1),
        B00 : corner ('b', 0, 0), B10 : corner ('b', U - 1, 0), B11 : corner ('b', U - 1, V - 1), B01 : corner ('b', 0, V - 1)
    };
    const along = (face, indices, knots) => ({ kind : 'bspline', face, indices, knots, degree : 1 });
    const edges = {
        Tv0 : { from : 'T00', to : 'T10', curve : along ('t', Row (top, 0), top.knotsU) }, Tu1 : { from : 'T10', to : 'T11', curve : along ('t', Column (top, U - 1), top.knotsV) },
        Tv1 : { from : 'T01', to : 'T11', curve : along ('t', Row (top, V - 1), top.knotsU) }, Tu0 : { from : 'T00', to : 'T01', curve : along ('t', Column (top, 0), top.knotsV) },
        Bv0 : { from : 'B00', to : 'B10', curve : along ('b', Row (bottom, 0), bottom.knotsU) }, Bu1 : { from : 'B10', to : 'B11', curve : along ('b', Column (bottom, U - 1), bottom.knotsV) },
        Bv1 : { from : 'B01', to : 'B11', curve : along ('b', Row (bottom, V - 1), bottom.knotsU) }, Bu0 : { from : 'B00', to : 'B01', curve : along ('b', Column (bottom, 0), bottom.knotsV) },
        V00 : { from : 'T00', to : 'B00', curve : { kind : 'line' } }, V10 : { from : 'T10', to : 'B10', curve : { kind : 'line' } },
        V11 : { from : 'T11', to : 'B11', curve : { kind : 'line' } }, V01 : { from : 'T01', to : 'B01', curve : { kind : 'line' } }
    };
    // Loops counter-clockwise in parameter space: (0,0) → (1,0) → (1,1) → (0,1), as [edge, forward].
    const loop = (list, sameSense) => sameSense ? list : list.slice ().reverse ().map (([e, f]) => [e, !f]);
    const side = (rowEdgeTop, rowEdgeBottom, startV, endV, perimeter, knots, sameSense, name) => ({
        name, kind : 'ruled', sameSense, knots, perimeter,
        loop : loop ([[rowEdgeTop, true], [endV, true], [rowEdgeBottom, false], [startV, false]], sameSense)
    });
    const faces = [
        { name : 'Product side', kind : 'surface', face : 't', sameSense : false, loop : loop ([['Tv0', true], ['Tu1', true], ['Tv1', false], ['Tu0', false]], false) },
        { name : 'Tool side', kind : 'surface', face : 'b', sameSense : true, loop : loop ([['Bv0', true], ['Bu1', true], ['Bv1', false], ['Bu0', false]], true) },
        side ('Tv0', 'Bv0', 'V00', 'V10', { top : Row (top, 0), bottom : Row (bottom, 0) }, top.knotsU, true, 'Side z-min'),
        side ('Tv1', 'Bv1', 'V01', 'V11', { top : Row (top, V - 1), bottom : Row (bottom, V - 1) }, top.knotsU, false, 'Side z-max'),
        side ('Tu0', 'Bu0', 'V00', 'V01', { top : Column (top, 0), bottom : Column (bottom, 0) }, top.knotsV, false, 'Side x-min'),
        side ('Tu1', 'Bu1', 'V10', 'V11', { top : Column (top, U - 1), bottom : Column (bottom, U - 1) }, top.knotsV, true, 'Side x-max')
    ];
    return { vertices, edges, faces };
}

// Topology check used by tests and before writing: every edge appears exactly once forward and once reversed.
export function BrepEdgeUses (brep)
{
    const uses = Object.fromEntries (Object.keys (brep.edges).map (e => [e, { forward : 0, reversed : 0 }]));
    for (const face of brep.faces) { for (const [e, forward] of face.loop) { uses[e][forward ? 'forward' : 'reversed']++; } }
    return uses;
}
