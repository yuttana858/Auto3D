import { WorkspaceDialog } from './modellibrary.js';
import { ReadTools } from '../../mcp/common.js';

const WindowCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function CreateWindowCode ()
{
    const bytes = crypto.getRandomValues (new Uint8Array (16));
    return [...bytes].map (byte => WindowCodeAlphabet[byte & 31]).join ('').match (/.{4}/g).join ('-');
}

export function AgentAccessFor (website)
{
    if (!website.agentAccess) { website.agentAccess = new AgentAccess (website); }
    return website.agentAccess;
}
export class AgentAccess
{
    constructor (website)
    {
        this.website = website; this.socket = null; this.instanceId = crypto.randomUUID (); this.generation = 0; this.status = 'Disconnected'; this.codeInput = null; this.copyButton = null; this.statusElement = null;
        website.auth.Subscribe (user => { if (!user || this.accountId && user.id !== this.accountId) { this.Disconnect (); } });
    }
    Account ()
    {
        const user = this.website.auth?.user;
        if (!user || this.website.accountReady === false || this.website.sessionEditor.readOnly) { throw new Error ('Sign in to an editable workspace.'); }
        return user.id;
    }
    async Request (path, body = null)
    {
        const owner = this.Account (), response = await fetch ('/api/agent/' + path, { method : body ? 'POST' : 'GET', credentials : 'same-origin', headers : { 'X-Auto3D-Account' : owner, ...(body ? { 'Content-Type' : 'application/json' } : {}) }, ...(body ? { body : JSON.stringify (body) } : {}) });
        if (!response.ok) { throw new Error ('Agent access unavailable. Check staging setup and permissions.'); }
        const result = await response.json (); if (this.Account () !== owner) { throw new Error ('Account changed.'); } return result;
    }
    Inspect () { return { status : this.status, connected : this.socket?.readyState === 1, screenshots : this.screenshots === true, connectionId : this.connectionId || null }; }
    Sessions () { return this.website.sessionEditor.sessions.Inspect ().tabs.map (tab => ({ id : tab.id, name : tab.name.slice (0, 100), active : tab.active })); }
    Disconnect ()
    {
        this.generation++; clearInterval (this.poll); clearInterval (this.renew); clearTimeout (this.handshakeTimer); this.socket?.close (); this.socket = null; this.connectionId = null; this.windowCode = null;
        if (this.codeInput) { this.codeInput.value = ''; } if (this.copyButton) { this.copyButton.disabled = true; }
        this.status = 'Disconnected'; if (this.statusElement) { this.statusElement.textContent = this.status; } return this.Inspect ();
    }
    async Connect ({ screenshots = false })
    {
        if (typeof screenshots !== 'boolean') { throw new Error ('Invalid screenshot preference.'); }
        const windowCode = CreateWindowCode ();
        const owner = this.Account (), config = await this.Request ('config');
        if (!config.pilot || !['https://auto3d-mcp-pilot.pages.dev', 'https://auto3d-5av.pages.dev'].includes (location.origin) || config.mcpUrl !== location.origin + '/mcp') { throw new Error ('MCP access is unavailable here.'); }
        this.Disconnect (); this.instanceId = crypto.randomUUID (); this.accountId = owner; this.screenshots = screenshots; this.windowCode = windowCode; this.status = 'Connecting'; const generation = this.generation;
        const socket = new WebSocket (location.origin.replace ('https:', 'wss:') + '/api/agent/connect'); this.socket = socket;
        socket.addEventListener ('message', event => { this.Message (event, socket, generation).catch (() => this.Disconnect ()); });
        socket.addEventListener ('close', () => { if (this.socket === socket) { this.Disconnect (); } });
        await new Promise ((resolve, reject) => {
            this.handshakeTimer = setTimeout (() => { this.Disconnect (); reject (new Error ('Connection timed out.')); }, 15000);
            socket.addEventListener ('error', () => { clearTimeout (this.handshakeTimer); reject (new Error ('Connection failed.')); }, { once : true });
            socket.addEventListener ('close', () => { clearTimeout (this.handshakeTimer); reject (new Error ('Connection ended.')); }, { once : true });
            socket.addEventListener ('open', () => {
                if (this.Account () !== owner || generation !== this.generation) { reject (new Error ('Account changed.')); return; }
                socket.send (JSON.stringify ({ type : 'hello', instanceId : this.instanceId, windowLabel : 'Auto3D window ' + this.instanceId.slice (0, 8), windowCode, sessions : this.Sessions () }));
            }, { once : true });
            this.onReady = () => { clearTimeout (this.handshakeTimer); resolve (); };
        });
        this.poll = setInterval (() => {
            try {
                if (this.Account () !== owner || generation !== this.generation) { this.Disconnect (); return; }
                socket.send (JSON.stringify ({ type : 'sessions', instanceId : this.instanceId, sessions : this.Sessions () }));
            } catch { this.Disconnect (); }
        }, 1000);
        this.renew = setInterval (() => { this.Request ('renew', { connectionId : this.connectionId, instanceId : this.instanceId }).catch (() => this.Disconnect ()); }, 60000);
        return { ...this.Inspect (), windowCode };
    }
    async Message (event, socket, generation)
    {
        if (typeof event.data !== 'string' || event.data.length > 65536 || generation !== this.generation || this.Account () !== this.accountId) { throw new Error ('Stale connection.'); }
        const message = JSON.parse (event.data);
        if (message.type === 'hello_ack') { this.connectionId = message.connectionId; this.status = 'Connected'; this.onReady?.(); return; }
        if (message.type === 'access_changed') { return; }
        const current = this.website.sessionEditor.sessions.active;
        const revision = this.website.sessionEditor.sessions.revision;
        const allowed = () => generation === this.generation && socket === this.socket && this.Account () === this.accountId && this.website.sessionEditor.sessions.active === current && this.website.sessionEditor.sessions.revision === revision && !this.website.sessionEditor.sessions.switching;
        if (message.type !== 'request' || message.sessionId !== current || !ReadTools.includes (message.command) || message.command === 'capture.image' && !this.screenshots) { throw new Error ('Request not allowed.'); }
        const metadata = this.website.commands.Catalog ().find (tool => tool.id === message.command);
        if (!metadata || metadata.mutates) { throw new Error ('Tool unavailable.'); }
        // Guard inside the registry queue, immediately before execution, and after it.
        const result = await this.website.commands.Queue (async () => {
            if (!allowed ()) { throw new Error ('Session changed.'); }
            const result = await this.website.commands.Invoke (message.command, message.arguments);
            if (!allowed ()) { throw new Error ('Session changed.'); }
            return { ok : true, command : message.command, result };
        });
        if (!allowed ()) { throw new Error ('Session changed.'); }
        const output = JSON.stringify ({ type : 'result', requestId : message.requestId, sessionId : current, result });
        if (output.length > (message.command === 'capture.image' ? 2050000 : 65536)) { socket.send (JSON.stringify ({ type : 'result', requestId : message.requestId, sessionId : current, error : true })); return; }
        socket.send (output);
    }
    async Open ()
    {
        const config = await this.Request ('config'), dialog = WorkspaceDialog ('Agent access'); dialog.dataset.capturePrivate = '';
        const form = document.createElement ('div'); form.className = 'workspace_save_form';
        const note = document.createElement ('p'); note.textContent = (config.mode === 'live-admin' ? 'Administrator live test · ' : 'Staging pilot · ') + 'Connect your OAuth client to ' + config.mcpUrl + '. Copy this window code into the Auto3D authorization page to pair automatically; without it, select a session from the agent. Remote tools can inspect; screenshots require permission here and in OAuth.';
        const codeLabel = document.createElement ('label'); codeLabel.textContent = 'App window code ';
        const code = document.createElement ('input'); code.readOnly = true; code.autocomplete = 'off'; code.placeholder = 'Connect this window to generate a code'; code.value = this.windowCode || ''; code.setAttribute ('aria-label', 'App window code'); codeLabel.appendChild (code); this.codeInput = code;
        const copy = document.createElement ('button'); copy.type = 'button'; copy.textContent = 'Copy'; copy.disabled = !this.windowCode; this.copyButton = copy;
        const captureLabel = document.createElement ('label'), capture = document.createElement ('input'); capture.type = 'checkbox'; captureLabel.append (capture, 'Allow screenshots from this window');
        const status = document.createElement ('p'); status.setAttribute ('role', 'status'); status.textContent = this.status; this.statusElement = status;
        const connect = document.createElement ('button'); connect.textContent = 'Connect this window'; connect.onclick = () => { this.Connect ({ screenshots : capture.checked }).then (result => { code.value = result.windowCode; copy.disabled = false; status.textContent = 'Connected. Copy this code into the Auto3D authorization page. It expires in 10 minutes and can be used once.'; }).catch (error => { this.Disconnect (); code.value = ''; copy.disabled = true; status.textContent = error.message; }); };
        copy.onclick = async () => {
            try { await navigator.clipboard.writeText (code.value); status.textContent = 'Window code copied.'; }
            catch { code.select (); status.textContent = 'Clipboard unavailable. The code is selected; copy it manually.'; }
        };
        const disconnect = document.createElement ('button'); disconnect.textContent = 'Disconnect'; disconnect.onclick = () => { this.Disconnect (); status.textContent = this.status; };
        const list = document.createElement ('div');
        const refresh = async () => {
            const result = await this.Request ('registrations'); list.replaceChildren ();
            for (const record of result.registrations) {
                const row = document.createElement ('p'); row.textContent = record.name + ' · ' + record.harness + ' · ' + (record.revokedAt !== null ? 'Revoked' : record.expiresAt <= Date.now () ? 'Expired' : 'Active');
                if (record.revokedAt === null && record.expiresAt > Date.now ()) { const revoke = document.createElement ('button'); revoke.textContent = 'Revoke'; revoke.onclick = () => { this.Request ('registrations', { action : 'revoke', id : record.id }).then (refresh).catch (error => { status.textContent = error.message; }); }; row.appendChild (revoke); } list.appendChild (row);
            }
        };
        form.append (note, codeLabel, copy, captureLabel, connect, disconnect, status, list); dialog.appendChild (form); await refresh (); return { opened : true };
    }
    async OpenAdmin ()
    {
        await this.Request ('config');
        const dialog = WorkspaceDialog ('Agent administration'); dialog.dataset.capturePrivate = '';
        const form = document.createElement ('div'); form.className = 'workspace_save_form';
        const account = document.createElement ('input'); account.placeholder = 'Pilot account ID'; account.setAttribute ('aria-label', 'Pilot account ID');
        const status = document.createElement ('p'); status.setAttribute ('role', 'status');
        const list = document.createElement ('div');
        const refresh = async () => {
            const data = await this.Request ('admin?accountId=' + encodeURIComponent (account.value)); list.replaceChildren (); status.textContent = data.disabled ? 'Agent access disabled' : 'Agent access enabled';
            for (const record of data.registrations) {
                const row = document.createElement ('p'); row.textContent = record.name + ' · ' + record.harness + ' · ' + (record.revokedAt !== null ? 'Revoked' : 'Expires ' + new Date (record.expiresAt).toLocaleString ());
                if (record.revokedAt === null) { const revoke = document.createElement ('button'); revoke.textContent = 'Revoke'; revoke.onclick = () => run (async () => { await this.Request ('admin', { accountId : account.value, id : record.id, action : 'revoke' }); await refresh (); }); row.appendChild (revoke); } list.appendChild (row);
            }
        };
        const run = action => { Promise.resolve ().then (action).catch (error => { status.textContent = error.message; }); };
        const inspect = document.createElement ('button'); inspect.textContent = 'Inspect account'; inspect.onclick = () => run (refresh);
        form.append (account, inspect);
        for (const [label, disabled] of [['Disable agent access and revoke registrations', true], ['Re-enable agent access', false]]) { const button = document.createElement ('button'); button.textContent = label; button.onclick = () => run (async () => { await this.Request ('admin', { accountId : account.value, action : 'disable', disabled }); await refresh (); }); form.appendChild (button); }
        form.append (status, list); dialog.appendChild (form); return { opened : true };
    }
}
