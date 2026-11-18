// Iso-contours of a heightfield (marching squares), the outlines that Phase 2 lofts pocket walls through. Fields are
// row-major (index j * nx + i) on a grid { nx, nz, dx, dz, x0, z0 }; contours come back as closed or open polylines of
// [x, z] points in mm. Saddle cells are resolved by the cell-centre average, so outlines never cross.

function Lerp (a, b, level) { const d = b - a; return Math.abs (d) < 1e-12 ? 0.5 : (level - a) / d; }

export function IsoContours (values, grid, level)
{
    const { nx, nz, dx, dz, x0, z0 } = grid, segments = new Map (), point = new Map ();
    // Edge ids: horizontal edge (i, j)→(i+1, j) = 2 * (j * nx + i); vertical edge (i, j)→(i, j+1) = 2 * (j * nx + i) + 1.
    const at = edge => {
        if (point.has (edge)) { return point.get (edge); }
        const k = edge >> 1, i = k % nx, j = (k - i) / nx, vertical = edge & 1;
        const a = values[k], b = values[vertical ? k + nx : k + 1], t = Lerp (a, b, level);
        const p = vertical ? [x0 + i * dx, z0 + (j + t) * dz] : [x0 + (i + t) * dx, z0 + j * dz]; point.set (edge, p); return p;
    };
    const link = (a, b) => { (segments.get (a) || segments.set (a, []).get (a)).push (b); (segments.get (b) || segments.set (b, []).get (b)).push (a); };
    for (let j = 0; j + 1 < nz; j++) {
        for (let i = 0; i + 1 < nx; i++) {
            const k = j * nx + i, v0 = values[k], v1 = values[k + 1], v2 = values[k + nx + 1], v3 = values[k + nx];
            const c = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0);
            if (c === 0 || c === 15) { continue; }
            // Cell edges: bottom (0-1), right (1-2), top (3-2), left (0-3).
            const bottom = 2 * k, right = 2 * (k + 1) + 1, top = 2 * (k + nx), left = 2 * k + 1;
            const centre = (v0 + v1 + v2 + v3) / 4 >= level;
            switch (c) {
                case 1 : case 14 : link (left, bottom); break;
                case 2 : case 13 : link (bottom, right); break;
                case 3 : case 12 : link (left, right); break;
                case 4 : case 11 : link (right, top); break;
                case 6 : case 9 : link (bottom, top); break;
                case 7 : case 8 : link (left, top); break;
                case 5 : if (centre) { link (left, top); link (bottom, right); } else { link (left, bottom); link (right, top); } break;
                case 10 : if (centre) { link (left, bottom); link (right, top); } else { link (left, top); link (bottom, right); } break;
            }
        }
    }
    const used = new Set (), contours = [];
    const walk = start => {
        const ids = [start]; used.add (start); let previous = null, current = start;
        for (;;) {
            const next = (segments.get (current) || []).find (e => e !== previous && !used.has (e));
            if (next === undefined) { break; }
            ids.push (next); used.add (next); previous = current; current = next;
        }
        return ids;
    };
    // Open chains first (they end on the grid border), then closed loops.
    for (const [edge, list] of segments) { if (list.length === 1 && !used.has (edge)) { contours.push ({ closed : false, points : walk (edge).map (at) }); } }
    for (const edge of segments.keys ()) {
        if (used.has (edge)) { continue; }
        const ids = walk (edge); contours.push ({ closed : true, points : ids.map (at) });
    }
    return contours;
}

export function PolygonArea (points)
{
    let area = 0; for (let i = 0; i < points.length; i++) { const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length]; area += ax * bz - bx * az; } return area / 2;
}
export function Centroid (points)
{
    let x = 0, z = 0; for (const p of points) { x += p[0]; z += p[1]; } return [x / points.length, z / points.length];
}
