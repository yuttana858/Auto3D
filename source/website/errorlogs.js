export function RedactLogText (value)
{
    const sanitized = String (value ?? '').replace (/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]');
    return sanitized.replace (/data:[^\s]+/gi, '[data omitted]').replace (/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g, '[token omitted]').replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, '[key omitted]').replace (/((?:password|passwd|authorization|cookie|api[_ -]?key|access[_ -]?token|refresh[_ -]?token|secret)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1[redacted]').replace (/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]').replace (/https?:\/\/[^\s)]+/g, (url) => SafeLogPath (url)).slice (0, 1800);
}
export function SafeLogPath (url)
{
    try { return new URL (String (url), 'https://auto3d.invalid').pathname; } catch { return '[unknown resource]'; }
}
function ErrorText (error)
{
    if (typeof error === 'string') { return error; }
    if (error instanceof Error) { return error.name + ': ' + error.message; }
    return '[object details omitted]';
}
export class ErrorLogs
{
    constructor (environment, storage = null)
    {
        this.environment = environment; this.storage = storage; this.entries = []; this.listeners = new Set (); this.account = null; this.key = null; this.sequence = 0; this.everBound = false;
    }
    BindAccount (id)
    {
        if (id === this.account) { return; }
        const startup = !this.everBound && id ? [...this.entries] : [];
        if (id) { this.everBound = true; }
        if (this.key) { try { this.storage?.removeItem (this.key); } catch { /* Logging remains usable without storage. */ } }
        this.entries = []; this.account = id || null; this.key = id ? 'auto3d-error-log-v1:' + id : null;
        try { const saved = JSON.parse (this.storage?.getItem (this.key) || '[]'); if (Array.isArray (saved)) { for (const entry of saved.slice (-200)) { if (entry && ['error', 'warning', 'info'].includes (entry.level) && typeof entry.message === 'string') { this.entries.push ({ id : ++this.sequence, timestamp : typeof entry.timestamp === 'string' ? entry.timestamp.slice (0, 40) : '', level : entry.level, source : RedactLogText (entry.source), message : RedactLogText (entry.message), details : RedactLogText (entry.details), count : Number.isInteger (entry.count) ? Math.min (999, Math.max (1, entry.count)) : 1 }); } } } } catch { /* Ignore damaged or unavailable tab storage. */ }
        this.entries = [...this.entries, ...startup].slice (-200);
        this.Notify ();
    }
    Notify ()
    {
        if (this.key) { try { this.storage?.setItem (this.key, JSON.stringify (this.entries)); } catch { /* Memory logging continues. */ } }
        this.listeners.forEach ((listener) => { try { listener (); } catch { /* Diagnostics must not interrupt the app. */ } });
    }
    Record (level, source, message, details = '')
    {
        if (!['error', 'warning', 'info'].includes (level)) { return; }
        const next = { level, source : RedactLogText (source), message : RedactLogText (message), details : RedactLogText (details) };
        const last = this.entries.at (-1);
        if (last && last.level === next.level && last.source === next.source && last.message === next.message && last.details === next.details) { last.count = Math.min (999, last.count + 1); last.timestamp = new Date ().toISOString (); }
        else { this.entries.push ({ id : ++this.sequence, timestamp : new Date ().toISOString (), ...next, count : 1 }); this.entries = this.entries.slice (-200); }
        this.Notify ();
    }
    RecordShadow (diagnosis, message = 'Current shadow state')
    {
        this.Record (diagnosis.contextLost || diagnosis.shaderErrors.length || (diagnosis.meshes > 0 && diagnosis.visibleMeshes === 0) ? 'error' : 'info', 'shadows', message, JSON.stringify (diagnosis));
        return diagnosis;
    }
    List (level = 'all') { return { entries : this.entries.filter ((entry) => level === 'all' || entry.level === level).map ((entry) => ({ ...entry })), limit : 200 }; }
    Clear () { this.entries = []; this.Notify (); return { cleared : true }; }
    Export () { return { filename : 'auto3d-error-log.json', mime : 'application/json', text : JSON.stringify ({ version : 1, exportedAt : new Date ().toISOString (), browser : RedactLogText (this.environment.navigator?.userAgent), ...this.List () }, null, 2) }; }
    Download ()
    {
        const file = this.Export (); const url = URL.createObjectURL (new Blob ([file.text], { type : file.mime })); const link = document.createElement ('a'); link.href = url; link.download = file.filename; link.click (); window.setTimeout (() => URL.revokeObjectURL (url), 1000); return { filename : file.filename, entries : this.entries.length };
    }
    Install ()
    {
        const environment = this.environment;
        this.onError = (event) => { if (event.error || event.message) { this.Record ('error', 'runtime', event.message || ErrorText (event.error), event.error?.stack || ''); } else { const target = event.target; if (target?.src || target?.href) { this.Record ('error', 'resource', 'Could not load ' + SafeLogPath (target.src || target.href)); } } };
        this.onRejection = (event) => this.Record ('error', 'promise', ErrorText (event.reason), event.reason instanceof Error ? event.reason.stack : '');
        this.onContextLost = () => this.Record ('error', 'WebGL', 'Rendering context lost. Save work and reload the app.');
        environment.addEventListener ('error', this.onError, true); environment.addEventListener ('unhandledrejection', this.onRejection); environment.document?.addEventListener ('webglcontextlost', this.onContextLost, true);
        this.originalFetch = environment.fetch;
        this.wrappedFetch = async (...args) => {
            const resource = SafeLogPath (typeof args[0] === 'string' || args[0] instanceof URL ? args[0] : args[0]?.url);
            try { const response = await this.originalFetch.apply (environment, args); if (!response.ok && !(resource === '/api/auth/session' && response.status === 401)) { this.Record ('error', 'request', 'HTTP ' + response.status + ' ' + resource); } return response; }
            catch (error) { this.Record ('error', 'request', 'Request failed ' + resource, ErrorText (error)); throw error; }
        };
        environment.fetch = this.wrappedFetch;
        this.originalConsole = {};
        for (const method of ['error', 'warn']) {
            this.originalConsole[method] = environment.console[method];
            environment.console[method] = (...args) => { this.originalConsole[method].apply (environment.console, args); this.Record (method === 'error' ? 'error' : 'warning', 'console', args.map (ErrorText).join (' ')); };
        }
        return this;
    }
}
