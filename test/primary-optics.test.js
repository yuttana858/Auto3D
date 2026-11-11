import assert from 'node:assert/strict';
import { CreatePrimaryProduct, ProductDesign, ListProductDesigns } from '../modules/primary-products/src/index.js';
import { PrimaryProductModel } from '../source/website/primaryproductsadapter.js';
import { Unit } from '../source/engine/model/unit.js';
import { SceneDocument, CloneSurface } from '../source/website/scenedocument.js';
import { RecoverySnapshot } from '../source/website/sessionrecovery.js';
import { PackRecoverySnapshot } from '../source/website/sessionrecoverypack.js';
import { PackSession, ReadSession } from '../source/website/sessionarchive.js';
import { ConvertModelToThreeObject, ModelToThreeConversionParams, ModelToThreeConversionOutput } from '../source/engine/threejs/threeconverter.js';
import { ExporterGltf } from '../source/engine/export/exportergltf.js';
import { ExporterModel } from '../source/engine/export/exportermodel.js';
import { FileFormat } from '../source/engine/io/fileutils.js';
import { ImporterGltf } from '../source/engine/import/importergltf.js';
import { RGBColor } from '../source/engine/model/color.js';
describe ('Clear primary product materials', function () {
    it ('builds closed positive-volume cavity walls for every bottle design', function () {
        for (const design of ListProductDesigns ().filter (d => d.family === 'bottle')) {
            const data = CreatePrimaryProduct ({ ...ProductDesign (design.id), material : 'glass' }), body = data.components[0];
            assert.equal (data.quality.hollowWalls, true); const edges = new Map (); let volume = 0;
            const point = i => body.positions.slice (i*3, i*3+3), key = i => point (i).map (v => Math.round (v*1e6)).join (',');
            for (let i = 0; i < body.indices.length; i += 3) {
                const ids = body.indices.slice (i, i+3), [a,b,c] = ids.map (point);
                volume += (a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
                for (let j = 0; j < 3; j++) { const edge = [key (ids[j]), key (ids[(j+1)%3])].sort ().join ('/'); edges.set (edge, (edges.get (edge) || 0)+1); }
            }
            assert.ok (volume > 0); assert.ok ([...edges.values ()].every (count => count === 2), design.id); assert.ok (body.normals.every (Number.isFinite));
        }
    });
    it ('renders physical transmission and retains optical values through clone, archives and GLB', async function () {
        const data = CreatePrimaryProduct ({ ...ProductDesign ('round-care'), material : 'petClear' });
        const model = PrimaryProductModel (data, Unit.Millimeter), original = model.materials[0];
        assert.equal (original.opacity, 1); assert.equal (original.transmission, 1); assert.equal (original.ior, 1.575); assert.ok (original.thickness > 0);
        assert.equal (CloneSurface (original).IsEqual (original), true);
        const converted = await new Promise (resolve => ConvertModelToThreeObject (model, new ModelToThreeConversionParams (), new ModelToThreeConversionOutput (), { onModelLoaded : resolve, onTextureLoaded () {} }));
        const materials = []; converted.traverse (node => { if (node.material) { materials.push (...(Array.isArray (node.material) ? node.material : [node.material])); } });
        assert.ok (materials.some (m => m.isMeshPhysicalMaterial && m.transmission === 1 && m.ior === 1.575 && m.thickness === original.thickness));
        const doc = new SceneDocument (); doc.AddImported (model, 'Clear PET'); const packed = PackSession (doc), saved = ReadSession (packed).document.model.materials[0];
        for (const field of ['transmission', 'ior', 'thickness']) { assert.equal (saved[field], original[field]); }
        const recovered = ReadSession (PackRecoverySnapshot (structuredClone (RecoverySnapshot (doc, {})))).document.model.materials[0];
        for (const field of ['transmission', 'ior', 'thickness']) { assert.equal (recovered[field], original[field]); }
        const bad = structuredClone (packed); bad.model.materials[0].ior = 0; assert.throws (() => ReadSession (bad), /optical/);
        const files = await new Promise (resolve => new ExporterGltf ().Export (new ExporterModel (model), FileFormat.Binary, resolve));
        const buffer = files[0].GetBufferContent (), json = JSON.parse (new TextDecoder ().decode (new Uint8Array (buffer, 20, new DataView (buffer).getUint32 (12, true))).trim ());
        assert.equal (json.materials[0].extensions.KHR_materials_transmission.transmissionFactor, 1); assert.equal (json.materials[0].extensions.KHR_materials_ior.ior, 1.575); assert.equal (json.materials[0].extensions.KHR_materials_volume.thicknessFactor, original.thickness);
        const importer = new ImporterGltf ();
        await new Promise ((resolve, reject) => importer.Import (files[0].GetName (), 'glb', buffer, { getDefaultMaterialColor : () => new RGBColor (0,0,0), getDefaultLineMaterialColor : () => new RGBColor (0,0,0), getFileBuffer : () => null, onSuccess : resolve, onError : () => reject (new Error (importer.GetErrorMessage ())) }));
        for (const field of ['transmission', 'ior', 'thickness']) { assert.equal (importer.GetModel ().materials[0][field], original[field]); }
        const inch = PrimaryProductModel (data, Unit.Inch); assert.ok (Math.abs (inch.materials[0].thickness*25.4-original.thickness) < 1e-10);
    });
});
