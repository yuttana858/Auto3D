import { EncodeRGBTexture, GenerateSurfaceTextureSet } from './surfacetextures.js';

// Small deterministic PNGs work in the browser, engine exports, and recovery workers.
export function BoardTexturePixels (edge)
{
    const size = 128; const pixels = new Uint8Array (size * size * 3); let seed = 197;
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        seed = (Math.imul (seed, 1664525) + 1013904223) >>> 0; const noise = ((seed >>> 24) / 255 - 0.5) * 15;
        const flute = edge ? Math.abs (y - (64 + 42 * Math.sin (x * Math.PI / 16))) < 6 || y < 9 || y > 118 : false;
        const base = edge ? (flute ? [177, 134, 83] : [90, 65, 40]) : [193, 155, 107];
        for (let c = 0; c < 3; c++) { pixels[(y * size + x) * 3 + c] = Math.round (base[c] + noise); }
    } }
    return { width : size, height : size, pixels };
}
export function BoardTexture (edge) { const data = BoardTexturePixels (edge); return EncodeRGBTexture (edge ? 'corrugated-edge.png' : 'kraft-fiber.png', data.width, data.height, data.pixels); }
let boardMaterials = null;
export function BoardMaterials ()
{
    if (!boardMaterials) { boardMaterials = [false, true].map (edge => {
        const maps = GenerateSurfaceTextureSet (BoardTexturePixels (edge), edge ? 'corrugated-edge' : 'kraft-fiber'); maps.diffuseMap.name = edge ? 'corrugated-edge.png' : 'kraft-fiber.png';
        return { role : edge ? 'edge' : 'liner', name : edge ? 'Exposed corrugated edge' : 'Natural kraft liner', color : [255, 255, 255], roughness : edge ? 1 : 0.92, metalness : 0, specularIntensity : 0.15, bumpScale : edge ? 0.15 : 0.08, normalScale : edge ? 0.35 : 0.2, aoIntensity : 0.25, displacementScale : 0, ...maps };
    }); }
    return boardMaterials.map (material => ({ ...material, ...Object.fromEntries (Object.entries (material).filter (([key]) => key.endsWith ('Map')).map (([key, map]) => [key, { ...map }])) }));
}
