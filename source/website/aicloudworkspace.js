// Account-private AI workspace transport. Callers own conflict resolution and
// must not silently replace local work when a different device saved a revision.
export class AICloudWorkspace
{
    constructor (auth, request = fetch) { this.auth = auth; this.request = request; }
    async Request (path, options = {})
    {
        const owner = this.auth.user?.id; if (!owner) { throw new Error ('Sign in to use the AI workspace.'); }
        const response = await this.request (path, { credentials : 'same-origin', ...options, headers : { ...options.headers, 'X-Auto3D-Account' : owner } });
        if (this.auth.user?.id !== owner) { throw new Error ('Account changed while accessing the AI workspace.'); }
        if (!response.ok) { let message; try { message = (await response.json ()).error; } catch { /* Use generic error. */ } const error = new Error (message || 'AI workspace unavailable.'); error.status = response.status; throw error; }
        return { response, owner };
    }
    async Inspect () { const { response, owner } = await this.Request ('/api/personal/ai-workspace'); const value = await response.json (); if (this.auth.user?.id !== owner) { throw new Error ('Account changed while accessing the AI workspace.'); } return value; }
    async Load (revision)
    {
        const { response, owner } = await this.Request ('/api/personal/ai-workspace?archive=1'); const etag = response.headers.get ('ETag'); const archive = await response.arrayBuffer ();
        if (this.auth.user?.id !== owner) { throw new Error ('Account changed while accessing the AI workspace.'); }
        if (etag !== '"' + revision + '"') { throw new Error ('AI workspace changed on another device.'); }
        return archive;
    }
    async Save (archive, revision)
    {
        if (!Number.isSafeInteger (revision) || revision < 0 || !(archive instanceof ArrayBuffer || ArrayBuffer.isView (archive) || archive instanceof Blob)) { throw new Error ('Invalid AI workspace save.'); }
        const { response, owner } = await this.Request ('/api/personal/ai-workspace', { method : 'PUT', headers : { 'If-Match' : '"' + revision + '"', 'Content-Type' : 'application/octet-stream' }, body : archive }); const value = await response.json ();
        if (this.auth.user?.id !== owner) { throw new Error ('Account changed while accessing the AI workspace.'); } return value;
    }
}
