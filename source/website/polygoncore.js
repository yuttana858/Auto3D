import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

export async function SimplifyPackedMesh (data, retain, error)
{
    if (!Number.isFinite (retain) || retain < 0.05 || retain > 1 || !Number.isFinite (error) || error < 0 || error > 0.05) { throw new Error ('Use 5–100% retained triangles and 0–5% relative error.'); }
    await MeshoptSimplifier.ready;
    const groups = new Map (); const total = data.corners.length / 12;
    const batches = new Map ();
    for (let triangle = 0; triangle < total; triangle++) { const base = data.materials[triangle * 2] + ':' + data.materials[triangle * 2 + 1]; const count = batches.get (base) || 0; const key = base + ':' + Math.floor (count / 200000); batches.set (base, count + 1); if (!groups.has (key)) { groups.set (key, []); } groups.get (key).push (triangle); }
    const kept = []; const metadata = []; let measuredError = 0;
    const canonical = (buffer, stride) => { const map = new Map (); const result = new Uint32Array (buffer.length / stride); for (let i = 0; i < result.length; i++) { const key = Array.from (buffer.subarray (i * stride, (i + 1) * stride)).join (','); if (!map.has (key)) { map.set (key, i); } result[i] = map.get (key); } return result; };
    const canonicalVertices = canonical (data.vertices, 3); const canonicalNormals = canonical (data.normals, 3); const canonicalUVs = canonical (data.uvs, 2); const canonicalColors = canonical (data.colors, 3);
    for (const triangles of groups.values ()) {
        const count = triangles.length * 3; const indices = new Uint32Array (count); const mapping = []; const unique = new Map ();
        for (let corner = 0; corner < count; corner++) {
            const source = triangles[Math.floor (corner / 3)] * 12 + (corner % 3) * 4;
            const [v, n, u, c] = data.corners.subarray (source, source + 4);
            const key = [canonicalVertices[v], n < 0 ? -1 : canonicalNormals[n], u < 0 ? -1 : canonicalUVs[u], c < 0 ? -1 : canonicalColors[c]].join (':');
            if (!unique.has (key)) { unique.set (key, mapping.length); mapping.push (source); } indices[corner] = unique.get (key);
        }
        const positions = new Float32Array (mapping.length * 3); const attributes = new Float32Array (mapping.length * 8);
        mapping.forEach ((source, index) => { const [v, n, u, c] = data.corners.subarray (source, source + 4); positions.set (data.vertices.subarray (v * 3, v * 3 + 3), index * 3); if (n >= 0) { attributes.set (data.normals.subarray (n * 3, n * 3 + 3), index * 8); } if (u >= 0) { attributes.set (data.uvs.subarray (u * 2, u * 2 + 2), index * 8 + 3); } if (c >= 0) { attributes.set (data.colors.subarray (c * 3, c * 3 + 3).map ((value) => value / 255), index * 8 + 5); } });
        const target = Math.max (3, Math.floor (triangles.length * retain) * 3);
        const [reduced, actualError] = target >= count ? [indices, 0] : MeshoptSimplifier.simplifyWithAttributes (indices, positions, 3, attributes, 8, [0.5, 0.5, 0.5, 1, 1, 1, 1, 1], null, target, error, ['LockBorder']);
        measuredError = Math.max (measuredError, actualError);
        for (let i = 0; i < reduced.length; i++) { const offset = mapping[reduced[i]]; for (let k = 0; k < 4; k++) { kept.push (data.corners[offset + k]); } if (i % 3 === 0) { metadata.push (data.materials[triangles[0] * 2], data.materials[triangles[0] * 2 + 1]); } }
    }
    return { corners : new Int32Array (kept), materials : new Int32Array (metadata), before : total, after : kept.length / 12, error : measuredError };
}
