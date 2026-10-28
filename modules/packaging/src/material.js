import { FlutePhaseAt } from './flutemapping.js';
import { EncodeRGBTexture, GenerateSurfaceTextureSet } from './surfacetextures.js';
import { ValidateBoardAppearance } from './appearancesettings.js';

// Periodic fields: matching tile borders, deterministic fibre bands and mottling.
export function BoardTexturePixels (edge, grain = .35, relief = false, flute = .12, board = null)
{
    const role = typeof edge === 'string' ? edge : edge ? 'edge' : 'liner';
    const size = role === 'edge' ? 512 : 256, pixels = new Uint8Array (size * size * 3), tau = Math.PI * 2;
    const noiseAt = (u, v, fx, fy, seed) => {
        const x = u * fx, y = v * fy, ix = Math.floor (x), iy = Math.floor (y); const smooth = t => t * t * (3 - 2 * t); const sx = smooth (x - ix), sy = smooth (y - iy);
        const hash = (a, b) => { let n = Math.imul ((a % fx + fx) % fx + seed, 374761393) ^ Math.imul ((b % fy + fy) % fy + seed, 668265263); n = Math.imul (n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295 - .5; };
        return (hash (ix, iy) * (1 - sx) + hash (ix + 1, iy) * sx) * (1 - sy) + (hash (ix, iy + 1) * (1 - sx) + hash (ix + 1, iy + 1) * sx) * sy;
    };
    const caliper = board?.caliperMm || 3;
    const outer = (board?.outsideLinerMm ?? caliper * .08) / caliper;
    const inner = (board?.insideLinerMm ?? caliper * .08) / caliper;
    const paper = (board?.mediumPaperMm ?? caliper * .06) / caliper;
    // Intermediate liners and wall ratios are presentation approximations: the
    // catalog does not contain individual wall heights or intermediate liners.
    const walls = /^(EB|BC|ACA|BCB)$/.test (board?.flute) ? board.flute.split ('') : ['C'];
    const weights = walls.map (f => ({ E : 1.5, B : 3, C : 4, A : 4.8 })[f]);
    const separator = Math.min (paper, (1 - inner - outer) / (walls.length * 8));
    const available = Math.max (0, 1 - inner - outer - separator * (walls.length - 1));
    const sum = weights.reduce ((a, b) => a + b, 0);
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        const u = x / (size - 1), v = y / (size - 1);
        const fibre = noiseAt (u, v, 48, 16, 197) + .4 * noiseAt (u, v, 61, 53, 317) + .35 * noiseAt (u, v, 113, 31, 739);
        const mottle = noiseAt (u, v, 5, 5, 83) + .5 * noiseAt (u, v, 13, 11, 541);
        const noise = grain * (15 * fibre + 5 * mottle);
        // PNG rows run down, whereas edge UV depth runs up from the inner face.
        const depth = 1 - v;
        let start = inner, liner = depth <= inner || depth >= 1 - outer, medium = 0;
        for (let i = 0; i < walls.length; i++) {
            const height = available * weights[i] / sum, center = start + height / 2;
            // Frequencies are integer multiples so the edge remains tileable.
            const frequency = walls[i] === 'E' ? 2 : 1;
            const wave = center + Math.max (0, (height - paper) / 2) * Math.cos (FlutePhaseAt (0, u * 4 * frequency, 1, 0));
            medium = Math.max (medium, Math.max (0, Math.min (1, (paper / 2 + .004 - Math.abs (depth - wave)) / .008)));
            start += height;
            if (i < walls.length - 1) { liner ||= depth >= start && depth <= start + separator; start += separator; }
        }
        const edgePaper = Math.max (liner ? 1 : 0, medium);
        const base = role === 'edge' ? [82 + 99 * edgePaper, 61 + 80 * edgePaper, 39 + 54 * edgePaper] : role === 'inner' ? [181, 146, 102] : [193, 155, 107];
        for (let c = 0; c < 3; c++) { pixels[(y * size + x) * 3 + c] = Math.round (relief ? 128 + grain * (28 * fibre + 5 * mottle) + flute * 6 * Math.cos (tau * 10 * u) : base[c] + noise); }
    } }
    return { width : size, height : size, pixels };
}
export function BoardTexture (edge) { const data = BoardTexturePixels (edge); return EncodeRGBTexture (edge ? 'corrugated-edge.png' : 'kraft-fiber.png', data.width, data.height, data.pixels); }
const paperCache = new Map (), edgeCache = new Map ();
function Remember (cache, key, create)
{
    if (!cache.has (key)) { if (cache.size >= 8) { cache.delete (cache.keys ().next ().value); } cache.set (key, create ()); }
    return cache.get (key);
}
function PaperMaterial (role, grain, board)
{
    const edge = role === 'edge', prefix = { liner : 'kraft-fiber', edge : 'corrugated-edge', inner : 'inner-kraft-fiber' }[role];
    const source = BoardTexturePixels (role, grain, false, .12, board);
    let input = source;
    if (edge) {
        // Full detail belongs in the color cross-section; auxiliary edge maps
        // need only the shared 256px tier, avoiding eight redundant 512px maps.
        const pixels = new Uint8Array (256 * 256 * 3);
        for (let y = 0; y < 256; y++) { for (let x = 0; x < 256; x++) { const at = (Math.round (y * (source.height - 1) / 255) * source.width + Math.round (x * (source.width - 1) / 255)) * 3; pixels.set (source.pixels.subarray (at, at + 3), (y * 256 + x) * 3); } }
        input = { width : 256, height : 256, pixels };
    }
    const maps = GenerateSurfaceTextureSet (input, prefix);
    maps.diffuseMap = EncodeRGBTexture (prefix + '.png', source.width, source.height, source.pixels);
    if (!edge) {
        const relief = BoardTexturePixels (role, grain, true, role === 'inner' ? .18 : .12); const reliefMaps = GenerateSurfaceTextureSet (relief);
        maps.bumpMap = EncodeRGBTexture ('board-' + role + '-flute-bump.png', relief.width, relief.height, relief.pixels);
        maps.normalMap = { ...reliefMaps.normalMap, name : 'board-' + role + '-flute-normal.png' };
    }
    return { role, boardFluteLinked : !edge, name : { liner : 'Natural kraft liner', edge : 'Exposed corrugated edge', inner : 'Natural kraft inner liner' }[role], color : [255, 255, 255], roughness : edge ? 1 : .92, metalness : 0, specularIntensity : .15, bumpScale : edge ? .15 : .08, normalScale : edge ? .35 : .2, aoIntensity : .25, displacementScale : 0, ...maps };
}
function CloneMaterial (material)
{
    return { ...material, color : [...material.color], ...Object.fromEntries (Object.entries (material).filter (([key]) => key.endsWith ('Map')).map (([key, map]) => [key, { ...map, ...(map.scale ? { scale : { ...map.scale } } : {}), ...(map.offset ? { offset : { ...map.offset } } : {}) }])) };
}
export function BoardMaterials (board = null, appearance = {})
{
    const grain = ValidateBoardAppearance (appearance).paperGrain, t = board?.caliperMm || 3;
    const edgeKey = JSON.stringify ([grain, board?.flute || 'Custom', ...['outsideLinerMm', 'insideLinerMm', 'mediumPaperMm'].map ((k, i) => Number (((board?.[k] ?? t * [.08, .08, .06][i]) / t).toFixed (9)))]);
    const papers = Remember (paperCache, grain, () => ['liner', 'inner'].map (role => PaperMaterial (role, grain)));
    const edge = Remember (edgeCache, edgeKey, () => PaperMaterial ('edge', grain, board));
    const materials = [papers[0], edge, papers[1]].map (material => {
        const result = CloneMaterial (material);
        if (board && material.role !== 'edge') { for (const key of ['bumpMap', 'normalMap']) { result[key].rotation = (board.directionDegrees - 90) * Math.PI / 180; result[key].scale = { x : 5 / board.pitchMm, y : 5 / board.pitchMm }; } }
        return result;
    });
    materials.push ({ ...CloneMaterial (materials[0]), role : 'closed', name : 'Wrapped closed score liner' });
    return materials;
}
