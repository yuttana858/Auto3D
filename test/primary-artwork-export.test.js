import assert from 'node:assert/strict';
import { Model } from '../source/engine/model/model.js';
import { Mesh } from '../source/engine/model/mesh.js';
import { Triangle } from '../source/engine/model/triangle.js';
import { Coord3D } from '../source/engine/geometry/coord3d.js';
import { Coord2D } from '../source/engine/geometry/coord2d.js';
import { PhysicalMaterial, TextureMap } from '../source/engine/model/material.js';
import { ExporterGltf } from '../source/engine/export/exportergltf.js';
import { ExporterModel } from '../source/engine/export/exportermodel.js';
import { FileFormat } from '../source/engine/io/fileutils.js';
import { ImporterGltf } from '../source/engine/import/importergltf.js';
import { RGBColor } from '../source/engine/model/color.js';
describe ('Portable label image export', function () {
    for (const mime of ['image/jpeg', 'image/webp']) { for (const format of [FileFormat.Text, FileFormat.Binary]) {
        it (`declares ${mime} correctly in ${format === FileFormat.Text ? 'gltf' : 'glb'} and preserves its source on import`, async function () {
            const model = new Model (), material = new PhysicalMaterial (), map = new TextureMap ();
            // These tests exercise container declarations, not image decoding.
            map.name = mime === 'image/jpeg' ? 'label.jpg' : 'label.webp'; map.mimeType = mime; map.buffer = new Uint8Array ([1, 2, 3, 4]).buffer; material.diffuseMap = map; model.AddMaterial (material);
            const mesh = new Mesh (); for (const p of [[0, 0, 0], [1, 0, 0], [0, 1, 0]]) { mesh.AddVertex (new Coord3D (...p)); mesh.AddNormal (new Coord3D (0, 0, 1)); mesh.AddTextureUV (new Coord2D (0, 0)); } mesh.AddTriangle (new Triangle (0, 1, 2).SetNormals (0, 1, 2).SetTextureUVs (0, 1, 2).SetMaterial (0)); model.AddMeshToRootNode (mesh);
            const files = await new Promise (resolve => new ExporterGltf ().Export (new ExporterModel (model), format, resolve)), buffer = files[0].GetBufferContent ();
            const json = format === FileFormat.Text ? JSON.parse (files[0].GetTextContent ()) : JSON.parse (new TextDecoder ().decode (new Uint8Array (buffer, 20, new DataView (buffer).getUint32 (12, true))).trim ());
            if (format === FileFormat.Binary) { assert.equal (json.images[0].mimeType, mime); }
            if (mime === 'image/webp') { assert.ok (json.extensionsRequired.includes ('EXT_texture_webp')); assert.equal (json.textures[0].extensions.EXT_texture_webp.source, 0); }
            const importer = new ImporterGltf ();
            await new Promise ((resolve, reject) => importer.Import (files[0].GetName (), format === FileFormat.Text ? 'gltf' : 'glb', buffer, { getDefaultMaterialColor : () => new RGBColor (0, 0, 0), getDefaultLineMaterialColor : () => new RGBColor (0, 0, 0), getFileBuffer : path => files.find (f => f.GetName () === path)?.GetBufferContent () || null, onSuccess : resolve, onError : () => reject (new Error (importer.GetErrorMessage ())) }));
            assert.deepEqual (new Uint8Array (importer.GetModel ().materials[0].diffuseMap.buffer), new Uint8Array ([1, 2, 3, 4]));
        });
    } }
});
