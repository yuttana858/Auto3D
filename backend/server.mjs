import http from 'node:http';
import { SupabaseLibraryAdapter } from './adapters/supabase.mjs';
import { LibraryService } from './library-service.mjs';

const service = new LibraryService (new SupabaseLibraryAdapter ());
const maxRequest = Number (process.env.AUTO3D_MAX_REQUEST_BYTES || 70 * 1024 * 1024);

function json (response, status, value)
{
    const data = JSON.stringify (value);
    response.writeHead (status, { 'Content-Type' : 'application/json', 'Content-Length' : Buffer.byteLength (data), 'Cache-Control' : 'no-store' });
    response.end (data);
}

function route (url)
{
    const path = url.pathname.replace (/\/+$/, '') || '/';
    const match = /^\/api\/library\/items\/([0-9a-f-]+)(?:\/(archive|thumbnail))?$/.exec (path);
    if (path === '/api/library/items') { return { name : 'items' }; }
    if (match) { return { name : match[2] || 'item', id : match[1] }; }
    return null;
}

async function bodyBuffer (request)
{
    const chunks = []; let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > maxRequest) { throw Object.assign (new Error ('Request is too large.'), { status : 413 }); }
        chunks.push (chunk);
    }
    return Buffer.concat (chunks);
}

async function publishForm (request)
{
    const body = await bodyBuffer (request);
    const webRequest = new Request ('http://localhost/api/library/items', { method : 'POST', headers : request.headers, body });
    const form = await webRequest.formData ();
    const metadata = JSON.parse (String (form.get ('metadata') || '{}'));
    const archive = form.get ('archive'); const thumbnail = form.get ('thumbnail');
    if (!(archive instanceof Blob) || !(thumbnail instanceof Blob)) { throw Object.assign (new Error ('Archive and thumbnail are required.'), { status : 400 }); }
    return { metadata, archive : Buffer.from (await archive.arrayBuffer ()), thumbnail : Buffer.from (await thumbnail.arrayBuffer ()) };
}

export function CreateServer (library = service)
{
    return http.createServer (async (request, response) => {
        response.setHeader ('X-Content-Type-Options', 'nosniff');
        response.setHeader ('Referrer-Policy', 'no-referrer');
        try {
            const url = new URL (request.url, 'http://localhost');
            const found = route (url);
            if (!found) { json (response, 404, { error : 'Not found.' }); return; }

            if (request.method === 'GET' && found.name === 'items') { json (response, 200, await library.List ()); return; }
            if (request.method === 'GET' && found.name === 'item') {
                const item = await library.Get (found.id); if (!item) { json (response, 404, { error : 'Library item not found.' }); return; }
                json (response, 200, item); return;
            }
            if (request.method === 'GET' && (found.name === 'archive' || found.name === 'thumbnail')) {
                const file = await library.Download (found.id, found.name);
                if (!file) { json (response, 404, { error : 'Library file not found.' }); return; }
                response.writeHead (file.status || 200, { 'Content-Type' : found.name === 'archive' ? 'application/octet-stream' : 'image/png', 'Cache-Control' : 'private, max-age=60' });
                if (file.body) { for await (const chunk of file.body) { response.write (chunk); } }
                response.end (); return;
            }
            if (request.method === 'POST' && found.name === 'items') {
                const { metadata, archive, thumbnail } = await publishForm (request);
                json (response, 201, await library.Publish (request.headers.authorization, metadata, archive, thumbnail)); return;
            }
            if (request.method === 'DELETE' && found.name === 'item') {
                const deleted = await library.Delete (request.headers.authorization, found.id);
                if (!deleted) { json (response, 404, { error : 'Library item not found.' }); return; }
                response.writeHead (204); response.end (); return;
            }
            json (response, 405, { error : 'Method not allowed.' });
        } catch (error) {
            json (response, Number (error.status) || 500, { error : Number (error.status) ? error.message : 'Internal server error.' });
        }
    });
}

if (import.meta.url === 'file://' + process.argv[1]) {
    const port = Number (process.env.PORT || 3000);
    CreateServer ().listen (port, () => console.log ('Auto3D Library API listening on port ' + port));
}
