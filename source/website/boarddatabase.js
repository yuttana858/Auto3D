export class AccountBoardDatabase
{
    constructor (website, module) { this.website = website; this.module = module; this.records = module.DefaultBoardDatabase (); this.revision = null; this.owner = null; this.loading = null; this.saving = Promise.resolve (); }
    async Request (method, body)
    {
        const owner = this.website.auth?.user?.id; if (!owner || this.website.accountReady === false) { throw new Error ('Sign in to use your board database.'); }
        const response = await fetch ('/api/packaging/boards', { method, credentials : 'same-origin', headers : { 'X-Auto3D-Account' : owner, ...(body ? { 'Content-Type' : 'application/json' } : {}) }, ...(body ? { body : JSON.stringify (body) } : {}) });
        if (this.website.auth?.user?.id !== owner) { throw new Error ('Account changed during board database update.'); }
        // Old deployments/dev fixtures can still use the nominal catalog; saves stay explicit.
        if (method === 'GET' && response.status === 404) { return { owner, revision : null, records : this.module.DefaultBoardDatabase () }; }
        let result; try { result = await response.json (); } catch { throw new Error ('Board database service unavailable.'); }
        if (this.website.auth?.user?.id !== owner) { throw new Error ('Account changed during board database update.'); }
        if (!response.ok) { throw new Error (result.error || 'Board database could not be updated.'); }
        return { owner, revision : result.revision, records : this.module.ValidateBoardDatabase (result.records) };
    }
    async Load (force = false)
    {
        const owner = this.website.auth?.user?.id;
        if (!force && owner && this.owner === owner) { return this.Inspect (); }
        if (this.loading) { await this.loading; if (this.owner === this.website.auth?.user?.id) { return this.Inspect (); } }
        this.loading = this.Request ('GET').then (result => { this.owner = result.owner; this.revision = result.revision; this.records = result.records; });
        try { await this.loading; return this.Inspect (); } finally { this.loading = null; }
    }
    Inspect () { return { scope : 'account', revision : this.revision, records : structuredClone (this.records) }; }
    Save (records, expectedRevision = this.revision)
    {
        const checked = this.module.ValidateBoardDatabase (records), owner = this.website.auth?.user?.id;
        const save = this.saving.catch (() => {}).then (async () => {
            if (this.website.auth?.user?.id !== owner || this.website.sessionEditor?.readOnly) { throw new Error ('Sign in to an editable account.'); }
            const result = await this.Request ('PUT', { records : checked, revision : expectedRevision }); this.owner = result.owner; this.revision = result.revision; this.records = result.records; return this.Inspect ();
        }); this.saving = save; return save;
    }
}
