import { MeshyCredential, OwnedTasks, RecordOwnedTask } from '../../_lib/aicredentials.js';
const MeshyBaseUrl = 'https://api.meshy.ai';
const MeshyAssetHost = 'assets.meshy.ai';
const ModelLimit = 200 * 1024 * 1024, ImageRequestLimit = 28 * 1024 * 1024, TextRequestLimit = 65536;
// Routes whose requests may carry reference images as data URIs.
const ImageRoutes = new Set (['image-to-3d', 'multi-image-to-3d', 'image-to-image', 'retexture', 'text-to-image']);
const SharedCreateLimit = 20, SharedCreateWindowMs = 3600000;

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

async function upstreamJson (context, path, init = {}, credential = null)
{
    const { key } = credential || await MeshyCredential (context);
    if (!key) { return json ({ error : 'No Meshy key is configured. Save a key in AI connections.', code : 'MESHY_KEY_MISSING' }, 401); }
    const headers = new Headers (init.headers || {});
    headers.set ('Authorization', 'Bearer ' + key);
    if (init.body !== undefined && !headers.has ('Content-Type')) { headers.set ('Content-Type', 'application/json'); }
    const target = new URL (meshyUrl (context, path));
    if (target.protocol !== 'https:') { return json ({ error : 'Invalid Meshy server configuration.' }, 503); }
    const response = await fetch (target.toString (), { ...init, headers, redirect : 'error', signal : AbortSignal.timeout (30000) });
    if (response.status === 401) { await response.body?.cancel (); return json ({ error : 'Meshy rejected the saved key. Check the key.', code : 'MESHY_KEY_REJECTED' }, 401); }
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
    const response = await fetch (source.toString (), { redirect : 'follow', signal : AbortSignal.timeout (120000) });
    if (!response.ok) { return json ({ error : 'Generated model is unavailable.' }, response.status === 404 ? 404 : 502); }
    if (response.url && new URL (response.url).protocol !== 'https:') { await response.body?.cancel (); return json ({ error : 'Generated model is unavailable.' }, 502); }
    if (Number (response.headers.get ('Content-Length')) > ModelLimit) { await response.body?.cancel (); return json ({ error : 'Generated model exceeds the 200 MB limit.' }, 413); }
    const headers = new Headers ({
        'Content-Type' : response.headers.get ('Content-Type') || 'model/gltf-binary',
        'Cache-Control' : 'private, max-age=300',
        'X-Content-Type-Options' : 'nosniff',
        'Content-Disposition' : 'attachment; filename="auto3d-generated.glb"'
    });
    const length = response.headers.get ('Content-Length');
    if (length) { headers.set ('Content-Length', length); }
    // Count bytes as they stream so a missing or false Content-Length cannot exceed the cap.
    let received = 0;
    const limited = response.body?.pipeThrough (new TransformStream ({ transform (chunk, controller) { received += chunk.byteLength; if (received > ModelLimit) { controller.error (new Error ('Generated model exceeds the size limit.')); return; } controller.enqueue (chunk); } }));
    return new Response (limited ?? null, { status : 200, headers });
}
// Meshy request bodies are flat objects of simple fields; reject anything else before spending credits.
function ValidPayload (payload)
{
    if (!payload || Array.isArray (payload) || typeof payload !== 'object') { return false; }
    const entries = Object.entries (payload);
    if (entries.length > 40) { return false; }
    const simple = value => value === null || ['string', 'number', 'boolean'].includes (typeof value);
    return entries.every (([key, value]) => /^[a-z][a-z0-9_]{0,63}$/.test (key) && (simple (value) || Array.isArray (value) && value.length <= 16 && value.every (simple)));
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
        const owner = context.data.user.id;

        if (path.length === 1 && path[0] === 'model' && method === 'GET') {
            return await model (context);
        }

        const routes = { 'text-to-3d' : 'v2', 'image-to-3d' : 'v1', 'multi-image-to-3d' : 'v1', 'text-to-image' : 'v1', 'image-to-image' : 'v1', retexture : 'v1', rigging : 'v1', animations : 'v1' };
        const version = routes[path[0]];
        if (Object.hasOwn (routes, path[0]) && typeof version === 'string') {
            const base = '/openapi/' + version + '/' + path[0];
            const credential = await MeshyCredential (context);
            if (path.length === 1 && method === 'POST') {
                const limit = ImageRoutes.has (path[0]) ? ImageRequestLimit : TextRequestLimit;
                const body = await boundedText (context.request, limit);
                let payload; try { payload = JSON.parse (body); } catch { return json ({ error : 'Invalid AI JSON request.' }, 400); }
                if (!ValidPayload (payload)) { return json ({ error : 'Expected flat AI request fields.' }, 400); }
                if (credential.shared) {
                    const { tasks } = await OwnedTasks (context.env, owner);
                    if (tasks.filter (task => Date.now () - task.createdAt < SharedCreateWindowMs).length >= SharedCreateLimit) { return json ({ error : 'The shared Meshy key allows ' + SharedCreateLimit + ' generations per hour per account. Save a personal key in AI connections for more.', code : 'MESHY_SHARED_RATE_LIMITED' }, 429, new Headers ({ 'Retry-After' : '600' })); }
                }
                const response = await upstreamJson (context, base, { method : 'POST', body }, credential);
                if (credential.shared && response.ok) {
                    const created = await response.clone ().json ().catch (() => null);
                    if (typeof created?.result === 'string') { await RecordOwnedTask (context.env, owner, created.result); }
                }
                return response;
            }
            if (path.length === 1 && method === 'GET') {
                const requestUrl = new URL (context.request.url); const pageSize = cleanPageSize (requestUrl.searchParams.get ('page_size'), 8);
                const sortBy = requestUrl.searchParams.get ('sort_by') === '+created_at' ? '+created_at' : '-created_at';
                if (!credential.shared) { return await upstreamJson (context, base + '?page_size=' + pageSize + '&sort_by=' + encodeURIComponent (sortBy), {}, credential); }
                // The shared key's account holds every user's tasks; return only this account's.
                const owned = new Set ((await OwnedTasks (context.env, owner)).tasks.map (task => task.id));
                const response = await upstreamJson (context, base + '?page_size=100&sort_by=' + encodeURIComponent (sortBy), {}, credential);
                if (!response.ok) { return response; }
                const listed = await response.json ();
                return json (Array.isArray (listed) ? listed.filter (task => owned.has (task?.id)).slice (0, pageSize) : [], 200);
            }
            if (path.length === 2 && method === 'GET' && String (path[1]).length <= 200) {
                if (credential.shared && !(await OwnedTasks (context.env, owner)).tasks.some (task => task.id === String (path[1]))) { return json ({ error : 'AI task not found.' }, 404); }
                return await upstreamJson (context, base + '/' + encodeURIComponent (String (path[1])), {}, credential);
            }
        }

        return json ({ error : 'AI API route not found.' }, 404);
    } catch (error) {
        if (error.status === 413) { return json ({ error : 'AI payload exceeds the supported size.' }, 413); }
        if (error.status === 401) { return json ({ error : 'Sign in to use Meshy.' }, 401); }
        if (error.status === 503) { return json ({ error : 'Secure Meshy key storage is unavailable. Contact your administrator.', code : 'MESHY_STORAGE_UNAVAILABLE' }, 503); }
        return json ({ error : context.request.method === 'POST' ? 'Submission response was lost. Check recent creations before retrying; Meshy may have accepted the task.' : 'AI provider request failed. Check the connection and retry.', code : 'MESHY_REQUEST_FAILED' }, 502);
    }
}
