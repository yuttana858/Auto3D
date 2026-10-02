import { context } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd ();
const build = await context ({ entryPoints : ['source/website/index.js'], bundle : true, minify : true, globalName : 'OV', sourcemap : true, loader : { '.ttf' : 'file', '.woff' : 'file', '.svg' : 'file' }, outfile : 'build/website_dev/o3dv.website.min.js', logLevel : 'info' });
await build.rebuild ();
await build.watch ();
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
async function stop () { server.close (); await build.dispose (); process.exit (0); }
process.on ('SIGINT', stop); process.on ('SIGTERM', stop);
