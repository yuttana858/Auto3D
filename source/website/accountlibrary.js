import { NormalizeLibraryPath, ExpandLibraryPaths, LibraryPathParent, RenameLibraryPath } from './modellibrary.js';
export class AccountLibrary
{
    constructor (auth, request = fetch) { this.auth = auth; this.fetch = (...args) => request (...args); }
    async Request (path, options = {})
    {
        const owner = this.auth.user?.id; if (!owner) { throw new Error ('Sign in to use your account Library.'); }
        const response = await this.fetch (path, { credentials : 'same-origin', signal : AbortSignal.timeout (120000), ...options, headers : { ...options.headers, 'X-Auto3D-Account' : owner } });
        if (this.auth.user?.id !== owner) { throw new Error ('Account changed. Reopen your Library.'); }
        if (!response.ok) { let body; try { body = await response.json (); } catch { /* Non-JSON failure. */ } throw new Error ((body?.error || 'Account Library request failed.') + ' (HTTP ' + response.status + ')'); }
        const result = {};
        for (const method of ['json', 'blob', 'arrayBuffer']) { result[method] = async () => { const value = await response[method] (); if (this.auth.user?.id !== owner) { throw new Error ('Account changed. Reopen your Library.'); } return value; }; }
        return result;
    }
    async List () { return (await this.Request ('/api/personal/items')).json (); }
    async Get (id) { return (await this.Request ('/api/personal/items/' + encodeURIComponent (id))).json (); }
    async Archive (item) { return (await this.Request ('/api/personal/items/' + encodeURIComponent (item.id) + '/archive')).arrayBuffer (); }
    async Thumbnail (item) { return (await this.Request ('/api/personal/items/' + encodeURIComponent (item.id) + '/thumbnail')).blob (); }
    async Save (item)
    {
        if (item.personal) { return this.Update (item.id, { name : item.name, category : item.category }); }
        const form = new FormData (); for (const key of ['name', 'category', 'kind', 'objects']) { form.append (key, String (item[key])); }
        form.append ('archive', item.archive, 'session.auto3d');
        const preview = await (await fetch (item.thumbnail)).blob (); form.append ('thumbnail', preview, 'thumbnail.png');
        return (await this.Request ('/api/personal/items', { method : 'POST', body : form })).json ();
    }
    async Update (id, changes) { return (await this.Request ('/api/personal/items/' + encodeURIComponent (id), { method : 'PATCH', headers : { 'Content-Type' : 'application/json' }, body : JSON.stringify (changes) })).json (); }
    async Remove (id) { return (await this.Request ('/api/personal/items/' + encodeURIComponent (id), { method : 'DELETE' })).json (); }
    async Folders ()
    {
        const profile = await (await this.Request ('/api/preferences')).json ();
        return ExpandLibraryPaths ([...(profile.folders || []), ...(await this.List ()).map ((item) => item.category), 'Uncategorized']);
    }
    async SaveFolders (folders) { await this.Request ('/api/preferences', { method : 'PUT', headers : { 'Content-Type' : 'application/json' }, body : JSON.stringify ({ folders : ExpandLibraryPaths (folders) }) }); }
    async AddFolder (value) { const path = NormalizeLibraryPath (value); if (!path) { throw new Error ('Enter a folder name.'); } await this.SaveFolders ([...await this.Folders (), path]); return path; }
    async MoveMany (ids, category) { const folder = await this.AddFolder (category); for (const id of ids) { await this.Update (id, { category : folder }); } }
    async RemoveMany (ids) { for (const id of ids) { await this.Remove (id); } }
    async RenameFolder (previous, next)
    {
        const old = NormalizeLibraryPath (previous); const path = NormalizeLibraryPath (next);
        if (!old || !path || old === 'Uncategorized' || path === old || path.startsWith (old + '/')) { throw new Error ('Choose a valid new folder path.'); }
        const folders = await this.Folders (); const items = await this.List ();
        for (const item of items) { const category = RenameLibraryPath (item.category, old, path); if (category !== item.category) { await this.Update (item.id, { category }); } }
        await this.SaveFolders (folders.map ((folder) => RenameLibraryPath (folder, old, path))); return path;
    }
    async DeleteFolder (value)
    {
        const path = NormalizeLibraryPath (value); if (!path || path === 'Uncategorized') { throw new Error ('Uncategorized cannot be deleted.'); }
        const folders = await this.Folders (); const destination = LibraryPathParent (path) || 'Uncategorized';
        for (const item of await this.List ()) { if (item.category === path || item.category.startsWith (path + '/')) { await this.Update (item.id, { category : destination }); } }
        await this.SaveFolders (folders.filter ((folder) => folder !== path && !folder.startsWith (path + '/'))); return destination;
    }
}
