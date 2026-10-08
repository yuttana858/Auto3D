const DefaultSupabaseUrl = 'https://iesepcoxqochycckbwoh.supabase.co';
const DefaultPublishableKey = 'sb_publishable_CmRJpuYE32OBF9rIV1jwqQ_diMF7OXh';
const AccessCookie = 'auto3d_access';

function json (data, status = 200)
{
    return new Response (JSON.stringify (data), {
        status,
        headers : { 'Content-Type' : 'application/json', 'Cache-Control' : 'no-store', 'X-Content-Type-Options' : 'nosniff', 'X-Robots-Tag' : 'noindex, nofollow, noarchive' }
    });
}

function config (env)
{
    return {
        url : String (env.SUPABASE_URL || DefaultSupabaseUrl).replace (/\/$/, ''),
        publishable : String (env.SUPABASE_PUBLISHABLE_KEY || DefaultPublishableKey),
        secret : String (env.SUPABASE_SECRET_KEY || '')
    };
}

function accessToken (request)
{
    const raw = request.headers.get ('Cookie') || '';
    for (const part of raw.split (';')) {
        const [name, ...rest] = part.trim ().split ('=');
        if (name === AccessCookie) { return decodeURIComponent (rest.join ('=')); }
    }
    return '';
}

async function request (env, path, options = {})
{
    const { url, secret } = config (env);
    if (!secret) { throw Object.assign (new Error ('Admin backend secret is not configured.'), { status : 503 }); }
    const headers = { apikey : secret, Authorization : 'Bearer ' + secret, 'Content-Type' : 'application/json', ...options.headers };
    const response = await fetch (url + path, { ...options, headers });
    if (!response.ok) {
        const detail = await response.json ().catch (() => ({}));
        throw Object.assign (new Error (detail.message || detail.msg || detail.error || 'Admin backend request failed.'), { status : response.status });
    }
    return response;
}

async function requireAdmin (context)
{
    const token = accessToken (context.request);
    if (!token) { throw Object.assign (new Error ('Sign in required.'), { status : 401 }); }
    const { url, publishable } = config (context.env);
    const userResponse = await fetch (url + '/auth/v1/user', { headers : { apikey : publishable, Authorization : 'Bearer ' + token } });
    if (!userResponse.ok) { throw Object.assign (new Error ('Session expired.'), { status : 401 }); }
    const authUser = await userResponse.json ();
    const response = await request (context.env, '/rest/v1/auto3d_users?select=id,email,display_name,status,is_platform_admin&auth_user_id=eq.' + encodeURIComponent (authUser.id) + '&limit=1');
    const rows = await response.json ();
    const admin = rows[0];
    if (!admin || admin.status !== 'active' || admin.is_platform_admin !== true) { throw Object.assign (new Error ('Administrator access required.'), { status : 403 }); }
    return admin;
}

function temporaryPassword ()
{
    const bytes = crypto.getRandomValues (new Uint8Array (18));
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    return Array.from (bytes, (value) => alphabet[value % alphabet.length]).join ('');
}

async function audit (env, actor, action, resourceType, resourceId, metadata = {})
{
    await request (env, '/rest/v1/auto3d_audit_events', {
        method : 'POST',
        headers : { Prefer : 'return=minimal' },
        body : JSON.stringify ({ actor_user_id : actor.id, action, resource_type : resourceType, resource_id : resourceId, metadata })
    });
}

async function list (context, actor)
{
    const [requestsResponse, usersResponse] = await Promise.all ([
        request (context.env, '/rest/v1/auto3d_account_requests?select=*&order=created_at.desc&limit=250'),
        request (context.env, '/rest/v1/auto3d_users?select=id,email,display_name,status,is_platform_admin,created_at,updated_at&order=created_at.desc&limit=500')
    ]);
    return json ({ admin : actor, requests : await requestsResponse.json (), users : await usersResponse.json () });
}

async function createAuthUser (env, email, displayName, password)
{
    const { url, secret } = config (env);
    const response = await fetch (url + '/auth/v1/admin/users', {
        method : 'POST',
        headers : { apikey : secret, Authorization : 'Bearer ' + secret, 'Content-Type' : 'application/json' },
        body : JSON.stringify ({ email, password, email_confirm : true, user_metadata : { display_name : displayName || email } })
    });
    const data = await response.json ().catch (() => ({}));
    if (!response.ok) { throw Object.assign (new Error (data.msg || data.message || 'Unable to create authentication user.'), { status : response.status }); }
    return data;
}

