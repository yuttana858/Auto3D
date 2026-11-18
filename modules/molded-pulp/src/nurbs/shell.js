// NURBS output of a formed shell (Phase 1). The internal forming result — a heightfield pair on a node grid — stays the
// review model; the output is a closed B-rep built on it: the product-side (top) and tool-side (bottom) faces are
// degree-1 B-spline surfaces through the review nodes (exact at every node, no overshoot between them), sharing one knot
// grid, so the four side faces are exact ruled surfaces between matching perimeter curves (brep.js).
//
// Why degree 1 for now: drafted pulp walls are nearly vertical at grid scale (a 35 mm wall at 4° spans ~2.4 mm, about
// two standard cells), so a cubic surface written as height over the floor plan rings at every rim and floor crease
// (measured up to 13.6 mm between nodes on a 6-can tray). Smooth, compact cubic walls need the walls parameterized by
// height — lofts through pocket outlines — which is Phase 2 (docs/molded-pulp-nurbs.md).
import { PullDirections } from '../orient.js';

// STEP and NURBS output stay at or below this many nodes per side; finer review grids are subsampled (2^k + 1 grids
// subsample exactly by taking every other node).
export const MaxOutputSide = 513;

function Subsample (grid, surfaces, maxSide)
{
    let stride = 1; while ((grid.nx - 1) / stride + 1 > maxSide && (grid.nx - 1) % (stride * 2) === 0 && (grid.nz - 1) % (stride * 2) === 0) { stride *= 2; }
    if (stride === 1) { return { grid, surfaces, stride }; }
    const nx = (grid.nx - 1) / stride + 1, nz = (grid.nz - 1) / stride + 1, top = new Float32Array (nx * nz), bottom = new Float32Array (nx * nz);
    for (let j = 0; j < nz; j++) { for (let i = 0; i < nx; i++) { const k = j * stride * grid.nx + i * stride; top[j * nx + i] = surfaces.top[k]; bottom[j * nx + i] = surfaces.bottom[k]; } }
    return { grid : { ...grid, nx, nz, n : nx, dx : grid.dx * stride, dz : grid.dz * stride }, surfaces : { top, bottom }, stride };
}

// Degree-1 clamped knots at the node coordinates: [c0, c0, c1, …, cn−1, cn−1].
function NodeKnots (start, step, count)
{
    const knots = new Float64Array (count + 2); knots[0] = start;
    for (let i = 0; i < count; i++) { knots[i + 1] = start + i * step; } knots[count + 1] = start + (count - 1) * step;
    return knots;
}

// One shell in its forming frame: grid { nx, nz, dx, dz, x0, z0 }, heights relative to baseY. Points are written in
// world millimetres through the shell's pull direction (a proper rotation, so face orientation is preserved).
export function NurbsShell (grid, surfaces, { baseY = 0, direction = '+y', id = 'pulp-shell', maxSide = MaxOutputSide } = {})
{
    const sub = Subsample (grid, surfaces, maxSide), g = sub.grid, world = PullDirections[direction].world;
    const face = heights => {
        const points = new Float64Array (g.nx * g.nz * 3);
        for (let b = 0; b < g.nz; b++) {
            for (let a = 0; a < g.nx; a++) { const w = world (g.x0 + a * g.dx, baseY + heights[b * g.nx + a], g.z0 + b * g.dz), k = (b * g.nx + a) * 3; points[k] = w[0]; points[k + 1] = w[1]; points[k + 2] = w[2]; }
        }
        return { degreeU : 1, degreeV : 1, knotsU : NodeKnots (g.x0, g.dx, g.nx), knotsV : NodeKnots (g.z0, g.dz, g.nz), countU : g.nx, countV : g.nz, points };
    };
    return { id, direction, top : face (sub.surfaces.top), bottom : face (sub.surfaces.bottom), stride : sub.stride, nodes : [g.nx, g.nz], cellMm : Math.max (g.dx, g.dz) };
}
