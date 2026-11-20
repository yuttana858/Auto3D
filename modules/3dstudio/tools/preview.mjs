import { BuildStudio, StudioRoot } from './build.mjs';
import { createServer } from 'node:http';
import { readFile, watch } from 'node:fs/promises';
import path from 'node:path';

const output = path.join (StudioRoot, 'dist');
await BuildStudio (output, true);
const abort = new AbortController ();
let queued = false, building = false, timer;
async function Rebuild ()
{
    if (building) { queued = true; return; }
    building = true;
    do {
        queued = false;
        try { await BuildStudio (output, true); } catch (error) { console.error (error.message); }
    } while (queued);
    building = false;
}
async function Watch (folder)
{
    try {
        for await (const event of watch (path.join (StudioRoot, folder), { recursive : true, signal : abort.signal })) {
            if (!event.filename) { continue; }
            clearTimeout (timer); timer = setTimeout (Rebuild, 150);
        }
    } catch (error) { if (error.name !== 'AbortError') { console.error (error.message); } }
}
Watch ('src'); Watch ('preview');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.wasm' : 'application/wasm', '.txt' : 'text/plain' };
const server = createServer (async (request, response) => {
    try {
        const pathname = decodeURIComponent (new URL (request.url, 'http://localhost').pathname);
        const filename = path.resolve (output, '.' + (pathname === '/' ? '/index.html' : pathname));
        if (!filename.startsWith (output + path.sep)) { response.writeHead (403).end (); return; }
        const body = await readFile (filename);
        response.writeHead (200, { 'Cache-Control' : 'no-store', 'Content-Type' : types[path.extname (filename)] || 'application/octet-stream' }); response.end (body);
    } catch { response.writeHead (404).end ('Not found'); }
});
server.listen (8085, '127.0.0.1', () => console.log ('Standalone 3Dstudio: http://localhost:8085 · local primitives, Booleans and editable history'));
function Stop () { clearTimeout (timer); abort.abort (); server.close (); }
server.on ('error', error => { console.error (error.message); Stop (); process.exitCode = 1; });
process.on ('SIGINT', Stop); process.on ('SIGTERM', Stop);
