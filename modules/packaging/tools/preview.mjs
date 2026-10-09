import { BuildPackaging, ModuleRoot } from './build.mjs';
import { createServer } from 'node:http';
import { readFile, watch } from 'node:fs/promises';
import path from 'node:path';
const output = path.join (ModuleRoot, 'dist'); await BuildPackaging (); let queued = false;
async function Watch (folder) { for await (const event of watch (path.join (ModuleRoot, folder), { recursive : true })) { if (!queued) { queued = true; setTimeout (() => BuildPackaging ().catch (error => console.error (error.message)).finally (() => { queued = false; }), 150); } } }
Watch ('src').catch (error => console.error (error.message)); Watch ('preview').catch (error => console.error (error.message));
const server = createServer (async (request, response) => {
    try { const pathname = decodeURIComponent (new URL (request.url, 'http://localhost').pathname); const filename = path.resolve (output, '.' + (pathname === '/' ? '/index.html' : pathname)); if (!filename.startsWith (output + path.sep)) { response.writeHead (403).end (); return; }
        const body = await readFile (filename); response.writeHead (200, { 'Cache-Control' : 'no-store', 'Content-Type' : ({ '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json' })[path.extname (filename)] || 'application/octet-stream' }); response.end (body);
    } catch { response.writeHead (404).end ('Not found'); }
});
server.listen (8082, '127.0.0.1', () => console.log ('Standalone Packaging: http://localhost:8082 · no Auto3D, login, database or cloud services'));
