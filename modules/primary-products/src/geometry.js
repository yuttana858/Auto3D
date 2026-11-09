import { GetArtworkZones } from './zones.js';
export { GetArtworkZones } from './zones.js';
import { CreatePillowPouch } from './pouch.js';
import { DefaultProductDraft, UpdateProductDraft, BottleShape } from './state.js';

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

export function CreatePrimaryProduct (input, options = {})
{
    const definition = UpdateProductDraft (DefaultProductDraft (), input);
    if (!options || typeof options !== 'object' || Array.isArray (options) || Object.keys (options).some (key => key !== 'segments')) { throw new Error ('Invalid geometry options.'); }
    const segments = options.segments ?? 64;
    if (!Number.isInteger (segments) || segments < 16 || segments > 128 || segments % 4 !== 0) { throw new Error ('Segments must be a multiple of four between 16 and 128.'); }
    if (definition.family === 'pouch') { return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components : [CreatePillowPouch (definition, segments)], bounds : { min : [-definition.widthMm / 2, 0, -definition.depthMm / 2], max : [definition.widthMm / 2, definition.heightMm, definition.depthMm / 2] }, artworkZones : GetArtworkZones (definition), quality : { construction : 'filled-pillow-presentation', hollowWalls : false, gusset : false, zipper : false, simulatedFill : false } }; }
    const h = definition.heightMm; const r = definition.diameterMm / 2; const components = [];
    const cylinder = (id, role, radius, low, high) => Revolve (id, role, [[0, low], [radius, low], [radius, high], [0, high]], segments);
    if (definition.family === 'bottle') {
        const shape = BottleShape (definition), neck = shape.neckDiameterMm / 2, capBottom = h - shape.capHeightMm, neckBottom = capBottom - shape.neckHeightMm, bodyTop = neckBottom - shape.shoulderHeightMm;
        components.push (Revolve ('body', 'body', [[0, 0], [r, 0], [r, bodyTop], [neck, neckBottom], [neck, capBottom], [0, capBottom]], segments));
        components.push (cylinder ('cap', 'closure', neck * 1.08, capBottom, h));
    } else {
        components.push (cylinder ('body', 'body', r, h * 0.025, h * 0.975));
        components.push (cylinder ('bottom', 'end', r, 0, h * 0.025));
        components.push (cylinder ('top', 'end', r, h * 0.975, h));
    }
    return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components,
        bounds : { min : [-r, 0, -r], max : [r, h, r] }, artworkZones : GetArtworkZones (definition),
        quality : { construction : 'closed-solid-presentation', hollowWalls : false, threads : false, pullTab : false } };
}
