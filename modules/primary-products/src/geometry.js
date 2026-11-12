import { AddInnerWall, SmoothMesh, CapMesh, DetailCan } from './detailmesh.js';
import { ProductMaterials } from './materials.js';
import { CreateClamshell } from './clamshell.js';
import { GetArtworkZones } from './zones.js';
export { GetArtworkZones } from './zones.js';
import { CreatePouchComponents } from './pouch.js';
import { DefaultProductDraft, UpdateProductDraft, BottleShape } from './state.js';
import { BottleSectionOf, SectionOutline } from './section.js';
import { Revolve } from './revolve.js';

// Neutral indexed meshes: base-centred, Y-up, millimeters; no engine dependencies.
// Lofted body for oval and rounded-rectangle bottles. Each profile row is either the body section scaled by `scale` or a
// circle of `radius` (the round neck); the shoulder blends between them along each outline point's own direction.
function Loft (id, role, section, rows, segments)
{
    const outline = SectionOutline (section, segments).points, positions = [], normals = [], uvs = [], indices = [];
    const point = (row, i) => {
        const p = outline[(i + segments) % segments];
        if (row.radius !== undefined) { const length = Math.hypot (p.x, p.z) || 1; return [p.x / length * row.radius, row.y, p.z / length * row.radius]; }
        const length = Math.hypot (p.x, p.z) || 1; return [p.x * row.scale + p.x / length * (row.radiusBlend || 0), row.y, p.z * row.scale + p.z / length * (row.radiusBlend || 0)];
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
    if (definition.family === 'clamshell') { return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components : CreateClamshell (definition), bounds : { min : [-definition.widthMm/2, 0, -definition.depthMm/2], max : [definition.widthMm/2, definition.heightMm, definition.depthMm/2] }, artworkZones : GetArtworkZones (definition), quality : { construction : 'closed-position-shell', hollowWalls : true, wallMm : definition.details?.wallMm || Math.min(1.2, definition.widthMm*.04, definition.depthMm*.04, definition.heightMm*.04), hinge : Boolean (definition.details) } }; }
    if (definition.family === 'pouch') {
        const shape = definition.pouchShape, style = shape?.style || 'pillow';
        return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components : CreatePouchComponents (definition, segments).map (mesh => definition.details && mesh.id === 'body' ? AddInnerWall (SmoothMesh (mesh), definition.details.wallMm) : mesh), bounds : { min : [-definition.widthMm / 2, 0, -definition.depthMm / 2], max : [definition.widthMm / 2, definition.heightMm, definition.depthMm / 2] }, artworkZones : GetArtworkZones (definition),
            quality : { construction : 'filled-' + { pillow : 'pillow', standup : 'standup', flatbottom : 'flatbottom' }[style] + '-presentation', hollowWalls : Boolean (definition.details), wallMm : definition.details?.wallMm || 0, gusset : { pillow : false, standup : 'bottom', flatbottom : 'box' }[style], gussetMm : shape?.gussetMm ?? 0, freeStanding : style !== 'pillow', zipper : Boolean (shape?.zipper), spout : shape?.spout ? shape.spout.position : false, threads : false, simulatedFill : false } };
    }
    const h = definition.heightMm; const r = definition.diameterMm / 2; const components = [];
    const cylinder = (id, role, radius, low, high) => Revolve (id, role, [[0, low], [radius, low], [radius, high], [0, high]], segments);
    if (definition.family === 'bottle') {
        const shape = BottleShape (definition), neck = shape.neckDiameterMm / 2, capBottom = h - shape.capHeightMm, neckBottom = capBottom - shape.neckHeightMm, bodyTop = neckBottom - shape.shoulderHeightMm;
        const section = BottleSectionOf (definition);
        const detailed = definition.details;
        const rows = [{ scale : 0, y : 0 }, { scale : 1, y : 0 }, { scale : 1, y : bodyTop }, { radius : neck, y : neckBottom }, { radius : neck, y : capBottom }, { radius : 0, y : capBottom }];
        if (detailed) {
            const heel = Math.min (r * .07, bodyTop * .05);
            rows.splice (0, 3, { scale : 0, y : 0 }, { scale : .91, y : 0 }, { scale : .97, y : heel * .3 }, { scale : 1, y : heel }, { scale : 1, y : bodyTop });
            if (detailed.shoulder === 'rounded') {
                const insert = [];
                for (let i = 1; i < 12; i++) { const t = i / 12, blend = (1 - Math.cos (Math.PI * t)) / 2; insert.push ({ scale : 1 - blend, radiusBlend : neck * blend, y : bodyTop + shape.shoulderHeightMm * t }); }
                rows.splice (5, 0, ...insert);
            }
        }
        if (section.shape === 'round') { components.push (Revolve ('body', 'body', rows.map (row => [row.radius ?? row.scale * r + (row.radiusBlend || 0), row.y]), segments)); }
        else { components.push (Loft ('body', 'body', section, rows, Math.max (segments, 96))); }
        const clear = ProductMaterials[definition.material].transmission > 0;
        let wallMm = 0;
        if (detailed) { SmoothMesh (components[0]); wallMm = detailed.wallMm; AddInnerWall (components[0], wallMm); }
        else if (clear) { wallMm = HollowBottle (components[0], definition.diameterMm, section.depthMm, capBottom, ProductMaterials[definition.material].wallMm, shape.neckHeightMm); }
        components.push (detailed ? CapMesh ('cap', neck * 1.08, capBottom, h, detailed.closure) : cylinder ('cap', 'closure', neck * 1.08, capBottom, h));
        if (detailed) {
            components.push (Revolve ('neck-ring', 'closure', [[neck * .97, capBottom - shape.neckHeightMm * .18], [neck * 1.04, capBottom - shape.neckHeightMm * .18], [neck * 1.04, capBottom - shape.neckHeightMm * .04], [neck * .97, capBottom - shape.neckHeightMm * .04], [neck * .97, capBottom - shape.neckHeightMm * .18]], segments));
            if (detailed.closure === 'fliptop') { const seam = Revolve ('cap-seam', 'closure', [[neck * 1.075, h - shape.capHeightMm * .32], [neck * 1.08, h - shape.capHeightMm * .32], [neck * 1.08, h - shape.capHeightMm * .30], [neck * 1.075, h - shape.capHeightMm * .30], [neck * 1.075, h - shape.capHeightMm * .32]], segments); components.push (seam); }
        }
        const depth = section.depthMm / 2;
        return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components, bounds : { min : [-r, 0, -depth], max : [r, h, depth] }, artworkZones : GetArtworkZones (definition), quality : { construction : 'closed-solid-presentation', section : section.shape, hollowWalls : clear || Boolean (detailed), wallMm, closure : detailed?.closure || 'smooth', cavity : clear || detailed ? 'closed-presentation-cavity' : null, threads : false, pullTab : false } };
    } else if (definition.details) { components.push (...DetailCan (definition, segments)); } else {
        components.push (cylinder ('body', 'body', r, h * 0.025, h * 0.975));
        components.push (cylinder ('bottom', 'end', r, 0, h * 0.025));
        components.push (cylinder ('top', 'end', r, h * 0.975, h));
    }
    return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components,
        bounds : { min : [-r, 0, -r], max : [r, h, r] }, artworkZones : GetArtworkZones (definition),
        quality : { construction : 'closed-solid-presentation', hollowWalls : Boolean (definition.details), wallMm : definition.details?.wallMm || 0, threads : false, pullTab : definition.details?.canStyle === 'beverage' } };
}
