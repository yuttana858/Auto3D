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
