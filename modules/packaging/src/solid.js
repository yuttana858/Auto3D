import * as THREE from 'three';

// Convex finite-caliper prisms, in the same X/Y/-Z frame as the board meshes.
// SAT tests solid volume, including containment; triangle crossing alone misses
// a board fully enclosed in another. Touching faces/edges are allowed contacts.
export function PanelSolid (points, thickness)
{
    const vertices = [0, thickness].flatMap (y => points.map (p => [p[0], y, -p[1]]));
    const edges = [[0, 1, 0]]; const axes = [[0, 1, 0]];
    points.forEach ((p, i) => { const q = points[(i + 1) % points.length]; const edge = new THREE.Vector3 (q[0] - p[0], 0, p[1] - q[1]).normalize (); edges.push (edge.toArray ()); axes.push (new THREE.Vector3 ().crossVectors (edge, new THREE.Vector3 (0, 1, 0)).toArray ()); });
    return { vertices, edges, axes };
}

export function SolidIntersections (panels, tolerance = 0.00001)
{
    if (!Number.isFinite (tolerance) || tolerance < 0 || tolerance > 0.001) { throw new Error ('Solid contact tolerance must be 0–0.001 mm.'); }
    const transformed = panels.map (panel => {
        const matrix = new THREE.Matrix4 ().fromArray (panel.matrix); const normal = new THREE.Matrix3 ().getNormalMatrix (matrix);
        const vertices = panel.solid.vertices.map (p => new THREE.Vector3 (...p).applyMatrix4 (matrix));
        return { name : panel.name, vertices, bounds : new THREE.Box3 ().setFromPoints (vertices), edges : panel.solid.edges.map (e => new THREE.Vector3 (...e).applyMatrix3 (normal).normalize ()), axes : panel.solid.axes.map (e => new THREE.Vector3 (...e).applyMatrix3 (normal).normalize ()) };
    });
    const intersections = [];
    for (let i = 0; i < transformed.length; i++) {
        for (let j = i + 1; j < transformed.length; j++) {
            const a = transformed[i]; const b = transformed[j];
            if (['x', 'y', 'z'].some (axis => Math.min (a.bounds.max[axis], b.bounds.max[axis]) - Math.max (a.bounds.min[axis], b.bounds.min[axis]) <= tolerance)) { continue; }
            const axes = [...a.axes, ...b.axes];
            for (const x of a.edges) { for (const y of b.edges) { const axis = new THREE.Vector3 ().crossVectors (x, y); if (axis.lengthSq () > 1e-12) { axes.push (axis.normalize ()); } } }
            let depth = Infinity;
            for (const axis of axes) {
                const ap = a.vertices.map (p => p.dot (axis)); const bp = b.vertices.map (p => p.dot (axis));
                const overlap = Math.min (Math.max (...ap) - Math.min (...bp), Math.max (...bp) - Math.min (...ap)); depth = Math.min (depth, overlap);
                if (depth <= tolerance) { break; }
            }
            if (depth > tolerance) { intersections.push ({ panels : [a.name, b.name], penetration : depth }); }
        }
    }
    return { units : 'mm', tolerance, clear : intersections.length === 0, intersections };
}
