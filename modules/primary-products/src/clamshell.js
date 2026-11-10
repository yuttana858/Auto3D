// Closed-position two-piece shell. Neutral millimeter meshes; physical cavity walls.
export function CreateClamshell (d)
{
    const w=d.widthMm, depth=d.depthMm, h=d.heightMm, t=Math.min(1.2, w*.04, depth*.04, h*.04), split=h*.6;
    const tray=(id, height, invert=false)=>{
        const mesh={id, materialRole:'body', positions:[], normals:[], uvs:[], indices:[]};
        const point=(x, y, z)=>[x, invert?h-y:y, z];
        const face=(points)=>{ if(invert){points.reverse();} const [a, b, c]=points, ab=b.map((v, i)=>v-a[i]), ac=c.map((v, i)=>v-a[i]), n=[ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]], len=Math.hypot(...n), start=mesh.positions.length/3; for(const p of points){mesh.positions.push(...p);mesh.normals.push(...n.map(v=>v/len));mesh.uvs.push(p[0]/w+.5, p[2]/depth+.5);} for(let i=1;i<points.length-1;i++){mesh.indices.push(start, start+i, start+i+1);} };
        // Matching rounded rings produce tapered cavity walls with a closed rim.
        // Keep the entire envelope authoritative; the feet taper inward.
        const radius = Math.min (w, depth) * .1;
        const ring = (inset, y) => {
            const x = w/2-inset, z = depth/2-inset, r = Math.max (radius-inset, radius*.2);
            const result = [];
            for (const [cx, cz, angle] of [[-x+r, -z+r, -Math.PI/2], [-x+r, z-r, Math.PI], [x-r, z-r, Math.PI/2], [x-r, -z+r, 0]]) {
                for (let step = 0; step <= 8; step++) {
                    const a = angle-step*Math.PI/16;
                    result.push (point (cx+r*Math.cos (a), y, cz+r*Math.sin (a)));
                }
            }
            return result;
        };
        const taper = Math.min (w, depth)*.04;
        const rings=[ring(taper, 0), ring(0, height), ring(t, height), ring(taper+t, t)];
        for(let r=0;r<3;r++){for(let i=0;i<rings[0].length;i++){const j=(i+1)%rings[0].length;face([rings[r][i], rings[r][j], rings[r+1][j], rings[r+1][i]]);}}
        face([...rings[0]].reverse());face(rings[3]);return mesh;
    };
    return [tray('base', split), tray('lid', h-split, true)];
}
