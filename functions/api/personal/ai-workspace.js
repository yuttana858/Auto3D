import { Database, LimitedBody, MaxArchive, Failure, Reply } from '../../_lib/accountstorage.js';

// A private, revisioned pointer to an AI project archive in the user's namespace.
export async function onRequest ({ request, env, data })
{
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test (data?.user?.id || '')) { return Reply ({ error : 'Sign in to use the AI workspace.' }, 401); }
    const owner = data.user.id, filter = 'auto3d_ai_workspaces?user_id=eq.' + encodeURIComponent (owner), prefix = 'users/' + owner + '/ai-workspace/'; const bucket = env.AUTO3D_LIBRARY_R2;
    try {
        if (!bucket) { throw Failure ('Account file storage unavailable.', 503); }
        await Database (env, 'auto3d_ai_workspaces?on_conflict=user_id', 'POST', { user_id : owner }, 'resolution=ignore-duplicates,return=minimal');
        const rows = await Database (env, filter + '&select=revision,archive_key,file_size,updated_at'); const row = rows?.[0];
        if (!row || !Number.isSafeInteger (Number (row.revision)) || Number (row.revision) < 0) { throw Failure ('AI workspace metadata unavailable.', 503); }
        const revision = Number (row.revision);
        if (row.archive_key !== null && (typeof row.archive_key !== 'string' || !row.archive_key.startsWith (prefix))) { throw Failure ('AI workspace metadata unavailable.', 503); }
        if (request.method === 'GET') {
            if (new URL (request.url).searchParams.get ('archive') !== '1') { return Reply ({ revision, exists : !!row.archive_key, size : Number (row.file_size) || 0, updatedAt : row.updated_at }); }
            if (!row.archive_key) { return Reply ({ error : 'No saved AI workspace.' }, 404); }
            const file = await bucket.get (row.archive_key); if (!file) { return Reply ({ error : 'AI workspace file unavailable.' }, 503); }
            return new Response (file.body, { headers : { 'Content-Type' : 'application/octet-stream', 'Cache-Control' : 'private, no-store', 'X-Content-Type-Options' : 'nosniff', 'ETag' : '"' + revision + '"' } });
        }
        if (request.method !== 'PUT') { return Reply ({ error : 'Method not allowed.' }, 405); }
        if (request.headers.get ('Origin') !== new URL (request.url).origin) { return Reply ({ error : 'Requests must come from Auto3D.' }, 403); }
        const match = request.headers.get ('If-Match'); if (!match || !/^"(?:0|[1-9][0-9]*)"$/.test (match)) { throw Failure ('A workspace revision is required.', 428); }
        const expected = Number (match.slice (1, -1)); if (!Number.isSafeInteger (expected)) { throw Failure ('Invalid workspace revision.'); }
        if (expected !== revision) { return Reply ({ error : 'AI workspace changed on another device.', revision }, 409); } if (revision >= Number.MAX_SAFE_INTEGER) { throw Failure ('AI workspace revision limit reached.', 409); }
        const archive = await LimitedBody (request, MaxArchive); if (archive.size < 4) { throw Failure ('Invalid AI workspace archive.'); }
        const magic = new Uint8Array (await archive.slice (0, 4).arrayBuffer ()); if (magic[0] !== 0x50 || magic[1] !== 0x4b || magic[2] !== 0x03 || magic[3] !== 0x04) { throw Failure ('Invalid AI workspace archive.'); }
        const key = prefix + crypto.randomUUID () + '/project.auto3d';
        try { await bucket.put (key, archive, { httpMetadata : { contentType : 'application/octet-stream' } }); } catch { try { await bucket.delete (key); } catch { /* Orphan cleanup requires reconciliation. */ } throw Failure ('AI workspace upload failed.', 503); }
        // A failed database response is ambiguous: retain the staged object so a
        // successful but unacknowledged commit cannot point at a deleted file.
        const updated = await Database (env, filter + '&revision=eq.' + revision + '&select=revision,updated_at', 'PATCH', { revision : revision + 1, archive_key : key, file_size : archive.size, updated_at : new Date ().toISOString () });
        if (!updated?.length) { try { await bucket.delete (key); } catch { /* Orphan cleanup requires reconciliation. */ } return Reply ({ error : 'AI workspace changed on another device.' }, 409); }
        if (row.archive_key && row.archive_key !== key) { try { await bucket.delete (row.archive_key); } catch { /* A later storage reconciliation can remove old revisions. */ } }
        return Reply ({ revision : Number (updated[0].revision), exists : true, size : archive.size, updatedAt : updated[0].updated_at });
    } catch (error) { return Reply ({ error : error.status ? error.message : 'AI workspace unavailable. Retry shortly.' }, error.status || 503); }
}
