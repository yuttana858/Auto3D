import { AgentLabel } from './agent-label.js';

// Consent integration boundary. The caller supplies the official OAuth helper
// and the verified Auto3D browser identity; this is not a public endpoint.
const Scope = 'auto3d.read';
const CaptureScope = 'auto3d.capture';
const ValidScopes = scopes => Array.isArray (scopes) && scopes.includes (Scope) && scopes.length <= 3 && new Set (scopes).size === scopes.length && scopes.every (scope => [Scope, CaptureScope, 'offline_access'].includes (scope));
const AccountId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const Escape = value => String (value).replace (/[&<>"']/g, char => ({ '&' : '&amp;', '<' : '&lt;', '>' : '&gt;', '"' : '&quot;', '\'' : '&#39;' })[char]);
const Bytes = value => new TextEncoder ().encode (value);
const Encode = bytes => btoa (String.fromCharCode (...bytes)).replace (/\+/g, '-').replace (/\//g, '_').replace (/=+$/, '');
function Decode (value)
{
    if (!/^[A-Za-z0-9_-]{43}$/.test (value)) { return null; }
    try { return Uint8Array.from (atob (value.replace (/-/g, '+').replace (/_/g, '/') + '='), char => char.charCodeAt (0)); } catch { return null; }
}
function SecureHeaders (base = new Headers ())
{
    const headers = new Headers (base); headers.set ('Cache-Control', 'no-store'); headers.set ('X-Content-Type-Options', 'nosniff');
    headers.set ('Content-Security-Policy', 'default-src \'none\'; form-action \'self\'; frame-ancestors \'none\'; base-uri \'none\'');
    headers.set ('Referrer-Policy', 'no-referrer'); return headers;
}
async function BoundedForm (request)
{
    if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test (request.headers.get ('Content-Type') || '') || Number (request.headers.get ('Content-Length')) > 8192) { throw new Error ('Invalid form.'); }
    const reader = request.body?.getReader (); if (!reader) { throw new Error ('Invalid form.'); }
    const chunks = []; let size = 0;
    try { let done = false; while (!done) { const part = await reader.read (); done = part.done; if (done) { break; } size += part.value.byteLength; if (size > 8192) { await reader.cancel (); throw new Error ('Invalid form.'); } chunks.push (part.value); } } finally { reader.releaseLock (); }
    const bytes = new Uint8Array (size); let offset = 0; for (const chunk of chunks) { bytes.set (chunk, offset); offset += chunk.length; }
    const form = new URLSearchParams (new TextDecoder ().decode (bytes));
    if ([...form.keys ()].some (key => !['handle', 'binding', 'decision'].includes (key)) || ['handle', 'binding', 'decision'].some (key => form.getAll (key).length !== 1)) { throw new Error ('Invalid form.'); }
    return form;
}

