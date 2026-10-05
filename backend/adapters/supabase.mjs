function required (env, key)
{
    const value = env[key];
    if (!value) { throw new Error (key + ' is required.'); }
    return value.replace (/\/$/, '');
}

function errorMessage (status, detail)
{
    return detail?.message || detail?.error || 'Supabase request failed (' + status + ').';
}

export class SupabaseLibraryAdapter
{
    constructor (env = process.env, fetchImpl = fetch)
    {
        this.url = required (env, 'SUPABASE_URL');
        this.key = required (env, 'SUPABASE_SECRET_KEY');
        this.table = env.SUPABASE_LIBRARY_TABLE || 'auto3d_library';
        this.bucket = env.SUPABASE_LIBRARY_BUCKET || 'auto3d-library';
        this.fetch = fetchImpl;
    }

    async Request (path, options = {})
    {
        const headers = { apikey : this.key, Authorization : 'Bearer ' + this.key, ...options.headers };
        const response = await this.fetch (this.url + path, { ...options, headers });
        if (!response.ok) {
            let detail = null; try { detail = await response.json (); } catch { /* ignore */ }
            const error = new Error (errorMessage (response.status, detail)); error.status = response.status; throw error;
        }
        return response;
    }

    Row (row)
    {
        return {
            id : row.id,
            name : row.name,
            category : row.category,
            kind : row.kind,
            objectCount : row.object_count,
            createdAt : row.created_at,
            createdBy : row.created_by || null,
            version : row.version || 1,
            supersedesId : row.supersedes_id || null,
            status : row.status || 'published'
        };
    }

    async List ()
    {
        const response = await this.Request ('/rest/v1/' + this.table + '?select=*&order=created_at.desc,id.asc&limit=1000');
        return (await response.json ()).map ((row) => this.Row (row));
    }

    async Get (id)
    {
        const response = await this.Request ('/rest/v1/' + this.table + '?select=*&id=eq.' + encodeURIComponent (id) + '&limit=1');
        const rows = await response.json ();
        return rows.length ? this.Row (rows[0]) : null;
    }

    async Download (id, type)
    {
        const field = type === 'archive' ? 'archive_path' : 'thumbnail_path';
        const meta = await this.Request ('/rest/v1/' + this.table + '?select=' + field + '&id=eq.' + encodeURIComponent (id) + '&limit=1');
        const rows = await meta.json ();
        if (!rows.length) { return null; }
        const path = rows[0][field].split ('/').map (encodeURIComponent).join ('/');
        return this.Request ('/storage/v1/object/authenticated/' + this.bucket + '/' + path);
    }

    async Publish (item, archive, thumbnail, actor)
    {
        const archivePath = item.id + '/session.auto3d';
        const thumbnailPath = item.id + '/thumbnail.png';
        const upload = async (path, data, contentType) => {
            await this.Request ('/storage/v1/object/' + this.bucket + '/' + path, {
                method : 'POST',
                headers : { 'Content-Type' : contentType, 'x-upsert' : 'false' },
                body : data
            });
        };
        await upload (archivePath, archive, 'application/octet-stream');
        try {
            await upload (thumbnailPath, thumbnail, 'image/png');
            await this.Request ('/rest/v1/' + this.table, {
                method : 'POST',
                headers : { 'Content-Type' : 'application/json', Prefer : 'return=minimal' },
                body : JSON.stringify ({
                    id : item.id,
                    name : item.name,
                    category : item.category,
                    kind : item.kind,
                    object_count : item.objectCount,
                    archive_path : archivePath,
                    thumbnail_path : thumbnailPath,
                    created_by : actor.subject,
                    version : item.version || 1,
                    supersedes_id : item.supersedesId || null,
                    status : 'published'
                })
            });
        } catch (error) {
            await this.DeleteObjects ([archivePath, thumbnailPath]).catch (() => {});
            throw error;
        }
        return await this.Get (item.id);
    }

    async DeleteObjects (paths)
    {
        return this.Request ('/storage/v1/object/' + this.bucket, {
            method : 'DELETE',
            headers : { 'Content-Type' : 'application/json' },
            body : JSON.stringify ({ prefixes : paths })
        });
    }

    async Delete (id)
    {
        const meta = await this.Request ('/rest/v1/' + this.table + '?select=archive_path,thumbnail_path&id=eq.' + encodeURIComponent (id) + '&limit=1');
        const rows = await meta.json ();
        if (!rows.length) { return false; }
        await this.Request ('/rest/v1/' + this.table + '?id=eq.' + encodeURIComponent (id), { method : 'DELETE' });
        await this.DeleteObjects ([rows[0].archive_path, rows[0].thumbnail_path]);
        return true;
    }
}
