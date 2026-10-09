import { SupabaseConfig, SupabaseHeaders } from './supabase.js';

// Call only after resolving authorized, published metadata; never accept a client object key.
export async function LibraryFile (env, row, type)
{
    const fail = (status) => { throw Object.assign (new Error ('Library file unavailable.'), { status }); };
    const provider = row.storage_provider || 'supabase';
    const path = row[type + '_path'];
    if (provider === 'r2') {
        const objectKey = row[type + '_object_key'] || path;
        if (!objectKey) { fail (404); }
        if (!env.AUTO3D_LIBRARY_R2) { fail (503); }
        let object;
        try { object = await env.AUTO3D_LIBRARY_R2.get (objectKey); } catch { fail (502); }
        if (!object) { fail (404); }
        return object.body;
    }
    if (provider !== 'supabase') { fail (502); }
    if (!path) { fail (404); }
    const { url, key } = SupabaseConfig (env);
    const encoded = String (path).split ('/').map (encodeURIComponent).join ('/');
    let file;
    try {
        file = await fetch (url + '/storage/v1/object/authenticated/auto3d-library/' + encoded, {
            headers : SupabaseHeaders (key), signal : AbortSignal.timeout (10000)
        });
    } catch { fail (502); }
    if (!file.ok) { fail (file.status === 404 ? 404 : 502); }
    return file.body;
}