export function CreateConsentHandler ({ oauth, verifiedUser, signingKey, now = () => Date.now () })
{
    if (!oauth || typeof verifiedUser !== 'function' || !(signingKey instanceof Uint8Array) || signingKey.length < 32) { throw new Error ('Consent configuration is required.'); }
    const key = crypto.subtle.importKey ('raw', signingKey, { name : 'HMAC', hash : 'SHA-256' }, false, ['sign', 'verify']);
    const input = (handle, account, expires) => Bytes (JSON.stringify ([handle, account, expires]));
    const failure = (message, status) => new Response (message, { status, headers : SecureHeaders () });
    return async request => {
        try {
            if (!['GET', 'POST'].includes (request.method)) { return failure ('Method not allowed.', 405); }
            if (new URL (request.url).protocol !== 'https:') { return failure ('Secure connection required.', 400); }
            if (request.method === 'POST' && request.headers.get ('Origin') !== new URL (request.url).origin) { return failure ('Invalid origin.', 403); }
            const user = await verifiedUser (request);
            if (!user || !AccountId.test (user.id || '')) {
                if (request.method !== 'GET') { return failure ('Sign in to Auto3D and try connecting again.', 401); }
                const params = new URL (request.url).searchParams; if (request.url.length > 8192 || [...params].length > 30) { return failure ('Invalid authorization request.', 400); }
                const fields = [...params].map (([name, value]) => '<input type="hidden" name="' + Escape (name) + '" value="' + Escape (value) + '">').join ('');
                const body = '<!doctype html><html><head><meta charset="utf-8"><title>Connect Auto3D</title></head><body><main><h1>Connect Auto3D</h1><p>Sign in to Auto3D in another tab if needed, then continue here.</p><p><a href="/" target="_blank" rel="noopener noreferrer">Open Auto3D</a></p><form method="get">' + fields + '<button type="submit">Continue</button></form></main></body></html>';
                const headers = SecureHeaders (); headers.set ('Content-Type', 'text/html; charset=utf-8'); return new Response (body, { status : 401, headers });
            }
            if (request.method === 'GET') {
                const authRequest = await oauth.parseAuthRequest (request); const description = await oauth.describeConsent (authRequest);
                if (!ValidScopes (authRequest.scope) || !ValidScopes (description.scope) || authRequest.scope.length !== description.scope.length || authRequest.scope.some (scope => !description.scope.includes (scope))) { return failure ('Only supported read and screenshot permissions are available.', 400); }
                const transaction = await oauth.beginConsent (authRequest); const expires = now () + 10 * 60 * 1000;
                const signature = await crypto.subtle.sign ('HMAC', await key, input (transaction.handle, user.id, expires));
                const binding = expires + '.' + Encode (new Uint8Array (signature));
                const verifiedDomain = description.clientDomain ? '<p>Verified client domain: ' + Escape (description.clientDomain) + '</p>' : '<p>The client name is self-reported.</p>';
                const loopback = description.redirectIsLoopback ? '<p>Warning: a local application will receive the authorization response.</p>' : '';
                const body = '<!doctype html><html><head><meta charset="utf-8"><title>Connect Auto3D</title></head><body><main><h1>Connect Auto3D</h1><p>Signed in as ' + Escape (user.email || user.name || 'your Auto3D account') + '</p><p>Client: ' + Escape (description.clientName) + '</p>' + verifiedDomain + '<p>Redirect destination: ' + Escape (description.redirectHost) + '</p>' + loopback + '<p>Requested access: read the selected Auto3D session. The authorization can remain active until it expires or you revoke it.</p>' + (authRequest.scope.includes (CaptureScope) ? '<p>Also share screenshots of the viewer or workspace with the connected agent when requested.</p>' : '') + '<form method="post"><input type="hidden" name="handle" value="' + Escape (transaction.handle) + '"><input type="hidden" name="binding" value="' + Escape (binding) + '"><button name="decision" value="approve">Allow requested access</button><button name="decision" value="deny">Deny</button></form></main></body></html>';
                const headers = SecureHeaders (transaction.headers); headers.set ('Content-Type', 'text/html; charset=utf-8'); return new Response (body, { headers });
            }
            const form = await BoundedForm (request); const handle = form.get ('handle'); const decision = form.get ('decision'); const parts = form.get ('binding').split ('.');
            const expires = Number (parts[0]); const signature = parts.length === 2 ? Decode (parts[1]) : null;
            if (!handle || handle.length > 512 || !['approve', 'deny'].includes (decision) || !Number.isSafeInteger (expires) || expires <= now () || expires > now () + 10 * 60 * 1000 || !signature || !(await crypto.subtle.verify ('HMAC', await key, signature, input (handle, user.id, expires)))) { return failure ('Consent expired or account changed. Start again.', 403); }
            if (decision === 'deny') { const denied = await oauth.denyConsent (request, handle); return new Response (null, { status : 302, headers : SecureHeaders (denied.headers) }); }
            const approved = await oauth.approveConsent (request, handle);
            if (!ValidScopes (approved.request.scope)) { return failure ('Invalid authorization scope.', 403); }
            const client = AgentLabel (await oauth.describeConsent (approved.request));
            const completed = await oauth.completeAuthorization ({ request : approved.request, userId : user.id, metadata : {}, scope : approved.request.scope, props : { grantId : crypto.randomUUID (), authorizedAt : now (), client } });
            const headers = SecureHeaders (approved.headers); headers.set ('Location', completed.redirectTo); return new Response (null, { status : 302, headers });
        } catch { return failure ('Unable to complete authorization. Start again.', 400); }
    };
}
