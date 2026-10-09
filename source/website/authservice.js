export class AuthService
{
    constructor (fetchImpl = fetch)
    {
        this.fetch = (...args) => fetchImpl (...args); this.user = null; this.listeners = new Set (); this.restoring = null; this.tail = Promise.resolve (); this.generation = 0; this.loggedOut = false;
        this.storageKey = 'auto3d-explicit-logout-v1';
        try { this.loggedOut = localStorage.getItem (this.storageKey) === '1'; } catch { /* Storage unavailable. */ }
        if (typeof window !== 'undefined') {
            window.addEventListener ('storage', (event) => {
                if (event.key !== this.storageKey) { return; }
                this.generation++;
                if (event.newValue === '1') { this.loggedOut = true; this.Update (null); }
                else { this.loggedOut = false; this.Restore ().catch (() => {}); }
            });
        }
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
        if (this.loggedOut) { return this.Update (null); }
        if (this.restoring) { return this.restoring; }
        const generation = this.generation;
        this.restoring = this.Queue (async () => {
            try {
                let data;
                try { data = await this.Request ('session'); }
                catch (error) { if (error.status !== 401) { throw error; } data = await this.Request ('refresh'); }
                if (this.loggedOut || generation !== this.generation) { return this.user; }
                return this.Update (data.user);
            } catch (error) { if (generation === this.generation) { this.Update (null); } if (error.status === 401) { return null; } throw error; }
            finally { this.restoring = null; }
        });
        return this.restoring;
    }

    Recover (email) { return this.Request ('recover', { email }); }
    ResetPassword (accessToken, password) { return this.Request ('reset-password', { accessToken, password }); }
    SignIn (email, password)
    {
        const generation = ++this.generation;
        return this.Queue (async () => {
            const data = await this.Request ('login', { email, password });
            if (generation !== this.generation) { return this.user; }
            this.loggedOut = false;
            try { localStorage.removeItem (this.storageKey); } catch { /* Storage unavailable. */ }
            return this.Update (data.user);
        });
    }
    SignOut ()
    {
        this.generation++; this.loggedOut = true;
        try { localStorage.setItem (this.storageKey, '1'); } catch { /* Storage unavailable. */ }
        this.Update (null);
        return this.Queue (async () => { await this.Request ('logout'); return this.Inspect (); });
    }
}
