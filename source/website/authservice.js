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

    async SignIn (email, password)
    {
        const response = await fetch (this.Endpoint ('/api/auth/login'), {
            method : 'POST',
            credentials : 'same-origin',
            headers : { 'Content-Type' : 'application/json', Accept : 'application/json' },
            body : JSON.stringify ({ email, password })
        });
        const data = await response.json ().catch (() => ({}));
        if (!response.ok) { throw new Error (data.error || 'Unable to sign in.'); }
        this.user = data.user || null;
        this.organization = data.organization || null;
        this.permissions = Array.isArray (data.permissions) ? data.permissions : [];
        return this.user;
    }

    async RequestAccess (details)
    {
        const response = await fetch (this.Endpoint ('/api/auth/request'), {
            method : 'POST',
            credentials : 'same-origin',
            headers : { 'Content-Type' : 'application/json', Accept : 'application/json' },
            body : JSON.stringify (details)
        });
        const data = await response.json ().catch (() => ({}));
        if (!response.ok) { throw new Error (data.error || 'Unable to submit request.'); }
        return data;
    }

    async ChangePassword (password)
    {
        const response = await fetch (this.Endpoint ('/api/auth/change-password'), {
            method : 'POST',
            credentials : 'same-origin',
            headers : { 'Content-Type' : 'application/json', Accept : 'application/json' },
            body : JSON.stringify ({ password })
        });
        const data = await response.json ().catch (() => ({}));
        if (!response.ok) { throw new Error (data.error || 'Unable to change password.'); }
        if (this.user) { this.user.requiresPasswordChange = false; }
        return data;
    }

    async SignOut ()
    {
        await fetch (this.Endpoint ('/api/auth/logout'), { method : 'POST', credentials : 'same-origin' });
        this.user = null; this.organization = null; this.permissions = [];
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
