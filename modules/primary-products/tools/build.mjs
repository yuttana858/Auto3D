import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve (new URL ('..', import.meta.url).pathname);
const output = path.resolve (process.argv[2] || path.join (root, 'dist'));
await mkdir (output, { recursive : true });
await build ({ entryPoints : [path.join (root, 'src/index.js')], outfile : path.join (output, 'primary-products.module.js'), bundle : true, format : 'esm', minify : true });
await copyFile (path.join (root, 'src/primary-products.css'), path.join (output, 'primary-products.module.css'));
console.log ('Primary Products UI built independently.');
