import { EncodeRGBTexture } from './texturepng.js';
export const LabelFinishes = Object.freeze ({
    paperMatte : { name : 'Matte paper', roughness : .72, metalness : 0, grain : 'paper', bumpMm : .025, clearcoat : 0 },
    texturedPaper : { name : 'Textured paper', roughness : .84, metalness : 0, grain : 'fiber', bumpMm : .065, clearcoat : 0 },
    glossFilm : { name : 'Gloss laminated film', roughness : .2, metalness : 0, grain : 'smooth', bumpMm : .002, clearcoat : 1 },
    satinFilm : { name : 'Satin film', roughness : .46, metalness : 0, grain : 'plastic', bumpMm : .008, clearcoat : .2 },
    foil : { name : 'Metallic foil', roughness : .28, metalness : 1, grain : 'brushed', bumpMm : .006, clearcoat : .4 },
    clearFilm : { name : 'Clear gloss film / transparent artwork', roughness : .12, metalness : 0, grain : 'smooth', bumpMm : .002, clearcoat : 1 }
});
const cache = new Map ();
const noise = (x, y) => { let n = Math.imul (x + 17, 374761393) ^ Math.imul (y + 39, 668265263); n = Math.imul (n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
// Portable deterministic maps, with physical tile size supplied by the adapter.
export function ProductSurfaceMaps (kind = 'plastic', strength = .5, size = 128)
{
    if (!['plastic', 'smooth', 'paper', 'fiber', 'brushed', 'film', 'frosted'].includes (kind) || !Number.isFinite (strength) || strength < 0 || strength > 1 || !Number.isInteger (size) || size < 8 || size > 256) { throw new Error ('Invalid product texture settings.'); }
    const key = [kind, strength, size].join ('-'); if (cache.has (key)) { return cache.get (key); }
    const bump = new Uint8Array (size * size * 3), rough = new Uint8Array (bump.length), normal = new Uint8Array (bump.length), heights = new Float32Array (size * size);
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        const fine = noise (x, y), coarse = noise (Math.floor (x / 4), Math.floor (y / 4));
        let h = .5 + (fine - .5) * .28;
        if (kind === 'brushed') { h = .3 + .5 * noise (x, 0) + .06 * fine; }
        if (kind === 'paper' || kind === 'fiber') { h = .2 + .35 * fine + .45 * coarse; }
        if (kind === 'film') { h = .5 + .15 * Math.sin (x * Math.PI * 8 / size + Math.sin (y * Math.PI * 4 / size)) + .05 * fine; }
        if (kind === 'smooth') { h = .5 + .03 * (fine - .5); }
        heights[y * size + x] = h;
    } }
    const at = (x, y) => heights[((y + size) % size) * size + (x + size) % size];
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 3, h = at (x, y), dx = (at (x + 1, y) - at (x - 1, y)) * strength, dy = (at (x, y + 1) - at (x, y - 1)) * strength, length = Math.hypot (dx, dy, 1);
        bump.fill (Math.round (h * 255), i, i + 3); rough.set ([255, Math.round (255 * (1 - strength * .24 * (1 - h))), 255], i);
        normal.set ([Math.round (127.5 * (1 - dx / length)), Math.round (127.5 * (1 + dy / length)), Math.round (127.5 * (1 + 1 / length))], i);
    } }
    const result = { bumpMap : EncodeRGBTexture ('primary-' + key + '-bump.png', size, size, bump), normalMap : EncodeRGBTexture ('primary-' + key + '-normal.png', size, size, normal), roughnessMap : EncodeRGBTexture ('primary-' + key + '-roughness.png', size, size, rough) };
    if (cache.size >= 32) { cache.delete (cache.keys ().next ().value); } cache.set (key, result); return result;
}
export function ProductGrain (id) { return ['kraftFilm', 'paperboard'].includes (id) ? 'paper' : id === 'moldedFiber' ? 'fiber' : ['aluminum', 'steel', 'brushedMetal', 'foil'].includes (id) ? 'brushed' : id.toLowerCase ().includes ('film') ? 'film' : id.toLowerCase ().includes ('frost') ? 'frosted' : ['glass', 'amberGlass', 'petClear', 'petOpaque', 'lacquer'].includes (id) ? 'smooth' : 'plastic'; }
