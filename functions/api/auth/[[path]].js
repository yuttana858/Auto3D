const DefaultSupabaseUrl = 'https://iesepcoxqochycckbwoh.supabase.co';
const DefaultPublishableKey = 'sb_publishable_CmRJpuYE32OBF9rIV1jwqQ_diMF7OXh';
const AccessCookie = 'auto3d_access';
const RefreshCookie = 'auto3d_refresh';

function json (data, status = 200, headers = {})
{
    return new Response (JSON.stringify (data), {
        status,
        headers : { 'Content-Type' : 'application/json', 'Cache-Control' : 'no-store', 'X-Content-Type-Options' : 'nosniff', ...headers }
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

function cookieMap (request)
{
    const result = {};
    const raw = request.headers.get ('Cookie') || '';
    for (const part of raw.split (';')) {
        const index = part.indexOf ('=');
        if (index < 0) { continue; }
        result[part.slice (0, index).trim ()] = decodeURIComponent (part.slice (index + 1).trim ());
    }
    return result;
}

function cookie (name, value, maxAge)
{
    return name + '=' + encodeURIComponent (value) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge;
}

async function authFetch (env, path, options = {})
{
    const { url, publishable } = config (env);
    const headers = { apikey : publishable, 'Content-Type' : 'application/json', ...options.headers };
    return fetch (url + path, { ...options, headers });
}

async function userFromToken (env, token)
{
    if (!token) { return null; }
    const response = await authFetch (env, '/auth/v1/user', { headers : { Authorization : 'Bearer ' + token } });
    return response.ok ? response.json () : null;
}

async function appProfile (env, authUser)
{
    const { url, secret } = config (env);
    if (!secret || !authUser) {
        return { user : authUser ? { id : authUser.id, email : authUser.email, displayName : authUser.user_metadata?.display_name || authUser.user_metadata?.name || null } : null, organization : null, permissions : [] };
    }
    const headers = { apikey : secret, Authorization : 'Bearer ' + secret };
    const query = '/rest/v1/auto3d_users?select=id,email,display_name,status,is_platform_admin&auth_user_id=eq.' + encodeURIComponent (authUser.id) + '&limit=1';
    const response = await fetch (url + query, { headers });
    const rows = response.ok ? await response.json () : [];
    const profile = rows[0];
    if (!profile || profile.status !== 'active') { return { user : null, organization : null, permissions : [] }; }

    let organization = null;
    let permissions = profile.is_platform_admin ? ['platform.admin'] : [];
    const membershipResponse = await fetch (url + '/rest/v1/auto3d_organization_members?select=role,organization_id,auto3d_organizations(id,name,slug,status)&user_id=eq.' + encodeURIComponent (profile.id) + '&status=eq.active&limit=1', { headers });
    if (membershipResponse.ok) {
        const memberships = await membershipResponse.json ();
        const membership = memberships[0];
        if (membership?.auto3d_organizations?.status === 'active') {
            organization = membership.auto3d_organizations;
            const role = membership.role;
            const rolePermissions = {
                owner : ['library.read','library.write','share.create','share.revoke','user.invite','user.manage','organization.manage'],
                admin : ['library.read','library.write','share.create','share.revoke','user.invite','user.manage'],
                editor : ['library.read','library.write','share.create'],
                viewer : ['library.read']
            };
            permissions = [...new Set ([...permissions, ...(rolePermissions[role] || [])])];
        }
    }

    return {
        user : { id : profile.id, authUserId : authUser.id, email : profile.email, displayName : profile.display_name, platformAdmin : profile.is_platform_admin },
        organization,
        permissions
    };
}

async function login (context)
{
    let body;
    try { body = await context.request.json (); } catch { return json ({ error : 'Invalid sign-in request.' }, 400); }
    const email = String (body.email || '').trim ().toLowerCase ();
    const password = String (body.password || '');
    if (!email || !password) { return json ({ error : 'Email and password are required.' }, 400); }

    const response = await authFetch (context.env, '/auth/v1/token?grant_type=password', {
        method : 'POST',
        body : JSON.stringify ({ email, password })
    });
    const data = await response.json ().catch (() => ({}));
    if (!response.ok || !data.access_token) { return json ({ error : data.error_description || data.msg || 'Incorrect email or password.' }, 401); }

    const authUser = data.user || await userFromToken (context.env, data.access_token);
    const profile = await appProfile (context.env, authUser);
    if (!profile.user) { return json ({ error : 'This Auto3D account is not active.' }, 403); }

    const headers = new Headers ();
    headers.append ('Set-Cookie', cookie (AccessCookie, data.access_token, Math.max (60, Number (data.expires_in || 3600))));
    headers.append ('Set-Cookie', cookie (RefreshCookie, data.refresh_token || '', 60 * 60 * 24 * 30));
    return json (profile, 200, headers);
}

async function refresh (env, refreshToken)
{
    if (!refreshToken) { return null; }
    const response = await authFetch (env, '/auth/v1/token?grant_type=refresh_token', {
        method : 'POST',
        body : JSON.stringify ({ refresh_token : refreshToken })
    });
    if (!response.ok) { return null; }
    return response.json ();
}

async function session (context)
{
    const cookies = cookieMap (context.request);
    let access = cookies[AccessCookie] || '';
    let authUser = await userFromToken (context.env, access);
    let refreshed = null;
    if (!authUser && cookies[RefreshCookie]) {
        refreshed = await refresh (context.env, cookies[RefreshCookie]);
        access = refreshed?.access_token || '';
        authUser = await userFromToken (context.env, access);
    }
    if (!authUser) { return json ({ user : null, organization : null, permissions : [] }); }
    const profile = await appProfile (context.env, authUser);
    if (!refreshed) { return json (profile); }
    const headers = new Headers ();
    headers.append ('Set-Cookie', cookie (AccessCookie, refreshed.access_token, Math.max (60, Number (refreshed.expires_in || 3600))));
    headers.append ('Set-Cookie', cookie (RefreshCookie, refreshed.refresh_token || cookies[RefreshCookie], 60 * 60 * 24 * 30));
    return json (profile, 200, headers);
}

async function requestAccess (context)
{
    const { url, secret } = config (context.env);
    if (!secret) { return json ({ error : 'Account requests are not configured yet.' }, 503); }
    let body;
    try { body = await context.request.json (); } catch { return json ({ error : 'Invalid account request.' }, 400); }
    const email = String (body.email || '').trim ().toLowerCase ();
    const displayName = String (body.displayName || '').trim ().slice (0, 120);
    const organizationName = String (body.organizationName || '').trim ().slice (0, 120);
    const message = String (body.message || '').trim ().slice (0, 1000);
    if (!/^\S+@\S+\.\S+$/.test (email)) { return json ({ error : 'Enter a valid email address.' }, 400); }

    const headers = { apikey : secret, Authorization : 'Bearer ' + secret, 'Content-Type' : 'application/json', Prefer : 'return=minimal' };
    const response = await fetch (url + '/rest/v1/auto3d_account_requests', {
        method : 'POST', headers,
        body : JSON.stringify ({ email, display_name : displayName || null, organization_name : organizationName || null, message : message || null })
    });
    if (!response.ok) {
        const detail = await response.json ().catch (() => ({}));
        if (response.status === 409) { return json ({ error : 'A pending request already exists for this email.' }, 409); }
        console.error ('Account request error', response.status, detail);
        return json ({ error : 'Unable to submit account request.' }, 502);
    }
    return json ({ ok : true }, 201);
}

function logout ()
{
    const headers = new Headers ();
    headers.append ('Set-Cookie', cookie (AccessCookie, '', 0));
    headers.append ('Set-Cookie', cookie (RefreshCookie, '', 0));
    return json ({ ok : true }, 200, headers);
}

export async function onRequest (context)
{
    const path = context.params.path || [];
    const action = String (path[0] || '');
    if (context.request.method === 'GET' && action === 'session') { return session (context); }
    if (context.request.method === 'POST' && action === 'login') { return login (context); }
    if (context.request.method === 'POST' && action === 'logout') { return logout (); }
    if (context.request.method === 'POST' && action === 'request') { return requestAccess (context); }
    return json ({ error : 'Not found.' }, 404);
}
