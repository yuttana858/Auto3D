import { AuthResponse, AuthRequest } from '../../_lib/auth.js';
import { DatabaseRequest, RequireAdmin } from '../../_lib/accounts.js';
import { ReadBody } from '../auth/[[path]].js';

const message = 'Request received. An administrator will review it and contact you if approved.';
export async function onRequest (context)
{
    const action = (context.params.path || []).join ('/');
    if (!['request', 'admin', 'review'].includes (action)) { return AuthResponse ({ error : 'Not found.' }, 404); }
    if (context.request.method !== (action === 'admin' ? 'GET' : 'POST')) { return AuthResponse ({ error : 'Method not allowed.' }, 405); }
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
        const columns = 'id,email,name,reason,status,created_at,reviewed_at,user_id';
        if (action === 'admin') { return AuthResponse ({ isAdmin : true, requests : await DatabaseRequest (context.env, 'auto3d_access_requests?select=' + columns + '&order=created_at.desc&limit=100') }); }
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
        const updated = await DatabaseRequest (context.env, path + '&status=eq.processing&select=' + columns, { method : 'PATCH', headers : { Prefer : 'return=representation' }, body : JSON.stringify ({ status : 'approved', user_id : user.id }) });
        return AuthResponse ({ request : updated[0], message : 'Account created. Share the initial password through your secure process.' });
    } catch (error) { return AuthResponse ({ error : [400, 401, 403, 413].includes (error.status) ? error.message : 'Account service unavailable. Refresh before retrying; administrators can reconcile processing requests in Supabase.' }, error.status || 503); }
}
