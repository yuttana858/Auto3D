import assert from 'node:assert/strict';
import { unzlibSync } from 'fflate';
import { GenerateSurfaceTextureSet, ProceduralSurfacePixels } from '../src/index.js';
import { BoardMaterials } from '../src/material.js';
function Pixels (map) {
    const bytes = new Uint8Array (map.buffer); const view = new DataView (map.buffer);
    assert.deepEqual ([...bytes.slice (0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const width = view.getUint32 (16); const height = view.getUint32 (20); assert.equal (bytes[25], 2);
    let offset = 8; let raw;
    while (offset < bytes.length) { const size = view.getUint32 (offset); const name = String.fromCharCode (...bytes.slice (offset + 4, offset + 8)); if (name === 'IDAT') { raw = unzlibSync (bytes.slice (offset + 8, offset + 8 + size)); } offset += size + 12; }
    const pixels = []; for (let y = 0; y < height; y++) { assert.equal (raw[y * (width * 3 + 1)], 0); pixels.push (...raw.slice (y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1))); }
    return { width, height, pixels };
}
describe ('Local surface texture generation', () => {
    it ('Produces independent portable maps and a neutral tangent normal for a flat source', () => {
        const input = { width : 4, height : 4, pixels : new Uint8Array (48).fill (200) }; const maps = GenerateSurfaceTextureSet (input, 'flat');
        assert.equal (Object.keys (maps).length, 8); assert.deepEqual (Pixels (maps.diffuseMap).pixels, [...input.pixels]);
        assert.deepEqual (Pixels (maps.normalMap).pixels, Array.from ({ length : 16 }, () => [128, 128, 255]).flat ());
        assert.ok (Pixels (maps.metalnessMap).pixels.every (v => v === 0)); assert.ok (Pixels (maps.roughnessMap).pixels.every (v => v < 255 && v > 225));
        assert.notDeepEqual (maps.metalnessMap.buffer, maps.roughnessMap.buffer); assert.deepEqual (maps.bumpMap.buffer, maps.displacementMap.buffer);
    });
    it ('Derives directional normals and bounded roughness/AO without changing the source RGB', () => {
        const input = ProceduralSurfacePixels (32); const previous = input.pixels.slice (); const maps = GenerateSurfaceTextureSet (input); const normal = Pixels (maps.normalMap);
        assert.deepEqual (input.pixels, previous); assert.equal (normal.width, 32); assert.equal (normal.height, 32); assert.ok (normal.pixels.some ((v, i) => i % 3 < 2 && v !== 128));
        assert.deepEqual (GenerateSurfaceTextureSet (input).normalMap.buffer, maps.normalMap.buffer);
        for (const key of ['aoMap', 'roughnessMap', 'specularMap']) { assert.ok (Pixels (maps[key]).pixels.every (v => v >= 225 && v <= 255)); }
        assert.throws (() => GenerateSurfaceTextureSet ({ ...input, pixels : new Uint8Array (3) }), /RGB/); assert.throws (() => ProceduralSurfacePixels (2000), /1024/);
    });
    it ('Uses the correct normal Y direction for top-down PNG rows sampled with flipped texture V', () => {
        const pixels = new Uint8Array (48); for (let y = 0; y < 4; y++) { pixels.fill (y * 64, y * 12, (y + 1) * 12); }
        const normal = Pixels (GenerateSurfaceTextureSet ({ width : 4, height : 4, pixels }).normalMap).pixels.slice (15, 18);
        assert.equal (normal[0], 128); assert.ok (normal[1] > 128); assert.ok (normal[2] > 128);
    });
    it ('Provides every board map with restrained matte nonmetallic defaults and independent mapping definitions', () => {
        const a = BoardMaterials (); const b = BoardMaterials ();
        for (const material of a) { for (const key of ['diffuseMap', 'roughnessMap', 'metalnessMap', 'normalMap', 'bumpMap', 'specularMap', 'aoMap', 'displacementMap']) { assert.equal (Pixels (material[key]).width, 128); } assert.equal (material.metalness, 0); assert.equal (material.displacementScale, 0); assert.ok (material.roughness >= .9); }
        a[0].normalMap.name = 'changed.png'; assert.notEqual (b[0].normalMap.name, a[0].normalMap.name);
    });
});
