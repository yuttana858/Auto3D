import { build } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const StudioRoot = fileURLToPath (new URL ('../', import.meta.url));
const manifoldRoot = path.dirname (fileURLToPath (import.meta.resolve ('manifold-3d/manifold.wasm')));
export const StudioStaticAssets = [
    path.join (StudioRoot, 'src/3dstudio.css'),
    path.join (manifoldRoot, 'manifold.wasm'),
    path.join (manifoldRoot, 'LICENSE'),
    path.join (manifoldRoot, 'package.json'),
    path.join (StudioRoot, 'licenses/native-notices.txt')
];

export function StudioBuildOptions (output, sourcemap = false)
{
    const common = { absWorkingDir : StudioRoot, bundle : true, format : 'esm', platform : 'browser', minify : true, sourcemap };
    return {
        ui : { ...common, entryPoints : ['src/index.js'], outfile : path.join (output, '3dstudio.module.js') },
        // Manifold's Node-only initialization branch is unused in a browser worker.
        worker : { ...common, entryPoints : ['src/worker.js'], outfile : path.join (output, '3dstudio.worker.js'), external : ['node:*'], metafile : true, plugins : [{ name : '3dstudio-kernel-boundary', setup : bundler => {
            bundler.onEnd (result => {
                if (result.errors.length) { return; }
                const factory = path.join (manifoldRoot, 'manifold.js');
                for (const input of Object.keys (result.metafile.inputs)) {
                    const absolute = path.resolve (StudioRoot, input);
                    if (absolute.split (path.sep).includes ('node_modules') && absolute !== factory) {
                        throw new Error ('Unexpected dependency in the 3Dstudio worker: ' + input);
                    }
                }
            });
        } }] }
    };
}

export async function CopyStudioAssets (output)
{
    await mkdir (output, { recursive : true });
    await copyFile (StudioStaticAssets[0], path.join (output, '3dstudio.module.css'));
    await copyFile (StudioStaticAssets[1], path.join (output, 'manifold.wasm'));
    await copyFile (StudioStaticAssets[2], path.join (output, 'LICENSE.manifold.txt'));
    const dependency = JSON.parse (await readFile (StudioStaticAssets[3], 'utf8'));
    await writeFile (path.join (output, 'THIRD_PARTY_NOTICES.txt'), [
        `Manifold ${dependency.version} (manifold-3d)`,
        'Copyright 2020-2026 The Manifold Authors.',
        'https://github.com/elalish/manifold',
        'Licensed under Apache-2.0; see LICENSE.manifold.txt.',
        'The JavaScript factory is bundled and minified into 3dstudio.worker.js.',
        'manifold.wasm is distributed unchanged from the pinned npm package.',
        '',
        await readFile (StudioStaticAssets[4], 'utf8')
    ].join ('\n'));
}

export async function BuildStudio (output = path.join (StudioRoot, 'dist'), preview = false)
{
    output = path.resolve (output);
    await mkdir (output, { recursive : true });
    const options = StudioBuildOptions (output);
    await build (options.ui);
    await build (options.worker);
    await CopyStudioAssets (output);
    if (preview) {
        await build ({ absWorkingDir : StudioRoot, entryPoints : ['preview/main.js'], outfile : path.join (output, 'preview.js'), bundle : true, format : 'esm', minify : true });
        await copyFile (path.join (StudioRoot, 'preview/index.html'), path.join (output, 'index.html'));
        await copyFile (fileURLToPath (new URL ('../LICENSE', import.meta.resolve ('three'))), path.join (output, 'LICENSE.three.txt'));
    }
    console.log ('3Dstudio UI and solid-modeling worker built independently.');
}

if (process.argv[1] && path.resolve (process.argv[1]) === fileURLToPath (import.meta.url)) {
    await BuildStudio (process.argv[2], !process.argv[2]);
}
