import { SupabaseConfig, SupabaseHeaders, RequireServerKey } from './supabase.js';
export const MaxArchive = 32 * 1024 * 1024;
export function Failure (message, status = 400) { return Object.assign (new Error (message), { status }); }
export function Reply (body, status = 200) { return Response.json (body, { status, headers : { 'Cache-Control' : 'private, no-store', 'X-Content-Type-Options' : 'nosniff' } }); }
export async function Database (env, path, method = 'GET', body = undefined, prefer = 'return=representation')
{
    const { url, key } = SupabaseConfig (env); RequireServerKey (key);
    const response = await fetch (url + '/rest/v1/' + path, { method, headers : { ...SupabaseHeaders (key), 'Content-Type' : 'application/json', Prefer : prefer }, body : body === undefined ? undefined : JSON.stringify (body), signal : AbortSignal.timeout (15000) });
    if (!response.ok) {
        if (path.startsWith ('rpc/auto3d_reserve_personal_item')) { let detail; try { detail = await response.json (); } catch { /* Non-JSON failure. */ } if (detail?.code === 'P0001') { throw Failure ('Account Library limit reached (1 GB or 1,000 saves). Delete unneeded saves before uploading.', 409); } }
        throw Failure ('Account storage unavailable. Retry shortly.', 503);
    }
    return response.status === 204 || prefer.includes ('return=minimal') ? null : response.json ();
}
export async function LimitedBody (request, limit)
{
    if (Number (request.headers.get ('Content-Length')) > limit) { throw Failure ('File is too large. Account saves support up to 32 MB; use File on disk for larger sessions.', 413); }
    if (!request.body) { throw Failure ('Request body required.'); }
    const reader = request.body.getReader (); const chunks = []; let size = 0;
    try { for (;;) { const { done, value } = await reader.read (); if (done) { break; } size += value.byteLength; if (size > limit) { await reader.cancel (); throw Failure ('File is too large. Account saves support up to 32 MB.', 413); } chunks.push (value); } }
    finally { reader.releaseLock (); }
    return new Blob (chunks);
}
export function Folder (value)
{
    if (typeof value !== 'string' || value.length > 200 || /[\\\x00-\x1f]/.test (value)) { throw Failure ('Invalid folder path.'); }
    const path = value.split ('/').map ((part) => part.trim ()).filter (Boolean);
    if (!path.length || path.length > 10 || path.some ((part) => part === '.' || part === '..' || part.length > 80)) { throw Failure ('Invalid folder path.'); }
    return path.join ('/');
}
export function Preferences (value)
{
    if (!value || typeof value !== 'object' || Array.isArray (value) || Object.keys (value).some ((key) => !['units', 'theme', 'view', 'viewportQuality'].includes (key)) || !['metric', 'standard'].includes (value.units) || ![1, 2].includes (value.theme)) { throw Failure ('Invalid account preferences.'); }
    const result = { units : value.units, theme : value.theme };
    if (value.viewportQuality !== undefined) {
        if (!['auto', 'fast', 'quality'].includes (value.viewportQuality)) { throw Failure ('Invalid viewport quality.'); }
        result.viewportQuality = value.viewportQuality;
    }
    if (value.view !== undefined) {
        const v = value.view; const allowed = ['environmentMapName', 'backgroundIsEnvMap', 'horizonGradient', 'backgroundPreset', 'showGroundGrid', 'backgroundColor', 'defaultLineColor', 'defaultColor', 'showEdges', 'edgeColor', 'edgeThreshold', 'navigationMode', 'projectionMode'];
        const color = (array, size) => Array.isArray (array) && array.length === size && array.every ((n) => Number.isInteger (n) && n >= 0 && n <= 255);
        if (!v || typeof v !== 'object' || Array.isArray (v) || Object.keys (v).some ((key) => !allowed.includes (key)) || allowed.some ((key) => v[key] === undefined) || typeof v.environmentMapName !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test (v.environmentMapName) || !['standard', 'dark', 'light', 'sunset', 'outdoor', 'custom'].includes (v.backgroundPreset) || ['backgroundIsEnvMap', 'horizonGradient', 'showGroundGrid', 'showEdges'].some ((key) => typeof v[key] !== 'boolean') || !color (v.backgroundColor, 4) || !color (v.defaultLineColor, 3) || !color (v.defaultColor, 3) || !color (v.edgeColor, 3) || !Number.isFinite (v.edgeThreshold) || v.edgeThreshold < 0 || v.edgeThreshold > 180 || ![1, 2].includes (v.navigationMode) || ![1, 2].includes (v.projectionMode)) { throw Failure ('Invalid viewport preferences.'); }
        result.view = v;
    }
    return result;
}
