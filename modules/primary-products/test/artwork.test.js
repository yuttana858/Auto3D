import assert from 'node:assert/strict';
import { DefaultProductDraft, UpdateProductDraft } from '../src/state.js';
import { ListProductMaterials, ProductMaterials } from '../src/materials.js';
import { ValidateProductArtwork, CreateLabelMesh } from '../src/artwork.js';
import { ProductDefinition, ValidateProductDefinition } from '../src/definition.js';
import { ArtworkImageInfo, MaxArtworkBytes } from '../src/imageinfo.js';
const art = { resourceId : 'a'.repeat (64), name : 'Label.png', mime : 'image/png', zone : 'front', widthMm : 30, heightMm : 40 };
describe ('Primary Products real surfaces and artwork', function () {
    it ('provides category-specific rendered PBR presets and resets the default roughness on material change', function () {
        for (const family of ['bottle', 'can', 'pouch']) { const materials = ListProductMaterials (family); assert.ok (materials.length >= 4); for (const m of materials) { const d = UpdateProductDraft (DefaultProductDraft (family), { material : m.id }); assert.equal (ProductMaterials[d.material].metalness, m.metalness); } }
        assert.equal (UpdateProductDraft (DefaultProductDraft (), { material : 'hdpe' }).roughness, 0.62);
        assert.throws (() => UpdateProductDraft (DefaultProductDraft ('can'), { material : 'hdpe' }));
    });
    it ('bounds image decoding before using the browser decoder', function () {
        const b = new Uint8Array (32); b.set ([137, 80, 78, 71, 13, 10, 26, 10]); const v = new DataView (b.buffer); v.setUint32 (12, 0x49484452); v.setUint32 (16, 200); v.setUint32 (20, 100);
        assert.deepEqual (ArtworkImageInfo (b.buffer), { width : 200, height : 100, mime : 'image/png' }); v.setUint32 (16, 99999); assert.throws (() => ArtworkImageInfo (b.buffer)); assert.throws (() => ArtworkImageInfo (new ArrayBuffer (MaxArtworkBytes + 1))); assert.throws (() => ArtworkImageInfo (new TextEncoder ().encode ('<svg onload="alert(1)"></svg>').buffer));
    });
    it ('validates physical fit and source descriptors before changing geometry', function () {
        const d = DefaultProductDraft (); assert.equal (ValidateProductArtwork (d, [art]).length, 1);
        assert.throws (() => ValidateProductArtwork (d, [{ ...art, widthMm : 999 }])); assert.throws (() => ValidateProductArtwork (d, [art, { ...art, zone : 'wrap' }]));
        assert.throws (() => ValidateProductArtwork (d, [{ ...art, resourceId : 'https://example.com/x.png' }]));
        assert.deepEqual (ValidateProductDefinition (ProductDefinition (d, [art])).artwork, [art]);
        assert.equal (ValidateProductDefinition (ProductDefinition (d)).artwork, undefined);
    });
    it ('creates finite outward-facing label patches with full unmirrored UVs for every zone', function () {
        for (const family of ['bottle', 'can', 'pouch']) { for (const zone of family === 'pouch' ? ['front', 'back'] : ['front', 'back', 'wrap']) {
            const mesh = CreateLabelMesh (DefaultProductDraft (family), { ...art, zone }); assert.ok (mesh.positions.every (Number.isFinite)); assert.equal (Math.min (...mesh.uvs), 0); assert.equal (Math.max (...mesh.uvs), 1);
            for (let i = 0; i < mesh.indices.length; i += 3) { const ids = mesh.indices.slice (i, i + 3), [a, b, c] = ids.map (id => mesh.positions.slice (id * 3, id * 3 + 3)), ab = b.map ((x, j) => x - a[j]), ac = c.map ((x, j) => x - a[j]); const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]], n = mesh.normals.slice (ids[0] * 3, ids[0] * 3 + 3); assert.ok (cross.reduce ((sum, x, j) => sum + x * n[j], 0) > 0); }
        } }
    });
});
