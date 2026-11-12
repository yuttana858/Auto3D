import { ProductMaterials } from './materials.js';
import { CreateClamshell } from './clamshell.js';
import { GetArtworkZones } from './zones.js';
export { GetArtworkZones } from './zones.js';
import { CreatePouch } from './pouch.js';
import { DefaultProductDraft, UpdateProductDraft, BottleShape } from './state.js';
import { BottleSectionOf, SectionOutline } from './section.js';

// Neutral indexed meshes: base-centred, Y-up, millimeters; no engine dependencies.
function Revolve (id, role, profile, segments)
{
    const positions = []; const normals = []; const uvs = []; const indices = [];
    // Separate strips retain hard profile corners and a duplicated UV seam.
    const add = (p, n, uv) => { positions.push (...p); normals.push (...n); uvs.push (...uv); };
    for (let row = 0; row < profile.length - 1; row++) {
        const [r0, y0] = profile[row]; const [r1, y1] = profile[row + 1];
        const length = Math.hypot (y1 - y0, r1 - r0);
        for (let col = 0; col < segments; col++) {
            const start = positions.length / 3;
            for (const [r, y, u, v] of [[r0, y0, col / segments, 0], [r0, y0, (col + 1) / segments, 0], [r1, y1, col / segments, 1], [r1, y1, (col + 1) / segments, 1]]) {
                const angle = u * Math.PI * 2; const c = Math.cos (angle); const s = Math.sin (angle);
                add ([r * c, y, r * s], [(y1 - y0) * c / length, (r0 - r1) / length, (y1 - y0) * s / length], [u, (row + v) / (profile.length - 1)]);
            }
            if (r0 > 0) { indices.push (start, start + 2, start + 1); }
            if (r1 > 0) { indices.push (start + 1, start + 2, start + 3); }
        }
    }
    return { id, materialRole : role, positions, normals, uvs, indices };
}

// Lofted body for oval and rounded-rectangle bottles. Each profile row is either the body section scaled by `scale` or a
// circle of `radius` (the round neck); the shoulder blends between them along each outline point's own direction.
function Loft (id, role, section, rows, segments)
{
    const outline = SectionOutline (section, segments).points, positions = [], normals = [], uvs = [], indices = [];
    const point = (row, i) => {
        const p = outline[(i + segments) % segments];
        if (row.radius !== undefined) { const length = Math.hypot (p.x, p.z) || 1; return [p.x / length * row.radius, row.y, p.z / length * row.radius]; }
        return [p.x * row.scale, row.y, p.z * row.scale];
    };
    for (let r = 0; r < rows.length - 1; r++) {
        const r0 = rows[r], r1 = rows[r + 1], flat = Math.abs (r1.y - r0.y) < 1e-9, size = row => row.radius ?? row.scale;
        for (let col = 0; col < segments; col++) {
            const start = positions.length / 3;
            for (const [row, i, v] of [[r0, col, 0], [r0, col + 1, 0], [r1, col, 1], [r1, col + 1, 1]]) {
                const p = point (row, i); let n;
                if (flat) { n = [0, r0.y === 0 ? -1 : 1, 0]; }
                else {
                    // Normal from the outline tangent and the profile direction, oriented away from the axis.
                    const ahead = point (row, i + 1), behind = point (row, i - 1), du = [ahead[0] - behind[0], 0, ahead[2] - behind[2]];
                    const a = point (r0, i), b = point (r1, i), dv = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                    n = [dv[1] * du[2] - dv[2] * du[1], dv[2] * du[0] - dv[0] * du[2], dv[0] * du[1] - dv[1] * du[0]];
                    if (n[0] * p[0] + n[2] * p[2] < 0) { n = n.map (x => -x); }
                    const length = Math.hypot (...n) || 1; n = n.map (x => x / length);
                }
                positions.push (...p); normals.push (...n); uvs.push (i / segments, (r + v) / (rows.length - 1));
            }
            if (size (r0) > 0) { indices.push (start, start + 2, start + 1); }
            if (size (r1) > 0) { indices.push (start + 1, start + 2, start + 3); }
        }
    }
    return { id, materialRole : role, positions, normals, uvs, indices };
}

