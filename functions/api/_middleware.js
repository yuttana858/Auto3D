import { AudiencePublicRoute } from '../_lib/audienceshares.js';
import { AccessCookie, LoggedOutCookie, AuthCookies, AuthResponse, VerifiedUser } from '../_lib/auth.js';
export async function onRequest (context)
{
    const path = new URL (context.request.url).pathname;
    if (path.startsWith ('/api/auth/') || path === '/api/accounts/request') { return context.next (); }
    if (AudiencePublicRoute (context.request, context.env)) {
        if (context.request.method === 'POST' && context.request.headers.get ('Origin') !== new URL (context.request.url).origin) { return AuthResponse ({ error : 'Requests must come from Auto3D.' }, 403); }
        return context.next ();
    }
    const cookies = AuthCookies (context.request);
    if (cookies[LoggedOutCookie] || !cookies[AccessCookie]) { return AuthResponse ({ error : 'Sign in to use Auto3D.' }, 401); }
    try { context.data.user = await VerifiedUser (context.env, cookies[AccessCookie]); }
    catch (error) { return AuthResponse ({ error : error.status === 401 ? 'Your session has expired. Sign in again.' : 'Sign-in service unavailable.' }, error.status || 503); }
    const expectedAccount = context.request.headers.get ('X-Auto3D-Account');
    if (expectedAccount && expectedAccount !== context.data.user.id) { return AuthResponse ({ error : 'Account changed. Refresh before retrying.' }, 409); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes (context.request.method) && context.request.headers.get ('Origin') !== new URL (context.request.url).origin) { return AuthResponse ({ error : 'Requests must come from Auto3D.' }, 403); }
    return context.next ();
}
