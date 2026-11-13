// Clip the actual inner cavity of a bottle, then close the horizontal liquid surface.
// The caller supplies a closed outer+inner wall mesh made by AddInnerWall.
export function BottleFill (body, contents, wall)
{
    if (!contents || contents.fillPercent <= 0) { return null; }
    const half = body.positions.length / 6, faceStart = body.indices.length / 2, gap = Math.min (.1, wall * .1);
    const points = [], normals = [], averages = new Map ();
    const key = p => p.map (v => Math.round (v * 1e7)).join (',');
    for (let i = half; i < body.positions.length / 3; i++) {
        const k = key (body.positions.slice (i * 3, i * 3 + 3)), n = body.normals.slice (i * 3, i * 3 + 3), sum = averages.get (k) || [0, 0, 0];
        n.forEach ((v, axis) => { sum[axis] += v; }); averages.set (k, sum);
    }
    for (let i = half; i < body.positions.length / 3; i++) {
        const n = body.normals.slice (i * 3, i * 3 + 3), p = body.positions.slice (i * 3, i * 3 + 3);
        const sum = averages.get (key (p)), length = Math.hypot (...sum) || 1;
        points.push (p.map ((v, axis) => v + sum[axis] / length * gap)); normals.push (n.map (v => -v));
    }
    const low = Math.min (...points.map (p => p[1])), high = Math.max (...points.map (p => p[1]));
    const level = low + (high - low) * contents.fillPercent / 100;
    const mesh = { id : 'contents', materialRole : 'contents', positions : [], normals : [], uvs : [], indices : [] }, rim = new Map ();
    const add = (p, n) => { mesh.positions.push (...p); mesh.normals.push (...n); mesh.uvs.push (0, 0); return mesh.positions.length / 3 - 1; };
    const rimPoint = p => { rim.set (p.map (v => Math.round (v * 1e7)).join (','), p); };
    for (let i = faceStart; i < body.indices.length; i += 3) {
        const ids = [body.indices[i], body.indices[i + 2], body.indices[i + 1]].map (id => id - half), triangle = ids.map (id => ({ p : points[id], n : normals[id] })), clipped = [];
        for (let j = 0; j < 3; j++) {
            const a = triangle[j], b = triangle[(j + 1) % 3], ai = a.p[1] <= level, bi = b.p[1] <= level;
            if (ai) { clipped.push (a); }
            if (ai !== bi) {
                const t = (level - a.p[1]) / (b.p[1] - a.p[1]), p = a.p.map ((v, k) => v + (b.p[k] - v) * t), n = a.n.map ((v, k) => v + (b.n[k] - v) * t), length = Math.hypot (...n) || 1;
                clipped.push ({ p, n : n.map (v => v / length) }); rimPoint (p);
            }
        }
        for (let j = 1; j < clipped.length - 1; j++) { mesh.indices.push (...[clipped[0], clipped[j], clipped[j + 1]].map (v => add (v.p, v.n))); }
    }
    const ring = [...rim.values ()].sort ((a, b) => Math.atan2 (a[2], a[0]) - Math.atan2 (b[2], b[0]));
    if (ring.length > 2) {
        const center = [ring.reduce ((s, p) => s + p[0], 0) / ring.length, level, ring.reduce ((s, p) => s + p[2], 0) / ring.length];
        for (let i = 0; i < ring.length; i++) { mesh.indices.push (...[center, ring[(i + 1) % ring.length], ring[i]].map (p => add (p, [0, 1, 0]))); }
    }
    return mesh;
}
