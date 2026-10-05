export function IsLibraryId (value)
{
    return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test (value);
}

export class CloudLibrary
{
    constructor ()
    {
        this.apiUrl = typeof window !== 'undefined' && window.AUTO3D_LIBRARY_API_URL ? window.AUTO3D_LIBRARY_API_URL : '';
    }

    async Request (path, options = {})
    {
        const response = await fetch (this.apiUrl.replace (/\/$/, '') + path, options);
        if (!response.ok) {
            let detail = null; try { detail = await response.json (); } catch { /* Non-JSON backend error. */ }
            throw new Error (detail?.error || 'Shared library request failed (' + response.status + ').');
        }
        return response;
    }

    Item (row)
    {
        return {
            id : row.id,
            name : row.name,
            category : row.category,
            kind : row.kind,
            objects : row.objectCount,
            updatedAt : row.createdAt,
            shared : true
        };
    }

    async List ()
    {
        const response = await this.Request ('/api/library/items');
        return (await response.json ()).map ((row) => this.Item (row));
    }

    async Get (id)
    {
        if (!IsLibraryId (id)) { throw new Error ('This shared model link is invalid.'); }
        const response = await this.Request ('/api/library/items/' + encodeURIComponent (id));
        return this.Item (await response.json ());
    }

    async Archive (item)
    {
        return (await this.Request ('/api/library/items/' + encodeURIComponent (item.id) + '/archive')).arrayBuffer ();
    }

    async Thumbnail (item)
    {
        return (await this.Request ('/api/library/items/' + encodeURIComponent (item.id) + '/thumbnail')).blob ();
    }

    async Save ()
    {
        throw new Error ('Shared publishing is disabled until corporate identity is connected. Save to Device library or File on disk.');
    }

    async CreateShare (item, allowDownload, code)
    {
        const response = await this.Request ('/api/share', {
            method : 'POST',
            headers : { 'Content-Type' : 'application/json' },
            body : JSON.stringify ({ itemId : item.id, allowDownload, code : code || null })
        });
        return response.json ();
    }

    async ShareInfo (token)
    {
        const response = await this.Request ('/api/share/' + encodeURIComponent (token));
        return response.json ();
    }

    async ShareArchive (token, code = '')
    {
        const response = await this.Request ('/api/share/' + encodeURIComponent (token) + '/archive', {
            method : 'POST',
            headers : { 'Content-Type' : 'application/json' },
            body : JSON.stringify ({ code })
        });
        return response.arrayBuffer ();
    }

    async DownloadShare (token, code = '')
    {
        return this.Request ('/api/share/' + encodeURIComponent (token) + '/download', {
            method : 'POST',
            headers : { 'Content-Type' : 'application/json' },
            body : JSON.stringify ({ code })
        });
    }

    Share (item)
    {
        const url = new URL (window.location.href); url.search = ''; url.hash = ''; url.searchParams.set ('share', item.id);
        return url.href;
    }
}
