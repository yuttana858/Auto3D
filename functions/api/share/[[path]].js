const DefaultSupabaseUrl = 'https://iesepcoxqochycckbwoh.supabase.co';
const DefaultPublishableKey = 'sb_publishable_CmRJpuYE32OBF9rIV1jwqQ_diMF7OXh';
const LegacyBucket = 'auto3d-library';
const LinkTable = 'auto3d_share_links';
const LibraryTable = 'auto3d_library';
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const Code = /^\d{4}$/;

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

async function request (env, path, options = {})
{
    const { url, key } = config (env);
    const headers = { apikey : key, ...options.headers };
    const response = await fetch (url + path, { ...options, headers });
    if (!response.ok) {
        console.error ('Auto3D share upstream error', response.status, path);
        throw Object.assign (new Error ('Share service is unavailable.'), { status : 502 });
    }
    return response;
}

async function codeHash (token, code)
{
    if (!code) { return null; }
    const bytes = new TextEncoder ().encode (token + ':' + code);
    const digest = await crypto.subtle.digest ('SHA-256', bytes);
    return Array.from (new Uint8Array (digest), (byte) => byte.toString (16).padStart (2, '0')).join ('');
}

async function libraryItem (env, id)
{
    const response = await request (env, '/rest/v1/' + LibraryTable + '?select=id,name,category,kind,object_count,created_at,status&id=eq.' + encodeURIComponent (id) + '&status=eq.published&limit=1');
    const rows = await response.json ();
    return rows[0] || null;
}

async function createShare (context)
{
    let body;
    try { body = await context.request.json (); } catch { return json ({ error : 'Invalid share request.' }, 400); }
    const itemId = String (body.itemId || '');
    const allowDownload = body.allowDownload === true;
    const code = body.code ? String (body.code) : '';
    if (!Uuid.test (itemId)) { return json ({ error : 'Invalid library item.' }, 400); }
    if (code && !Code.test (code)) { return json ({ error : 'Access code must contain exactly four digits.' }, 400); }
    if (!await libraryItem (context.env, itemId)) { return json ({ error : 'Library item not found.' }, 404); }

    const token = crypto.randomUUID ();
    const hash = await codeHash (token, code);
    await request (context.env, '/rest/v1/rpc/auto3d_create_share', {
        method : 'POST',
        headers : { 'Content-Type' : 'application/json' },
        body : JSON.stringify ({
            p_token : token,
            p_item_id : itemId,
            p_allow_download : allowDownload,
            p_code_hash : hash,
            p_code_required : Boolean (code)
        })
    });

    const origin = new URL (context.request.url).origin;
    return json ({
        token,
        url : origin + '/?view=' + encodeURIComponent (token),
        allowDownload,
        codeRequired : Boolean (code)
    }, 201);
}

async function shareInfo (env, token)
{
    const response = await request (env, '/rest/v1/' + LinkTable + '?select=token,item_id,allow_download,code_required,created_at,expires_at&token=eq.' + encodeURIComponent (token) + '&limit=1');
    const rows = await response.json ();
    if (!rows.length) { return null; }
    const share = rows[0];
    const item = await libraryItem (env, share.item_id);
    if (!item) { return null; }
    return {
        token : share.token,
        itemId : item.id,
        name : item.name,
        category : item.category,
        kind : item.kind,
        objectCount : item.object_count,
        createdAt : share.created_at,
        allowDownload : share.allow_download,
        codeRequired : share.code_required
    };
}

async function verifyShare (env, token, code)
{
    const hash = await codeHash (token, code || '');
    const response = await request (env, '/rest/v1/rpc/auto3d_verify_share', {
        method : 'POST',
        headers : { 'Content-Type' : 'application/json' },
        body : JSON.stringify ({ p_token : token, p_code_hash : hash })
    });
    const rows = await response.json ();
    return rows[0] || null;
}

async function archiveResponse (env, row)
{
    if (row.storage_provider === 'r2') {
        if (!env.AUTO3D_LIBRARY_R2) {
            throw Object.assign (new Error ('R2 Library storage is not configured.'), { status : 503 });
        }
        const key = row.archive_object_key || row.archive_path;
        const object = key ? await env.AUTO3D_LIBRARY_R2.get (key) : null;
        if (!object) { return null; }
        return new Response (object.body, {
            status : 200,
            headers : { 'Content-Type' : 'application/octet-stream' }
        });
    }

    const { url, key } = config (env);
    const path = String (row.archive_path || '').split ('/').map (encodeURIComponent).join ('/');
    if (!path) { return null; }
    const response = await fetch (url + '/storage/v1/object/authenticated/' + LegacyBucket + '/' + path, { headers : { apikey : key } });
    return response.ok ? response : null;
}

async function shareArchive (context, token, asDownload)
{
    let body = {};
    try { body = await context.request.json (); } catch { /* Access code is optional. */ }
    const code = body.code ? String (body.code) : '';
    if (code && !Code.test (code)) { return json ({ error : 'Access code must contain exactly four digits.' }, 400); }
    const grant = await verifyShare (context.env, token, code);
    if (!grant) { return json ({ error : 'Incorrect access code or unavailable share link.' }, 401); }
    if (asDownload && !grant.allow_download) { return json ({ error : 'Downloads are disabled for this share link.' }, 403); }

    const response = await request (context.env, '/rest/v1/' + LibraryTable + '?select=name,storage_provider,archive_object_key,archive_path&id=eq.' + encodeURIComponent (grant.item_id) + '&status=eq.published&limit=1');
    const rows = await response.json ();
    if (!rows.length) { return json ({ error : 'Library item not found.' }, 404); }
    const file = await archiveResponse (context.env, rows[0]);
    if (!file) { return json ({ error : 'Shared model data is unavailable.' }, 404); }

    const headers = new Headers (file.headers);
    headers.set ('Content-Type', 'application/octet-stream');
    headers.set ('Cache-Control', 'private, no-store');
    headers.set ('X-Content-Type-Options', 'nosniff');
    if (asDownload) {
        const safe = String (rows[0].name || 'Auto3D-share').replace (/[^a-z0-9._-]+/gi, '_');
        headers.set ('Content-Disposition', 'attachment; filename="' + safe + '.auto3d"');
    }
    return new Response (file.body, { status : 200, headers });
}

export async function onRequest (context)
{
    try {
        const path = context.params.path || [];
        if (context.request.method === 'POST' && path.length === 0) { return createShare (context); }
        const token = String (path[0] || '');
        if (!Uuid.test (token)) { return json ({ error : 'Invalid share link.' }, 400); }
        if (context.request.method === 'GET' && path.length === 1) {
            const info = await shareInfo (context.env, token);
            return info ? json (info) : json ({ error : 'Share link not found.' }, 404);
        }
        if (context.request.method === 'POST' && path.length === 2 && path[1] === 'archive') { return shareArchive (context, token, false); }
        if (context.request.method === 'POST' && path.length === 2 && path[1] === 'download') { return shareArchive (context, token, true); }
        return json ({ error : 'Not found.' }, 404);
    } catch (error) {
        console.error (error);
        return json ({ error : error.status ? error.message : 'Share service unavailable.' }, error.status || 500);
    }
}
