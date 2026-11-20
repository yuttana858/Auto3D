import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { StudioRoot, StudioBuildOptions } from '../tools/build.mjs';

describe ('3Dstudio independent build boundary', () => {
    it ('builds every module source without host or other-module imports and keeps the kernel out of the UI', async () => {
        const options = StudioBuildOptions (path.join (StudioRoot, 'dist')), modulePrefix = path.resolve (StudioRoot) + path.sep;
        const ui = await build ({ ...options.ui, write : false, metafile : true });
        const uiInputs = Object.keys (ui.metafile.inputs).map (name => path.resolve (StudioRoot, name));
        assert.ok (uiInputs.every (name => name.startsWith (path.join (StudioRoot, 'src') + path.sep)), 'UI must be portable without dependencies on the host or kernel');
        assert.ok (!uiInputs.some (name => ['kernel.js', 'worker.js'].includes (path.basename (name))), 'UI opening must not initialize the solid kernel');

        const worker = await build ({ ...options.worker, write : false });
        const factory = path.resolve (StudioRoot, '../../node_modules/manifold-3d/manifold.js');
        const workerInputs = Object.keys (worker.metafile.inputs).map (name => path.resolve (StudioRoot, name));
        assert.ok (workerInputs.some (name => name.endsWith (path.join ('manifold-3d', 'manifold.js'))), 'worker includes the pinned factory');
        assert.ok (workerInputs.every (name => name.startsWith (modulePrefix) || name === factory || name.endsWith (path.join ('node_modules', 'manifold-3d', 'manifold.js'))), 'worker may depend only on its own module and Manifold');

        // Include currently unreferenced sources too, so a future feature cannot
        // accidentally make the package depend on another app module.
        const sources = (await readdir (path.join (StudioRoot, 'src'), { recursive : true })).filter (name => name.endsWith ('.js')).map (name => path.join ('src', name));
        const all = await build ({ absWorkingDir : StudioRoot, entryPoints : sources, bundle : true, format : 'esm', platform : 'browser', external : ['node:*'], write : false, metafile : true, outdir : 'dist/test-boundary' });
        for (const name of Object.keys (all.metafile.inputs).map (name => path.resolve (StudioRoot, name))) {
            assert.ok (name.startsWith (modulePrefix) || name.endsWith (path.join ('node_modules', 'manifold-3d', 'manifold.js')), 'Unexpected dependency: ' + name);
        }
    });
});
