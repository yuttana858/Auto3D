const MeshyBaseUrl = 'https://api.meshy.ai';
const MeshyAssetHost = 'assets.meshy.ai';

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
    const personal = String (context.request.headers.get ('X-Auto3D-AI-Key') || '').trim ();
    if (personal) { return personal; }
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
    const text = await response.text ();
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
        const path = Array.isArray (context.params.path) ? context.params.path : [context.params.path].filter (Boolean);
        const method = context.request.method;

        if (path.length === 1 && path[0] === 'balance' && method === 'GET') {
            return upstreamJson (context, '/openapi/v1/balance');
        }

        if (path.length === 1 && path[0] === 'model' && method === 'GET') {
            return model (context);
        }

        if (path[0] === 'text-to-3d') {
            if (path.length === 1 && method === 'POST') {
                const body = await context.request.text ();
                return upstreamJson (context, '/openapi/v2/text-to-3d', { method : 'POST', body });
            }
            if (path.length === 1 && method === 'GET') {
                const requestUrl = new URL (context.request.url);
                const pageSize = cleanPageSize (requestUrl.searchParams.get ('page_size'), 8);
                const sortBy = requestUrl.searchParams.get ('sort_by') === '+created_at' ? '+created_at' : '-created_at';
                return upstreamJson (context, '/openapi/v2/text-to-3d?page_size=' + pageSize + '&sort_by=' + encodeURIComponent (sortBy));
            }
            if (path.length === 2 && method === 'GET') {
                return upstreamJson (context, '/openapi/v2/text-to-3d/' + encodeURIComponent (String (path[1])));
            }
        }

        if (path[0] === 'image-to-3d' && path.length === 1 && method === 'GET') {
            const requestUrl = new URL (context.request.url);
            const pageSize = cleanPageSize (requestUrl.searchParams.get ('page_size'), 4);
            const sortBy = requestUrl.searchParams.get ('sort_by') === '+created_at' ? '+created_at' : '-created_at';
            return upstreamJson (context, '/openapi/v1/image-to-3d?page_size=' + pageSize + '&sort_by=' + encodeURIComponent (sortBy));
        }

        return json ({ error : 'AI API route not found.' }, 404);
    } catch (error) {
        console.error ('Auto3D AI proxy error', error);
        return json ({ error : 'AI provider request failed.' }, 500);
    }
}
