import { MeshyKey } from '../../_lib/aicredentials.js';
const MeshyBaseUrl = 'https://api.meshy.ai';
const MeshyAssetHost = 'assets.meshy.ai';

async function boundedText (message, limit)
{
    if (Number (message.headers.get ('Content-Length')) > limit) { throw Object.assign (new Error ('AI payload too large.'), { status : 413 }); }
    const reader = message.body?.getReader (); if (!reader) { return ''; } const chunks = []; let length = 0;
    try { for (;;) { const { done, value } = await reader.read (); if (done) { break; } length += value.byteLength; if (length > limit) { await reader.cancel (); throw Object.assign (new Error ('AI payload too large.'), { status : 413 }); } chunks.push (value); } } finally { reader.releaseLock (); }
    const bytes = new Uint8Array (length); let offset = 0; for (const chunk of chunks) { bytes.set (chunk, offset); offset += chunk.length; } return new TextDecoder ().decode (bytes);
}

function json (data, status = 200, extraHeaders = null)
{
    const headers = new Headers ({
        'Content-Type' : 'application/json',
        'Cache-Control' : 'no-store',
        'X-Content-Type-Options' : 'nosniff'
    });
    if (extraHeaders) {
        for (const [key, value] of extraHeaders.entries ()) {
            if (key.toLowerCase () === 'retry-after') { headers.set ('Retry-After', value); }
        }
    }
    return new Response (JSON.stringify (data), { status, headers });
}

function meshyUrl (context, path)
{
    return String (context.env.MESHY_API_BASE_URL || MeshyBaseUrl).replace (/\/$/, '') + path;
}

async function upstreamJson (context, path, init = {})
{
    const key = await MeshyKey (context);
    if (!key) { return json ({ error : 'No Meshy key is configured. Save a key in AI connections.', code : 'MESHY_KEY_MISSING' }, 401); }
    const headers = new Headers (init.headers || {});
    headers.set ('Authorization', 'Bearer ' + key);
    if (init.body !== undefined && !headers.has ('Content-Type')) { headers.set ('Content-Type', 'application/json'); }
    const target = new URL (meshyUrl (context, path));
    if (target.protocol !== 'https:') { return json ({ error : 'Invalid Meshy server configuration.' }, 503); }
    const response = await fetch (target.toString (), { ...init, headers, redirect : 'error', signal : AbortSignal.timeout (30000) });
    if (response.status === 401 || response.status === 403) { await response.body?.cancel (); return json ({ error : 'Meshy rejected the saved key. Check the key and any Meshy IP restrictions.', code : 'MESHY_KEY_REJECTED' }, response.status); }
    const text = (await boundedText (response, 4 * 1024 * 1024)).replaceAll (key, '[redacted]');
    let body = null;
    if (text) {
        try { body = JSON.parse (text); }
        catch { body = { error : text }; }
    } else {
        body = {};
    }
    return json (body, response.status, response.headers);
}

function cleanPageSize (value, fallback)
{
    const parsed = Number.parseInt (value, 10);
    return Number.isFinite (parsed) ? Math.max (1, Math.min (100, parsed)) : fallback;
}

async function model (context)
{
    const requestUrl = new URL (context.request.url);
    const raw = requestUrl.searchParams.get ('url');
    if (!raw) { return json ({ error : 'Missing model URL.' }, 400); }
    let source = null;
    try { source = new URL (raw); }
    catch { return json ({ error : 'Invalid model URL.' }, 400); }
    if (source.protocol !== 'https:' || source.hostname !== MeshyAssetHost) {
        return json ({ error : 'Only Meshy-generated asset URLs can be proxied.' }, 400);
    }
    const response = await fetch (source.toString (), { redirect : 'follow' });
    if (!response.ok) { return json ({ error : 'Generated model is unavailable.' }, response.status === 404 ? 404 : 502); }
    const headers = new Headers ({
        'Content-Type' : response.headers.get ('Content-Type') || 'model/gltf-binary',
        'Cache-Control' : 'private, max-age=300',
        'X-Content-Type-Options' : 'nosniff',
        'Content-Disposition' : 'attachment; filename="auto3d-generated.glb"'
    });
    const length = response.headers.get ('Content-Length');
    if (length) { headers.set ('Content-Length', length); }
    return new Response (response.body, { status : 200, headers });
}

export async function onRequest (context)
{
    try {
        if (!context.data?.user?.id) { return json ({ error : 'Sign in to use Meshy.' }, 401); }
        if (context.request.headers.has ('X-Auto3D-AI-Key')) { return json ({ error : 'Browser-supplied AI credentials are not accepted.' }, 400); }
        const path = Array.isArray (context.params.path) ? context.params.path : [context.params.path].filter (Boolean);
        const method = context.request.method;

        if (path.length === 1 && path[0] === 'balance' && method === 'GET') {
            return await upstreamJson (context, '/openapi/v1/balance');
        }

        if (path.length === 1 && path[0] === 'model' && method === 'GET') {
            return await model (context);
        }

        const routes = { 'text-to-3d' : 'v2', 'image-to-3d' : 'v1', 'text-to-image' : 'v1', retexture : 'v1', rigging : 'v1', animations : 'v1' };
        const version = routes[path[0]];
        if (Object.hasOwn (routes, path[0]) && typeof version === 'string') {
            const base = '/openapi/' + version + '/' + path[0];
            if (path.length === 1 && method === 'POST') {
                const body = await boundedText (context.request, 28 * 1024 * 1024);
                if (body.length > 28 * 1024 * 1024) { return json ({ error : 'AI request exceeds the reference image limit.' }, 413); }
                let payload; try { payload = JSON.parse (body); } catch { return json ({ error : 'Invalid AI JSON request.' }, 400); }
                if (!payload || Array.isArray (payload) || typeof payload !== 'object') { return json ({ error : 'Expected AI request fields.' }, 400); }
                return await upstreamJson (context, base, { method : 'POST', body });
            }
            if (path.length === 1 && method === 'GET') {
                const requestUrl = new URL (context.request.url); const pageSize = cleanPageSize (requestUrl.searchParams.get ('page_size'), 8);
                const sortBy = requestUrl.searchParams.get ('sort_by') === '+created_at' ? '+created_at' : '-created_at';
                return await upstreamJson (context, base + '?page_size=' + pageSize + '&sort_by=' + encodeURIComponent (sortBy));
            }
            if (path.length === 2 && method === 'GET' && String (path[1]).length <= 200) { return await upstreamJson (context, base + '/' + encodeURIComponent (String (path[1]))); }
        }

        return json ({ error : 'AI API route not found.' }, 404);
    } catch (error) {
        if (error.status === 413) { return json ({ error : 'AI payload exceeds the supported size.' }, 413); }
        if (error.status === 401) { return json ({ error : 'Sign in to use Meshy.' }, 401); }
        if (error.status === 503) { return json ({ error : 'Secure Meshy key storage is unavailable. Contact your administrator.', code : 'MESHY_STORAGE_UNAVAILABLE' }, 503); }
        return json ({ error : 'AI provider request failed. Check the connection and retry.', code : 'MESHY_REQUEST_FAILED' }, 500);
    }
}
