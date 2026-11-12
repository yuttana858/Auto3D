import { WorkspaceDialog } from './modellibrary.js';
import { ReadTools } from '../../mcp/common.js';

const WindowCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function CreateWindowCode ()
{
    const bytes = crypto.getRandomValues (new Uint8Array (16));
    return [...bytes].map (byte => WindowCodeAlphabet[byte & 31]).join ('').match (/.{4}/g).join ('-');
}

const TabCommands = /^session\.tabs\.(?:new|switch|close)$/;
const ResultLimit = 65536, CaptureLimit = 2050000;
function Coded (code, message) { return Object.assign (new Error (message), { agentCode : code }); }
// Map a failure to the bridge's structured result without disclosing stack traces.
export function AgentFailure (error)
{
    const message = String (error?.message || 'The command failed.').slice (0, 300);
    if (error?.agentCode) { return { code : error.agentCode, message }; }
    if (/^(?:arguments\b|Unknown argument)/.test (message)) { return { code : 'invalid_arguments', message }; }
    if (/^Unknown command/.test (message)) { return { code : 'unknown_command', message }; }
    if (/read-only/i.test (message)) { return { code : 'permission_required', message }; }
    return { code : 'command_failed', message };
}
// Large inspect results are shortened by trimming their largest list, never silently dropped.
export function FitResult (payload, limit)
{
    if (JSON.stringify (payload).length <= limit) { return payload; }
    const copy = structuredClone (payload);
    const arrays = [];
    const visit = (value, path, depth) => {
        if (!value || typeof value !== 'object' || depth > 4) { return; }
        if (Array.isArray (value)) { arrays.push ({ value, path }); value.forEach ((item, index) => visit (item, path + '[' + index + ']', depth + 1)); return; }
        for (const [key, item] of Object.entries (value)) { visit (item, path ? path + '.' + key : key, depth + 1); }
    };
    visit (copy.result, '', 0);
    arrays.sort ((left, right) => JSON.stringify (right.value).length - JSON.stringify (left.value).length);
    const largest = arrays[0];
    if (!largest) { throw Coded ('result_too_large', 'The result exceeds the transfer limit and cannot be shortened.'); }
    const total = largest.value.length;
    let keep = total;
    while (keep > 0) {
        keep = Math.floor (keep / 2); largest.value.length = keep;
        copy.truncated = { path : largest.path || '(root)', returned : keep, total, note : 'Result shortened to fit the transfer limit. Use a narrower inspect command or an ID filter for the remaining items.' };
        if (JSON.stringify (copy).length <= limit) { return copy; }
    }
    throw Coded ('result_too_large', 'The result exceeds the transfer limit even after shortening.');
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
        this.website = website; this.socket = null; this.instanceId = crypto.randomUUID (); this.generation = 0; this.status = 'Disconnected'; this.codeInput = null; this.copyButton = null; this.statusElement = null; this.reconnectEnabled = false; this.reconnectAttempts = 0; this.allowSelect = false; this.running = new Map ();
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
    SetScreenshots (allowed)
    {
        if (typeof allowed !== 'boolean') { throw new Error ('Invalid screenshot preference.'); }
        this.screenshots = allowed; return { screenshots : allowed, connected : this.socket?.readyState === 1 };
    }
    Inspect () { return { status : this.status, connected : this.socket?.readyState === 1, screenshots : this.screenshots === true, allowSelect : this.allowSelect === true, connectionId : this.connectionId || null }; }
    Sessions () { return this.website.sessionEditor.sessions.Inspect ().tabs.map (tab => ({ id : tab.id, name : tab.name.slice (0, 100), active : tab.active })); }
    Disconnect ({ preserveRetry = false } = {})
    {
        if (!preserveRetry) { this.reconnectEnabled = false; this.reconnectAttempts = 0; }
        clearTimeout (this.reconnectTimer); this.reconnectTimer = null;
        this.generation++; clearInterval (this.poll); clearInterval (this.renew); clearTimeout (this.handshakeTimer); this.socket?.close (); this.socket = null; this.connectionId = null; this.windowCode = null;
        if (this.codeInput) { this.codeInput.value = ''; } if (this.copyButton) { this.copyButton.disabled = true; }
        this.status = 'Disconnected'; if (this.statusElement) { this.statusElement.textContent = this.status; } return this.Inspect ();
    }
    ConnectionLost ()
    {
        const retry = this.reconnectEnabled, owner = this.accountId, screenshots = this.screenshots, allowSelect = this.allowSelect, attempts = this.reconnectAttempts;
        this.Disconnect ();
        if (!retry || !owner || this.website.auth?.user?.id !== owner) { return; }
        this.reconnectEnabled = true; this.reconnectAttempts = attempts; this.ScheduleReconnect (owner, screenshots, allowSelect);
    }
    ScheduleReconnect (owner, screenshots, allowSelect = true)
    {
        if (!this.reconnectEnabled || this.reconnectTimer) { return; }
        const delay = Math.min (30000, 1000 * 2 ** Math.min (this.reconnectAttempts++, 5));
        this.status = 'Reconnecting'; if (this.statusElement) { this.statusElement.textContent = this.status; }
        this.reconnectTimer = setTimeout (async () => {
            this.reconnectTimer = null;
            if (!this.reconnectEnabled || this.website.auth?.user?.id !== owner) { this.Disconnect (); return; }
            try { await this.Connect ({ screenshots, allowSelect, retry : true }); }
            catch { if (this.reconnectEnabled && this.website.auth?.user?.id === owner) { this.ScheduleReconnect (owner, screenshots, allowSelect); } }
        }, delay);
    }
    async Connect ({ screenshots = false, allowSelect = true, retry = false } = {})
    {
        if (typeof screenshots !== 'boolean' || typeof allowSelect !== 'boolean') { throw new Error ('Invalid connection preference.'); }
        const initialGeneration = this.generation;
        const windowCode = CreateWindowCode ();
        const owner = this.Account (), config = await this.Request ('config');
        if (retry && (!this.reconnectEnabled || this.generation !== initialGeneration)) { throw new Error ('Reconnect cancelled.'); }
        if (!config.pilot || !['https://auto3d-mcp-pilot.pages.dev', 'https://auto3d-5av.pages.dev'].includes (location.origin) || config.mcpUrl !== location.origin + '/mcp') { throw new Error ('MCP access is unavailable here.'); }
        // A reconnect keeps the window identity so an existing pairing resumes.
        this.Disconnect ({ preserveRetry : retry }); if (!retry) { this.instanceId = crypto.randomUUID (); } this.accountId = owner; this.screenshots = screenshots; this.allowSelect = allowSelect; this.windowCode = windowCode; this.status = 'Connecting'; const generation = this.generation;
        const socket = new WebSocket (location.origin.replace ('https:', 'wss:') + '/api/agent/connect'); this.socket = socket;
        // Only protocol violations end the connection; command failures are returned as results.
        socket.addEventListener ('message', event => { this.Message (event, socket, generation).catch (() => { if (this.socket === socket) { this.ConnectionLost (); } }); });
        socket.addEventListener ('close', () => { if (this.socket === socket) { this.ConnectionLost (); } });
        await new Promise ((resolve, reject) => {
            this.handshakeTimer = setTimeout (() => { this.Disconnect (); reject (new Error ('Connection timed out.')); }, 15000);
            socket.addEventListener ('error', () => { clearTimeout (this.handshakeTimer); reject (new Error ('Connection failed.')); }, { once : true });
            socket.addEventListener ('close', () => { clearTimeout (this.handshakeTimer); reject (new Error ('Connection ended.')); }, { once : true });
            socket.addEventListener ('open', () => {
                if (this.Account () !== owner || generation !== this.generation) { reject (new Error ('Account changed.')); return; }
                socket.send (JSON.stringify ({ type : 'hello', instanceId : this.instanceId, windowLabel : 'Auto3D window ' + this.instanceId.slice (0, 8), windowCode, allowSelect, sessions : this.Sessions () }));
            }, { once : true });
            this.onReady = () => { clearTimeout (this.handshakeTimer); resolve (); };
        });
        this.poll = setInterval (() => {
            try {
                if (this.Account () !== owner || generation !== this.generation) { this.Disconnect (); return; }
                socket.send (JSON.stringify ({ type : 'sessions', instanceId : this.instanceId, sessions : this.Sessions () }));
            } catch { this.ConnectionLost (); }
        }, 1000);
        this.renew = setInterval (() => { this.Request ('renew', { connectionId : this.connectionId, instanceId : this.instanceId }).catch (() => this.ConnectionLost ()); }, 60000);
        this.reconnectEnabled = true; this.reconnectAttempts = 0;
        if (this.codeInput) { this.codeInput.value = windowCode; } if (this.copyButton) { this.copyButton.disabled = false; }
        if (this.statusElement) { this.statusElement.textContent = retry ? 'Reconnected. Existing agent pairings resume; a new code is available for new agents.' : 'Connected'; }
        return { ...this.Inspect (), windowCode };
    }
    async Message (event, socket, generation)
    {
        if (typeof event.data !== 'string' || event.data.length > 65536 || generation !== this.generation || this.Account () !== this.accountId) { throw new Error ('Stale connection.'); }
        const message = JSON.parse (event.data);
        if (message.type === 'hello_ack') { this.connectionId = message.connectionId; this.status = 'Connected'; this.onReady?.(); return; }
        if (message.type === 'access_changed') { return; }
        if (message.type === 'cancel') { if (this.running.get (message.requestId) === 'commands.text') { this.website.commands.Cancel (); } return; }
        if (message.type !== 'request' || typeof message.requestId !== 'string' || typeof message.sessionId !== 'string') { throw new Error ('Invalid message.'); }
        const reply = payload => {
            if (generation !== this.generation || socket !== this.socket) { return; }
            socket.send (JSON.stringify ({ type : 'result', requestId : message.requestId, sessionId : message.sessionId, ...payload }));
        };
        this.running.set (message.requestId, message.command);
        try {
            const result = await this.Execute (message, socket, generation);
            if (TabCommands.test (message.command)) {
                // Advertise the new tab first so the broker can move this agent's pairing to it.
                socket.send (JSON.stringify ({ type : 'sessions', instanceId : this.instanceId, sessions : this.Sessions () }));
                result.activeSessionId = this.website.sessionEditor.sessions.active;
            }
            reply ({ result : FitResult (result, (message.command === 'capture.image' ? CaptureLimit : ResultLimit) - 512) });
        } catch (error) { reply ({ error : AgentFailure (error) }); }
        finally { this.running.delete (message.requestId); }
    }
    async Execute (message, socket, generation)
    {
        const current = this.website.sessionEditor.sessions.active;
        const revision = this.website.sessionEditor.sessions.revision;
        const tabCommand = TabCommands.test (message.command);
        const connected = () => generation === this.generation && socket === this.socket && this.Account () === this.accountId;
        // Tab commands legitimately change the active tab; everything else must not see a tab change.
        const allowed = () => connected () && (tabCommand || this.website.sessionEditor.sessions.active === current && this.website.sessionEditor.sessions.revision === revision && !this.website.sessionEditor.sessions.switching);
        if (message.sessionId !== current) { throw Coded ('session_changed', 'The paired tab is not active in this window.'); }
        if (!ReadTools.includes (message.command) && message.writeAuthorized !== true) { throw Coded ('permission_required', 'Write permission required.'); }
        if (message.command === 'capture.image' && !this.screenshots) { throw Coded ('permission_required', 'Screenshots are not allowed for this window. Enable them in Agent access.'); }
        const metadata = this.website.commands.Catalog ().find (tool => tool.id === message.command);
        if (!metadata) { throw Coded ('unknown_command', 'Tool unavailable.'); }
        // Cancellation must not wait behind the macro it cancels.
        if (message.command === 'macro.cancel') { return { ok : true, command : message.command, result : await this.website.commands.Invoke (message.command, message.arguments) }; }
        // Guard inside the registry queue, immediately before execution, and after it.
        const result = await this.website.commands.Queue (async () => {
            if (!allowed ()) { throw Coded ('session_changed', 'Session changed.'); }
            const value = await this.website.commands.Invoke (message.command, message.arguments);
            if (!allowed ()) { throw Coded ('session_changed', 'Session changed while the command ran. Inspect before retrying.'); }
            return { ok : true, command : message.command, result : value };
        });
        if (!allowed ()) { throw Coded ('session_changed', 'Session changed while the command ran. Inspect before retrying.'); }
        return result;
    }
    async Open ()
    {
        await this.Request ('config');
        const dialog = WorkspaceDialog ('MCP connections'); dialog.dataset.capturePrivate = '';
        const form = document.createElement ('div'); form.className = 'workspace_save_form';
        const captureLabel = document.createElement ('label'), capture = document.createElement ('input'); capture.type = 'checkbox'; capture.checked = this.screenshots === true; captureLabel.append (capture, 'Allow screenshots from this window');
        // Applies at once to the live connection (the screenshot gate runs in this window), and to the next Live Control.
        capture.addEventListener ('change', () => { this.SetScreenshots (capture.checked); });
        const status = document.createElement ('p'); status.setAttribute ('role', 'status'); status.textContent = this.status; this.statusElement = status;
        const connect = document.createElement ('button'); connect.textContent = 'Live Control'; connect.onclick = () => { this.Connect ({ screenshots : capture.checked }).then (() => { status.textContent = 'Connected'; }).catch (error => { this.Disconnect (); status.textContent = error.message; }); };
        const disconnect = document.createElement ('button'); disconnect.textContent = 'Disconnect'; disconnect.onclick = () => { this.Disconnect (); status.textContent = this.status; };
        const list = document.createElement ('div');
        const refresh = async () => {
            const result = await this.Request ('registrations'); list.replaceChildren ();
            // Only active connections are listed; revoked and expired ones cannot be used again.
            const active = result.registrations.filter (record => record.revokedAt === null && record.expiresAt > Date.now ());
            if (!active.length) { const empty = document.createElement ('p'); empty.textContent = 'No active connections.'; list.appendChild (empty); }
            for (const record of active) {
                const row = document.createElement ('p'); row.textContent = record.name + ' · Active';
                { const revoke = document.createElement ('button'); revoke.textContent = 'Revoke'; revoke.onclick = () => { this.Request ('registrations', { action : 'revoke', id : record.id }).then (refresh).catch (error => { status.textContent = error.message; }); }; row.appendChild (revoke); } list.appendChild (row);
            }
        };
        form.append (captureLabel, connect, disconnect, status, list); dialog.appendChild (form); await refresh (); return { opened : true };
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
                const row = document.createElement ('p'); row.textContent = record.name + ' · ' + (record.revokedAt !== null ? 'Revoked' : 'Expires ' + new Date (record.expiresAt).toLocaleString ());
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
