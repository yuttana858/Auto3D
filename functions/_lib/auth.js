import { SupabaseConfig, SupabaseHeaders } from './supabase.js';

export const AccessCookie = '__Host-auto3d-access';
export const RefreshCookie = '__Host-auto3d-refresh';

export function AuthCookies (request)
{
    const result = {};
    for (const part of (request.headers.get ('Cookie') || '').split (';')) {
        const index = part.indexOf ('=');
        if (index < 0) { continue; }
        try { result[part.slice (0, index).trim ()] = decodeURIComponent (part.slice (index + 1)); } catch { /* Invalid cookie. */ }
    }
    return result;
}

export function AuthResponse (body, status = 200, tokens = null, clear = false)
{
    const headers = new Headers ({ 'Content-Type' : 'application/json', 'Cache-Control' : 'private, no-store', 'X-Content-Type-Options' : 'nosniff' });
    if (tokens || clear) {
        for (const [name, value] of [[AccessCookie, tokens?.access_token], [RefreshCookie, tokens?.refresh_token]]) {
            headers.append ('Set-Cookie', name + '=' + encodeURIComponent (clear ? '' : value) + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + (clear ? 0 : 604800));
        }
    }
    return new Response (JSON.stringify (body), { status, headers });
}

export async function AuthRequest (env, path, options = {})
{
    const { url, key } = SupabaseConfig (env);
    try {
        return await fetch (url + '/auth/v1/' + path, {
            ...options, headers : { 'Content-Type' : 'application/json', apikey : key, ...(path.startsWith ('admin/') ? SupabaseHeaders (key) : {}), ...options.headers }, signal : AbortSignal.timeout (10000)
        });
    } catch { throw Object.assign (new Error ('Sign-in service is unavailable. Try again.'), { status : 503 }); }
}

export function PublicUser (user)
{
    if (!user?.id || user.is_anonymous === true) { throw Object.assign (new Error ('Authentication required.'), { status : 401 }); }
    // Identity is verified by the provider, never taken from browser metadata.
    return { id : user.id, email : typeof user.email === 'string' ? user.email : null };
}

export async function VerifiedUser (env, token)
{
    const response = await AuthRequest (env, 'user', { headers : { Authorization : 'Bearer ' + token } });
    if (!response.ok) {
        throw Object.assign (new Error (response.status >= 500 ? 'Sign-in service is unavailable. Try again.' : 'Your session has expired. Sign in again.'), { status : response.status >= 500 ? 503 : 401 });
    }
    return PublicUser (await response.json ());
}
