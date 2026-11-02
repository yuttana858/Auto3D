import { AuthResponse, AuthRequest } from '../../_lib/auth.js';
import { DatabaseRequest, RequireAdmin } from '../../_lib/accounts.js';
import { ReadBody } from '../auth/[[path]].js';

const message = 'Request received. An administrator will review it and contact you if approved.';
export async function onRequest (context)
{
    const action = (context.params.path || []).join ('/');
    if (!['request', 'desk-8b4f2d71c6', 'review', 'users', 'manage'].includes (action)) { return AuthResponse ({ error : 'Not found.' }, 404); }
    if (context.request.method !== (['desk-8b4f2d71c6', 'users'].includes (action) ? 'GET' : 'POST')) { return AuthResponse ({ error : 'Method not allowed.' }, 405); }
    if (context.request.method === 'POST' && context.request.headers.get ('Origin') !== new URL (context.request.url).origin) { return AuthResponse ({ error : 'Requests must come from this application.' }, 403); }
    try {
        if (action === 'request') {
            const body = await ReadBody (context.request);
            if (typeof body?.email !== 'string' || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test (body.email.trim ()) || typeof body.name !== 'string' || !body.name.trim () || body.name.length > 100 || typeof body.reason !== 'string' || body.reason.length > 1000 || Object.keys (body).some ((key) => !['email', 'name', 'reason'].includes (key))) { return AuthResponse ({ error : 'Enter a valid name, email and reason (up to 1000 characters).' }, 400); }
            const digest = await crypto.subtle.digest ('SHA-256', new TextEncoder ().encode (context.request.headers.get ('CF-Connecting-IP') || 'local'));
            const ipHash = Array.from (new Uint8Array (digest), (byte) => byte.toString (16).padStart (2, '0')).join ('');
            await DatabaseRequest (context.env, 'rpc/auto3d_request_account', { method : 'POST', body : JSON.stringify ({ p_email : body.email.trim ().toLowerCase (), p_name : body.name.trim (), p_reason : body.reason.trim (), p_ip_hash : ipHash }) });
            return AuthResponse ({ message }, 202);
        }
        const admin = await RequireAdmin (context);
        if (action === 'users') {
            const page = Number (new URL (context.request.url).searchParams.get ('page') || 1);
            if (!Number.isInteger (page) || page < 1 || page > 10000) { return AuthResponse ({ error : 'Invalid page.' }, 400); }
            const selectedId = new URL (context.request.url).searchParams.get ('id');
            if (selectedId && !/^[0-9a-f-]{36}$/i.test (selectedId)) { return AuthResponse ({ error : 'Invalid account ID.' }, 400); }
            const response = await AuthRequest (context.env, selectedId ? 'admin/users/' + selectedId : 'admin/users?page=' + page + '&per_page=50');
            if (!response.ok) { throw new Error ('Could not list accounts.'); }
            const data = await response.json (); const users = selectedId ? [data] : Array.isArray (data.users) ? data.users : [];
            const ids = users.map ((user) => user.id).filter ((id) => /^[0-9a-f-]{36}$/i.test (id));
            const controls = ids.length ? await DatabaseRequest (context.env, 'auto3d_account_controls?select=user_id,disabled&user_id=in.(' + ids.join (',') + ')') : [];
            const admins = await DatabaseRequest (context.env, 'auto3d_admin_emails?select=email');
            return AuthResponse ({ page, hasMore : users.length === 50, users : users.map ((user) => ({ id : user.id, email : user.email, name : typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.slice (0, 100) : '', disabled : controls.some ((item) => item.user_id === user.id && item.disabled) || (user.banned_until && Date.parse (user.banned_until) > Date.now ()), isAdmin : admins.some ((item) => item.email === user.email?.toLowerCase ()) })) });
        }
        if (action === 'manage') {
            const body = await ReadBody (context.request);
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test (body?.id || '') || !['revoke', 'restore', 'reset_password'].includes (body?.action) || Object.keys (body).some ((key) => !['id', 'action', 'password'].includes (key))) { return AuthResponse ({ error : 'Invalid account action.' }, 400); }
            if (body.action === 'reset_password' ? (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 1024) : body.password !== undefined) { return AuthResponse ({ error : 'Enter a new password of at least 12 characters for a reset only.' }, 400); }
            const response = await AuthRequest (context.env, 'admin/users/' + body.id);
            if (!response.ok) { return AuthResponse ({ error : 'Account unavailable.' }, 404); }
            const user = await response.json ();
            if (body.action === 'revoke') {
                const protectedAdmins = await DatabaseRequest (context.env, 'auto3d_admin_emails?select=email&email=eq.' + encodeURIComponent (user.email?.toLowerCase () || '') + '&limit=1');
                if (body.id === admin.id || protectedAdmins.length) { return AuthResponse ({ error : 'Administrator accounts cannot be revoked here. Use the trusted administrator setup process.' }, 403); }
            }
            // Block old sessions before a provider change, including ambiguous provider failures.
            const existing = await DatabaseRequest (context.env, 'auto3d_account_controls?select=disabled&user_id=eq.' + body.id + '&limit=1');
            const disabled = body.action === 'restore' ? false : body.action === 'revoke' ? true : Boolean (existing[0]?.disabled);
            await DatabaseRequest (context.env, 'auto3d_account_controls?on_conflict=user_id', { method : 'POST', headers : { Prefer : 'resolution=merge-duplicates' }, body : JSON.stringify ({ user_id : body.id, sessions_after : new Date ().toISOString (), updated_by : admin.id, updated_at : new Date ().toISOString (), disabled }) });
            const changed = await AuthRequest (context.env, 'admin/users/' + body.id, { method : 'PUT', body : JSON.stringify (body.action === 'reset_password' ? { password : body.password } : { ban_duration : body.action === 'revoke' ? '876000h' : 'none' }) });
            if (!changed.ok) { return AuthResponse ({ error : 'Old app sessions are blocked, but the provider change did not complete. Refresh and retry.' }, 503); }
            return AuthResponse ({ id : body.id, action : body.action, message : body.action === 'reset_password' ? 'Password reset. Old sessions are blocked. Share the new password through your secure process.' : body.action === 'revoke' ? 'Access revoked. Saved Library files are retained.' : 'Access restored. The user must sign in again.' });
        }
        const columns = 'id,email,name,reason,status,created_at,reviewed_at,user_id';
        if (action === 'desk-8b4f2d71c6') { return AuthResponse ({ isAdmin : true, requests : await DatabaseRequest (context.env, 'auto3d_access_requests?select=' + columns + '&order=created_at.desc&limit=100') }); }
        const body = await ReadBody (context.request);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test (body?.id || '') || !['approve', 'reject'].includes (body?.decision) || Object.keys (body).some ((key) => !['id', 'decision', 'password'].includes (key))) { return AuthResponse ({ error : 'Invalid review.' }, 400); }
        if (body.decision === 'approve' && (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 1024)) { return AuthResponse ({ error : 'Enter an initial password of at least 12 characters.' }, 400); }
        const path = 'auto3d_access_requests?id=eq.' + body.id;
        const rows = await DatabaseRequest (context.env, path + '&status=eq.pending&select=' + columns, { method : 'PATCH', headers : { Prefer : 'return=representation' }, body : JSON.stringify ({ status : body.decision === 'approve' ? 'processing' : 'rejected', reviewed_by : admin.id, reviewed_at : new Date ().toISOString () }) });
        if (!rows?.length) { return AuthResponse ({ error : 'This request has already been reviewed or is being processed. Refresh the list.' }, 409); }
        if (body.decision === 'reject') { return AuthResponse ({ request : rows[0] }); }
        // Claim first: only one reviewer can create an account. Ambiguous failures
        // stay processing for reconciliation instead of issuing a second account.
        const created = await AuthRequest (context.env, 'admin/users', { method : 'POST', body : JSON.stringify ({ email : rows[0].email, password : body.password, email_confirm : true, user_metadata : { name : rows[0].name } }) });
        if (!created.ok) {
            if (created.status < 500) { await DatabaseRequest (context.env, path + '&status=eq.processing', { method : 'PATCH', body : JSON.stringify ({ status : 'pending', reviewed_by : null, reviewed_at : null }) }); }
            return AuthResponse ({ error : 'Account creation did not complete. Check whether the email already has an account in Supabase before retrying.' }, 503);
        }
        const user = await created.json ();
        if (!user?.id) { throw Object.assign (new Error ('Account service unavailable.'), { status : 503 }); }
        // Seed shared-table defaults idempotently. If storage is temporarily
        // unavailable, approval still completes and first sign-in retries the
        // same upsert; never create a second user to retry provisioning.
        let preferencesReady = true;
        try { await DatabaseRequest (context.env, 'auto3d_preferences?on_conflict=user_id', { method : 'POST', headers : { Prefer : 'resolution=ignore-duplicates,return=minimal' }, body : JSON.stringify ({ user_id : user.id }) }); }
        catch { preferencesReady = false; }
        const updated = await DatabaseRequest (context.env, path + '&status=eq.processing&select=' + columns, { method : 'PATCH', headers : { Prefer : 'return=representation' }, body : JSON.stringify ({ status : 'approved', user_id : user.id }) });
        return AuthResponse ({ request : updated[0], preferencesReady, message : preferencesReady ? 'Account created. Share the initial password through your secure process.' : 'Account created. Default preferences will be initialized on first sign-in. Share the initial password through your secure process.' });
    } catch (error) { return AuthResponse ({ error : ([400, 401, 403, 413].includes (error.status) || error.code === 'SUPABASE_SERVER_KEY_REQUIRED') ? error.message : 'Account service unavailable. Refresh before retrying; administrators can reconcile processing requests in Supabase.' }, error.status || 503); }
}
