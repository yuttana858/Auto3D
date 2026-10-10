import { zlibSync } from 'fflate';

export function EncodeRGBTexture (name, width, height, rgb)
{
    if (!Number.isInteger (width) || !Number.isInteger (height) || width < 1 || height < 1 || width > 1024 || height > 1024 || rgb.length !== width * height * 3) { throw new Error ('Use RGB pixels up to 1024 × 1024.'); }
    const rows = new Uint8Array ((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) { rows.set (rgb.subarray (y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1); }
    const chunk = (name, bytes) => {
        const result = new Uint8Array (bytes.length + 12); const view = new DataView (result.buffer); view.setUint32 (0, bytes.length); result.set ([...name].map (char => char.charCodeAt (0)), 4); result.set (bytes, 8);
        let crc = -1; for (const byte of result.subarray (4, bytes.length + 8)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) { crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } } view.setUint32 (result.length - 4, (crc ^ -1) >>> 0); return result;
    };
    const header = new Uint8Array (13); const view = new DataView (header.buffer); view.setUint32 (0, width); view.setUint32 (4, height); header[8] = 8; header[9] = 2;
    const chunks = [new Uint8Array ([137, 80, 78, 71, 13, 10, 26, 10]), chunk ('IHDR', header), chunk ('IDAT', zlibSync (rows)), chunk ('IEND', new Uint8Array ())];
    const png = new Uint8Array (chunks.reduce ((sum, bytes) => sum + bytes.length, 0)); let offset = 0; chunks.forEach (bytes => { png.set (bytes, offset); offset += bytes.length; });
    return { name, mimeType : 'image/png', buffer : png.buffer };
}

export function ProceduralSurfacePixels (size = 128)
{
    if (!Number.isInteger (size) || size < 4 || size > 1024) { throw new Error ('Use a 4–1024 pixel surface.'); }
    const pixels = new Uint8Array (size * size * 3);
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        const grain = Math.round (242 + 7 * Math.sin (x * 2 * Math.PI * 13 / size) * Math.sin (y * 2 * Math.PI * 17 / size)); pixels.fill (grain, (y * size + x) * 3, (y * size + x + 1) * 3);
    } }
    return { width : size, height : size, pixels };
}

export function GenerateSurfaceTextureSet (input = ProceduralSurfacePixels (), prefix = 'surface')
{
    const { width, height, pixels } = input;
    if (!Number.isInteger (width) || !Number.isInteger (height) || width < 4 || height < 4 || width > 1024 || height > 1024 || !(pixels instanceof Uint8Array || pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 3) { throw new Error ('Use 4–1024 pixel RGB surface data.'); }
    const count = width * height; const heights = new Float32Array (count);
    for (let i = 0; i < count; i++) { heights[i] = (pixels[i * 3] * 0.2126 + pixels[i * 3 + 1] * 0.7152 + pixels[i * 3 + 2] * 0.0722) / 255; }
    const maps = {}; for (const key of ['bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'specularMap', 'aoMap']) { maps[key] = new Uint8Array (count * 3); }
    const value = (x, y) => heights[((y + height) % height) * width + (x + width) % width];
    for (let y = 0; y < height; y++) { for (let x = 0; x < width; x++) {
        const i = y * width + x; const h = heights[i]; const dx = (value (x + 1, y) - value (x - 1, y)) * 2; const dy = (value (x, y + 1) - value (x, y - 1)) * 2; const n = Math.hypot (dx, dy, 1);
        // PNG rows point downward; texture V points upward after the normal image flip.
        maps.normalMap.set ([Math.round ((-dx / n * 0.5 + 0.5) * 255), Math.round ((dy / n * 0.5 + 0.5) * 255), Math.round ((1 / n * 0.5 + 0.5) * 255)], i * 3);
        for (const [key, v] of [['bumpMap', 96 + h * 64], ['roughnessMap', 225 + h * 30], ['metalnessMap', 255], ['specularMap', 235 + h * 20], ['aoMap', 240 + h * 15]]) { maps[key].fill (Math.round (v), i * 3, i * 3 + 3); }
    } }
    const result = { diffuseMap : EncodeRGBTexture (prefix + '-color.png', width, height, pixels) };
    for (const [key, rgb] of Object.entries (maps)) { result[key] = EncodeRGBTexture (prefix + '-' + key.replace ('Map', '').toLowerCase () + '.png', width, height, rgb); }
    result.displacementMap = { ...result.bumpMap, name : prefix + '-height.png' }; return result;
}
