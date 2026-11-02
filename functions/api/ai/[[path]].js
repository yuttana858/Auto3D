import { Database } from '../../_lib/accountstorage.js';
import { CredentialExists, SaveCredential, ReadCredential, DeleteCredential } from '../../_lib/ai-credentials.js';

const MeshyBaseUrl = 'https://api.meshy.ai';
const MeshyAssetHost = 'assets.meshy.ai';
const TaskId = /^[A-Za-z0-9_-]{1,200}$/;
const Routes = { 'text-to-3d' : 'v2', 'image-to-3d' : 'v1', 'text-to-image' : 'v1', retexture : 'v1', rigging : 'v1', animations : 'v1' };

async function OwnedTask (context, id)
{
    if (typeof id !== 'string' || !TaskId.test (id)) { return null; }
    const owner = context.data.user.id; const rows = await Database (context.env, 'auto3d_ai_tasks?user_id=eq.' + encodeURIComponent (owner) + '&task_id=eq.' + encodeURIComponent (id) + '&select=task_id,route&limit=1');
    return rows?.[0] || null;
}

async function boundedText (message, limit)
{
    if (Number (message.headers.get ('Content-Length')) > limit) { throw Object.assign (new Error ('AI payload too large.'), { status : 413 }); }
    const reader = message.body?.getReader (); if (!reader) { return ''; } const chunks = []; let length = 0;
    try { let done = false; while (!done) { const part = await reader.read (); done = part.done; if (done) { break; } length += part.value.byteLength; if (length > limit) { await reader.cancel (); throw Object.assign (new Error ('AI payload too large.'), { status : 413 }); } chunks.push (part.value); } } finally { reader.releaseLock (); }
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

async function apiKey (context)
{
    if (context.env.AUTO3D_AI_ENCRYPTION_KEY) { const personal = await ReadCredential (context.env, context.data.user.id); if (personal) { return personal; } }
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
    const key = await apiKey (context);
    if (!key) { return json ({ error : 'Meshy API key is not configured.' }, 401); }
    const headers = new Headers (init.headers || {});
    headers.set ('Authorization', 'Bearer ' + key);
    if (init.body !== undefined && !headers.has ('Content-Type')) { headers.set ('Content-Type', 'application/json'); }
    const response = await fetch (meshyUrl (context, path), { ...init, headers });
    const text = (await boundedText (response, 4 * 1024 * 1024)).split (key).join ('[redacted]');
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
    const raw = requestUrl.searchParams.get ('url'); const task = await OwnedTask (context, requestUrl.searchParams.get ('task'));
    if (!task || !Object.hasOwn (Routes, task.route)) { return json ({ error : 'AI task not found.' }, 404); }
    if (!raw) { return json ({ error : 'Missing model URL.' }, 400); }
    let source = null;
    try { source = new URL (raw); }
    catch { return json ({ error : 'Invalid model URL.' }, 400); }
    if (source.protocol !== 'https:' || source.hostname !== MeshyAssetHost) {
        return json ({ error : 'Only Meshy-generated asset URLs can be proxied.' }, 400);
    }
    const lookup = await upstreamJson (context, '/openapi/' + Routes[task.route] + '/' + task.route + '/' + encodeURIComponent (task.task_id));
    if (!lookup.ok) { return json ({ error : 'AI task is unavailable.' }, 502); }
    const data = await lookup.json (); const ownedUrl = data.model_urls?.glb || data.result?.rigged_character_glb_url || data.result?.animation_glb_url;
    if (raw !== ownedUrl) { return json ({ error : 'Model URL is not available for this AI task.' }, 404); }
    const response = await fetch (source.toString (), { redirect : 'error' });
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
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test (context.data?.user?.id || '')) { return json ({ error : 'Sign in to use AI.' }, 401); }
        const path = Array.isArray (context.params.path) ? context.params.path : [context.params.path].filter (Boolean);
        const method = context.request.method;

        if (path.length === 1 && path[0] === 'credential') {
            if (context.request.headers.get ('X-Auto3D-Account') !== context.data.user.id) { return json ({ error : 'Account changed. Refresh and try again.' }, 409); }
            if (method === 'GET') { return json ({ configured : await CredentialExists (context.env, context.data.user.id) }); }
            if (context.request.headers.get ('Origin') !== new URL (context.request.url).origin) { return json ({ error : 'Requests must come from Auto3D.' }, 403); }
            if (method === 'DELETE') { await DeleteCredential (context.env, context.data.user.id); return json ({ configured : false }); }
            if (method === 'PUT') {
                if (!/^application\/json(?:\s*;|$)/i.test (context.request.headers.get ('Content-Type') || '')) { return json ({ error : 'Invalid request.' }, 400); }
                let body; try { body = JSON.parse (await boundedText (context.request, 2048)); } catch { return json ({ error : 'Invalid request.' }, 400); }
                if (!body || Array.isArray (body) || Object.keys (body).length !== 1 || typeof body.key !== 'string') { return json ({ error : 'Invalid request.' }, 400); }
                await SaveCredential (context.env, context.data.user.id, body.key); return json ({ configured : true });
            }
            return json ({ error : 'Method not allowed.' }, 405);
        }

        if (path.length === 1 && path[0] === 'balance' && method === 'GET') {
            return upstreamJson (context, '/openapi/v1/balance');
        }

        if (path.length === 1 && path[0] === 'model' && method === 'GET') {
            return model (context);
        }

        const version = Routes[path[0]];
        if (Object.hasOwn (Routes, path[0]) && typeof version === 'string') {
            const base = '/openapi/' + version + '/' + path[0];
            if (path.length === 1 && method === 'POST') {
                const body = await boundedText (context.request, 28 * 1024 * 1024);
                if (body.length > 28 * 1024 * 1024) { return json ({ error : 'AI request exceeds the reference image limit.' }, 413); }
                let payload; try { payload = JSON.parse (body); } catch { return json ({ error : 'Invalid AI JSON request.' }, 400); }
                if (!payload || Array.isArray (payload) || typeof payload !== 'object') { return json ({ error : 'Expected AI request fields.' }, 400); }
                const taskFields = ['input_task_id', 'preview_task_id', 'rig_task_id'];
                if (Object.keys (payload).some (field => /task_?id$/i.test (field) && !taskFields.includes (field))) { return json ({ error : 'Unsupported AI task reference.' }, 400); }
                for (const field of ['input_task_id', 'preview_task_id', 'rig_task_id']) { if (payload[field] !== undefined && !(await OwnedTask (context, payload[field]))) { return json ({ error : 'Source AI task not found.' }, 404); } }
                const created = await upstreamJson (context, base, { method : 'POST', body }); if (!created.ok) { return created; }
                const result = await created.clone ().json (); if (typeof result.result !== 'string' || !TaskId.test (result.result)) { return json ({ error : 'AI provider returned an invalid task.' }, 502); }
                try { await Database (context.env, 'auto3d_ai_tasks', 'POST', { task_id : result.result, user_id : context.data.user.id, route : path[0] }); }
                catch { return json ({ error : 'Task was submitted, but account ownership could not be recorded. Do not retry automatically; contact an administrator.' }, 503); }
                return created;
            }
            if (path.length === 1 && method === 'GET') {
                const requestUrl = new URL (context.request.url); const pageSize = cleanPageSize (requestUrl.searchParams.get ('page_size'), 8);
                const order = requestUrl.searchParams.get ('sort_by') === '+created_at' ? 'asc' : 'desc';
                const rows = await Database (context.env, 'auto3d_ai_tasks?user_id=eq.' + encodeURIComponent (context.data.user.id) + '&route=eq.' + encodeURIComponent (path[0]) + '&select=task_id&order=created_at.' + order + '&limit=' + pageSize);
                const tasks = []; for (const row of rows || []) { if (typeof row.task_id !== 'string' || !TaskId.test (row.task_id)) { continue; } const response = await upstreamJson (context, base + '/' + encodeURIComponent (row.task_id)); if (!response.ok) { return json ({ error : 'AI task history is unavailable.' }, response.status); } tasks.push (await response.json ()); }
                return json (tasks);
            }
            if (path.length === 2 && method === 'GET') { const task = await OwnedTask (context, path[1]); if (!task || task.route !== path[0]) { return json ({ error : 'AI task not found.' }, 404); } return upstreamJson (context, base + '/' + encodeURIComponent (path[1])); }
        }

        return json ({ error : 'AI API route not found.' }, 404);
    } catch (error) {
        if (error.status === 413) { return json ({ error : 'AI payload exceeds the supported size.' }, 413); }
        if (error.status === 400) { return json ({ error : error.message }, 400); }
        return json ({ error : 'AI provider or credential storage is unavailable.' }, 503);
    }
}
