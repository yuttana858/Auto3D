// Closed-position two-piece shell. Neutral millimeter meshes; physical cavity walls.
import { DetailBox } from './detailmesh.js';
export function CreateClamshell (d)
{
    const w=d.widthMm, depth=d.depthMm, h=d.heightMm, t=d.details?.wallMm || Math.min(1.2, w*.04, depth*.04, h*.04), split=h*(d.details?.shellStyle === 'retail' ? .28 : .6);
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
        const rings = d.details ? [ring(taper, 0), ring(taper*.8, height*.06), ring(taper*.4, height*.86), ring(0, height*.94), ring(0, height), ring(t, height), ring(taper*.4+t, height*.86), ring(taper+t, t)] : [ring(taper, 0), ring(0, height), ring(t, height), ring(taper+t, t)];
        for(let r=0;r<rings.length-1;r++){for(let i=0;i<rings[0].length;i++){const j=(i+1)%rings[0].length;face([rings[r][i], rings[r][j], rings[r+1][j], rings[r+1][i]]);}}
        face([...rings[0]].reverse());face(rings[rings.length-1]);return mesh;
    };
    const result = [tray('base', split), tray('lid', h-split, true)];
    if (d.details) {
        result.push (DetailBox ('hinge', [0, split, -depth/2 + depth*.025], [w*.45, Math.min(t*1.5, h*.03), depth*.05]));
        for (const sign of [-1, 1]) { result.push (DetailBox ('latch-' + (sign < 0 ? 'left' : 'right'), [sign*w*.28, split, depth/2-depth*.025], [w*.12, Math.min(t*2, h*.04), depth*.05])); }
    }
    return result;
}
