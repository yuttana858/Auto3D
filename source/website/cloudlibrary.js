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
        try { this.session = JSON.parse (sessionStorage.getItem ('sw-auto3d-publisher') || 'null'); } catch { this.session = null; }
    }

    StoreSession (data)
    {
        this.session = data ? { access_token : data.access_token, refresh_token : data.refresh_token, expires_at : Math.floor (Date.now () / 1000) + data.expires_in } : null;
        try { if (this.session) { sessionStorage.setItem ('sw-auto3d-publisher', JSON.stringify (this.session)); } else { sessionStorage.removeItem ('sw-auto3d-publisher'); } } catch { /* Keep the sign-in in memory. */ }
    }

    async Token ()
    {
        if (!this.session?.access_token) { throw new Error ('Sign in to publish to the shared library, or choose Device library.'); }
        if (this.session.expires_at < Date.now () / 1000 + 60) {
            try {
                const data = await this.Request ('/auth/v1/token?grant_type=refresh_token', { method : 'POST', body : JSON.stringify ({ refresh_token : this.session.refresh_token }) });
                this.StoreSession (data);
            } catch { this.StoreSession (null); throw new Error ('Your sign-in expired. Sign in again to publish.'); }
        }
        return this.session.access_token;
    }

    async Request (path, options = {}, authenticated = false)
    {
        const headers = { apikey : this.config.key, ...options.headers };
        if (authenticated) { headers.Authorization = 'Bearer ' + await this.Token (); }
        if (typeof options.body === 'string') { headers['Content-Type'] = 'application/json'; }
        const response = await fetch (this.config.url + path, { ...options, headers });
        if (!response.ok) {
            let detail = null; try { detail = await response.json (); } catch { /* Non-JSON gateway error. */ }
            throw new Error (detail?.msg || detail?.error_description || detail?.message || detail?.error || 'Shared library request failed (' + response.status + ').');
        }
        return response.status === 204 ? null : response.headers.get ('content-type')?.includes ('application/json') ? response.json () : response.blob ();
    }

    async SignIn (email, password)
    {
        const data = await this.Request ('/auth/v1/token?grant_type=password', { method : 'POST', body : JSON.stringify ({ email, password }) });
        this.StoreSession (data);
    }
    async SignOut ()
    {
        try { if (this.session) { await this.Request ('/auth/v1/logout', { method : 'POST' }, true); } } finally { this.StoreSession (null); }
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

    async Save (item)
    {
        await this.Token ();
        if (item.archive.size > 64 * 1024 * 1024) { throw new Error ('Shared saves have a 64 MB limit. Download this session or save to Device library.'); }
        const thumbnail = await (await fetch (item.thumbnail)).blob ();
        const archivePath = item.id + '/session.auto3d'; const thumbnailPath = item.id + '/thumbnail.png';
        await this.Request ('/storage/v1/object/' + this.config.bucket + '/' + archivePath, { method : 'POST', body : item.archive, headers : { 'Content-Type' : 'application/octet-stream', 'x-upsert' : 'false' } }, true);
        await this.Request ('/storage/v1/object/' + this.config.bucket + '/' + thumbnailPath, { method : 'POST', body : thumbnail, headers : { 'Content-Type' : 'image/png', 'x-upsert' : 'false' } }, true);
        await this.Request ('/rest/v1/auto3d_library', { method : 'POST', headers : { Prefer : 'return=minimal' }, body : JSON.stringify ({ id : item.id, name : item.name, category : item.category, kind : item.kind, object_count : item.objects, archive_path : archivePath, thumbnail_path : thumbnailPath }) }, true);
    }

    Share (item)
    {
        const url = new URL (window.location.href); url.search = ''; url.hash = ''; url.searchParams.set ('share', item.id);
        return url.href;
    }
}
