import fs from 'node:fs';
import crypto from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { FloatType } from 'three';

// Produce our own thumbnails from the CC0 HDR data, rather than copying
// Poly Haven's separately copyrighted website renders.
const directory = 'website/assets/hdri';
const sources = JSON.parse(fs.readFileSync(`${directory}/sources.json`, 'utf8').replace(/^\uFEFF/, ''));
function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
    const name = Buffer.from(type);
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length, 0);
    name.copy(result, 4);
    data.copy(result, 8);
    result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
    return result;
}
for (const source of sources) {
    const bytes = fs.readFileSync(`${directory}/${source.id}.hdr`);
    if (crypto.createHash('md5').update(bytes).digest('hex') !== source.md5) throw Error(`Checksum mismatch: ${source.id}`);
    const image = new RGBELoader().setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const width = 256, height = 128;
    const pixels = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const src = (Math.floor(y * image.height / height) * image.width + Math.floor(x * image.width / width)) * 4;
            for (let channel = 0; channel < 3; channel++) {
                const linear = image.data[src + channel];
                const mapped = linear / (1 + linear);
                pixels[y * (width * 3 + 1) + x * 3 + channel + 1] = Math.round(255 * Math.pow(mapped, 1 / 2.2));
            }
        }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
    fs.writeFileSync(`${directory}/${source.id}.png`, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));
    console.log(`${source.id}: checksum verified, preview generated`);
}
