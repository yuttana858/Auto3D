export function NewShareCode ()
{
    const value = new Uint32Array (1); do { crypto.getRandomValues (value); } while (value[0] >= 4294960000);
    return String (value[0] % 10000).padStart (4, '0');
}
export class AudienceSharing
{
    constructor (library) { this.library = library; }
    async Create (item, { code = NewShareCode (), allowDownload = false, expiresDays = 30 } = {})
    {
        if (typeof code !== 'string' || !/^\d{4}$/.test (code) || typeof allowDownload !== 'boolean' || !Number.isInteger (expiresDays) || expiresDays < 1 || expiresDays > 90) { throw new Error ('Use a four-digit code and expiry of 1–90 days.'); }
        const editor = this.library.editor; if (editor.readOnly || !editor.website.auth.user || editor.website.accountReady === false) { throw new Error ('Sign in to share a saved model.'); }
        const owner = editor.website.auth.user.id;
        const options = { source : item.personal ? 'account' : item.shared ? 'published' : 'device', itemId : item.id, code, allowDownload, expiresDays };
        let body, headers;
        if (options.source === 'device') {
            const archive = await this.library.ArchiveForItem (item); body = new FormData (); body.append ('options', JSON.stringify (options)); body.append ('name', item.name); body.append ('archive', new Blob ([archive]), 'session.auto3d');
        } else { body = JSON.stringify (options); headers = { 'Content-Type' : 'application/json' }; }
        if (editor.website.auth.user?.id !== owner || editor.website.accountReady === false) { throw new Error ('Account changed. Reopen the Library.'); }
        return (await this.library.accountStorage.Request ('/api/audience', { method : 'POST', body, headers })).json ();
    }
    async List () { return (await this.library.accountStorage.Request ('/api/audience')).json (); }
    async Revoke (token) { if (!/^[0-9a-f-]{36}$/i.test (token)) { throw new Error ('Invalid share link.'); } return (await this.library.accountStorage.Request ('/api/audience/' + token, { method : 'DELETE' })).json (); }
}
