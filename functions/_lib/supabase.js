// Server-only configuration. Never import this module into the website bundle.
export function SupabaseConfig (env)
{
    const url = String (env.SUPABASE_URL || '').trim ().replace (/\/$/, '');
    const key = String (env.SUPABASE_SECRET_KEY || '').trim ();
    let validUrl = false;
    try {
        const parsed = new URL (url);
        validUrl = parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/' && !parsed.search && !parsed.hash;
    } catch { /* Missing or invalid project URL. */ }
    if (!validUrl || !key) {
        throw Object.assign (new Error ('Library database configuration is unavailable.'), { status : 503 });
    }
    return { url, key };
}

export function SupabaseHeaders (key)
{
    // New secret keys authenticate through apikey; legacy service_role JWTs
    // additionally need the bearer header. Do not treat sb_secret keys as JWTs.
    const headers = { apikey : key };
    if (!key.startsWith ('sb_secret_')) { headers.Authorization = 'Bearer ' + key; }
    return headers;
}

export function RequireServerKey (key)
{
    let privileged = key.startsWith ('sb_secret_');
    if (!privileged) {
        try {
            const payload = key.split ('.')[1].replace (/-/g, '+').replace (/_/g, '/');
            privileged = JSON.parse (atob (payload)).role === 'service_role';
        } catch { /* Not a service-role JWT. */ }
    }
    if (!privileged) {
        throw Object.assign (new Error ('Account administration requires a Supabase secret or service_role key in the server configuration.'), { status : 503, code : 'SUPABASE_SERVER_KEY_REQUIRED' });
    }
}
