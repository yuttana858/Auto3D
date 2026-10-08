const DefaultSupabaseUrl = 'https://iesepcoxqochycckbwoh.supabase.co';
const DefaultPublishableKey = 'sb_publishable_CmRJpuYE32OBF9rIV1jwqQ_diMF7OXh';
const AccessCookie = 'auto3d_access';
const Roles = new Set (['owner', 'admin', 'editor', 'viewer']);
const UserStatuses = new Set (['active', 'disabled']);

function json (data, status = 200)
{
    return new Response (JSON.stringify (data), {
        status,
        headers : {
            'Content-Type' : 'application/json',
            'Cache-Control' : 'no-store',
            'X-Content-Type-Options' : 'nosniff',
            'X-Robots-Tag' : 'noindex, nofollow, noarchive'
        }
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
    if (!admin || admin.status !== 'active' || admin.is_platform_admin !== true) {
        throw Object.assign (new Error ('Administrator access required.'), { status : 403 });
    }
    return admin;
}

function temporaryPassword ()
{
    const bytes = crypto.getRandomValues (new Uint8Array (18));
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    return Array.from (bytes, (value) => alphabet[value % alphabet.length]).join ('');
}

function slugify (value)
{
    const base = String (value || '').trim ().toLowerCase ()
        .normalize ('NFKD').replace (/[^a-z0-9]+/g, '-').replace (/^-+|-+$/g, '').slice (0, 60);
    return base.length >= 3 ? base : 'org-' + crypto.randomUUID ().slice (0, 8);
}

async function audit (env, actor, action, resourceType, resourceId, metadata = {})
{
    await request (env, '/rest/v1/auto3d_audit_events', {
        method : 'POST',
        headers : { Prefer : 'return=minimal' },
        body : JSON.stringify ({
            actor_user_id : actor.id,
            action,
            resource_type : resourceType,
            resource_id : resourceId,
            metadata
        })
    });
}

async function list (context, actor)
{
    const [requestsResponse, usersResponse, orgsResponse, membersResponse] = await Promise.all ([
        request (context.env, '/rest/v1/auto3d_account_requests?select=*&order=created_at.desc&limit=250'),
        request (context.env, '/rest/v1/auto3d_users?select=id,email,display_name,status,is_platform_admin,created_at,updated_at&order=created_at.desc&limit=500'),
        request (context.env, '/rest/v1/auto3d_organizations?select=id,name,slug,status,storage_quota_bytes,created_at&order=name.asc&limit=250'),
        request (context.env, '/rest/v1/auto3d_organization_members?select=organization_id,user_id,role,status,joined_at&limit=2000')
    ]);
    return json ({
        admin : actor,
        requests : await requestsResponse.json (),
        users : await usersResponse.json (),
        organizations : await orgsResponse.json (),
        memberships : await membersResponse.json ()
    });
}

async function createAuthUser (env, email, displayName, password)
{
    const { url, secret } = config (env);
    const response = await fetch (url + '/auth/v1/admin/users', {
        method : 'POST',
        headers : { apikey : secret, Authorization : 'Bearer ' + secret, 'Content-Type' : 'application/json' },
        body : JSON.stringify ({
            email,
            password,
            email_confirm : true,
            user_metadata : { display_name : displayName || email }
        })
    });
    const data = await response.json ().catch (() => ({}));
    if (!response.ok) {
        throw Object.assign (new Error (data.msg || data.message || 'Unable to create authentication user.'), { status : response.status });
    }
    return data.user || data;
}

async function createUserRecord (env, authUser, displayName, isAdmin = false)
{
    const response = await request (env, '/rest/v1/auto3d_users', {
        method : 'POST',
        headers : { Prefer : 'return=representation' },
        body : JSON.stringify ({
            auth_user_id : authUser.id,
            email : String (authUser.email || '').toLowerCase (),
            display_name : displayName || authUser.email,
            status : 'active',
            is_platform_admin : isAdmin
        })
    });
    const user = (await response.json ())[0];
    await request (env, '/rest/v1/auto3d_user_identities', {
        method : 'POST',
        headers : { Prefer : 'return=minimal' },
        body : JSON.stringify ({
            user_id : user.id,
            provider : 'supabase',
            provider_tenant_id : '',
            provider_subject_id : authUser.id,
            provider_email : authUser.email
        })
    });
    return user;
}

async function setMembership (env, userId, organizationId, role)
{
    if (!organizationId) { return null; }
    if (!Roles.has (role)) { throw Object.assign (new Error ('Invalid organization role.'), { status : 400 }); }
    const orgResponse = await request (env, '/rest/v1/auto3d_organizations?select=id,name,status&id=eq.' + encodeURIComponent (organizationId) + '&limit=1');
    const orgs = await orgResponse.json ();
    const organization = orgs[0];
    if (!organization || organization.status !== 'active') {
        throw Object.assign (new Error ('Organization is unavailable.'), { status : 400 });
    }
    const response = await request (env, '/rest/v1/auto3d_organization_members?on_conflict=organization_id,user_id', {
        method : 'POST',
        headers : { Prefer : 'resolution=merge-duplicates,return=representation' },
        body : JSON.stringify ({
            organization_id : organizationId,
            user_id : userId,
            role,
            status : 'active'
        })
    });
    return (await response.json ())[0];
}

async function createUser (context, actor, fromRequest = false)
{
    let body;
    try { body = await context.request.json (); } catch {
        throw Object.assign (new Error ('Invalid user request.'), { status : 400 });
    }
    const email = String (body.email || '').trim ().toLowerCase ();
    const displayName = String (body.displayName || '').trim ().slice (0, 120);
    const organizationId = String (body.organizationId || '').trim ();
    const role = String (body.role || 'viewer');
    if (!/^\S+@\S+\.\S+$/.test (email)) { throw Object.assign (new Error ('Enter a valid email.'), { status : 400 }); }

    const password = String (body.password || '') || temporaryPassword ();
    if (password.length < 12) { throw Object.assign (new Error ('Temporary password must be at least 12 characters.'), { status : 400 }); }

    const authUser = await createAuthUser (context.env, email, displayName, password);
    let user;
    try {
        user = await createUserRecord (context.env, authUser, displayName, body.platformAdmin === true);
        await setMembership (context.env, user.id, organizationId, role);
    } catch (error) {
        const { url, secret } = config (context.env);
        await fetch (url + '/auth/v1/admin/users/' + encodeURIComponent (authUser.id), {
            method : 'DELETE',
            headers : { apikey : secret, Authorization : 'Bearer ' + secret }
        }).catch (() => {});
        throw error;
    }

    if (fromRequest && body.requestId) {
        await request (context.env, '/rest/v1/auto3d_account_requests?id=eq.' + encodeURIComponent (body.requestId), {
            method : 'PATCH',
            headers : { Prefer : 'return=minimal' },
            body : JSON.stringify ({
                status : 'approved',
                reviewed_by : actor.id,
                reviewed_at : new Date ().toISOString (),
                created_user_id : user.id
            })
        });
    }
    await audit (context.env, actor, fromRequest ? 'USER_REQUEST_APPROVE' : 'USER_CREATE', 'user', user.id, {
        email : user.email,
        organizationId : organizationId || null,
        role : organizationId ? role : null,
        platformAdmin : body.platformAdmin === true
    });
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

async function createOrganization (context, actor)
{
    const body = await context.request.json ();
    const name = String (body.name || '').trim ().slice (0, 120);
    const slug = slugify (body.slug || name);
    if (!name) { throw Object.assign (new Error ('Organization name is required.'), { status : 400 }); }
    const response = await request (context.env, '/rest/v1/auto3d_organizations', {
        method : 'POST',
        headers : { Prefer : 'return=representation' },
        body : JSON.stringify ({ name, slug })
    });
    const organization = (await response.json ())[0];
    await audit (context.env, actor, 'ORGANIZATION_CREATE', 'organization', organization.id, { name, slug });
    return json ({ organization }, 201);
}

async function updateUser (context, actor, id)
{
    const body = await context.request.json ();
    const currentResponse = await request (context.env, '/rest/v1/auto3d_users?select=id,email,status,is_platform_admin&id=eq.' + encodeURIComponent (id) + '&limit=1');
    const current = (await currentResponse.json ())[0];
    if (!current) { throw Object.assign (new Error ('User not found.'), { status : 404 }); }

    const patch = { updated_at : new Date ().toISOString () };
    if (body.status !== undefined) {
        const status = String (body.status);
        if (!UserStatuses.has (status)) { throw Object.assign (new Error ('Invalid user status.'), { status : 400 }); }
        if (id === actor.id && status !== 'active') { throw Object.assign (new Error ('You cannot disable your own administrator account.'), { status : 400 }); }
        patch.status = status;
    }
    if (body.platformAdmin !== undefined) {
        if (id === actor.id && body.platformAdmin !== true) { throw Object.assign (new Error ('You cannot remove your own platform-admin access.'), { status : 400 }); }
        patch.is_platform_admin = body.platformAdmin === true;
    }

    await request (context.env, '/rest/v1/auto3d_users?id=eq.' + encodeURIComponent (id), {
        method : 'PATCH',
        headers : { Prefer : 'return=minimal' },
        body : JSON.stringify (patch)
    });
    if (body.organizationId !== undefined) {
        const organizationId = String (body.organizationId || '');
        if (organizationId) {
            await setMembership (context.env, id, organizationId, String (body.role || 'viewer'));
        } else {
            await request (context.env, '/rest/v1/auto3d_organization_members?user_id=eq.' + encodeURIComponent (id), {
                method : 'DELETE',
                headers : { Prefer : 'return=minimal' }
            });
        }
    }
    await audit (context.env, actor, 'USER_UPDATE', 'user', id, patch);
    return json ({ ok : true });
}

async function resetPassword (context, actor, id)
{
    const response = await request (context.env, '/rest/v1/auto3d_users?select=id,auth_user_id,email&id=eq.' + encodeURIComponent (id) + '&limit=1');
    const target = (await response.json ())[0];
    if (!target || !target.auth_user_id) { throw Object.assign (new Error ('Authentication user not found.'), { status : 404 }); }
    const password = temporaryPassword ();
    const { url, secret } = config (context.env);
    const authResponse = await fetch (url + '/auth/v1/admin/users/' + encodeURIComponent (target.auth_user_id), {
        method : 'PUT',
        headers : { apikey : secret, Authorization : 'Bearer ' + secret, 'Content-Type' : 'application/json' },
        body : JSON.stringify ({ password })
    });
    if (!authResponse.ok) {
        const detail = await authResponse.json ().catch (() => ({}));
        throw Object.assign (new Error (detail.msg || detail.message || 'Unable to reset password.'), { status : authResponse.status });
    }
    await audit (context.env, actor, 'USER_PASSWORD_RESET', 'user', id, { email : target.email });
    return json ({ temporaryPassword : password });
}

async function deleteUser (context, actor, id)
{
    const response = await request (context.env, '/rest/v1/auto3d_users?select=id,auth_user_id,email&id=eq.' + encodeURIComponent (id) + '&limit=1');
    const target = (await response.json ())[0];
    if (!target) { throw Object.assign (new Error ('User not found.'), { status : 404 }); }
    if (target.id === actor.id) { throw Object.assign (new Error ('You cannot delete your own administrator account.'), { status : 400 }); }

    if (target.auth_user_id) {
        const { url, secret } = config (context.env);
        const authDelete = await fetch (url + '/auth/v1/admin/users/' + encodeURIComponent (target.auth_user_id), {
            method : 'DELETE',
            headers : { apikey : secret, Authorization : 'Bearer ' + secret }
        });
        if (!authDelete.ok && authDelete.status !== 404) {
            throw Object.assign (new Error ('Unable to delete authentication user.'), { status : authDelete.status });
        }
    }
    await request (context.env, '/rest/v1/auto3d_organization_members?user_id=eq.' + encodeURIComponent (id), {
        method : 'DELETE',
        headers : { Prefer : 'return=minimal' }
    });
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
        const id = String (path[1] || '');

        if (context.request.method === 'GET' && !action) { return list (context, actor); }
        if (context.request.method === 'POST' && action === 'approve') { return createUser (context, actor, true); }
        if (context.request.method === 'POST' && action === 'decline') { return decline (context, actor); }
        if (context.request.method === 'POST' && action === 'organizations') { return createOrganization (context, actor); }
        if (context.request.method === 'POST' && action === 'users' && !id) { return createUser (context, actor, false); }
        if (context.request.method === 'PATCH' && action === 'users' && id) { return updateUser (context, actor, id); }
        if (context.request.method === 'POST' && action === 'users' && id && path[2] === 'reset-password') { return resetPassword (context, actor, id); }
        if (context.request.method === 'DELETE' && action === 'users' && id) { return deleteUser (context, actor, id); }
        return json ({ error : 'Not found.' }, 404);
    } catch (error) {
        console.error (error);
        return json ({ error : error.message || 'Admin API unavailable.' }, error.status || 500);
    }
}
