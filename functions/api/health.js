import { SupabaseConfig, SupabaseHeaders } from '../_lib/supabase.js';

export async function onRequestGet (context)
{
    let database = 'unavailable';
    try {
        const { url, key } = SupabaseConfig (context.env);
        const response = await fetch (url + '/rest/v1/auto3d_library?select=id&limit=1', {
            headers : SupabaseHeaders (key), signal : AbortSignal.timeout (5000)
        });
        if (response.ok && Array.isArray (await response.json ())) { database = 'ok'; }
    } catch { /* Report readiness without exposing upstream details or credentials. */ }
    return Response.json ({ service : 'auto3d-library-api', status : database === 'ok' ? 'ok' : 'degraded', database, publishing : 'awaiting-corporate-identity' }, {
        status : database === 'ok' ? 200 : 503,
        headers : { 'Cache-Control' : 'no-store', 'X-Content-Type-Options' : 'nosniff' }
    });
}
