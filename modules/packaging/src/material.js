import { EncodeRGBTexture, GenerateSurfaceTextureSet } from './surfacetextures.js';
import { ValidateBoardAppearance } from './appearancesettings.js';

// Periodic fields: matching tile borders, deterministic fibre bands and mottling.
export function BoardTexturePixels (edge, grain = .35, relief = false, flute = .12)
{
    const role = typeof edge === 'string' ? edge : edge ? 'edge' : 'liner';
    const size = 128, pixels = new Uint8Array (size * size * 3), tau = Math.PI * 2;
    const noiseAt = (u, v, fx, fy, seed) => {
        const x = u * fx, y = v * fy, ix = Math.floor (x), iy = Math.floor (y); const smooth = t => t * t * (3 - 2 * t); const sx = smooth (x - ix), sy = smooth (y - iy);
        const hash = (a, b) => { let n = Math.imul ((a % fx + fx) % fx + seed, 374761393) ^ Math.imul ((b % fy + fy) % fy + seed, 668265263); n = Math.imul (n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295 - .5; };
        return (hash (ix, iy) * (1 - sx) + hash (ix + 1, iy) * sx) * (1 - sy) + (hash (ix, iy + 1) * (1 - sx) + hash (ix + 1, iy + 1) * sx) * sy;
    };
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        const u = x / (size - 1), v = y / (size - 1);
        const fibre = noiseAt (u, v, 48, 16, 197) + .4 * noiseAt (u, v, 61, 53, 317);
        const mottle = noiseAt (u, v, 5, 5, 83) + .5 * noiseAt (u, v, 13, 11, 541);
        const noise = grain * (9 * fibre + 3 * mottle);
        const wave = .5 + .33 * Math.sin (tau * 4 * u), liner = v < .075 || v > .925;
        const medium = Math.exp (-Math.pow ((v - wave) / .035, 2));
        const edgePaper = Math.max (liner ? 1 : 0, medium);
        const base = role === 'edge' ? [82 + 99 * edgePaper, 61 + 80 * edgePaper, 39 + 54 * edgePaper] : role === 'inner' ? [181, 146, 102] : role === 'closed' ? [190, 153, 106] : [193, 155, 107];
        for (let c = 0; c < 3; c++) { pixels[(y * size + x) * 3 + c] = Math.round (relief ? 128 + grain * (24 * fibre + 5 * mottle) + flute * 6 * Math.cos (tau * 10 * u) : base[c] + noise); }
    } }
    return { width : size, height : size, pixels };
}
export function BoardTexture (edge) { const data = BoardTexturePixels (edge); return EncodeRGBTexture (edge ? 'corrugated-edge.png' : 'kraft-fiber.png', data.width, data.height, data.pixels); }
const cache = new Map ();
export function BoardMaterials (board = null, appearance = {})
{
    const settings = ValidateBoardAppearance (appearance), grain = settings.paperGrain; const key = String (grain);
    if (!cache.has (key)) {
        if (cache.size >= 8) { cache.delete (cache.keys ().next ().value); }
        cache.set (key, ['liner', 'edge', 'inner', 'closed'].map (role => {
            const edge = role === 'edge', prefix = { liner : 'kraft-fiber', edge : 'corrugated-edge', inner : 'inner-kraft-fiber', closed : 'closed-kraft-fiber' }[role];
            const maps = GenerateSurfaceTextureSet (BoardTexturePixels (role, grain), prefix); maps.diffuseMap.name = prefix + '.png';
            if (!edge) { const relief = BoardTexturePixels (role, grain, true, role === 'inner' ? .18 : .12); const reliefMaps = GenerateSurfaceTextureSet (relief); maps.bumpMap = { ...EncodeRGBTexture ('board-' + role + '-flute-bump.png', relief.width, relief.height, relief.pixels) }; maps.normalMap = { ...reliefMaps.normalMap, name : 'board-' + role + '-flute-normal.png' }; }
            return { role, boardFluteLinked : !edge, name : { liner : 'Natural kraft liner', edge : 'Exposed corrugated edge', inner : 'Natural kraft inner liner', closed : 'Wrapped closed score liner' }[role], color : [255, 255, 255], roughness : edge ? 1 : role === 'closed' ? .9 : .92, metalness : 0, specularIntensity : .15, bumpScale : edge ? .15 : .08, normalScale : edge ? .35 : .2, aoIntensity : .25, displacementScale : 0, ...maps };
        }));
    }
    return cache.get (key).map (material => {
        const result = { ...material, ...Object.fromEntries (Object.entries (material).filter (([key]) => key.endsWith ('Map')).map (([key, map]) => [key, { ...map }])) };
        if (board && material.role !== 'edge') { for (const key of ['bumpMap', 'normalMap']) { result[key].rotation = (board.directionDegrees - 90) * Math.PI / 180; result[key].scale = { x : 5 / board.pitchMm, y : 5 / board.pitchMm }; } }
        return result;
    });
}
