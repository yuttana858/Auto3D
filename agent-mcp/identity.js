import { AgentLabel } from './agent-label.js';
import { AccessCookie, LoggedOutCookie, AuthCookies, AuthRequest, VerifiedUser } from '../functions/_lib/auth.js';
import { DatabaseRequest } from '../functions/_lib/accounts.js';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Verifies the application's actual HttpOnly login cookie with Supabase,
// including the server-side active-session check. Never accepts a user ID from
// a header, form, OAuth client or browser WebSocket message.
export function CreateBrowserIdentity (env)
{
    return async request => {
        const cookies = AuthCookies (request);
        if (cookies[LoggedOutCookie] || !cookies[AccessCookie]) { return null; }
        return VerifiedUser (env, cookies[AccessCookie]);
    };
}

// Bind a live browser connection to the verified Supabase session, not just
// the account. A refreshed token retains the same session_id.
export function CreateBrowserConnectionIdentity (env)
{
    const verify = CreateBrowserIdentity (env);
    return async request => {
        const user = await verify (request); if (!user) { return null; }
        const token = AuthCookies (request)[AccessCookie]; let sessionId;
        try { const payload = token.split ('.')[1].replace (/-/g, '+').replace (/_/g, '/'); sessionId = JSON.parse (atob (payload)).session_id; } catch { return null; }
        if (typeof sessionId !== 'string' || !Uuid.test (sessionId)) { return null; }
        const hash = await crypto.subtle.digest ('SHA-256', new TextEncoder ().encode (sessionId));
        return { ...user, sessionFingerprint : [...new Uint8Array (hash)].map (value => value.toString (16).padStart (2, '0')).join ('') };
    };
}

// validateToken must be the official provider's private Service Binding RPC.
// isAccountActive must query trusted account status, not token claims. Both
// checks occur on every request; this factory does not itself expose an API.
export function CreateResourceVerifier ({ resource, validateToken, isAccountActive, now = () => Date.now () })
{
    let url; try { url = new URL (resource); } catch { throw new Error ('Invalid resource.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.href !== resource || typeof validateToken !== 'function' || typeof isAccountActive !== 'function') { throw new Error ('Invalid resource verifier configuration.'); }
    return async token => {
        if (typeof token !== 'string' || !token || token.length > 4096 || /\s/.test (token)) { throw new Error ('Invalid authorization.'); }
        const result = await validateToken (resource, token);
        if (!result || result.audience !== resource || typeof result.userId !== 'string' || !Uuid.test (result.userId) || typeof result.props?.grantId !== 'string' || !Uuid.test (result.props.grantId) || !Number.isSafeInteger (result.props.authorizedAt) || result.props.authorizedAt <= 0 || result.props.authorizedAt > now () || !Array.isArray (result.scope) || !result.scope.includes ('auto3d.read') || result.scope.length > 3 || new Set (result.scope).size !== result.scope.length || result.scope.some (scope => !['auto3d.read', 'auto3d.capture', 'offline_access'].includes (scope)) || !Number.isSafeInteger (result.expiresAt) || result.expiresAt * 1000 <= now () || !(await isAccountActive (result.userId, result.props.authorizedAt))) { throw new Error ('Invalid authorization.'); }
        return { accountId : result.userId, grantId : result.props.grantId, scopes : [...result.scope], expiresAt : result.expiresAt * 1000, client : AgentLabel ({ clientName : result.props.client?.name, clientDomain : result.props.client?.domain }) };
    };
}

// Fail closed if the account was disabled, deleted, banned, or its sessions
// invalidated since the OAuth grant was approved. Uses server-only credentials.
export function CreateAccountActiveCheck (env, { now = () => Date.now () } = {})
{
    return async (userId, authorizedAt) => {
        if (!Uuid.test (userId || '') || !Number.isSafeInteger (authorizedAt)) { return false; }
        const userResponse = await AuthRequest (env, 'admin/users/' + encodeURIComponent (userId));
        if (!userResponse.ok) { return false; } const user = await userResponse.json ();
        if (user.id !== userId || user.is_anonymous === true || !user.email_confirmed_at || user.deleted_at || (user.banned_until && (!Number.isFinite (Date.parse (user.banned_until)) || Date.parse (user.banned_until) > now ()))) { return false; }
        const rows = await DatabaseRequest (env, 'auto3d_account_controls?select=disabled,sessions_after&user_id=eq.' + encodeURIComponent (userId) + '&limit=1');
        if (!Array.isArray (rows) || rows.length > 1) { return false; } const control = rows[0];
        if (control?.disabled) { return false; }
        if (control?.sessions_after) { const after = Date.parse (control.sessions_after); if (!Number.isFinite (after) || authorizedAt <= after) { return false; } }
        return true;
    };
}
