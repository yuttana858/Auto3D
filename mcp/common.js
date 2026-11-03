export const ReadTools = Object.freeze (['scene.inspect', 'camera.current.inspect', 'packaging.measurements.inspect', 'render.queue.inspect', 'session.tabs.inspect', 'capture.image']);
export const Scopes = Object.freeze (['auto3d.read', 'auto3d.capture', 'offline_access']);
export function LiveMcpPath (pathname)
{
    return pathname === '/mcp' || pathname.startsWith ('/oauth/') || ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-authorization-server/oauth', '/api/agent/config', '/api/agent/connect', '/api/agent/renew', '/api/agent/registrations', '/api/agent/admin'].includes (pathname);
}
export function Identifier (value)
{
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test (value)) { throw new Error ('Invalid identifier.'); }
    return value;
}
export function AgentName (value)
{
    if (typeof value !== 'string' || !value.trim () || value.length > 80 || [...value].some (char => { const code = char.codePointAt (0); return code < 32 || code >= 127 && code <= 159 || code === 8206 || code === 8207 || code >= 8234 && code <= 8238 || code >= 8294 && code <= 8297; })) { throw new Error ('Use a name of 1–80 visible characters.'); }
    return value.trim ();
}
export function ValidScopes (scopes)
{
    return Array.isArray (scopes) && scopes.includes ('auto3d.read') && scopes.length <= Scopes.length && new Set (scopes).size === scopes.length && scopes.every (scope => Scopes.includes (scope));
}
export function Json (data, status = 200)
{
    return Response.json (data, { status, headers : { 'Cache-Control' : 'no-store', 'X-Content-Type-Options' : 'nosniff' } });
}
export async function ReadBytes (request, limit)
{
    if (Number (request.headers.get ('Content-Length')) > limit) { throw new Error ('Request too large.'); }
    const reader = request.body?.getReader (); if (!reader) { return new Uint8Array (); }
    let length = 0; const chunks = [];
    try {
        for (;;) {
            const chunk = await reader.read (); if (chunk.done) { break; }
            length += chunk.value.byteLength;
            if (length > limit) { await reader.cancel (); throw new Error ('Request too large.'); }
            chunks.push (chunk.value);
        }
    } finally { reader.releaseLock (); }
    const bytes = new Uint8Array (length); let offset = 0;
    for (const chunk of chunks) { bytes.set (chunk, offset); offset += chunk.length; }
    return bytes;
}
export async function ReadJson (request, limit = 4096)
{
    if (!/^application\/json(?:\s*;|$)/i.test (request.headers.get ('Content-Type') || '')) { throw new Error ('Use JSON.'); }
    const body = JSON.parse (new TextDecoder ().decode (await ReadBytes (request, limit)));
    if (!body || typeof body !== 'object' || Array.isArray (body)) { throw new Error ('Use an object.'); }
    return body;
}
export function PilotConfig (env)
{
    if (env.AUTO3D_MCP_LIVE_ADMIN === '1') {
        const origin = 'https://auto3d-5av.pages.dev';
        const accounts = String (env.AUTO3D_MCP_LIVE_ACCOUNTS || '').split (',').map (id => id.trim ()).filter (Boolean);
        const identity = String (env.SUPABASE_URL || '').trim ().replace (/\/$/, '');
        if (env.AUTO3D_MCP_PILOT === '1' || env.AUTO3D_MCP_ORIGIN !== origin || !accounts.length || accounts.some (id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test (id)) || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test (identity) || identity !== env.AUTO3D_MCP_PRODUCTION_SUPABASE_URL) { throw new Error ('Live administrator MCP configuration is incomplete.'); }
        return { mode : 'live-admin', origin, issuer : origin + '/oauth', resource : origin + '/mcp', accounts };
    }
    const origin = 'https://auto3d-mcp-pilot.pages.dev';
    if (env.AUTO3D_MCP_PILOT !== '1' || env.AUTO3D_MCP_ORIGIN !== origin) { throw new Error ('MCP pilot is disabled.'); }
    const accounts = String (env.AUTO3D_MCP_PILOT_ACCOUNTS || '').split (',').map (id => id.trim ()).filter (Boolean);
    if (!accounts.length || accounts.some (id => !/^[0-9a-f-]{36}$/i.test (id))) { throw new Error ('Pilot accounts are not configured.'); }
    const staging = String (env.AUTO3D_MCP_STAGING_SUPABASE_URL || '').replace (/\/$/, ''), production = String (env.AUTO3D_MCP_PRODUCTION_SUPABASE_URL || '').replace (/\/$/, '');
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test (staging) || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test (production) || staging === production || String (env.SUPABASE_URL || '').replace (/\/$/, '') !== staging) { throw new Error ('Separate staging identity configuration required.'); }
    return { mode : 'staging', origin, issuer : origin + '/oauth', resource : origin + '/mcp', accounts };
}
export function PilotAccount (env, accountId)
{
    if (!PilotConfig (env).accounts.includes (accountId)) { throw new Error ('This account is not enrolled in the pilot.'); }
}
