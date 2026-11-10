import { OpenCommandPanel } from './commandpanel.js';

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
            this.running = true; this.SetBusy (true); this.status.textContent = 'Running command…';
            try {
                const result = await website.commands.Execute ('commands.text', { text });
                if (!result.ok || !result.result.ok) { throw new Error (result.error?.message || result.result.error?.message || 'Command could not complete.'); }
                this.history.push (text); this.history = this.history.slice (-50); this.historyIndex = this.history.length; this.input.value = ''; resize ();
                const completed = result.result.completed; const last = completed.at (-1);
                this.status.textContent = last?.command === 'object.array' ? 'Array created · ' + last.result.total + ' objects' : 'Completed · ' + completed.length + (completed.length === 1 ? ' command' : ' commands');
            } catch (error) { this.status.textContent = error.message; }
            finally { this.running = false; this.SetBusy (website.sessionEditor.busy); this.input.focus (); }
        });
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
