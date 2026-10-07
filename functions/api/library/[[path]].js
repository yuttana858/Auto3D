const DefaultSupabaseUrl = 'https://iesepcoxqochycckbwoh.supabase.co';
const DefaultPublishableKey = 'sb_publishable_CmRJpuYE32OBF9rIV1jwqQ_diMF7OXh';
const LegacyBucket = 'auto3d-library';
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

function config (env)
{
    return {
        url : String (env.SUPABASE_URL || DefaultSupabaseUrl).replace (/\/$/, ''),
        key : String (env.SUPABASE_PUBLISHABLE_KEY || DefaultPublishableKey)
    };
}

async function supabase (env, path)
{
    const { url, key } = config (env);
    const response = await fetch (url + path, { headers : { apikey : key } });
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
        fileSize : Number (row.file_size_bytes || 0),
        storageProvider : row.storage_provider || 'supabase'
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

function responseHeaders (type, sourceHeaders = null)
{
    const headers = sourceHeaders ? new Headers (sourceHeaders) : new Headers ();
    if (!headers.has ('Content-Type')) {
        headers.set ('Content-Type', type === 'archive' ? 'application/octet-stream' : 'image/png');
    }
    headers.set ('Cache-Control', 'public, max-age=300');
    headers.set ('X-Content-Type-Options', 'nosniff');
    return headers;
}

async function getR2File (env, key, type)
{
    if (!env.AUTO3D_LIBRARY_R2) {
        throw Object.assign (new Error ('R2 Library storage is not configured.'), { status : 503 });
    }
    const object = await env.AUTO3D_LIBRARY_R2.get (key);
    if (!object) { return json ({ error : 'Library file unavailable.' }, 404); }
    const headers = responseHeaders (type);
    object.writeHttpMetadata?.(headers);
    return new Response (object.body, { status : 200, headers });
}

async function getLegacyFile (env, pathValue, type)
{
    const { url, key } = config (env);
    const path = String (pathValue).split ('/').map (encodeURIComponent).join ('/');
    const response = await fetch (url + '/storage/v1/object/authenticated/' + LegacyBucket + '/' + path, { headers : { apikey : key } });
    if (!response.ok) { return json ({ error : 'Library file unavailable.' }, response.status === 404 ? 404 : 502); }
    return new Response (response.body, { status : 200, headers : responseHeaders (type, response.headers) });
}

async function getFile (env, id, type)
{
    const objectField = type === 'archive' ? 'archive_object_key' : 'thumbnail_object_key';
    const legacyField = type === 'archive' ? 'archive_path' : 'thumbnail_path';
    const row = await getRow (env, id, 'storage_provider,' + objectField + ',' + legacyField);
    if (!row) { return json ({ error : 'Library item not found.' }, 404); }

    if (row.storage_provider === 'r2') {
        const key = row[objectField] || row[legacyField];
        if (!key) { return json ({ error : 'Library file unavailable.' }, 404); }
        return getR2File (env, key, type);
    }

    if (!row[legacyField]) { return json ({ error : 'Library file unavailable.' }, 404); }
    return getLegacyFile (env, row[legacyField], type);
}

export async function onRequest (context)
{
    const method = context.request.method;
    if (method !== 'GET') {
        return json ({ error : 'Corporate publishing is unavailable until Microsoft Entra ID is connected.' }, 503);
    }

    try {
        const path = context.params.path || [];
        if (!path.length || path[0] === 'items' && path.length === 1) { return list (context.env); }
        if (path[0] !== 'items' || !Uuid.test (String (path[1] || ''))) { return json ({ error : 'Invalid library request.' }, 400); }
        const id = path[1];
        if (path.length === 2) { return getItem (context.env, id); }
        if (path.length === 3 && (path[2] === 'archive' || path[2] === 'thumbnail')) { return getFile (context.env, id, path[2]); }
        return json ({ error : 'Not found.' }, 404);
    } catch (error) {
        console.error (error);
        return json ({ error : error.status ? error.message : 'Library API unavailable.' }, error.status || 500);
    }
}
