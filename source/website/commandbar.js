import { OpenCommandPanel } from './commandpanel.js';

// The command bar is also a message channel between the user and connected MCP agents.
// Agents read it with ui.command_bar.inspect and reply with ui.command_bar.respond.
const LogLimit = 100, TextLimit = 2000;
const AgentPrefix = /^(?:@agent|\/agent)\b[:,]?\s*/i;

export class CommandBar
{
    constructor (website, parent)
    {
        this.website = website;
        const root = document.createElement ('div'); root.className = 'scene_command_bar'; parent.appendChild (root);
        this.root = root;
        const header = document.createElement ('div'); header.className = 'scene_command_header'; root.appendChild (header);
        this.status = document.createElement ('div'); this.status.className = 'scene_status'; this.status.setAttribute ('role', 'status'); this.status.textContent = 'Add a model to begin'; header.appendChild (this.status);
        const close = document.createElement ('button'); close.type = 'button'; close.className = 'scene_command_close'; close.textContent = '×'; close.title = 'Close command bar'; close.setAttribute ('aria-label', 'Close command bar');
        close.addEventListener ('click', () => this.SetVisible (false)); header.appendChild (close);
        this.onVisibilityChange = () => {};
        const form = document.createElement ('form'); form.className = 'scene_command_form'; root.appendChild (form);
        this.input = document.createElement ('textarea'); this.input.rows = 1; this.input.maxLength = 2000; this.input.placeholder = 'Type a command · array model 4x4x6'; this.input.setAttribute ('aria-label', 'Command or macro'); this.input.autocomplete = 'off'; form.appendChild (this.input);
        this.run = document.createElement ('button'); this.run.type = 'submit'; this.run.textContent = 'Run'; form.appendChild (this.run);
        this.browse = document.createElement ('button'); this.browse.type = 'button'; this.browse.textContent = 'Commands & macros'; this.browse.addEventListener ('click', () => OpenCommandPanel (website)); form.appendChild (this.browse);
        this.history = []; this.historyIndex = 0; this.RestoreVisibility ();
        this.log = []; this.nextId = 1; this.ownStatus = null;
        // Every status line change (app progress, errors, agent replies) is kept for agents to read.
        // Observer callbacks run after ShowStatus returns, so its own text is skipped by value.
        new MutationObserver (() => { const text = this.status.textContent; if (text === this.ownStatus) { this.ownStatus = null; return; } this.ownStatus = null; delete this.status.dataset.tone; this.Record ('app', 'status', text); }).observe (this.status, { childList : true, characterData : true, subtree : true });
        const resize = () => { this.input.style.height = 'auto'; this.input.style.height = Math.min (this.input.scrollHeight, 180) + 'px'; };
        this.input.addEventListener ('input', resize);
        this.input.addEventListener ('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault (); form.requestSubmit (); return; }
            if (!['ArrowUp', 'ArrowDown'].includes (event.key) || !this.history.length) { return; }
            event.preventDefault (); this.historyIndex = Math.max (0, Math.min (this.history.length, this.historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
            this.input.value = this.history[this.historyIndex] || ''; resize ();
        });
        form.addEventListener ('submit', async event => {
            event.preventDefault (); if (this.running || website.sessionEditor.busy) { return; }
            const text = this.input.value.trim (); if (!text) { this.input.focus (); return; }
            const remember = () => { this.history.push (text); this.history = this.history.slice (-50); this.historyIndex = this.history.length; this.input.value = ''; resize (); };
            const addressed = AgentPrefix.test (text);
            if (addressed) { const message = text.replace (AgentPrefix, '').trim (); if (message) { this.SendToAgent (message); remember (); } this.input.focus (); return; }
            this.running = true; this.SetBusy (true); this.status.textContent = 'Running command…';
            try {
                const result = await website.commands.Execute ('commands.text', { text });
                if (!result.ok || !result.result.ok) { throw new Error (result.error?.message || result.result.error?.message || 'Command could not complete.'); }
                remember ();
                const completed = result.result.completed; const last = completed.at (-1);
                this.Record ('user', 'command', text, true);
                this.status.textContent = last?.command === 'object.array' ? 'Array created · ' + last.result.total + ' objects' : 'Completed · ' + completed.length + (completed.length === 1 ? ' command' : ' commands');
            } catch (error) {
                // Text that is not a command is a message for a connected agent.
                if (/^Unknown command/.test (error.message) && this.AgentConnected ()) { this.SendToAgent (text); remember (); }
                else { this.Record ('user', 'command', text, false); this.status.textContent = error.message; }
            }
            finally { this.running = false; this.SetBusy (website.sessionEditor.busy); this.input.focus (); }
        });
    }
    AgentConnected () { return this.website.agentAccess?.socket?.readyState === 1; }
    Record (from, kind, text, ok = true)
    {
        const value = String (text ?? '').slice (0, TextLimit); const last = this.log.at (-1);
        if (kind === 'status' && (!value || last?.kind === 'status' && last.text === value)) { return null; }
        const entry = { id : this.nextId++, at : Date.now (), from, kind, text : value, ok };
        this.log.push (entry); if (this.log.length > LogLimit) { this.log.splice (0, this.log.length - LogLimit); }
        return entry;
    }
    SendToAgent (text)
    {
        const entry = this.Record ('user', 'message', text);
        this.ShowStatus (this.AgentConnected () ? 'Sent to agent · waiting for a reply' : 'No agent connected · message kept for the next agent that connects', 'pending');
        return entry;
    }
    ShowStatus (text, tone = '')
    {
        this.ownStatus = text; this.status.textContent = text;
        if (tone) { this.status.dataset.tone = tone; } else { delete this.status.dataset.tone; }
    }
    // Agent reply shown in the status line above the text box; reopens a hidden bar.
    Respond ({ message, replyTo })
    {
        const text = String (message).trim ();
        if (!text || text.length > TextLimit) { throw new Error ('Reply must be 1–2,000 characters.'); }
        if (replyTo !== undefined && !this.log.some (entry => entry.id === replyTo && entry.from === 'user')) { throw new Error ('replyTo must be the id of a user entry still in the command bar log.'); }
        const entry = this.Record ('agent', 'response', text); if (replyTo !== undefined) { entry.replyTo = replyTo; }
        if (!this.visible) { this.root.hidden = false; this.onVisibilityChange (true); } // Show without stealing focus or changing the saved preference.
        this.ShowStatus ('Agent: ' + text, 'agent');
        return { id : entry.id, shown : true };
    }
    Inspect ({ after = 0, limit = 50 } = {})
    {
        const entries = this.log.filter (entry => entry.id > after).slice (-limit);
        return { visible : this.visible, status : this.status.textContent, agentConnected : this.AgentConnected (), lastId : this.nextId - 1, entries : entries.map (entry => ({ ...entry })) };
    }
    get visible () { return !this.root.hidden; }
    // Hiding keeps typed text and history; the tool strip Commands button reopens the bar.
    SetVisible (visible)
    {
        this.root.hidden = !visible;
        try { localStorage.setItem ('auto3d.commandBarHidden', visible ? '0' : '1'); } catch { /* Storage is optional. */ }
        if (visible) { this.input.focus (); }
        this.onVisibilityChange (visible);
        return { visible };
    }
    RestoreVisibility ()
    {
        let hidden = false; try { hidden = localStorage.getItem ('auto3d.commandBarHidden') === '1'; } catch { /* Storage is optional. */ }
        this.root.hidden = hidden;
    }
    SetBusy (busy) { this.input.disabled = busy || this.running; this.run.disabled = busy || this.running; this.browse.disabled = busy || this.running; }
}
