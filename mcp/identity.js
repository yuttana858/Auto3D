import { AccessCookie, LoggedOutCookie, AuthCookies, VerifiedUser, AuthRequest } from '../functions/_lib/auth.js';
import { DatabaseRequest, RequireAdmin } from '../functions/_lib/accounts.js';
import { PilotAccount, PilotConfig } from './common.js';

export async function BrowserIdentity (request, env)
{
    const cookies = AuthCookies (request);
    if (cookies[LoggedOutCookie] || !cookies[AccessCookie]) { return null; }
    const user = await VerifiedUser (env, cookies[AccessCookie]); PilotAccount (env, user.id);
    if (PilotConfig (env).mode === 'live-admin') { await RequireAdmin ({ request, env }); }
    const payload = JSON.parse (atob (cookies[AccessCookie].split ('.')[1].replace (/-/g, '+').replace (/_/g, '/')));
    const digest = await crypto.subtle.digest ('SHA-256', new TextEncoder ().encode (payload.session_id));
    return { ...user, sessionFingerprint : [...new Uint8Array (digest)].map (byte => byte.toString (16).padStart (2, '0')).join ('') };
}
export async function ActiveRegistration (env, accountId, registrationId)
{
    PilotAccount (env, accountId);
    const record = await env.AUTO3D_AGENT_BROKER.getByName (accountId).AssertRegistration ({ accountId, id : registrationId });
    const controls = await DatabaseRequest (env, 'auto3d_account_controls?select=disabled,sessions_after&user_id=eq.' + encodeURIComponent (accountId) + '&limit=1');
    if (controls.some (control => control.disabled || Date.parse (control.sessions_after) >= record.createdAt)) { throw new Error ('Account access revoked.'); }
    if (PilotConfig (env).mode === 'live-admin') {
        const response = await AuthRequest (env, 'admin/users/' + encodeURIComponent (accountId));
        if (!response.ok) { throw new Error ('Account unavailable.'); }
        const user = await response.json ();
        if (user.id !== accountId || !user.email_confirmed_at || !user.email || user.is_anonymous || Date.parse (user.banned_until) > Date.now ()) { throw new Error ('Administrator required.'); }
        const admins = await DatabaseRequest (env, 'auto3d_admin_emails?select=email&email=eq.' + encodeURIComponent (user.email.toLowerCase ()) + '&limit=1');
        if (!admins.length) { throw new Error ('Administrator access revoked.'); }
    }
    return record;
}
