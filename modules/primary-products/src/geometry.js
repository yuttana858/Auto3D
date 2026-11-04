import { DefaultProductDraft, UpdateProductDraft } from './state.js';

// Neutral indexed meshes: base-centred, Y-up, millimeters; no engine dependencies.
export function GetArtworkZones (input)
{
    const d = UpdateProductDraft (DefaultProductDraft (), input);
    const height = d.heightMm * (d.family === 'bottle' ? 0.55 : 0.82);
    const radius = d.diameterMm / 2;
    return ['front', 'back', 'wrap'].map (id => ({ id, componentId : 'body', surface : 'cylinder', radiusMm : radius,
        bottomMm : d.heightMm * 0.08, widthMm : id === 'wrap' ? Math.PI * d.diameterMm : Math.PI * d.diameterMm * 0.3,
        heightMm : height, startAngleRad : id === 'back' ? Math.PI : 0, seamAngleRad : Math.PI }));
}

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
    const h = definition.heightMm; const r = definition.diameterMm / 2; const components = [];
    const cylinder = (id, role, radius, low, high) => Revolve (id, role, [[0, low], [radius, low], [radius, high], [0, high]], segments);
    if (definition.family === 'bottle') {
        const neck = r * 0.42;
        components.push (Revolve ('body', 'body', [[0, 0], [r, 0], [r, h * 0.65], [neck, h * 0.82], [neck, h * 0.9], [0, h * 0.9]], segments));
        components.push (cylinder ('cap', 'closure', neck * 1.08, h * 0.9, h));
    } else {
        components.push (cylinder ('body', 'body', r, h * 0.025, h * 0.975));
        components.push (cylinder ('bottom', 'end', r, 0, h * 0.025));
        components.push (cylinder ('top', 'end', r, h * 0.975, h));
    }
    return { apiVersion : 1, generatorVersion : 1, units : 'mm', definition, components,
        bounds : { min : [-r, 0, -r], max : [r, h, r] }, artworkZones : GetArtworkZones (definition),
        quality : { construction : 'closed-solid-presentation', hollowWalls : false, threads : false, pullTab : false } };
}