// A closed inner cavity keeps the assembled bottle hollow while retaining the
// existing outside envelope and closed closure. Wall thickness varies at shoulders.
function HollowBottle (mesh, width, depth, height, wall, neckHeight)
{
    const t = Math.min (wall, width*.025, depth*.025, height*.025, neckHeight*.25);
    const scale = [(width-2*t)/width, 1, (depth-2*t)/depth];
    const count = mesh.positions.length/3, original = [...mesh.positions], normals = [...mesh.normals], indices = [...mesh.indices];
    for (let i = 0; i < original.length; i += 3) {
        mesh.positions.push (original[i]*scale[0], Math.max (t, Math.min (height-t, original[i+1])), original[i+2]*scale[2]);
        const n = normals.slice (i, i+3).map ((v, axis) => -v/scale[axis]), length = Math.hypot (...n);
        mesh.normals.push (...n.map (v => v/length));
    }
    mesh.uvs.push (...mesh.uvs.slice ());
    for (let i = 0; i < indices.length; i += 3) { mesh.indices.push (count+indices[i], count+indices[i+2], count+indices[i+1]); }
    return t;
}

export function CreatePrimaryProduct (input, options = {})
{
    const definition = UpdateProductDraft (DefaultProductDraft (), input);
    if (!options || typeof options !== 'object' || Array.isArray (options) || Object.keys (options).some (key => key !== 'segments')) { throw new Error ('Invalid geometry options.'); }
    const segments = options.segments ?? 64;
    if (!Number.isInteger (segments) || segments < 16 || segments > 128 || segments % 4 !== 0) { throw new Error ('Segments must be a multiple of four between 16 and 128.'); }
    if (definition.family === 'clamshell') { return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components : CreateClamshell (definition), bounds : { min : [-definition.widthMm/2, 0, -definition.depthMm/2], max : [definition.widthMm/2, definition.heightMm, definition.depthMm/2] }, artworkZones : GetArtworkZones (definition), quality : { construction : 'closed-position-shell', hollowWalls : true, hinge : false } }; }
    if (definition.family === 'pouch') { return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components : [CreatePouch (definition, segments)], bounds : { min : [-definition.widthMm / 2, 0, -definition.depthMm / 2], max : [definition.widthMm / 2, definition.heightMm, definition.depthMm / 2] }, artworkZones : GetArtworkZones (definition), quality : { construction : definition.pouchShape ? 'filled-standup-presentation' : 'filled-pillow-presentation', hollowWalls : false, gusset : definition.pouchShape ? 'bottom' : false, gussetMm : definition.pouchShape?.gussetMm ?? 0, freeStanding : Boolean (definition.pouchShape), zipper : false, simulatedFill : false } }; }
    const h = definition.heightMm; const r = definition.diameterMm / 2; const components = [];
    const cylinder = (id, role, radius, low, high) => Revolve (id, role, [[0, low], [radius, low], [radius, high], [0, high]], segments);
    if (definition.family === 'bottle') {
        const shape = BottleShape (definition), neck = shape.neckDiameterMm / 2, capBottom = h - shape.capHeightMm, neckBottom = capBottom - shape.neckHeightMm, bodyTop = neckBottom - shape.shoulderHeightMm;
        const section = BottleSectionOf (definition);
        if (section.shape === 'round') { components.push (Revolve ('body', 'body', [[0, 0], [r, 0], [r, bodyTop], [neck, neckBottom], [neck, capBottom], [0, capBottom]], segments)); }
        else { components.push (Loft ('body', 'body', section, [{ scale : 0, y : 0 }, { scale : 1, y : 0 }, { scale : 1, y : bodyTop }, { radius : neck, y : neckBottom }, { radius : neck, y : capBottom }, { radius : 0, y : capBottom }], Math.max (segments, 96))); }
        const clear = ProductMaterials[definition.material].transmission > 0;
        const wallMm = clear ? HollowBottle (components[0], definition.diameterMm, section.depthMm, capBottom, ProductMaterials[definition.material].wallMm, shape.neckHeightMm) : 0;
        components.push (cylinder ('cap', 'closure', neck * 1.08, capBottom, h));
        const depth = section.depthMm / 2;
        return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components, bounds : { min : [-r, 0, -depth], max : [r, h, depth] }, artworkZones : GetArtworkZones (definition), quality : { construction : 'closed-solid-presentation', section : section.shape, hollowWalls : clear, wallMm, cavity : clear ? 'closed-presentation-cavity' : null, threads : false, pullTab : false } };
    } else {
        components.push (cylinder ('body', 'body', r, h * 0.025, h * 0.975));
        components.push (cylinder ('bottom', 'end', r, 0, h * 0.025));
        components.push (cylinder ('top', 'end', r, h * 0.975, h));
    }
    return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components,
        bounds : { min : [-r, 0, -r], max : [r, h, r] }, artworkZones : GetArtworkZones (definition),
        quality : { construction : 'closed-solid-presentation', hollowWalls : false, threads : false, pullTab : false } };
}
