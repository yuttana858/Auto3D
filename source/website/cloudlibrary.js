import { LibraryConfig } from './libraryconfig.js';

export function IsLibraryId (value)
{
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test (value);
}

export class CloudLibrary
{
    constructor ()
    {
        this.config = LibraryConfig;
    }

    async Request (path, options = {})
    {
        const headers = { apikey : this.config.key, ...options.headers };
        const response = await fetch (this.config.url + path, { ...options, headers });
        if (!response.ok) {
            let detail = null; try { detail = await response.json (); } catch { /* Non-JSON gateway error. */ }
            throw new Error (detail?.msg || detail?.error_description || detail?.message || detail?.error || 'Shared library request failed (' + response.status + ').');
        }
        return response.status === 204 ? null : response.headers.get ('content-type')?.includes ('application/json') ? response.json () : response.blob ();
    }

    Item (row)
    {
        return { id : row.id, name : row.name, category : row.category, kind : row.kind, objects : row.object_count, updatedAt : row.created_at, archivePath : row.archive_path, thumbnailPath : row.thumbnail_path, shared : true };
    }

    async List ()
    {
        const rows = [];
        for (let offset = 0; ; offset += 1000) {
            const page = await this.Request ('/rest/v1/auto3d_library?select=*&order=created_at.desc,id.asc&limit=1000&offset=' + offset);
            rows.push (...page);
            if (page.length < 1000) { break; }
        }
        return rows.map ((row) => this.Item (row));
    }

    async Get (id)
    {
        if (!IsLibraryId (id)) { throw new Error ('This shared model link is invalid.'); }
        const rows = await this.Request ('/rest/v1/auto3d_library?select=*&id=eq.' + encodeURIComponent (id));
        if (!rows.length) { throw new Error ('This shared model is unavailable.'); }
        return this.Item (rows[0]);
    }

    async File (path)
    {
        return this.Request ('/storage/v1/object/authenticated/' + this.config.bucket + '/' + path.split ('/').map (encodeURIComponent).join ('/'));
    }

    async Archive (item) { return (await this.File (item.archivePath)).arrayBuffer (); }

    async Save ()
    {
        throw new Error ('Shared publishing is disabled during the corporate identity migration. Save to Device library or File on disk.');
    }

    Share (item)
    {
        const url = new URL (window.location.href); url.search = ''; url.hash = ''; url.searchParams.set ('share', item.id);
        return url.href;
    }
}
