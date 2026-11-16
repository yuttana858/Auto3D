// Conversation API uses the signed-in account and never trusts an actor in the payload.
export class MessengerService
{
    constructor (website, request = fetch) { this.website = website; this.fetch = request; this.owner = website.auth?.user?.id || null; this.generation = 0; website.auth?.Subscribe (user => { const next = user?.id || null; if (next !== this.owner) { this.owner = next; this.generation++; } }); }
    async Request (path, options = {})
    {
        const owner = this.website.auth?.user?.id, generation = this.generation; if (!owner) { throw new Error ('Sign in to use Messenger.'); }
        const response = await this.fetch ('/api/messenger/' + path, { credentials : 'same-origin', signal : AbortSignal.timeout (15000), ...options, headers : { ...options.headers, 'X-Auto3D-Account' : owner } });
        if (this.website.auth?.user?.id !== owner || generation !== this.generation) { throw new Error ('Account changed. Reopen Messenger.'); }
        let body; try { body = await response.json (); } catch { throw new Error ('Messenger returned an invalid response.'); }
        if (this.website.auth?.user?.id !== owner || generation !== this.generation) { throw new Error ('Account changed. Reopen Messenger.'); }
        if (!response.ok) { throw new Error (body?.error || 'Messenger is unavailable.'); } return body;
    }
    List () { return this.Request ('conversations'); }
    Lookup (email) { return this.Request ('lookup', { method : 'POST', headers : { 'Content-Type' : 'application/json' }, body : JSON.stringify ({ email }) }); }
    Create (kind, title, members) { return this.Request ('conversations', { method : 'POST', headers : { 'Content-Type' : 'application/json' }, body : JSON.stringify ({ kind, title, members }) }); }
    Leave (id) { return this.Request ('conversations/' + encodeURIComponent (id), { method : 'DELETE' }); }
    Read (id, { beforeTime = null, beforeId = null, limit = 50 } = {}) { if ((beforeTime === null) !== (beforeId === null)) { throw new Error ('Provide both message cursor fields.'); } const query = new URLSearchParams ({ limit : String (limit) }); if (beforeTime !== null) { query.set ('beforeTime', beforeTime); query.set ('beforeId', beforeId); } return this.Request ('conversations/' + encodeURIComponent (id) + '/messages?' + query); }
    Send (id, body, origin = 'user', messageId = crypto.randomUUID ()) { return this.Request ('conversations/' + encodeURIComponent (id) + '/messages', { method : 'POST', headers : { 'Content-Type' : 'application/json' }, body : JSON.stringify ({ body, origin, id : messageId }) }); }
}
