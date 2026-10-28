import assert from 'node:assert/strict';
import { CreateFefcoBox, UnfoldFefco, FefcoProfile, PackagingContours, PackagingModuleVersion, PackagingAPIVersion, ExportPackagingSVG } from '../src/index.js';
import { FefcoPanel } from '../src/panel.js';
import { FefcoThumbnail } from '../src/catalog.js';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

describe ('Independent Packaging module', () => {
    it ('Exposes a versioned neutral mesh API without importing Auto3D', async () => {
        const result = await build ({ entryPoints : [new URL ('../src/index.js', import.meta.url).pathname], bundle : true, format : 'esm', write : false, metafile : true });
        assert.equal (PackagingModuleVersion, '1.10.1'); assert.equal (PackagingAPIVersion, 1);
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
    it ('accepts the rounded inch defaults for every preset and distinguishes overlap thumbnails', () => {
        for (const code of ['0200', '0201', '0202', '0203']) {
            const box = CreateFefcoBox ({ code, length : 15.748031 * 25.4, width : 11.811024 * 25.4, height : 9.84252 * 25.4, thickness : 0.11811 * 25.4 });
            assert.ok (box.meshes.length > 0); assert.equal (box.parameters.code, code);
        }
        assert.match (FefcoThumbnail ('0202'), /Partial flap overlap/);
        assert.match (FefcoThumbnail ('0203'), /Full-width overlapping top flaps/);
        assert.notEqual (FefcoThumbnail ('0202'), FefcoThumbnail ('0203'));
    });
    it ('reports box generation errors even when the host catches them, and blocks duplicate clicks', async () => {
        const panel = Object.create (FefcoPanel.prototype); let calls = 0; let release;
        panel.generationStatus = { textContent : '' }; panel.SetDisabled = () => {};
        panel.host = { blocked : () => false, run : async action => { try { return await action (); } catch { return; } } };
        const operation = panel.RunGeneration (async () => { calls++; await new Promise (resolve => { release = resolve; }); return { objectId : 'box' }; });
        assert.equal (panel.generationStatus.textContent, 'Generating box…');
        await panel.RunGeneration (() => { calls++; }); assert.equal (calls, 1);
        release (); assert.deepEqual (await operation, { objectId : 'box' }); assert.equal (panel.generationStatus.textContent, 'Box added to scene.'); assert.equal (panel.generating, false);
        await panel.RunGeneration (() => { throw new Error ('Set known scene units.'); });
        assert.equal (panel.generationStatus.textContent, 'Cannot generate box: Set known scene units.'); assert.equal (panel.generating, false);
    });
    it ('Uses the saved profile instead of silently replacing it with a newly generated draft', () => { const profile = FefcoProfile ({}); profile.name = 'Saved board'; const flat = UnfoldFefco ({ length : 800 }, profile); assert.equal (flat.profile.name, 'Saved board'); assert.deepEqual (flat.profile.paths, profile.paths); });
});
