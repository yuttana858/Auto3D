const AccountId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GrantId = /^[A-Za-z0-9_-]{1,128}$/;
function ResponseJson (body, status = 200) { return Response.json (body, { status, headers : { 'Cache-Control' : 'no-store', 'X-Content-Type-Options' : 'nosniff' } }); }
async function ReadSmallJson (request)
{
    if (!/^application\/json(?:\s*;|$)/i.test (request.headers.get ('Content-Type') || '') || Number (request.headers.get ('Content-Length')) > 2048 || !request.body) { throw new Error ('Invalid request.'); }
    const reader = request.body.getReader (); let size = 0, text = ''; const decoder = new TextDecoder ();
    try { let done = false; while (!done) { const part = await reader.read (); done = part.done; if (done) { break; } size += part.value.byteLength; if (size > 2048) { await reader.cancel (); throw new Error ('Invalid request.'); } text += decoder.decode (part.value, { stream : true }); } text += decoder.decode (); } finally { reader.releaseLock (); }
    return JSON.parse (text);
}

// This handler is same-origin and requires the existing verified browser login.
// The OAuth provider receives only the verified account ID, never a form value.
export function CreateGrantHandler ({ oauth, verifiedUser })
{
    if (!oauth || typeof verifiedUser !== 'function') { throw new Error ('Grant service configuration required.'); }
    return async request => {
        try {
            const url = new URL (request.url); if (url.protocol !== 'https:') { return ResponseJson ({ error : 'Secure connection required.' }, 400); }
            if (request.method !== 'GET' && request.method !== 'POST') { return ResponseJson ({ error : 'Method not allowed.' }, 405); }
            if (request.method === 'POST' && request.headers.get ('Origin') !== url.origin) { return ResponseJson ({ error : 'Invalid origin.' }, 403); }
            const user = await verifiedUser (request); if (typeof user?.id !== 'string' || !AccountId.test (user.id)) { return ResponseJson ({ error : 'Sign in to manage agent access.' }, 401); }
            if (request.headers.get ('X-Auto3D-Account') !== user.id) { return ResponseJson ({ error : 'Account changed. Refresh and try again.' }, 409); }
            if (request.method === 'GET' && url.pathname.endsWith ('/grants')) {
                const cursor = url.searchParams.get ('cursor'); if ([...url.searchParams.keys ()].some (key => key !== 'cursor') || url.searchParams.getAll ('cursor').length > 1 || cursor && cursor.length > 512) { return ResponseJson ({ error : 'Invalid page.' }, 400); }
                const page = await oauth.listUserGrants (user.id, { limit : 50, ...(cursor ? { cursor } : {}) });
                const items = (page.items || []).filter (grant => grant.userId === user.id && typeof grant.id === 'string' && GrantId.test (grant.id)).map (grant => ({ id : grant.id, clientId : typeof grant.clientId === 'string' ? grant.clientId.slice (0, 500) : '', scope : Array.isArray (grant.scope) ? grant.scope.filter (scope => ['auto3d.read', 'auto3d.capture', 'offline_access'].includes (scope)) : [], createdAt : grant.createdAt, expiresAt : grant.expiresAt || null }));
                return ResponseJson ({ grants : items, cursor : page.cursor || null });
            }
            if (request.method === 'POST' && url.pathname.endsWith ('/grants/revoke') && !url.search) {
                const body = await ReadSmallJson (request); if (!body || typeof body !== 'object' || Array.isArray (body) || Object.keys (body).length !== 1 || typeof body.id !== 'string' || !GrantId.test (body.id)) { return ResponseJson ({ error : 'Invalid grant.' }, 400); }
                await oauth.revokeGrant (body.id, user.id); return ResponseJson ({ revoked : true });
            }
            return ResponseJson ({ error : 'Not found.' }, 404);
        } catch { return ResponseJson ({ error : 'Agent access could not be updated.' }, 503); }
    };
}
