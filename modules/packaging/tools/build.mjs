import { build } from 'esbuild';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const ModuleRoot = fileURLToPath (new URL ('../', import.meta.url));
export async function BuildPackaging (output = path.join (ModuleRoot, 'dist'), preview = true)
{
    await mkdir (output, { recursive : true });
    await build ({ absWorkingDir : ModuleRoot, entryPoints : ['src/index.js'], bundle : true, format : 'esm', minify : true, outfile : path.join (output, 'packaging.module.js') });
    await copyFile (path.join (ModuleRoot, 'src/packaging.css'), path.join (output, 'packaging.module.css'));
    await copyFile (path.join (ModuleRoot, 'package.json'), path.join (output, 'module.json'));
    if (preview) { await build ({ absWorkingDir : ModuleRoot, entryPoints : ['preview/main.js'], bundle : true, format : 'esm', minify : true, outfile : path.join (output, 'preview.js') }); await copyFile (path.join (ModuleRoot, 'preview/index.html'), path.join (output, 'index.html')); }
    const bytes = (await readFile (path.join (output, 'packaging.module.js'))).length;
    console.log ('Packaging module built independently: ' + bytes + ' bytes');
}
if (process.argv[1] === fileURLToPath (import.meta.url)) { await BuildPackaging (); }
