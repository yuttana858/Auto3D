import { VerifyActiveSession } from './session.js';
import { SupabaseConfig, SupabaseHeaders, RequireServerKey } from './supabase.js';
import { AccessCookie, LoggedOutCookie, AuthCookies, AuthRequest } from './auth.js';

export async function DatabaseRequest (env, path, options = {})
{
    const { url, key } = SupabaseConfig (env);
    RequireServerKey (key);
    let response;
    try { response = await fetch (url + '/rest/v1/' + path, { ...options, headers : { ...SupabaseHeaders (key), 'Content-Type' : 'application/json', ...options.headers }, signal : AbortSignal.timeout (10000) }); }
    catch { throw Object.assign (new Error ('Account service unavailable.'), { status : 503 }); }
    if (!response.ok) { throw Object.assign (new Error ('Account service unavailable.'), { status : 503 }); }
    return response.status === 204 ? null : response.json ();
}

export async function RequireAdmin (context)
{
    const cookies = AuthCookies (context.request); const token = cookies[AccessCookie];
    if (cookies[LoggedOutCookie]) { throw Object.assign (new Error ('Sign in to manage accounts.'), { status : 401 }); }
    if (!token) { throw Object.assign (new Error ('Sign in to manage accounts.'), { status : 401 }); }
    const response = await AuthRequest (context.env, 'user', { headers : { Authorization : 'Bearer ' + token } });
    if (!response.ok) { throw Object.assign (new Error ('Sign in again.'), { status : response.status >= 500 ? 503 : 401 }); }
    const user = await response.json ();
    if (!user.id || user.is_anonymous || !user.email_confirmed_at || typeof user.email !== 'string') { throw Object.assign (new Error ('Administrator access required.'), { status : 403 }); }
    await VerifyActiveSession (context.env, token, user);
    const allowed = await DatabaseRequest (context.env, 'auto3d_admin_emails?select=email&email=eq.' + encodeURIComponent (user.email.toLowerCase ()) + '&limit=1');
    if (!allowed?.length) { throw Object.assign (new Error ('Administrator access required.'), { status : 403 }); }
    return user;
}
