import assert from 'node:assert/strict';
import { CreateFefcoBox, UnfoldFefco, FefcoProfile, PackagingContours, PackagingModuleVersion, PackagingAPIVersion, ExportPackagingSVG } from '../src/index.js';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

describe ('Independent Packaging module', () => {
    it ('Exposes a versioned neutral mesh API without importing Auto3D', async () => {
        const result = await build ({ entryPoints : [new URL ('../src/index.js', import.meta.url).pathname], bundle : true, format : 'esm', write : false, metafile : true });
        assert.equal (PackagingModuleVersion, '1.0.0'); assert.equal (PackagingAPIVersion, 1);
        assert.equal (JSON.parse (await readFile (new URL ('../package.json', import.meta.url))).version, PackagingModuleVersion);
        assert.equal (Object.keys (result.metafile.inputs).some (name => /source\/(engine|website)/.test (name)), false);
        const box = CreateFefcoBox ({}); assert.equal (box.units, 'mm'); assert.equal (box.apiVersion, 1); assert.equal (box.meshes.length, 13); assert.ok (Array.isArray (box.meshes[0].vertices[0]));
    });
    it ('Creates a single connected flat sheet with physical thickness, UVs and cut/score guides for every style', () => {
        for (const code of ['0200', '0201', '0202', '0203']) {
            const box = CreateFefcoBox ({ code }); const flat = UnfoldFefco (box.parameters, box.profile); assert.equal (flat.state, 'flat'); assert.deepEqual (flat.profile, box.profile); assert.equal (PackagingContours (flat.profile).length, 1);
            const board = flat.meshes[0]; const ys = board.vertices.map (point => point[1]); assert.ok (Math.abs (Math.max (...ys) - Math.min (...ys) - 3) < 0.00001); assert.ok (board.triangles.every (triangle => triangle.uvs.length === 3)); assert.equal (flat.materials[0].diffuseMap.name, 'kraft-fiber.png');
            assert.ok (flat.meshes[1].lines.length > 0); assert.ok (flat.meshes[2].lines.length > 0); assert.equal (flat.materials[flat.meshes[2].lines[0].material].role, 'score');
            assert.match (ExportPackagingSVG (flat.profile), /id="CUT"/); assert.match (ExportPackagingSVG (flat.profile), /id="SCORE"/);
        }
    });
    it ('Uses the saved profile instead of silently replacing it with a newly generated draft', () => { const profile = FefcoProfile ({}); profile.name = 'Saved board'; const flat = UnfoldFefco ({ length : 800 }, profile); assert.equal (flat.profile.name, 'Saved board'); assert.deepEqual (flat.profile.paths, profile.paths); });
});
