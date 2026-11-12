import * as THREE from 'three';

// Two continuous formed side cradles. These presentation surfaces are not manufacturing CAD.
export const PresentationPulp = Object.freeze ({ thickness : 0.055, backZ : -1.62, frontZ : 2.04, bottom : -1.12, top : 1.2, seam : 0.045 });
const mix = THREE.MathUtils.lerp;
const smooth = (value, from, to) => { const t = THREE.MathUtils.clamp ((value - from) / (to - from), 0, 1); return t * t * (3 - 2 * t); };

function section (v)
{
    if (v < 0.42) { return [mix (PresentationPulp.seam, 1.34, v / 0.42), -1.12]; }
    if (v < 0.62) { const angle = -Math.PI / 2 + (v - 0.42) / 0.2 * Math.PI / 2; return [1.34 + 0.3 * Math.cos (angle), -0.82 + 0.3 * Math.sin (angle)]; }
    const wall = (v - 0.62) / 0.38; return [1.64 - 0.22 * wall, mix (-0.82, 1.2, wall)];
}

export function CreatePresentationPulpSide (side)
{
    if (side !== -1 && side !== 1) { throw new Error ('Choose the left or right pulp cradle.'); }
    const d = PresentationPulp, along = 80, across = 48, columns = across + 1;
    const positions = [], unfolded = [], uv = [], faces = [];
    for (let i = 0; i <= along; i++) {
        const u = i / along, z = mix (d.backZ, d.frontZ, u);
        const cell = Math.abs (((u * 6 + 0.5) % 1) - 0.5), rib = 1 - smooth (cell, 0.1, 0.32);
        const end = 1 - smooth (Math.min (u, 1 - u), 0, 0.09);
        for (let j = 0; j <= across; j++) {
            const v = j / across, [baseX, baseY] = section (v);
            const wall = smooth (v, 0.58, 0.68);
            const sideRib = 0.24 * rib * smooth (v, 0.53, 0.68) * (1 - smooth (v, 0.91, 0.98));
            const topBead = 0.1 * Math.exp (-Math.pow ((v - 0.975) / 0.025, 2));
            const x = baseX + sideRib + topBead - 0.14 * end * wall;
            const foot = 0.31 * Math.exp (-Math.pow ((baseX - 0.85) / 0.25, 4)) * (1 - wall) * (1 - end * 0.6);
            const y = baseY + foot + 0.14 * end * (1 - wall);
            positions.push (side * x, y, z); unfolded.push (side * (d.seam + v * 3.35), d.bottom, z); uv.push (u * 3, v * 2);
            if (i < along && j < across) {
                const midZ = mix (d.backZ, d.frontZ, (i + 0.5) / along), midY = section ((j + 0.5) / across)[1];
                // A continuous side web surrounds the handle clearance opening.
                const hole = j / across > 0.62 && Math.abs (midZ - 0.25) < 0.78 && midY > 0.31 && midY < 0.98;
                if (!hole) {
                    const a = i * columns + j, b = a + columns, c = b + 1, e = a + 1;
                    if (side > 0) { faces.push (a, b, c, a, c, e); } else { faces.push (a, c, b, a, e, c); }
                }
            }
        }
    }
    // Compact the unused hole vertices, then find every exposed sheet edge.
    const used = [...new Set (faces)], remap = new Map (used.map ((old, i) => [old, i]));
    const base = [], flatBase = [], tex = [];
    for (const old of used) { base.push (...positions.slice (old * 3, old * 3 + 3)); flatBase.push (...unfolded.slice (old * 3, old * 3 + 3)); tex.push (...uv.slice (old * 2, old * 2 + 2)); }
    const triangles = faces.map (i => remap.get (i)), edges = new Map ();
    for (let i = 0; i < triangles.length; i += 3) {
        for (const [a, b] of [[triangles[i], triangles[i + 1]], [triangles[i + 1], triangles[i + 2]], [triangles[i + 2], triangles[i]]]) {
            const key = Math.min (a, b) + ':' + Math.max (a, b);
            if (edges.has (key)) { edges.delete (key); } else { edges.set (key, [a, b]); }
        }
    }
    const skin = new THREE.BufferGeometry (); skin.setAttribute ('position', new THREE.Float32BufferAttribute (base, 3)); skin.setIndex (triangles); skin.computeVertexNormals ();
    const normals = skin.getAttribute ('normal'), count = used.length, formed = [], flat = [], indices = [...triangles];
    for (const face of [1, -1]) {
        for (let i = 0; i < count; i++) {
            formed.push (base[i * 3] + normals.getX (i) * d.thickness / 2 * face, base[i * 3 + 1] + normals.getY (i) * d.thickness / 2 * face, base[i * 3 + 2] + normals.getZ (i) * d.thickness / 2 * face);
            flat.push (flatBase[i * 3], flatBase[i * 3 + 1] + d.thickness / 2 * face, flatBase[i * 3 + 2]);
        }
    }
    for (let i = 0; i < triangles.length; i += 3) { indices.push (triangles[i] + count, triangles[i + 2] + count, triangles[i + 1] + count); }
    for (const [a, b] of edges.values ()) { indices.push (a, b + count, b, a, a + count, b + count); }
    const geometry = new THREE.BufferGeometry (); geometry.setAttribute ('position', new THREE.Float32BufferAttribute (formed, 3)); geometry.setAttribute ('uv', new THREE.Float32BufferAttribute ([...tex, ...tex], 2)); geometry.setIndex (indices); geometry.computeVertexNormals (); geometry.computeBoundingBox (); geometry.computeBoundingSphere ();
    const blank = new THREE.BufferGeometry (); blank.setAttribute ('position', new THREE.Float32BufferAttribute (flat, 3)); blank.setIndex (indices); blank.computeVertexNormals ();
    geometry.morphAttributes.position = [blank.getAttribute ('position').clone ()]; geometry.morphAttributes.position[0].name = 'Flat pulp sheet'; geometry.morphAttributes.normal = [blank.getAttribute ('normal').clone ()];
    geometry.computeBoundingBox (); geometry.computeBoundingSphere ();
    skin.dispose (); blank.dispose (); return geometry;
}
