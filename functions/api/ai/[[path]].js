const MeshyBaseUrl = 'https://api.meshy.ai';
const MeshyAssetHost = 'assets.meshy.ai';

async function boundedText (message, limit)
{
    if (Number (message.headers.get ('Content-Length')) > limit) { throw Object.assign (new Error ('AI payload too large.'), { status : 413 }); }
    const reader = message.body?.getReader (); if (!reader) { return ''; } const chunks = []; let length = 0;
    try { while (true) { const { done, value } = await reader.read (); if (done) { break; } length += value.byteLength; if (length > limit) { await reader.cancel (); throw Object.assign (new Error ('AI payload too large.'), { status : 413 }); } chunks.push (value); } } finally { reader.releaseLock (); }
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

function apiKey (context)
{
    const allowShared = String (context.env.AUTO3D_AI_ALLOW_SHARED_KEY || '').toLowerCase () === 'true';
    const secret = String (context.env.MESHY_API_KEY || '').trim ();
    return allowShared ? secret : '';
}

function meshyUrl (context, path)
{
    return String (context.env.MESHY_API_BASE_URL || MeshyBaseUrl).replace (/\/$/, '') + path;
}

async function upstreamJson (context, path, init = {})
{
    const key = apiKey (context);
    if (!key) { return json ({ error : 'Meshy API key is not configured.' }, 401); }
    const headers = new Headers (init.headers || {});
    headers.set ('Authorization', 'Bearer ' + key);
    if (init.body !== undefined && !headers.has ('Content-Type')) { headers.set ('Content-Type', 'application/json'); }
    const response = await fetch (meshyUrl (context, path), { ...init, headers });
    const text = await boundedText (response, 4 * 1024 * 1024);
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
        if (context.request.headers.has ('X-Auto3D-AI-Key')) { return json ({ error : 'Browser-supplied AI credentials are not accepted.' }, 400); }
        const path = Array.isArray (context.params.path) ? context.params.path : [context.params.path].filter (Boolean);
        const method = context.request.method;

        if (path.length === 1 && path[0] === 'balance' && method === 'GET') {
            return upstreamJson (context, '/openapi/v1/balance');
        }

        if (path.length === 1 && path[0] === 'model' && method === 'GET') {
            return model (context);
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
                return upstreamJson (context, base, { method : 'POST', body });
            }
            if (path.length === 1 && method === 'GET') {
                const requestUrl = new URL (context.request.url); const pageSize = cleanPageSize (requestUrl.searchParams.get ('page_size'), 8);
                const sortBy = requestUrl.searchParams.get ('sort_by') === '+created_at' ? '+created_at' : '-created_at';
                return upstreamJson (context, base + '?page_size=' + pageSize + '&sort_by=' + encodeURIComponent (sortBy));
            }
            if (path.length === 2 && method === 'GET' && String (path[1]).length <= 200) { return upstreamJson (context, base + '/' + encodeURIComponent (String (path[1]))); }
        }

        return json ({ error : 'AI API route not found.' }, 404);
    } catch (error) {
        if (error.status === 413) { return json ({ error : 'AI payload exceeds the supported size.' }, 413); }
        console.error ('Auto3D AI proxy error', error);
        return json ({ error : 'AI provider request failed.' }, 500);
    }
}
