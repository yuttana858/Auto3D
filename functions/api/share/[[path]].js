import { SupabaseConfig, SupabaseHeaders } from '../../_lib/supabase.js';
import { LibraryFile } from '../../_lib/libraryfiles.js';
import { LimitedBody } from '../../_lib/accountstorage.js';
const LinkTable = 'auto3d_share_links';
const LibraryTable = 'auto3d_library';
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const Code = /^\d{4}$/;

async function shareBody (request, allowed)
{
    let body;
    try { body = JSON.parse (await (await LimitedBody (request, 4096)).text ()); }
    catch (error) { throw Object.assign (new Error (error.status === 413 ? 'Share request exceeds 4 KB.' : 'Invalid share request.'), { status : error.status === 413 ? 413 : 400 }); }
    if (!body || Array.isArray (body) || typeof body !== 'object' || Object.keys (body).some (key => !allowed.includes (key)) || body.code !== undefined && (typeof body.code !== 'string' || body.code !== '' && !Code.test (body.code))) {
        throw Object.assign (new Error ('Invalid share fields or access code.'), { status : 400 });
    }
    return body;
}

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

async function request (env, path, options = {})
{
    const { url, key } = SupabaseConfig (env);
    const headers = { ...options.headers, ...SupabaseHeaders (key) };
    const response = await fetch (url + path, { ...options, headers, signal : AbortSignal.timeout (10000) });
    if (!response.ok) {
        // Query strings contain share tokens and library identifiers.
        console.error ('Auto3D share upstream error', response.status, path.split ('?')[0]);
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
    const body = await shareBody (context.request, ['itemId', 'allowDownload', 'code']);
    if (body.allowDownload !== undefined && typeof body.allowDownload !== 'boolean') { return json ({ error : 'Invalid download permission.' }, 400); }
    const itemId = String (body.itemId || '');
    const allowDownload = body.allowDownload === true;
    const code = body.code ? String (body.code) : '';
    if (!Uuid.test (itemId)) { return json ({ error : 'Invalid library item.' }, 400); }
    if (code && !Code.test (code)) { return json ({ error : 'Access code must contain exactly four digits.' }, 400); }
    if (code && (context.env.AUTO3D_SHARE_PIN_THROTTLE_READY !== 'true' || !context.env.AUTO3D_SHARE_RATE_SECRET)) { return json ({ error : 'Protected links are unavailable until access-code protection is configured.' }, 503); }
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
        url : origin + '/mini.html?view=' + encodeURIComponent (token),
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
    if (share.expires_at && !(Date.parse (share.expires_at) > Date.now ())) { return null; }
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

async function verifyShare (context, token, code)
{
    const info = await shareInfo (context.env, token);
    if (!info) { return null; }
    const hash = await codeHash (token, code || '');
    let endpoint = 'auto3d_verify_share';
    let body = { p_token : token, p_code_hash : hash };
    if (info.codeRequired) {
        // Refuse unthrottled four-digit challenges until the proposed SQL and
        // server-side secret/configuration have been applied and verified.
        if (context.env.AUTO3D_SHARE_PIN_THROTTLE_READY !== 'true' || !context.env.AUTO3D_SHARE_RATE_SECRET) {
            throw Object.assign (new Error ('Protected shared links are temporarily unavailable.'), { status : 503 });
        }
        const ip = context.request.headers.get ('CF-Connecting-IP') || 'unresolved';
        const identifier = new TextEncoder ().encode (token + ':' + ip + ':' + context.env.AUTO3D_SHARE_RATE_SECRET);
        const digest = await crypto.subtle.digest ('SHA-256', identifier);
        const actor = Array.from (new Uint8Array (digest), byte => byte.toString (16).padStart (2, '0')).join ('');
        endpoint = 'auto3d_verify_share_limited';
        body = { ...body, p_actor_hash : actor };
    }
    const response = await request (context.env, '/rest/v1/rpc/' + endpoint, {
        method : 'POST', headers : { 'Content-Type' : 'application/json' },
        body : JSON.stringify (body)
    });
    const rows = await response.json ();
    return rows[0] || null;
}

async function shareArchive (context, token, asDownload)
{
    const body = await shareBody (context.request, ['code']);
    const code = body.code ? String (body.code) : '';
    if (code && !Code.test (code)) { return json ({ error : 'Access code must contain exactly four digits.' }, 400); }
    const grant = await verifyShare (context, token, code);
    if (!grant) { return json ({ error : 'Incorrect access code or unavailable share link.' }, 401); }
    if (asDownload && !grant.allow_download) { return json ({ error : 'Downloads are disabled for this share link.' }, 403); }

    const response = await request (context.env, '/rest/v1/' + LibraryTable + '?select=name,archive_path,storage_provider,archive_object_key&id=eq.' + encodeURIComponent (grant.item_id) + '&status=eq.published&limit=1');
    const rows = await response.json ();
    if (!rows.length) { return json ({ error : 'Library item not found.' }, 404); }
    const fileBody = await LibraryFile (context.env, rows[0], 'archive');
    const headers = new Headers ({
        'Content-Type' : 'application/octet-stream',
        'Cache-Control' : 'private, no-store',
        'X-Content-Type-Options' : 'nosniff'
    });
    if (asDownload) {
        const safe = String (rows[0].name || 'Auto3D-share').replace (/[^a-z0-9._-]+/gi, '_');
        headers.set ('Content-Disposition', 'attachment; filename="' + safe + '.auto3d"');
    }
    return new Response (fileBody, { status : 200, headers });
}

export async function onRequest (context)
{
    try {
        const path = context.params.path || [];
        if (context.request.method === 'POST' && path.length === 0) { return await createShare (context); }
        const token = String (path[0] || '');
        if (!Uuid.test (token)) { return json ({ error : 'Invalid share link.' }, 400); }
        if (context.request.method === 'GET' && path.length === 1) {
            const info = await shareInfo (context.env, token);
            return info ? json (info) : json ({ error : 'Share link not found.' }, 404);
        }
        if (context.request.method === 'POST' && path.length === 2 && path[1] === 'archive') { return await shareArchive (context, token, false); }
        if (context.request.method === 'POST' && path.length === 2 && path[1] === 'download') { return await shareArchive (context, token, true); }
        return json ({ error : 'Not found.' }, 404);
    } catch (error) {
        console.error ('Auto3D share request failed');
        return json ({ error : error.status ? error.message : 'Share service unavailable.' }, error.status || 500);
    }
}
