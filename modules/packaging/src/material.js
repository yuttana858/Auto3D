import { zlibSync } from 'fflate';

// Small deterministic PNGs work in the browser, engine exports, and recovery workers.
export function BoardTexture (edge)
{
    const size = 128; const pixels = new Uint8Array ((size * 3 + 1) * size); let seed = 197;
    for (let y = 0; y < size; y++) { for (let x = 0; x < size; x++) {
        seed = (Math.imul (seed, 1664525) + 1013904223) >>> 0; const noise = ((seed >>> 24) / 255 - 0.5) * 15;
        const flute = edge ? Math.abs (y - (64 + 42 * Math.sin (x * Math.PI / 16))) < 6 || y < 9 || y > 118 : false;
        const base = edge ? (flute ? [177, 134, 83] : [90, 65, 40]) : [193, 155, 107];
        for (let c = 0; c < 3; c++) { pixels[y * (size * 3 + 1) + 1 + x * 3 + c] = Math.round (base[c] + noise); }
    } }
    const chunk = (name, bytes) => {
        const result = new Uint8Array (bytes.length + 12); const view = new DataView (result.buffer); view.setUint32 (0, bytes.length); result.set ([...name].map (char => char.charCodeAt (0)), 4); result.set (bytes, 8);
        let crc = -1; for (const byte of result.subarray (4, bytes.length + 8)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) { crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); } } view.setUint32 (result.length - 4, (crc ^ -1) >>> 0); return result;
    };
    const header = new Uint8Array (13); const view = new DataView (header.buffer); view.setUint32 (0, size); view.setUint32 (4, size); header[8] = 8; header[9] = 2;
    const chunks = [new Uint8Array ([137, 80, 78, 71, 13, 10, 26, 10]), chunk ('IHDR', header), chunk ('IDAT', zlibSync (pixels)), chunk ('IEND', new Uint8Array ())];
    const png = new Uint8Array (chunks.reduce ((sum, bytes) => sum + bytes.length, 0)); let offset = 0; chunks.forEach (bytes => { png.set (bytes, offset); offset += bytes.length; });
    return { name : edge ? 'corrugated-edge.png' : 'kraft-fiber.png', mimeType : 'image/png', buffer : png.buffer };
}

export function BoardMaterials () { return [false, true].map (edge => ({ role : edge ? 'edge' : 'liner', name : edge ? 'Exposed corrugated edge' : 'Natural kraft liner', color : [255, 255, 255], roughness : edge ? 1 : 0.92, metalness : 0, specularIntensity : 0.15, diffuseMap : BoardTexture (edge) })); }
