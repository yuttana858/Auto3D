import { Database, JsonBody, LimitedBody, MaxArchive, Folder, Failure, Reply } from '../../_lib/accountstorage.js';
const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function Item (row) { return { id : row.id, name : row.name, category : row.category, kind : row.kind, objects : row.object_count, updatedAt : row.updated_at, createdAt : row.created_at, size : row.file_size, personal : true }; }
export async function onRequest ({ request, env, data, params })
{
    if (!data?.user) { return Reply ({ error : 'Sign in to use your account Library.' }, 401); }
    const owner = data.user.id; const path = params.path || []; const bucket = env.AUTO3D_LIBRARY_R2;
    const base = 'auto3d_personal_library?user_id=eq.' + encodeURIComponent (owner);
    try {
        if (!bucket) { throw Failure ('Account file storage unavailable.', 503); }
        if (path[0] !== 'items' || path.length > 3) { throw Failure ('Invalid Library request.'); }
        if (path.length === 1) {
            if (request.method === 'GET') { return Reply ((await Database (env, base + '&status=eq.ready&order=created_at.desc,id.asc&limit=1000')).map (Item)); }
            if (request.method !== 'POST') { return Reply ({ error : 'Method not allowed.' }, 405); }
            const payload = await LimitedBody (request, MaxArchive + 2 * 1024 * 1024);
            const form = await new Response (payload, { headers : { 'Content-Type' : request.headers.get ('Content-Type') || '' } }).formData ();
            const allowed = ['name', 'category', 'kind', 'objects', 'archive', 'thumbnail'];
            if ([...form.keys ()].some ((key) => !allowed.includes (key)) || allowed.some ((key) => form.getAll (key).length !== 1)) { throw Failure ('Invalid upload fields.'); }
            const name = String (form.get ('name')).trim (); const category = Folder (form.get ('category')); const kind = form.get ('kind'); const objects = Number (form.get ('objects'));
            const archive = form.get ('archive'); const thumbnail = form.get ('thumbnail');
            if (!name || name.length > 100 || !['session', 'model'].includes (kind) || !Number.isInteger (objects) || objects < 0 || (objects === 0 && kind !== 'session') || objects > 1000 || !(archive instanceof Blob) || archive.size < 4 || archive.size > MaxArchive || !(thumbnail instanceof Blob) || thumbnail.size > 1024 * 1024) { throw Failure ('Invalid save or size exceeds account limits.'); }
            const zip = new Uint8Array (await archive.slice (0, 4).arrayBuffer ()); const png = new Uint8Array (await thumbnail.slice (0, 8).arrayBuffer ());
            if (zip.join (',') !== '80,75,3,4' || png.join (',') !== '137,80,78,71,13,10,26,10') { throw Failure ('Expected an Auto3D archive and PNG preview.'); }
            const id = crypto.randomUUID (); const prefix = 'users/' + owner + '/' + id;
            await Database (env, 'rpc/auto3d_reserve_personal_item', 'POST', { p_user_id : owner, p_id : id, p_name : name, p_category : category, p_kind : kind, p_object_count : objects, p_file_size : archive.size + thumbnail.size });
            try {
                await bucket.put (prefix + '/session.auto3d', archive, { httpMetadata : { contentType : 'application/octet-stream' } });
                await bucket.put (prefix + '/thumbnail.png', thumbnail, { httpMetadata : { contentType : 'image/png' } });
                const rows = await Database (env, base + '&id=eq.' + id, 'PATCH', { status : 'ready' }); return Reply (Item (rows[0]), 201);
            } catch (error) {
                // Keep the reservation if cleanup fails: partial entries are never listed/read.
                try { await bucket.delete ([prefix + '/session.auto3d', prefix + '/thumbnail.png']); await Database (env, base + '&id=eq.' + id, 'DELETE'); } catch { /* Administrator can reconcile pending uploads. */ }
                throw error;
            }
        }
        if (!Uuid.test (path[1])) { throw Failure ('Invalid Library identifier.'); }
        const filter = base + '&id=eq.' + encodeURIComponent (path[1]) + '&status=eq.ready';
        const rows = await Database (env, filter); const row = rows[0]; if (!row) { return Reply ({ error : 'Library item not found.' }, 404); }
        if (path.length === 3) {
            if (request.method !== 'GET' || !['archive', 'thumbnail'].includes (path[2])) { return Reply ({ error : 'Not found.' }, 404); }
            const key = path[2] === 'archive' ? row.archive_key : row.thumbnail_key;
            if (!key.startsWith ('users/' + owner + '/' + row.id + '/')) { throw Failure ('Invalid stored file.', 503); }
            const file = await bucket.get (key); if (!file) { return Reply ({ error : 'Library file unavailable.' }, 404); }
            return new Response (file.body, { headers : { 'Content-Type' : path[2] === 'archive' ? 'application/octet-stream' : 'image/png', 'Cache-Control' : 'private, no-store', 'X-Content-Type-Options' : 'nosniff' } });
        }
        if (request.method === 'GET') { return Reply (Item (row)); }
        if (request.method === 'PATCH') {
            const body = await JsonBody (request, 2048);
            if (!body || !Object.keys (body).length || Object.keys (body).some ((key) => !['name', 'category'].includes (key))) { throw Failure ('Invalid item changes.'); }
            if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim () || body.name.trim ().length > 100)) { throw Failure ('Invalid name.'); }
            const changes = { updated_at : new Date ().toISOString () };
            if (body.name !== undefined) { changes.name = body.name.trim (); } if (body.category !== undefined) { changes.category = Folder (body.category); }
            return Reply (Item ((await Database (env, filter, 'PATCH', changes))[0]));
        }
        if (request.method === 'DELETE') {
            await Database (env, filter, 'PATCH', { status : 'pending' });
            try { await bucket.delete ([row.archive_key, row.thumbnail_key]); await Database (env, base + '&id=eq.' + row.id, 'DELETE'); }
            catch (error) { await Database (env, base + '&id=eq.' + row.id, 'PATCH', { status : 'ready' }).catch (() => {}); throw error; }
            return Reply ({ removed : true });
        }
        return Reply ({ error : 'Method not allowed.' }, 405);
    } catch (error) { return Reply ({ error : error.status ? error.message : 'Account Library unavailable. Retry shortly.' }, error.status || 503); }
}
