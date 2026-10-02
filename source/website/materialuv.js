import { Coord2D } from '../engine/geometry/coord2d.js';
import * as THREE from 'three';

export function GetBoxUVTriangle (points, bounds)
{
    const a = new THREE.Vector3 (...points[0]);
    const normal = new THREE.Vector3 (...points[1]).sub (a).cross (new THREE.Vector3 (...points[2]).sub (a));
    const weights = [Math.abs (normal.x), Math.abs (normal.y), Math.abs (normal.z)];
    const dominant = weights.indexOf (Math.max (...weights));
    const axes = dominant === 0 ? [2, 1] : dominant === 1 ? [0, 2] : [0, 1];
    return points.map ((point) => axes.map ((axis) => (point[axis] - bounds.min[axis]) / (bounds.max[axis] - bounds.min[axis] || 1)));
}

export function GenerateMissingBoxUVs (viewer, entry)
{
    const originals = new Set (entry.meshes.map ((item) => item.mesh.userData.originalMeshInstance.GetMesh ()));
    for (const original of originals) {
        // Preserve authored coordinates. This action only fills wholly unmapped meshes.
        if (original.TextureUVCount () > 0) { continue; }
        const bounds = { min : [Infinity, Infinity, Infinity], max : [-Infinity, -Infinity, -Infinity] };
        original.EnumerateVertices ((vertex) => {
            [vertex.x, vertex.y, vertex.z].forEach ((value, axis) => {
                bounds.min[axis] = Math.min (bounds.min[axis], value);
                bounds.max[axis] = Math.max (bounds.max[axis], value);
            });
        });
        for (const triangle of original.triangles) {
            const points = [triangle.v0, triangle.v1, triangle.v2].map ((index) => {
                const vertex = original.GetVertex (index);
                return [vertex.x, vertex.y, vertex.z];
            });
            const indices = GetBoxUVTriangle (points, bounds).map ((uv) => original.AddTextureUV (new Coord2D (...uv)));
            triangle.SetTextureUVs (...indices);
        }
        viewer.mainModel.EnumerateMeshes ((mesh) => {
            if (mesh.userData.originalMeshInstance.GetMesh () !== original) { return; }
            const position = mesh.geometry.getAttribute ('position');
            const uv = [];
            // Viewer geometry is expanded per triangle, so adjacent faces can use different projections.
            for (let i = 0; i < position.count; i += 3) {
                const points = [0, 1, 2].map ((offset) => [position.getX (i + offset), position.getY (i + offset), position.getZ (i + offset)]);
                GetBoxUVTriangle (points, bounds).forEach ((point) => uv.push (...point));
            }
            mesh.geometry.setAttribute ('uv', new THREE.Float32BufferAttribute (uv, 2));
        });
    }
}
