import { SupabaseConfig, SupabaseHeaders } from '../../_lib/supabase.js';
import { LibraryFile } from '../../_lib/libraryfiles.js';
const Table = 'auto3d_library';
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json (data, status = 200)
{
    return new Response (JSON.stringify (data), {
        status,
        headers : {
            'Content-Type' : 'application/json',
            'Cache-Control' : 'no-store',
            'X-Content-Type-Options' : 'nosniff'
        }
    });
}

async function supabase (env, path)
{
    const { url, key } = SupabaseConfig (env);
    const response = await fetch (url + path, { headers : SupabaseHeaders (key), signal : AbortSignal.timeout (10000) });
    if (!response.ok) {
        console.error ('Auto3D library upstream error', response.status, path);
        throw Object.assign (new Error ('Shared library backend is unavailable.'), { status : 502 });
    }
    return response;
}

function item (row)
{
    return {
        id : row.id,
        name : row.name,
        category : row.category,
        kind : row.kind,
        objectCount : row.object_count,
        createdAt : row.created_at,
        version : row.version || 1,
        supersedesId : row.supersedes_id || null,
        status : row.status || 'published',
        storageProvider : row.storage_provider || 'supabase',
        fileSize : Number (row.file_size_bytes || 0)
    };
}

async function list (env)
{
    const response = await supabase (env, '/rest/v1/' + Table + '?select=*&status=eq.published&order=created_at.desc,id.asc&limit=1000');
    return json ((await response.json ()).map (item));
}

async function getRow (env, id, select = '*')
{
    const response = await supabase (env, '/rest/v1/' + Table + '?select=' + encodeURIComponent (select) + '&id=eq.' + encodeURIComponent (id) + '&status=eq.published&limit=1');
    const rows = await response.json ();
    return rows[0] || null;
}

async function getItem (env, id)
{
    const row = await getRow (env, id);
    return row ? json (item (row)) : json ({ error : 'Library item not found.' }, 404);
}

async function getFile (env, id, type)
{
    const field = type === 'archive' ? 'archive_path' : 'thumbnail_path';
    const row = await getRow (env, id, 'storage_provider,' + type + '_object_key,' + field);
    if (!row) { return json ({ error : 'Library item not found.' }, 404); }
    const body = await LibraryFile (env, row, type);
    const headers = new Headers ();
    headers.set ('Content-Type', type === 'archive' ? 'application/octet-stream' : 'image/png');
    headers.set ('Cache-Control', 'private, no-store');
    headers.set ('X-Content-Type-Options', 'nosniff');
    return new Response (body, { status : 200, headers });
}

export async function onRequest (context)
{
    const method = context.request.method;
    if (method !== 'GET') {
        return json ({ error : 'Corporate publishing is unavailable until Microsoft Entra ID is connected.' }, 503);
    }

    try {
        const path = context.params.path || [];
        if (!path.length || path[0] === 'items' && path.length === 1) { return await list (context.env); }
        if (path[0] !== 'items' || !Uuid.test (String (path[1] || ''))) { return json ({ error : 'Invalid library request.' }, 400); }
        const id = path[1];
        if (path.length === 2) { return await getItem (context.env, id); }
        if (path.length === 3 && (path[2] === 'archive' || path[2] === 'thumbnail')) { return await getFile (context.env, id, path[2]); }
        return json ({ error : 'Not found.' }, 404);
    } catch (error) {
        console.error ('Auto3D Library request failed');
        return json ({ error : error.status ? error.message : 'Library API unavailable.' }, error.status || 500);
    }
}
