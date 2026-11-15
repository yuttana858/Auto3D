// Account-scoped durable transcript for the command-bar agent channel. The origin label
// is reported by the client for display only; it is never used to authorize actions.
export class MessengerAIHistory
{
    constructor (messenger)
    {
        this.messenger = messenger; this.service = messenger.service; this.owner = messenger.website.auth?.user?.id || null; this.generation = 0; this.pending = []; this.items = []; this.conversation = null; this.error = ''; this.busy = false; this.more = false;
        messenger.website.auth.Subscribe (user => { const next = user?.id || null; if (next !== this.owner) { this.owner = next; this.generation++; this.pending = []; this.items = []; this.conversation = null; this.error = ''; this.busy = false; this.more = false; if (next) { this.Load ().catch (() => {}); } this.Changed (); } });
        if (this.owner) { this.Load ().catch (() => {}); }
    }
    Valid (owner, generation) { return owner && this.owner === owner && this.generation === generation && this.messenger.website.auth?.user?.id === owner; }
    Changed () { if (this.messenger.tab === 'ai' && !this.messenger.root.hidden) { this.messenger.RenderConversation (); } }
    async Find () { if (this.conversation) { return this.conversation; } const owner = this.owner, generation = this.generation; if (!owner) { throw new Error ('Sign in to use AI history.'); } const list = await this.service.List (); if (!this.Valid (owner, generation)) { throw new Error ('Account changed.'); } this.conversation = list.conversations.find (c => c.kind === 'ai')?.id || null; return this.conversation; }
    async Ensure ()
    {
        if (this.conversation) { return this.conversation; } const owner = this.owner, generation = this.generation; if (!owner) { throw new Error ('Sign in to use AI history.'); }
        const list = await this.service.List (); if (!this.Valid (owner, generation)) { throw new Error ('Account changed.'); } let item = list.conversations.find (c => c.kind === 'ai');
        if (!item) { try { const result = await this.service.Create ('ai', 'AI history', []); item = { id : result.id }; } catch (error) { const retry = await this.service.List (); item = retry.conversations.find (c => c.kind === 'ai'); if (!item) { throw error; } } }
        if (!this.Valid (owner, generation)) { throw new Error ('Account changed.'); } this.conversation = item.id; return item.id;
    }
    async Load (older = false)
    {
        const owner = this.owner, generation = this.generation; if (!owner) { return; }
        try { const id = await this.Find (); if (!id) { return; } const first = this.items[0], page = older && first ? { beforeTime : first.created_at, beforeId : first.id } : {}; const result = await this.service.Read (id, page); if (!this.Valid (owner, generation)) { return; }
            const merged = new Map (this.items.map (item => [item.id, item])); for (const item of result.messages) { merged.set (item.id, item); } this.items = [...merged.values ()].sort ((a, b) => a.created_at.localeCompare (b.created_at) || a.id.localeCompare (b.id)); if (older || !first) { this.more = result.messages.length === 50; } this.error = ''; this.preserveScroll = older; this.Changed (); }
        catch (error) { if (this.Valid (owner, generation)) { this.error = 'AI history unavailable: ' + error.message; this.Changed (); } }
    }
    Record (entry)
    {
        if (!this.owner || !((entry.from === 'user' && entry.kind === 'message') || (entry.from === 'agent' && entry.kind === 'response'))) { return; }
        if (this.pending.length >= 100) { this.error = 'AI history queue is full. Further command-bar messages are not saved; retry before closing this window.'; this.Changed (); return; }
        this.pending.push ({ id : crypto.randomUUID (), body : entry.text, origin : entry.from === 'agent' ? 'agent' : 'user', created_at : new Date (entry.at).toISOString () }); this.Changed (); this.Flush ();
    }
    async Flush ()
    {
        if (this.busy || !this.owner) { return; } const owner = this.owner, generation = this.generation; this.busy = true; this.error = ''; this.Changed ();
        try { while (this.pending.length && this.Valid (owner, generation)) { const item = this.pending[0], id = await this.Ensure (), result = await this.service.Send (id, item.body, item.origin, item.id); if (!this.Valid (owner, generation)) { return; } this.pending.shift (); const saved = Array.isArray (result?.message) ? result.message[0] : result?.message; const record = saved?.id === item.id && typeof saved.created_at === 'string' ? saved : item; if (!this.items.some (stored => stored.id === item.id)) { this.items.push (record); } this.error = ''; this.Changed (); } }
        catch (error) { if (this.Valid (owner, generation)) { this.error = 'AI history save could not be confirmed: ' + error.message; this.Changed (); } }
        finally { if (this.Valid (owner, generation)) { this.busy = false; } }
    }
    async Page (page = {}) { const id = await this.Find (); return id ? this.service.Read (id, page) : { messages : [] }; }
}
