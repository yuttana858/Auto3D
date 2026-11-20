import { BottleShape } from './state.js';
import { BottleSectionOf, SectionOutline } from './section.js';
import { BottleCap, BottleCornerLimit, BottleWall } from './bottleconstruction.js';
import { SmoothMesh } from './detailmesh.js';

// A single connected glass solid: outside heel/body/shoulder/neck, annular mouth,
// inner neck/shoulder/body and a thicker floor. There is no glass disk over the mouth.
// The shoulder offset is nominal presentation geometry, not a CAD shelling solver.
export function GlassBottleMesh (draft, segments)
{
    const shape = BottleShape (draft), section = BottleSectionOf (draft), cap = BottleCap (draft), { wallMm : wall, baseMm } = BottleWall (draft);
    const count = section.shape === 'round' ? segments : Math.max (96, segments), outline = SectionOutline (section, count).points;
    const neck = shape.neckDiameterMm / 2, neckBottom = cap.bottomMm - shape.neckHeightMm, bodyTop = neckBottom - shape.shoulderHeightMm;
    const cornerLimit = BottleCornerLimit (draft), heel = Math.min (Math.min (section.widthMm, section.depthMm) * .045, bodyTop * .06, cornerLimit * .8), innerHeel = Math.min (heel, (bodyTop - baseMm) * .2, (cornerLimit - wall) * .8);
    const mouthY = cap.bottomMm + Math.max (0, Math.min (cap.heightMm * .45, cap.heightMm - cap.wallMm - .1));
    const circle = (radius, y) => outline.map (p => { const length = Math.hypot (p.x, p.z); return [p.x / length * radius, y, p.z / length * radius]; });
    const body = (y, inset = 0, shrink = 0) => outline.map (p => [p.x - p.nx * (inset + shrink), y, p.z - p.nz * (inset + shrink)]);
    const shoulder = (t, inside) => {
        const rounded = draft.details?.shoulder !== 'sloped', blend = rounded ? (1 - Math.cos (Math.PI * t)) / 2 : t;
        const rate = rounded ? Math.PI * Math.sin (Math.PI * t) / 2 / shape.shoulderHeightMm : 1 / shape.shoulderHeightMm;
        return outline.map (p => {
            const length = Math.hypot (p.x, p.z), x = p.x / length, z = p.z / length;
            const normalX = p.nx * (1 - blend) + x * blend, normalZ = p.nz * (1 - blend) + z * blend;
            const slope = Math.max (0, (length - neck) * rate), normalLength = Math.hypot (normalX, slope, normalZ);
            return [p.x * (1 - blend) + x * neck * blend - (inside ? wall * normalX / normalLength : 0), bodyTop + shape.shoulderHeightMm * t - (inside ? wall * slope / normalLength : 0), p.z * (1 - blend) + z * neck * blend - (inside ? wall * normalZ / normalLength : 0)];
        });
    };
    const outer = [circle (0, 0), body (0, 0, heel)];
    for (let i = 1; i <= 4; i++) { const angle = i / 4 * Math.PI / 2; outer.push (body (heel * (1 - Math.cos (angle)), 0, heel * (1 - Math.sin (angle)))); }
    outer.push (body (bodyTop));
    const steps = draft.details?.shoulder === 'sloped' ? 1 : 16;
    for (let i = 1; i <= steps; i++) { outer.push (shoulder (i / steps, false)); }
    outer.push (circle (neck, mouthY));
    const inner = [circle (0, baseMm), body (baseMm, wall, innerHeel)];
    for (let i = 1; i <= 4; i++) { const angle = i / 4 * Math.PI / 2; inner.push (body (baseMm + innerHeel * (1 - Math.cos (angle)), wall, innerHeel * (1 - Math.sin (angle)))); }
    inner.push (body (bodyTop, wall));
    for (let i = 1; i <= steps; i++) { inner.push (shoulder (i / steps, true)); }
    inner.push (circle (neck - wall, mouthY));
    const shell = MeshRings ('body', [...outer, ...inner.slice ().reverse ()], count);
    // A separate closed cavity descriptor lets static contents clip the actual inner
    // shell without relying on the legacy outer/inner vertex-count convention.
    shell.cavity = MeshRings ('cavity', [...inner, circle (0, mouthY)], count);
    return SmoothMesh (shell);
}

function MeshRings (id, rings, count)
{
    const mesh = { id, materialRole : 'body', positions : [], normals : [], uvs : [], indices : [] };
    const triangle = (points, uv) => {
        const [a, b, c] = points, u = b.map ((n, i) => n - a[i]), v = c.map ((n, i) => n - a[i]);
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot (...cross);
        if (length < 1e-12) { return; }
        const normal = cross.map (n => n / length);
        points.forEach ((point, i) => { mesh.indices.push (mesh.positions.length / 3); mesh.positions.push (...point); mesh.normals.push (...normal); mesh.uvs.push (...uv[i]); });
    };
    for (let row = 0; row < rings.length - 1; row++) {
        for (let col = 0; col < count; col++) {
            const next = (col + 1) % count, low = rings[row], high = rings[row + 1], u0 = col / count, u1 = (col + 1) / count, v0 = row / (rings.length - 1), v1 = (row + 1) / (rings.length - 1);
            triangle ([low[col], high[col], low[next]], [[u0, v0], [u0, v1], [u1, v0]]);
            triangle ([low[next], high[col], high[next]], [[u1, v0], [u0, v1], [u1, v1]]);
        }
    }
    return mesh;
}
