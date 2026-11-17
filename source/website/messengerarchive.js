import { AIHistoryRow } from './messengeraistory.js';
// Messages remain in the authenticated conversation store. The archive groups each
// page by the viewer's local calendar date; no background deletion or copy is needed.
export class MessengerArchive
{
    constructor (messenger, tab, conversation)
    {
        this.messenger = messenger; this.service = messenger.service; this.owner = messenger.website.auth?.user?.id; this.tab = tab; this.current = conversation; this.sequence = 0; this.closed = false; this.messages = []; this.more = false;
        const root = messenger.content; root.replaceChildren ();
        const note = document.createElement ('p'); note.textContent = 'Saved messages grouped by your local date.'; root.appendChild (note);
        if (tab === 'people') { this.select = document.createElement ('select'); this.select.setAttribute ('aria-label', 'History conversation'); root.appendChild (this.select); this.select.addEventListener ('change', () => { this.current = this.select.value || null; this.messages = []; this.Load (); }); }
        this.status = document.createElement ('p'); this.status.setAttribute ('role', 'status'); root.appendChild (this.status);
        this.list = document.createElement ('div'); this.list.className = 'messenger_archive'; root.appendChild (this.list);
        this.older = document.createElement ('button'); this.older.type = 'button'; this.older.textContent = 'Load older days'; this.older.hidden = true; this.older.addEventListener ('click', () => this.Load (true)); root.appendChild (this.older);
        this.Initialize ();
    }
    Valid (sequence) { return !this.closed && this.sequence === sequence && this.owner && this.messenger.website.auth?.user?.id === this.owner; }
    async Initialize ()
    {
        const sequence = ++this.sequence; this.status.textContent = 'Loading history…';
        try { const { conversations } = await this.service.List (); if (!this.Valid (sequence)) { return; }
            if (this.tab === 'ai') { this.current = conversations.find (item => item.kind === 'ai')?.id || null; }
            else { const items = conversations.filter (item => item.kind !== 'ai'); this.select.replaceChildren (); this.select.add (new Option ('Choose a conversation', '')); for (const item of items) { this.select.add (new Option (item.title || (item.kind === 'group' ? 'Group' : 'Direct message') + ' · ' + item.id.slice (0, 8), item.id)); } if (!items.some (item => item.id === this.current)) { this.current = null; } this.select.value = this.current || ''; }
            await this.Load ();
        } catch (error) { if (this.Valid (sequence)) { this.status.textContent = 'History unavailable: ' + error.message; } }
    }
    async Load (older = false)
    {
        const sequence = ++this.sequence, id = this.current; this.older.hidden = true; this.older.disabled = true;
        if (!id) { this.messages = []; this.list.replaceChildren (); this.status.textContent = this.tab === 'people' ? 'Choose a conversation to view its history.' : 'No saved AI messages yet.'; return; }
        this.status.textContent = 'Loading history…'; const first = this.messages[0];
        try { const page = older && first ? { beforeTime : first.created_at, beforeId : first.id } : {}; const { messages } = await this.service.Read (id, page); if (!this.Valid (sequence) || this.current !== id) { return; }
            const merged = new Map ((older ? this.messages : []).map (item => [item.id, item])); for (const item of messages) { merged.set (item.id, item); } this.messages = [...merged.values ()].sort ((a, b) => a.created_at.localeCompare (b.created_at) || a.id.localeCompare (b.id)); this.more = messages.length === 50; this.older.hidden = !this.more; this.status.textContent = this.messages.length ? '' : 'No saved messages in this conversation.'; this.Render ();
        } catch (error) { if (this.Valid (sequence)) { this.status.textContent = 'History unavailable: ' + error.message; this.older.hidden = !older; } }
        finally { if (this.Valid (sequence)) { this.older.disabled = false; } }
    }
    Render ()
    {
        this.list.replaceChildren (); let previous = '';
        for (const entry of [...this.messages].reverse ()) { const date = new Date (entry.created_at); const day = Number.isNaN (date.valueOf ()) ? 'Unknown date' : date.toLocaleDateString (undefined, { year : 'numeric', month : 'long', day : 'numeric' });
            if (day !== previous) { const heading = document.createElement ('h3'); heading.textContent = day; this.list.appendChild (heading); previous = day; }
            if (this.tab === 'ai') { this.list.appendChild (AIHistoryRow (entry)); continue; }
            const row = document.createElement ('p'), who = document.createElement ('strong'); who.textContent = (entry.sender_id === this.owner ? 'You' : entry.sender_email || entry.sender_id) + ': '; row.append (who, document.createTextNode (entry.body)); this.list.appendChild (row);
        }
    }
    Close () { this.closed = true; this.sequence++; }
}
