import { OpenCommandPanel } from './commandpanel.js';

export class CommandBar
{
    constructor (website, parent)
    {
        this.website = website;
        const root = document.createElement ('div'); root.className = 'scene_command_bar'; parent.appendChild (root);
        const heading = document.createElement ('div'); heading.className = 'scene_command_heading'; root.appendChild (heading); this.root = root;
        this.status = document.createElement ('div'); this.status.className = 'scene_status'; this.status.setAttribute ('role', 'status'); this.status.textContent = 'Add a model to begin'; heading.appendChild (this.status);
        this.agentIndicator = document.createElement ('button'); this.agentIndicator.type = 'button'; this.agentIndicator.className = 'scene_agent_indicator'; this.agentIndicator.title = 'Agent connection'; this.agentIndicator.setAttribute ('aria-label', 'Agent disconnected'); this.agentIndicator.innerHTML = '<span class="scene_agent_symbol" aria-hidden="true">✦</span><span class="scene_agent_name"></span>'; this.agentIndicator.addEventListener ('click', () => website.authPanel.Open ()); heading.appendChild (this.agentIndicator);
        const form = document.createElement ('form'); form.className = 'scene_command_form'; root.appendChild (form);
        this.input = document.createElement ('textarea'); this.input.rows = 1; this.input.maxLength = 2000; this.input.placeholder = 'Type a command · array model 4x4x6'; this.input.setAttribute ('aria-label', 'Command or macro'); this.input.autocomplete = 'off'; form.appendChild (this.input);
        this.run = document.createElement ('button'); this.run.type = 'submit'; this.run.textContent = 'Run'; form.appendChild (this.run);
        this.browse = document.createElement ('button'); this.browse.type = 'button'; this.browse.textContent = 'Commands & macros'; this.browse.addEventListener ('click', () => OpenCommandPanel (website)); form.appendChild (this.browse);
        this.history = []; this.historyIndex = 0;
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
    BindAgentConnection (connection)
    {
        const update = () => {
            const state = connection.Inspect (); const agents = state.status === 'connected' ? state.agents : []; const active = agents.length > 0;
            const names = agents.map (agent => agent.name + (agent.domain ? '' : ' (client-reported)')); const title = agents.map (agent => agent.name + (agent.domain ? ' · ' + agent.domain : ' · client-reported name')).join ('; ');
            const label = active ? 'Connected: ' + names.join (', ') : state.status === 'connected' ? 'Ready for an agent' : 'Agent disconnected';
            this.agentIndicator.querySelector ('.scene_agent_name').textContent = active ? label : ''; this.agentIndicator.title = active ? title : label; this.agentIndicator.setAttribute ('aria-label', active ? label + '. ' + title : label); this.agentIndicator.classList.toggle ('agent_active', active); this.root.classList.toggle ('agent_connected', active);
        };
        connection.Subscribe (update); update ();
    }
    SetBusy (busy) { this.input.disabled = busy || this.running; this.run.disabled = busy || this.running; this.browse.disabled = busy || this.running; }
}
