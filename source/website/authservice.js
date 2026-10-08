export class AuthService
{
    constructor (fetchImpl = fetch)
    {
        this.fetch = (...args) => fetchImpl (...args); this.user = null; this.listeners = new Set (); this.restoring = null; this.tail = Promise.resolve ();
    }

    Subscribe (listener) { this.listeners.add (listener); return () => this.listeners.delete (listener); }
    Update (user) { this.user = user; this.listeners.forEach ((listener) => listener (this.user)); return this.user; }
    Inspect () { return { signedIn : Boolean (this.user), user : this.user ? { ...this.user } : null }; }
    Queue (operation) { const result = this.tail.then (operation, operation); this.tail = result.catch (() => {}); return result; }

    async Request (action, body)
    {
        let response;
        try {
            response = await this.fetch ('/api/auth/' + action, { method : action === 'session' ? 'GET' : 'POST', credentials : 'same-origin', headers : { 'Content-Type' : 'application/json' }, ...(body ? { body : JSON.stringify (body) } : {}) });
        } catch { throw new Error ('Sign-in service is unavailable. Try again.'); }
        let data;
        try { data = await response.json (); } catch { throw new Error ('Sign-in service is unavailable. Try again.'); }
        if (!response.ok) { throw Object.assign (new Error (data.error || 'Sign-in failed.'), { status : response.status }); }
        return data;
    }

    async Restore ()
    {
        if (this.restoring) { return this.restoring; }
        this.restoring = this.Queue (async () => {
            try {
                let data;
                try { data = await this.Request ('session'); }
                catch (error) { if (error.status !== 401) { throw error; } data = await this.Request ('refresh'); }
                return this.Update (data.user);
            } catch (error) { if (error.status === 401) { return this.Update (null); } throw error; }
            finally { this.restoring = null; }
        });
        return this.restoring;
    }

    SignIn (email, password) { return this.Queue (async () => { const data = await this.Request ('login', { email, password }); return this.Update (data.user); }); }
    SignOut () { return this.Queue (async () => { try { await this.Request ('logout'); } finally { this.Update (null); } return this.Inspect (); }); }
}