async function createUserRecord (env, authUser, displayName, isAdmin = false)
{
    const response = await request (env, '/rest/v1/auto3d_users', {
        method : 'POST',
        headers : { Prefer : 'return=representation' },
        body : JSON.stringify ({ auth_user_id : authUser.id, email : authUser.email, display_name : displayName || authUser.email, status : 'active', is_platform_admin : isAdmin })
    });
    return (await response.json ())[0];
}

async function createUser (context, actor, fromRequest = false)
{
    let body;
    try { body = await context.request.json (); } catch { throw Object.assign (new Error ('Invalid user request.'), { status : 400 }); }
    const email = String (body.email || '').trim ().toLowerCase ();
    const displayName = String (body.displayName || '').trim ().slice (0, 120);
    if (!/^\S+@\S+\.\S+$/.test (email)) { throw Object.assign (new Error ('Enter a valid email.'), { status : 400 }); }

    const password = String (body.password || '') || temporaryPassword ();
    if (password.length < 12) { throw Object.assign (new Error ('Temporary password must be at least 12 characters.'), { status : 400 }); }
    const authUser = await createAuthUser (context.env, email, displayName, password);
    const user = await createUserRecord (context.env, authUser, displayName, body.platformAdmin === true);

    if (fromRequest && body.requestId) {
        await request (context.env, '/rest/v1/auto3d_account_requests?id=eq.' + encodeURIComponent (body.requestId), {
            method : 'PATCH',
            headers : { Prefer : 'return=minimal' },
            body : JSON.stringify ({ status : 'approved', reviewed_by : actor.id, reviewed_at : new Date ().toISOString (), created_user_id : user.id })
        });
    }
    await audit (context.env, actor, fromRequest ? 'USER_REQUEST_APPROVE' : 'USER_CREATE', 'user', user.id, { email : user.email });
    return json ({ user, temporaryPassword : password }, 201);
}

async function decline (context, actor)
{
    const body = await context.request.json ();
    const id = String (body.requestId || '');
    await request (context.env, '/rest/v1/auto3d_account_requests?id=eq.' + encodeURIComponent (id), {
        method : 'PATCH',
        headers : { Prefer : 'return=minimal' },
        body : JSON.stringify ({ status : 'declined', reviewed_by : actor.id, reviewed_at : new Date ().toISOString () })
    });
    await audit (context.env, actor, 'USER_REQUEST_DECLINE', 'account_request', id);
    return json ({ ok : true });
}

async function deleteUser (context, actor, id)
{
    const response = await request (context.env, '/rest/v1/auto3d_users?select=id,auth_user_id,email,is_platform_admin&id=eq.' + encodeURIComponent (id) + '&limit=1');
    const rows = await response.json ();
    const target = rows[0];
    if (!target) { throw Object.assign (new Error ('User not found.'), { status : 404 }); }
    if (target.id === actor.id) { throw Object.assign (new Error ('You cannot delete your own administrator account.'), { status : 400 }); }

    if (target.auth_user_id) {
        const { url, secret } = config (context.env);
        const authDelete = await fetch (url + '/auth/v1/admin/users/' + encodeURIComponent (target.auth_user_id), {
            method : 'DELETE',
            headers : { apikey : secret, Authorization : 'Bearer ' + secret }
        });
        if (!authDelete.ok && authDelete.status !== 404) { throw Object.assign (new Error ('Unable to delete authentication user.'), { status : authDelete.status }); }
    }
    await request (context.env, '/rest/v1/auto3d_users?id=eq.' + encodeURIComponent (id), {
        method : 'PATCH',
        headers : { Prefer : 'return=minimal' },
        body : JSON.stringify ({ status : 'deleted', auth_user_id : null, updated_at : new Date ().toISOString () })
    });
    await audit (context.env, actor, 'USER_DELETE', 'user', id, { email : target.email });
    return json ({ ok : true });
}

export async function onRequest (context)
{
    try {
        const actor = await requireAdmin (context);
        const path = context.params.path || [];
        const action = String (path[0] || '');
        if (context.request.method === 'GET' && !action) { return list (context, actor); }
        if (context.request.method === 'POST' && action === 'approve') { return createUser (context, actor, true); }
        if (context.request.method === 'POST' && action === 'decline') { return decline (context, actor); }
        if (context.request.method === 'POST' && action === 'users') { return createUser (context, actor, false); }
        if (context.request.method === 'DELETE' && action === 'users' && path[1]) { return deleteUser (context, actor, String (path[1])); }
        return json ({ error : 'Not found.' }, 404);
    } catch (error) {
        console.error (error);
        return json ({ error : error.message || 'Admin API unavailable.' }, error.status || 500);
    }
}
