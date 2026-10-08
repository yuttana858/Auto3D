import { SupabaseConfig, SupabaseHeaders, RequireServerKey } from './supabase.js';
export async function VerifyActiveSession (env, token, user)
{
    let sessionId;
    try { const payload = token.split ('.')[1].replace (/-/g, '+').replace (/_/g, '/'); sessionId = JSON.parse (atob (payload)).session_id; } catch { /* Invalid token. */ }
    if (typeof sessionId !== 'string') { throw Object.assign (new Error ('Sign in again.'), { status : 401 }); }
    const { url, key } = SupabaseConfig (env); RequireServerKey (key);
    let response;
    try { response = await fetch (url + '/rest/v1/rpc/auto3d_session_active', { method : 'POST', headers : { ...SupabaseHeaders (key), 'Content-Type' : 'application/json' }, body : JSON.stringify ({ p_session_id : sessionId, p_user_id : user.id }), signal : AbortSignal.timeout (10000) }); }
    catch { throw Object.assign (new Error ('Sign-in service unavailable.'), { status : 503 }); }
    if (!response.ok) { throw Object.assign (new Error ('Sign-in service unavailable.'), { status : 503 }); }
    if (await response.json () !== true) { throw Object.assign (new Error ('Your session has expired. Sign in again.'), { status : 401 }); }
}
