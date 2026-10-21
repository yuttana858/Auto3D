import { AudienceUuid, AudienceReady, AudienceHash, AudienceRows, AudienceOptions } from '../../_lib/audienceshares.js';
import { Database, Failure, Reply, LimitedBody, MaxArchive } from '../../_lib/accountstorage.js';
import { LibraryFile } from '../../_lib/libraryfiles.js';
const base = 'auto3d_audience_shares';
function Owner (data) { if (!data?.user?.id) { throw Failure ('Sign in to manage shared models.', 401); } return data.user.id; }
function View (row, origin) { return { token : row.token, name : row.name, source : row.source, itemId : row.source_item_id, url : origin + '/mini.html?share=' + row.token, codeRequired : true, allowDownload : row.allow_download, expiresAt : row.expires_at, status : row.status }; }
async function Json (request, limit = 4096) { try { return JSON.parse (await (await LimitedBody (request, limit)).text ()); } catch (e) { throw Failure (e.status === 413 ? 'Share request is too large.' : 'Invalid share request.', e.status || 400); } }
async function Create ({ request, env, data })
{
    const owner = Owner (data); let body, archive, name; const bucket = env.AUTO3D_LIBRARY_R2;
    if ((request.headers.get ('Content-Type') || '').startsWith ('multipart/form-data')) {
        const payload = await LimitedBody (request, MaxArchive + 16384); const form = await new Response (payload, { headers : { 'Content-Type' : request.headers.get ('Content-Type') } }).formData ();
        if (['options', 'archive', 'name'].some (key => form.getAll (key).length !== 1) || [...form.keys ()].some (key => !['options', 'archive', 'name'].includes (key))) { throw Failure ('Invalid share upload fields.'); }
        try { body = AudienceOptions (JSON.parse (form.get ('options'))); } catch { throw Failure ('Invalid share options.'); }
        if (body.source !== 'device') { throw Failure ('Only device saves need an upload.'); }
        archive = form.get ('archive'); name = form.get ('name');
    } else {
        body = AudienceOptions (await Json (request));
        if (body.source === 'account') {
            const row = (await Database (env, 'auto3d_personal_library?id=eq.' + body.itemId + '&user_id=eq.' + owner + '&status=eq.ready'))[0];
            if (!row || !row.archive_key?.startsWith ('users/' + owner + '/' + row.id + '/')) { throw Failure ('Saved model not found.', 404); }
            const object = await bucket.get (row.archive_key); if (!object) { throw Failure ('Saved model file unavailable.', 404); }
            archive = await new Response (object.body).blob (); name = row.name;
        } else if (body.source === 'published') {
            const row = (await Database (env, 'auto3d_library?id=eq.' + body.itemId + '&status=eq.published'))[0];
            if (!row) { throw Failure ('Saved model not found.', 404); }
            archive = await new Response (await LibraryFile (env, row, 'archive')).blob (); name = row.name;
        } else { throw Failure ('Upload the saved device archive.'); }
    }
    if (!(archive instanceof Blob) || archive.size < 4 || archive.size > MaxArchive || typeof name !== 'string' || !name.trim () || name.length > 100 || [...new Uint8Array (await archive.slice (0, 4).arrayBuffer ())].join (',') !== '80,75,3,4') { throw Failure ('Expected a saved Auto3D model up to 32 MB.'); }
    const token = crypto.randomUUID (); const key = 'audience/' + owner + '/' + token + '/session.auto3d';
    await Database (env, 'rpc/auto3d_reserve_audience_share', 'POST', { p_owner : owner, p_token : token, p_source : body.source, p_item : body.itemId, p_name : name.trim (), p_size : archive.size, p_hash : await AudienceHash (env, 'code:' + token + ':' + body.code), p_download : body.allowDownload, p_days : body.expiresDays });
    try {
        await bucket.put (key, archive, { httpMetadata : { contentType : 'application/octet-stream' } });
        const rows = await Database (env, base + '?token=eq.' + token + '&owner_id=eq.' + owner + '&status=eq.pending', 'PATCH', { status : 'ready' });
        if (!rows[0]) { throw Failure ('Share creation was cancelled or revoked.', 409); }
        return Reply ({ ...View (rows[0], new URL (request.url).origin), code : body.code }, 201);
    } catch (error) {
        try { await bucket.delete (key); await Database (env, base + '?token=eq.' + token + '&owner_id=eq.' + owner, 'DELETE'); } catch { /* Keep pending quota if cleanup fails; pending shares cannot be viewed. */ }
        throw error;
    }
}
export async function onRequest (context)
{
    const { request, env, data, params } = context; const path = params.path || []; const origin = new URL (request.url).origin;
    try {
        if (!AudienceReady (env)) { throw Failure ('Audience sharing is not enabled on this server yet.', 503); }
        if (!path.length) {
            if (request.method === 'POST') { return await Create (context); }
            if (request.method === 'GET') { const owner = Owner (data); const rows = await Database (env, base + '?owner_id=eq.' + owner + '&order=created_at.desc&limit=1000'); return Reply ({ shares : rows.map (row => View (row, origin)) }); }
            throw Failure ('Method not allowed.', 405);
        }
        const token = String (path[0]).toLowerCase (); if (!AudienceUuid.test (token)) { throw Failure ('Invalid share link.'); }
        if (path.length === 1 && request.method === 'DELETE') {
            const owner = Owner (data); const row = (await Database (env, base + '?token=eq.' + token + '&owner_id=eq.' + owner))[0]; if (!row) { throw Failure ('Share link not found.', 404); }
            await Database (env, base + '?token=eq.' + token + '&owner_id=eq.' + owner, 'PATCH', { status : 'revoked' });
            await env.AUTO3D_LIBRARY_R2.delete (row.archive_key); await Database (env, base + '?token=eq.' + token + '&owner_id=eq.' + owner, 'PATCH', { file_size : 0 }); return Reply ({ revoked : token });
        }
        if (path.length === 1 && request.method === 'GET') {
            const row = (await AudienceRows (env, token))[0]; if (!row || row.status !== 'ready' || !(Date.parse (row.expires_at) > Date.now ())) { throw Failure ('Share link unavailable or expired.', 404); }
            return Reply ({ name : row.name, codeRequired : true, allowDownload : row.allow_download, expiresAt : row.expires_at });
        }
        if (request.method !== 'POST' || path.length !== 2 || !['archive', 'download'].includes (path[1])) { throw Failure ('Not found.', 404); }
        const body = await Json (request); if (!body || Object.keys (body).length !== 1 || typeof body.code !== 'string' || !/^\d{4}$/.test (body.code)) { throw Failure ('Enter exactly four digits.'); }
        const actor = request.headers.get ('CF-Connecting-IP'); if (!actor) { throw Failure ('Audience access protection unavailable.', 503); }
        const rows = await Database (env, 'rpc/auto3d_verify_audience_share', 'POST', { p_token : token, p_hash : await AudienceHash (env, 'code:' + token + ':' + body.code), p_actor : await AudienceHash (env, 'actor:' + token + ':' + actor) }); const grant = rows[0];
        if (grant?.retry_after > 0) { const response = Reply ({ error : 'Too many attempts. Try again later.', retryAfter : grant.retry_after }, 429); response.headers.set ('Retry-After', String (grant.retry_after)); return response; }
        if (!grant?.archive_key) { throw Failure ('Incorrect code or unavailable model.', 401); }
        if (path[1] === 'download' && !grant.allow_download) { throw Failure ('Downloads are disabled for this link.', 403); }
        if (!/^audience\/[0-9a-f-]{36}\//.test (grant.archive_key) || !grant.archive_key.endsWith ('/' + token + '/session.auto3d')) { throw Failure ('Shared file unavailable.', 503); }
        const file = await env.AUTO3D_LIBRARY_R2.get (grant.archive_key); if (!file) { throw Failure ('Shared file unavailable.', 404); }
        const headers = { 'Content-Type' : 'application/octet-stream', 'Cache-Control' : 'private, no-store', 'X-Content-Type-Options' : 'nosniff' };
        if (path[1] === 'download') { headers['Content-Disposition'] = 'attachment; filename="' + String (grant.name || 'Auto3D').replace (/[^a-z0-9._-]+/gi, '_') + '.auto3d"'; }
        return new Response (file.body, { headers });
    } catch (error) { console.error ('Audience share request failed', error.status || 500); return Reply ({ error : error.status ? error.message : 'Shared model service unavailable.' }, error.status || 500); }
}
