export class AuthService
{
    constructor (options = {})
    {
        this.apiUrl = String (options.apiUrl || '').replace (/\/$/, '');
        this.user = null;
        this.organization = null;
        this.permissions = [];
        this.ready = false;
    }

    Endpoint (path)
    {
        return this.apiUrl + path;
    }

    async Initialize ()
    {
        try {
            const response = await fetch (this.Endpoint ('/api/auth/session'), {
                method : 'GET',
                credentials : 'same-origin',
                headers : { Accept : 'application/json' }
            });
            if (response.ok) {
                const session = await response.json ();
                this.user = session.user || null;
                this.organization = session.organization || null;
                this.permissions = Array.isArray (session.permissions) ? session.permissions : [];
            }
        } catch {
            // Authentication may not be configured yet. Guest mode remains available.
        }
        this.ready = true;
        return this.user;
    }

    SignIn (returnTo = window.location.href)
    {
        const url = new URL (this.Endpoint ('/api/auth/login'), window.location.origin);
        url.searchParams.set ('returnTo', returnTo);
        window.location.assign (url.href);
    }

    SignOut (returnTo = window.location.origin + window.location.pathname)
    {
        const url = new URL (this.Endpoint ('/api/auth/logout'), window.location.origin);
        url.searchParams.set ('returnTo', returnTo);
        window.location.assign (url.href);
    }

    GetUser ()
    {
        return this.user;
    }

    GetOrganization ()
    {
        return this.organization;
    }

    GetPermissions ()
    {
        return [...this.permissions];
    }

    HasPermission (permission)
    {
        return this.permissions.includes (permission);
    }
}
