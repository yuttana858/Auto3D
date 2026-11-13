import { context } from 'esbuild';
import { execFileSync } from 'node:child_process';
execFileSync (process.execPath, ['tools/prepare_animation_decoders.mjs', 'build/website_dev']);
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ModuleRoot } from '../modules/packaging/tools/build.mjs';
import { copyFile } from 'node:fs/promises';

const root = process.cwd ();
const build = await context ({ entryPoints : { 'o3dv.website.min' : 'source/website/index.js', 'o3dv.recovery' : 'source/website/sessionrecoveryworker.js', 'o3dv.optimize' : 'source/website/polygonworker.js' }, define : { 'import.meta.url' : 'document.currentScript.src' }, bundle : true, minify : true, globalName : 'OV', sourcemap : true, loader : { '.ttf' : 'file', '.woff' : 'file', '.svg' : 'file' }, outdir : 'build/website_dev', logLevel : 'info' });
await build.rebuild ();
await build.watch ();
const packaging = await context ({ absWorkingDir : ModuleRoot, entryPoints : ['src/index.js'], bundle : true, format : 'esm', minify : true, outfile : path.join (root, 'build/website_dev/packaging/packaging.module.js'), plugins : [{ name : 'packaging-css', setup : bundler => { bundler.onLoad ({ filter : /index\.js$/ }, async args => { if (args.path !== path.join (ModuleRoot, 'src/index.js')) { return; } return { contents : await readFile (args.path, 'utf8'), loader : 'js', watchFiles : [path.join (ModuleRoot, 'src/packaging.css')] }; }); bundler.onEnd (async () => { await copyFile (path.join (ModuleRoot, 'src/packaging.css'), path.join (root, 'build/website_dev/packaging/packaging.module.css')); }); } }], logLevel : 'info' });
await packaging.rebuild (); await packaging.watch ();
const primaryProducts = await context ({ entryPoints : ['modules/primary-products/src/index.js'], bundle : true, format : 'esm', minify : true, outfile : path.join (root, 'build/website_dev/primary-products/primary-products.module.js'), plugins : [{ name : 'primary-products-css', setup : bundler => { bundler.onLoad ({ filter : /index\.js$/ }, async args => { if (args.path !== path.join (root, 'modules/primary-products/src/index.js')) { return; } return { contents : await readFile (args.path, 'utf8'), loader : 'js', watchFiles : [path.join (root, 'modules/primary-products/src/primary-products.css')] }; }); bundler.onEnd (async () => { await copyFile (path.join (root, 'modules/primary-products/src/primary-products.css'), path.join (root, 'build/website_dev/primary-products/primary-products.module.css')); }); } }], logLevel : 'info' });
await primaryProducts.rebuild (); await primaryProducts.watch ();
const moldedPulp = await context ({ entryPoints : ['modules/molded-pulp/src/index.js'], bundle : true, format : 'esm', minify : true, outfile : path.join (root, 'build/website_dev/molded-pulp/molded-pulp.module.js'), plugins : [{ name : 'molded-pulp-css', setup : bundler => { bundler.onLoad ({ filter : /index\.js$/ }, async args => { if (args.path !== path.join (root, 'modules/molded-pulp/src/index.js')) { return; } return { contents : await readFile (args.path, 'utf8'), loader : 'js', watchFiles : [path.join (root, 'modules/molded-pulp/src/molded-pulp.css')] }; }); bundler.onEnd (async () => { await copyFile (path.join (root, 'modules/molded-pulp/src/molded-pulp.css'), path.join (root, 'build/website_dev/molded-pulp/molded-pulp.module.css')); }); } }], logLevel : 'info' });
await moldedPulp.rebuild (); await moldedPulp.watch ();
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.jpg' : 'image/jpeg', '.webp' : 'image/webp', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm', '.glb' : 'model/gltf-binary', '.gltf' : 'model/gltf+json' };
const server = createServer (async (request, response) => {
    response.setHeader ('Cache-Control', 'no-store');
    try {
        const url = new URL (request.url, 'http://localhost'); const parts = decodeURIComponent (url.pathname).split ('/').filter (Boolean);
        if (parts.some ((part) => part.startsWith ('.') || part.includes ('\\') || part.includes (':'))) { response.writeHead (403).end (); return; }
        let filename = path.resolve (root, ...parts);
        if (filename !== root && !filename.startsWith (root + path.sep)) { response.writeHead (403).end (); return; }
        if ((await stat (filename)).isDirectory ()) { filename = path.join (filename, 'index.html'); }
        const data = await readFile (filename); response.setHeader ('Content-Type', types[path.extname (filename)] || 'application/octet-stream'); response.writeHead (200); response.end (data);
    } catch { response.writeHead (404).end ('Not found'); }
});
server.on ('error', async (error) => { console.error (error.message); await build.dispose (); process.exit (1); });
server.listen (8080, '127.0.0.1', () => console.log ('SW Auto3D development server: http://localhost:8080/website/index.html — source watching, no browser cache. Refresh after a successful rebuild.'));
async function stop () { server.close (); await Promise.all ([build.dispose (), packaging.dispose (), primaryProducts.dispose (), moldedPulp.dispose ()]); process.exit (0); }
process.on ('SIGINT', stop); process.on ('SIGTERM', stop);
