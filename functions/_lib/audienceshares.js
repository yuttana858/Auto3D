import { Database, Failure } from './accountstorage.js';
export const AudienceUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function AudienceReady (env) { return env.AUTO3D_AUDIENCE_SHARING_READY === 'true' && typeof env.AUTO3D_AUDIENCE_SECRET === 'string' && env.AUTO3D_AUDIENCE_SECRET.length >= 32 && !!env.AUTO3D_LIBRARY_R2; }
export function AudiencePublicRoute (request, env)
{
    const path = new URL (request.url).pathname;
    return AudienceReady (env) && (request.method === 'GET' && /^\/api\/audience\/[0-9a-f-]{36}$/.test (path) || request.method === 'POST' && /^\/api\/audience\/[0-9a-f-]{36}\/(archive|download)$/.test (path));
}
export async function AudienceHash (env, value)
{
    const key = await crypto.subtle.importKey ('raw', new TextEncoder ().encode (env.AUTO3D_AUDIENCE_SECRET), { name : 'HMAC', hash : 'SHA-256' }, false, ['sign']);
    return [...new Uint8Array (await crypto.subtle.sign ('HMAC', key, new TextEncoder ().encode (value)))].map (v => v.toString (16).padStart (2, '0')).join ('');
}
export function AudienceCode () { const value = new Uint32Array (1); do { crypto.getRandomValues (value); } while (value[0] >= 4294960000); return String (value[0] % 10000).padStart (4, '0'); }
export async function AudienceRows (env, token) { return Database (env, 'auto3d_audience_shares?token=eq.' + token); }
export function AudienceOptions (body)
{
    if (!body || typeof body !== 'object' || Array.isArray (body) || Object.keys (body).some (k => !['source', 'itemId', 'code', 'allowDownload', 'expiresDays'].includes (k)) || !['account', 'published', 'device'].includes (body.source) || typeof body.itemId !== 'string' || !body.itemId || body.itemId.length > 200 || body.code !== undefined && !/^\d{4}$/.test (body.code) || body.code !== undefined && typeof body.code !== 'string' || body.allowDownload !== undefined && typeof body.allowDownload !== 'boolean' || body.expiresDays !== undefined && (!Number.isInteger (body.expiresDays) || body.expiresDays < 1 || body.expiresDays > 90)) { throw Failure ('Choose a saved item, four-digit code and expiry from 1–90 days.'); }
    if (body.source !== 'device' && !AudienceUuid.test (body.itemId)) { throw Failure ('Invalid saved item identifier.'); }
    return { ...body, code : body.code ?? AudienceCode (), allowDownload : body.allowDownload ?? false, expiresDays : body.expiresDays ?? 30 };
}
