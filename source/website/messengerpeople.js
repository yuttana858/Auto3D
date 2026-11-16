// User-to-user messages are rendered as text, never interpreted as commands.
export class MessengerPeople
{
    constructor (messenger)
    {
        this.messenger = messenger; this.service = messenger.service; this.owner = messenger.website.auth?.user?.id; this.closed = false; this.sequence = 0; this.current = messenger.lastPeopleConversation || null; this.messages = []; messenger.input.disabled = true; messenger.send.disabled = true;
        const root = messenger.content; root.replaceChildren ();
        const notice = document.createElement ('p'); notice.textContent = 'Conversation members may give their connected agents access to read messages.'; root.appendChild (notice);
        const form = document.createElement ('form'); form.className = 'messenger_people_new'; root.appendChild (form);
        this.recipients = document.createElement ('input'); this.recipients.type = 'text'; this.recipients.placeholder = 'Recipient email(s), separated by commas'; this.recipients.setAttribute ('aria-label', 'Recipient email addresses'); this.recipients.maxLength = 2000; form.appendChild (this.recipients);
        this.create = document.createElement ('button'); this.create.type = 'submit'; this.create.textContent = 'Start conversation'; form.appendChild (this.create);
        this.select = document.createElement ('select'); this.select.setAttribute ('aria-label', 'Conversation'); root.appendChild (this.select);
        this.leave = document.createElement ('button'); this.leave.type = 'button'; this.leave.textContent = 'Leave conversation'; this.leave.disabled = true; root.appendChild (this.leave);
        this.status = document.createElement ('p'); this.status.setAttribute ('role', 'status'); root.appendChild (this.status);
        this.older = document.createElement ('button'); this.older.type = 'button'; this.older.textContent = 'Load older messages'; this.older.hidden = true; root.appendChild (this.older);
        this.list = document.createElement ('div'); this.list.className = 'messenger_people_messages'; root.appendChild (this.list);
        this.select.addEventListener ('change', () => { this.messenger.StopDictation (); const next = this.select.value || null; this.current = next; this.messenger.lastPeopleConversation = next; const draft = this.messenger.peopleDrafts.get (next); this.messenger.peopleAgentDraft = !!draft?.agent; this.messenger.peopleAgentDraftConversation = draft?.agent ? next : null; this.messenger.input.value = draft?.text || ''; this.messenger.drafts.people = this.messenger.input.value; this.messenger.input.disabled = !next; this.messenger.RefreshDictationAvailability (); this.messenger.input.dispatchEvent (new Event ('input', { bubbles : true })); this.messages = []; this.historyExhausted = false; this.older.hidden = true; this.list.replaceChildren (); this.leave.disabled = !this.current; this.messenger.send.disabled = !this.current; this.LoadMessages (); });
        this.leave.addEventListener ('click', () => this.Leave ());
        this.older.addEventListener ('click', () => this.LoadOlder ()); form.addEventListener ('submit', event => { event.preventDefault (); this.Start (); });
        this.Refresh (); this.timer = setInterval (() => { if (!this.closed && !messenger.root.hidden) { this.Refresh (true); } }, 5000);
    }
    Valid () { return !this.closed && this.messenger.website.auth?.user?.id === this.owner; }
    async Refresh (quiet = false)
    {
        const sequence = ++this.sequence;
        try { const { conversations } = await this.service.List (); if (!this.Valid () || sequence !== this.sequence) { return; } this.available = true;
            const previous = this.current; this.select.replaceChildren (); this.select.add (new Option ('Choose a conversation', '')); for (const item of conversations) { if (item.kind !== 'ai') { this.select.add (new Option (item.title || (item.kind === 'group' ? 'Group' : 'Direct message') + ' · ' + item.id.slice (0, 8), item.id)); } }
            this.current = conversations.some (item => item.id === previous && item.kind !== 'ai') ? previous : null; this.select.value = this.current || ''; this.messenger.input.disabled = !this.current; this.messenger.RefreshDictationAvailability (); this.leave.disabled = !this.current || !!this.leaving || !!this.sending; this.messenger.send.disabled = !this.current || !!this.sending || !!this.leaving;
            if (previous && !this.current) { this.messages = []; this.historyExhausted = false; this.older.hidden = true; this.list.replaceChildren (); }
            if (this.current) { await this.LoadMessages (quiet); } else if (!quiet) { this.status.textContent = this.messenger.peopleAgentDraft ? 'Agent prepared a reply. Review it before pressing Send.' : 'Start or select a conversation.'; }
        } catch (error) { if (this.Valid ()) { this.available = false; this.status.textContent = 'Messenger unavailable: ' + error.message; this.messenger.input.disabled = true; this.messenger.RefreshDictationAvailability (); this.messenger.send.disabled = true; } }
    }
    async Start ()
    {
        this.messenger.StopDictation ();
        const emails = [...new Set (this.recipients.value.split (',').map (value => value.trim ().toLowerCase ()).filter (Boolean))]; if (!emails.length || emails.length > 20) { this.status.textContent = 'Enter one to 20 recipient email addresses.'; return; }
        this.create.disabled = true; this.status.textContent = 'Finding recipients…';
        try { const members = []; for (const email of emails) { const match = await this.service.Lookup (email); if (!match.id) { throw new Error ('A recipient was not found or is unavailable.'); } members.push (match.id); } if (!this.Valid ()) { return; }
            const result = await this.service.Create (members.length === 1 ? 'direct' : 'group', emails.join (', ').slice (0, 120), members); if (!this.Valid ()) { return; } this.current = result.id; this.messenger.lastPeopleConversation = result.id; this.messenger.input.value = ''; this.messenger.drafts.people = ''; this.messenger.peopleAgentDraft = false; this.messenger.peopleAgentDraftConversation = null; this.messenger.input.dispatchEvent (new Event ('input', { bubbles : true })); this.messages = []; this.historyExhausted = false; this.older.hidden = true; this.list.replaceChildren (); this.recipients.value = ''; await this.Refresh (); }
        catch (error) { if (this.Valid ()) { this.status.textContent = error.message; } } finally { if (this.Valid ()) { this.create.disabled = false; } }
    }
    async Leave ()
    {
        this.messenger.StopDictation ();
        const id = this.current; if (!id || this.leaving) { return; } this.leaving = true; this.leave.disabled = true; this.select.disabled = true; this.messenger.send.disabled = true;
        try { const result = await this.messenger.LeaveConversation (id); if (!this.Valid () || !result.left) { return; } this.messenger.peopleDrafts.delete (id); this.current = null; this.messenger.lastPeopleConversation = null; this.messenger.input.value = ''; this.messenger.drafts.people = ''; this.messenger.peopleAgentDraft = false; this.messenger.peopleAgentDraftConversation = null; this.messenger.input.dispatchEvent (new Event ('input', { bubbles : true })); this.messages = []; this.list.replaceChildren (); await this.Refresh (); }
        catch (error) { if (this.Valid ()) { this.status.textContent = 'Could not leave conversation: ' + error.message; } }
        finally { this.leaving = false; if (this.Valid ()) { this.select.disabled = false; this.leave.disabled = !this.current; this.messenger.send.disabled = !this.current; } }
    }
    async LoadMessages (quiet = false)
    {
        const id = this.current; if (!id) { return; } try { const { messages } = await this.service.Read (id); if (!this.Valid () || this.current !== id) { return; } const old = new Map (this.messages.map (entry => [entry.id, entry])); for (const entry of messages) { old.set (entry.id, entry); } this.messages = [...old.values ()].sort ((a, b) => a.created_at.localeCompare (b.created_at) || a.id.localeCompare (b.id)); this.older.hidden = !!this.historyExhausted || messages.length < 50; this.Render (); this.status.textContent = this.messenger.peopleAgentDraft ? 'Agent prepared a reply. Review it before pressing Send.' : ''; }
        catch (error) { if (this.Valid () && !quiet) { this.status.textContent = error.message; } }
    }
    async LoadOlder ()
    {
        const first = this.messages[0], id = this.current; if (!first || !id) { return; } this.older.disabled = true;
        try { const { messages } = await this.service.Read (id, { beforeTime : first.created_at, beforeId : first.id }); if (!this.Valid () || this.current !== id) { return; } const old = new Map (this.messages.map (entry => [entry.id, entry])); for (const entry of messages) { old.set (entry.id, entry); } this.messages = [...old.values ()].sort ((a, b) => a.created_at.localeCompare (b.created_at) || a.id.localeCompare (b.id)); this.historyExhausted = messages.length < 50; this.older.hidden = this.historyExhausted; this.Render (); }
        catch (error) { if (this.Valid ()) { this.status.textContent = error.message; } } finally { if (this.Valid ()) { this.older.disabled = false; } }
    }
    Render () { this.list.replaceChildren (); for (const entry of this.messages) { const row = document.createElement ('p'), who = document.createElement ('strong'); who.textContent = (entry.sender_id === this.owner ? 'You' : entry.sender_email || entry.sender_id) + ': '; row.append (who, document.createTextNode (entry.body)); this.list.appendChild (row); } }
    async Send (message)
    {
        const id = this.current; if (!id || !message || this.sending || this.leaving) { return false; } this.sending = true; this.messenger.send.disabled = true; this.leave.disabled = true; this.select.disabled = true; const messageId = this.failed?.conversation === id && this.failed.body === message ? this.failed.id : crypto.randomUUID ();
        try { await this.service.Send (id, message, 'user', messageId); this.failed = null; if (!this.Valid () || this.current !== id) { return false; } await this.LoadMessages (); return true; }
        catch (error) { if (this.Valid ()) { this.failed = { conversation : id, body : message, id : messageId }; this.status.textContent = 'Message may not have been sent. Retry: ' + error.message; } return false; }
        finally { this.sending = false; if (this.Valid ()) { this.select.disabled = false; this.messenger.send.disabled = !this.current; this.leave.disabled = !this.current; } }
    }
    Close () { this.closed = true; this.sequence++; clearInterval (this.timer); }
}
