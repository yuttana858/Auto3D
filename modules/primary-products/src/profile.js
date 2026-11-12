import { CreatePrimaryProduct } from './geometry.js';

// Orthographic filled projections of the real component triangles. One SVG path per
// component avoids thousands of DOM nodes and does not introduce another CAD model.
export function ProfileProjection (draft, plane = 'front')
{
    const data = CreatePrimaryProduct (draft), axis = plane === 'top' ? 2 : 1;
    return data.components.map (mesh => {
        const paths = [];
        for (let i = 0; i < mesh.indices.length; i += 3) {
            const points = mesh.indices.slice (i, i + 3).map (id => [mesh.positions[id * 3], mesh.positions[id * 3 + axis]]);
            const [a, b, c] = points, area = (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
            if (area < 1e-8) { continue; }
            paths.push ('M' + points.map (p => p.map (n => Math.round (n * 10000) / 10000).join (',')).join ('L') + 'Z');
        }
        return { id : mesh.id, role : mesh.materialRole, path : paths.join ('') };
    });
}
