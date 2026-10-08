import { AccessCookie, RefreshCookie, AuthCookies, AuthRequest, AuthResponse, VerifiedUser } from '../../_lib/auth.js';

async function ReadBody (request)
{
    if (!request.headers.get ('Content-Type')?.startsWith ('application/json')) { throw Object.assign (new Error ('Use a JSON request.'), { status : 400 }); }
    // Bound credential requests even when Content-Length is absent.
    const reader = request.body?.getReader (); let size = 0; const chunks = [];
    if (!reader) { throw Object.assign (new Error ('Enter your sign-in details.'), { status : 400 }); }
    for (let chunk = await reader.read (); !chunk.done; chunk = await reader.read ()) {
        const { value } = chunk;
        size += value.byteLength;
        if (size > 8192) { await reader.cancel (); throw Object.assign (new Error ('Sign-in request is too large.'), { status : 413 }); }
        chunks.push (value);
    }
    const bytes = new Uint8Array (size); let offset = 0;
    for (const chunk of chunks) { bytes.set (chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse (new TextDecoder ().decode (bytes)); }
    catch { throw Object.assign (new Error ('Invalid sign-in request.'), { status : 400 }); }
}

async function Session (context)
{
    const cookies = AuthCookies (context.request);
    if (!cookies[AccessCookie]) {
        return AuthResponse ({ user : null }, cookies[RefreshCookie] ? 401 : 200);
    }
    return AuthResponse ({ user : await VerifiedUser (context.env, cookies[AccessCookie]) });
}

async function Login (context)
{
    const body = await ReadBody (context.request);
    if (typeof body?.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test (body.email.trim ()) || body.email.length > 254 || typeof body.password !== 'string' || !body.password.length || body.password.length > 1024) {
        return AuthResponse ({ error : 'Enter a valid email and password.' }, 400);
    }
    return await Exchange (context, 'password', { email : body.email.trim (), password : body.password });
}

async function Exchange (context, grant, body)
{
    const response = await AuthRequest (context.env, 'token?grant_type=' + grant, { method : 'POST', body : JSON.stringify (body) });
    if (!response.ok) {
        const status = response.status === 429 ? 429 : response.status >= 500 ? 503 : 401;
        const error = status === 429 ? 'Too many sign-in attempts. Please wait and try again.' : status === 503 ? 'Sign-in service is unavailable. Try again.' : grant === 'password' ? 'Email or password is incorrect, or the account is not confirmed.' : 'Your session has expired. Sign in again.';
        return AuthResponse ({ error }, status, null, grant !== 'password' && status === 401);
    }
    const tokens = await response.json ();
    if (typeof tokens.access_token !== 'string' || !tokens.access_token || typeof tokens.refresh_token !== 'string' || !tokens.refresh_token) { return AuthResponse ({ error : 'Sign-in service returned an incomplete session.' }, 503); }
    const user = await VerifiedUser (context.env, tokens.access_token);
    return AuthResponse ({ user }, 200, tokens);
}

async function Logout (context)
{
    const cookies = AuthCookies (context.request);
    let token = cookies[AccessCookie];
    let response = token ? await AuthRequest (context.env, 'logout?scope=local', { method : 'POST', headers : { Authorization : 'Bearer ' + token } }) : null;
    if ((!token || response.status === 401) && cookies[RefreshCookie]) {
        const refreshed = await AuthRequest (context.env, 'token?grant_type=refresh_token', { method : 'POST', body : JSON.stringify ({ refresh_token : cookies[RefreshCookie] }) });
        if (refreshed.ok) {
            token = (await refreshed.json ()).access_token;
            if (!token) { return AuthResponse ({ error : 'Could not revoke the session. Please try again.' }, 503, null, true); }
            response = await AuthRequest (context.env, 'logout?scope=local', { method : 'POST', headers : { Authorization : 'Bearer ' + token } });
        } else if (![400, 401, 403].includes (refreshed.status)) {
            return AuthResponse ({ error : 'Could not revoke the session. Please try again.' }, 503, null, true);
        }
    }
    if (response) {
        if (!response.ok && ![401, 403, 404].includes (response.status)) {
            return AuthResponse ({ error : 'Could not revoke the session. Please try signing out again.' }, 503, null, true);
        }
    }
    return AuthResponse ({ user : null }, 200, null, true);
}

export async function onRequest (context)
{
    const path = context.params.path || [];
    if (path.length !== 1 || !['session', 'login', 'refresh', 'logout'].includes (path[0])) { return AuthResponse ({ error : 'Not found.' }, 404); }
    if (context.request.method !== (path[0] === 'session' ? 'GET' : 'POST')) { return AuthResponse ({ error : 'Method not allowed.' }, 405); }
    if (context.request.method === 'POST' && context.request.headers.get ('Origin') !== new URL (context.request.url).origin) { return AuthResponse ({ error : 'Sign-in requests must come from this application.' }, 403); }
    try {
        if (path[0] === 'session') { return await Session (context); }
        if (path[0] === 'login') { return await Login (context); }
        if (path[0] === 'logout') { return await Logout (context); }
        const token = AuthCookies (context.request)[RefreshCookie];
        if (!token) { return AuthResponse ({ error : 'Sign in again.' }, 401, null, true); }
        return await Exchange (context, 'refresh_token', { refresh_token : token });
    } catch (error) {
        const message = [400, 413].includes (error.status) ? error.message : error.status === 401 ? 'Your session has expired. Sign in again.' : 'Sign-in service is unavailable. Try again.';
        return AuthResponse ({ error : message }, error.status || 503, null, path[0] === 'logout');
    }
}
