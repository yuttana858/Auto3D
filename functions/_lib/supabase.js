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
