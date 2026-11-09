export const MaxArtworkBytes = 4 * 1024 * 1024;
export function ArtworkImageInfo (buffer)
{
    const bytes = new Uint8Array (buffer); if (bytes.length < 24 || bytes.length > MaxArtworkBytes) { throw new Error ('Use a PNG, JPEG or WebP image up to 4 MiB.'); }
    const view = new DataView (bytes.buffer, bytes.byteOffset, bytes.byteLength); let width, height, mime;
    if ([137, 80, 78, 71, 13, 10, 26, 10].every ((n, i) => bytes[i] === n) && view.getUint32 (12) === 0x49484452) { width = view.getUint32 (16); height = view.getUint32 (20); mime = 'image/png'; }
    else if (bytes[0] === 255 && bytes[1] === 216) {
        mime = 'image/jpeg'; let offset = 2;
        while (offset + 4 < bytes.length) {
            if (bytes[offset++] !== 255) { break; } while (bytes[offset] === 255) { offset++; }
            const marker = bytes[offset++]; if (marker === 217 || marker === 218) { break; }
            if (marker === 1 || marker >= 208 && marker <= 215) { continue; }
            const size = view.getUint16 (offset); if (size < 2 || offset + size > bytes.length) { break; }
            if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes (marker) && size >= 7) { height = view.getUint16 (offset + 3); width = view.getUint16 (offset + 5); break; } offset += size;
        }
    } else if (String.fromCharCode (...bytes.slice (0, 4)) === 'RIFF' && String.fromCharCode (...bytes.slice (8, 12)) === 'WEBP' && bytes.length >= 30) {
        mime = 'image/webp'; const chunk = String.fromCharCode (...bytes.slice (12, 16));
        if (chunk === 'VP8X') { width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16); height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16); }
        else if (chunk === 'VP8 ' && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) { width = view.getUint16 (26, true) & 16383; height = view.getUint16 (28, true) & 16383; }
        else if (chunk === 'VP8L' && bytes[20] === 47) { width = 1 + (view.getUint32 (21, true) & 16383); height = 1 + ((view.getUint32 (21, true) >>> 14) & 16383); }
    }
    if (!Number.isInteger (width) || !Number.isInteger (height) || width < 1 || height < 1 || width > 4096 || height > 4096 || width * height > 16 * 1024 * 1024) { throw new Error ('Use a valid PNG, JPEG or WebP image at most 4096 × 4096 pixels.'); }
    return { width, height, mime };
}
