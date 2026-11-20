import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

describe ('3Dstudio Pages asset identity', () => {
    it ('invalidates the release when any module, style, worker or WASM payload changes', async () => {
        const root = await mkdtemp (path.join (tmpdir (), 'auto3d-pages-test-')), previousCwd = process.cwd ();
        const tool = new URL ('../tools/build_pages.mjs', import.meta.url); let run = 0;
        const put = async (filename, bytes) => { const target = path.join (root, filename); await mkdir (path.dirname (target), { recursive : true }); await writeFile (target, bytes); };
        try {
            for (const file of ['index.html', 'embed.html', 'mini.html', 'info/index.html', 'info/cookies.html', 'info/faq.html']) { await put ('website/' + file, '<head></head><!-- website start --><!-- website end --><script>start()</script>'); }
            await put ('website/_headers', '/*\n  Content-Security-Policy: script-src __INLINE_SCRIPT_HASHES__\n'); await put ('LICENSE.md', 'Fixture license');
            await put ('source/website/preferences.js', "export const AppVersion = '0.99.0';");
            const assets = ['o3dv.website.min.js', 'o3dv.website.min.css', 'o3dv.optimize.js', 'o3dv.recovery.js', 'o3dv.mini.js', 'packaging/packaging.module.js', 'packaging/packaging.module.css', 'primary-products/primary-products.module.js', 'primary-products/primary-products.module.css', 'molded-pulp/molded-pulp.module.js', 'molded-pulp/molded-pulp.module.css', 'molded-pulp/molded-pulp.worker.js', '3dstudio/3dstudio.module.js', '3dstudio/3dstudio.module.css', '3dstudio/3dstudio.worker.js', '3dstudio/manifold.wasm'];
            for (const file of assets) { await put ('build/website/' + file, file); }
            for (const module of ['packaging', 'primary-products', 'molded-pulp', '3dstudio']) { await put ('modules/' + module + '/package.json', JSON.stringify ({ version : '0.1.0' })); }
            // The repository runs Mocha serially. Restore cwd in finally even on
            // a failed assertion; no application build artifacts are touched.
            process.chdir (root);
            const build = async () => { tool.search = '?fixture=' + path.basename (root) + '&run=' + ++run; await import (tool.href); return JSON.parse (await readFile (path.join (root, 'build/pages/version.json'), 'utf8')); };
            let previous = await build ();
            for (const [key, filename] of Object.entries ({ script : '3dstudio.module.js', stylesheet : '3dstudio.module.css', worker : '3dstudio.worker.js', wasm : 'manifold.wasm' })) {
                const bytes = Buffer.from ('changed ' + filename); await put ('build/website/3dstudio/' + filename, bytes);
                const next = await build ();
                assert.notEqual (next.assetDigest, previous.assetDigest, key + ' must invalidate the combined release digest');
                assert.equal (next.modules.studio3d[key + 'Hash'], createHash ('sha256').update (bytes).digest ('hex'));
                assert.equal (next.modules.studio3d[key], '/o3dv/3dstudio/' + filename + '?v=' + next.assetDigest);
                assert.deepEqual (await readFile (path.join (root, 'build/pages/o3dv/3dstudio/', filename)), bytes);
                previous = next;
            }
        } finally { process.chdir (previousCwd); await rm (root, { recursive : true, force : true }); }
    });
});
