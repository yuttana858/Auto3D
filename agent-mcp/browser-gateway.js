// Only bind this gateway on the app's HTTPS origin through private bindings.
const AccountId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const InstanceId = /^[A-Za-z0-9_-]{1,128}$/;
const Fingerprint = /^[0-9a-f]{64}$/;
async function ReadRenewal (request)
{
    if (!/^application\/json(?:\s*;|$)/i.test (request.headers.get ('Content-Type') || '') || Number (request.headers.get ('Content-Length')) > 1024 || !request.body) { throw new Error ('Invalid request.'); }
    const reader = request.body.getReader (); let size = 0, text = ''; const decoder = new TextDecoder ();
    try { let done = false; while (!done) { const part = await reader.read (); done = part.done; if (done) { break; } size += part.value.byteLength; if (size > 1024) { await reader.cancel (); throw new Error ('Invalid request.'); } text += decoder.decode (part.value, { stream : true }); } text += decoder.decode (); } finally { reader.releaseLock (); }
    const data = JSON.parse (text); if (!data || typeof data !== 'object' || Array.isArray (data) || Object.keys (data).sort ().join (',') !== 'connectionId,instanceId' || typeof data.connectionId !== 'string' || !InstanceId.test (data.connectionId) || typeof data.instanceId !== 'string' || !InstanceId.test (data.instanceId)) { throw new Error ('Invalid request.'); } return data;
}
export function CreateBrowserGateway ({ namespace, verifiedUser, now = () => Date.now () })
{
    if (!namespace || typeof namespace.getByName !== 'function' || typeof verifiedUser !== 'function') { throw new Error ('Gateway configuration is required.'); }
    return async request => {
        const url = new URL (request.url); const connect = url.pathname === '/api/agent/connect' && request.method === 'GET'; const renew = url.pathname === '/api/agent/renew' && request.method === 'POST';
        if (url.protocol !== 'https:' || (!connect && !renew) || url.search || request.headers.get ('Origin') !== url.origin) { return new Response ('Invalid connection.', { status : 403 }); }
        if (connect && (request.headers.get ('Upgrade') || '').toLowerCase () !== 'websocket') { return new Response ('WebSocket upgrade required.', { status : 426 }); }
        let user; try { user = await verifiedUser (request); } catch { return new Response ('Sign-in service unavailable.', { status : 503 }); }
        if (typeof user?.id !== 'string' || !AccountId.test (user.id) || typeof user.sessionFingerprint !== 'string' || !Fingerprint.test (user.sessionFingerprint)) { return new Response ('Sign in to connect.', { status : 401 }); }
        if (renew) {
            if (request.headers.get ('X-Auto3D-Account') !== user.id) { return new Response ('Account changed.', { status : 409 }); }
            try { const data = await ReadRenewal (request); const expiresAt = now () + 5 * 60 * 1000; await namespace.getByName (user.id).Renew ({ accountId : user.id, sessionFingerprint : user.sessionFingerprint, ...data, expiresAt }); return Response.json ({ expiresAt }, { headers : { 'Cache-Control' : 'no-store' } }); }
            catch { return new Response ('Connection unavailable.', { status : 409, headers : { 'Cache-Control' : 'no-store' } }); }
        }
        const headers = new Headers ({ Upgrade : 'websocket', 'X-Auto3D-Verified-Account' : user.id, 'X-Auto3D-Verified-Session' : user.sessionFingerprint, 'X-Auto3D-Connection-Expires' : String (now () + 5 * 60 * 1000) });
        return namespace.getByName (user.id).fetch (new Request ('https://broker.internal/connect', { headers }));
    };
}
