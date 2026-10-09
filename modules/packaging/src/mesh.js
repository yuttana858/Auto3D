// Portable mesh contract: canonical mm; material/normal/UV indices per triangle.
export function MeshData (geometry, name, materialForGroup, uvForVertex)
{
    const data = { name, vertices : [], normals : [], uvs : [], triangles : [], lines : [] }; const positions = geometry.getAttribute ('position'); const normals = geometry.getAttribute ('normal'); const uvs = geometry.getAttribute ('uv'); const ids = []; const vertices = new Map ();
    for (let i = 0; i < positions.count; i++) {
        const point = [positions.getX (i), positions.getY (i), positions.getZ (i)]; const key = point.map (value => value.toFixed (8)).join (','); if (!vertices.has (key)) { vertices.set (key, data.vertices.length); data.vertices.push (point); } ids.push (vertices.get (key));
        data.normals.push ([normals.getX (i), normals.getY (i), normals.getZ (i)]); data.uvs.push (uvForVertex ? uvForVertex (i, uvs) : [uvs.getX (i), uvs.getY (i)]);
    }
    const index = geometry.getIndex (); const at = i => index ? index.getX (i) : i;
    for (const group of geometry.groups) { for (let i = group.start; i < group.start + group.count; i += 3) { const refs = [at (i), at (i + 1), at (i + 2)]; data.triangles.push ({ vertices : refs.map (ref => ids[ref]), normals : refs, uvs : refs, material : materialForGroup (group.materialIndex) }); } }
    return data;
}
