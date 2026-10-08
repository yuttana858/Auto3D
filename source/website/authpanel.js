import { WorkspaceDialog } from './modellibrary.js';

export class AuthPanel
{
    constructor (auth, admin)
    {
        this.auth = auth; this.admin = admin; this.dialog = null;
        const header = document.getElementById ('header_buttons');
        this.button = document.createElement ('button'); this.button.className = 'auth_header_button';
        this.button.addEventListener ('click', () => this.Open ()); header.appendChild (this.button);
        auth.Subscribe (() => { this.button.textContent = auth.user ? 'Account' : 'Sign in'; });
        this.button.textContent = 'Sign in';
    }

    Open ()
    {
        if (this.dialog?.isConnected) { this.dialog.focus (); return { opened : true }; }
        const dialog = WorkspaceDialog ('Auto3D account'); this.dialog = dialog;
        const panel = this.Create (() => dialog.close ()); dialog.appendChild (panel);
        dialog.addEventListener ('close', () => { panel.dispose (); this.dialog = null; }, { once : true });
        panel.querySelector ('input, button')?.focus ();
        return { opened : true };
    }

    Create (onContinue = null)
    {
        const panel = document.createElement ('section'); panel.className = 'auth_panel'; panel.setAttribute ('aria-label', 'Auto3D sign in');
        const heading = document.createElement ('h2'); heading.textContent = 'Sign in to Auto3D';
        const form = document.createElement ('form');
        const emailLabel = document.createElement ('label'); emailLabel.textContent = 'Email';
        const email = document.createElement ('input'); email.type = 'email'; email.autocomplete = 'username'; email.required = true; email.maxLength = 254; emailLabel.appendChild (email);
        const passwordLabel = document.createElement ('label'); passwordLabel.textContent = 'Password';
        const password = document.createElement ('input'); password.type = 'password'; password.autocomplete = 'current-password'; password.required = true; password.maxLength = 1024; passwordLabel.appendChild (password);
        const submit = document.createElement ('button'); submit.type = 'submit'; submit.textContent = 'Sign in';
        const status = document.createElement ('p'); status.className = 'auth_status'; status.setAttribute ('role', 'status'); status.setAttribute ('aria-live', 'polite');
        const hint = document.createElement ('p'); hint.className = 'auth_hint'; hint.textContent = 'Use the account provided by your administrator. Request an account below. Contact your administrator for password resets.';
        const signOut = document.createElement ('button'); signOut.type = 'button'; signOut.textContent = 'Sign out';
        const requestAccount = document.createElement ('button'); requestAccount.type = 'button'; requestAccount.textContent = 'Request an account';
        requestAccount.addEventListener ('click', () => this.admin.OpenRequest ());
        let busy = false;
        const render = () => {
            const user = this.auth.user; form.hidden = Boolean (user); hint.hidden = Boolean (user); signOut.hidden = !user; requestAccount.hidden = Boolean (user);
            heading.textContent = user ? 'Welcome back' : 'Sign in to Auto3D';
            if (!busy) { status.textContent = user ? 'Signed in as ' + (user.email || 'Auto3D user') : ''; }
            email.disabled = password.disabled = submit.disabled = signOut.disabled = busy;
        };
        form.addEventListener ('submit', async (event) => {
            event.preventDefault (); if (busy) { return; } busy = true; render (); status.textContent = 'Signing in…';
            try { await this.auth.SignIn (email.value, password.value); status.textContent = 'Signed in as ' + (this.auth.user.email || 'Auto3D user'); }
            catch (error) { status.textContent = error.message; }
            finally { password.value = ''; busy = false; email.disabled = password.disabled = submit.disabled = signOut.disabled = false; }
        });
        signOut.addEventListener ('click', async () => {
            if (busy) { return; } busy = true; render (); status.textContent = 'Signing out…';
            let message = '';
            try { await this.auth.SignOut (); } catch (error) { message = error.message; }
            finally { busy = false; render (); status.textContent = message || 'Signed out.'; }
        });
        form.append (emailLabel, passwordLabel, submit); panel.append (heading, form, status, hint, requestAccount, signOut);
        if (onContinue) {
            const proceed = document.createElement ('button'); proceed.type = 'button'; proceed.className = 'auth_continue';
            const update = () => { proceed.textContent = 'Continue to workspace'; proceed.hidden = !this.auth.user; }; update ();
            proceed.addEventListener ('click', () => { if (this.auth.user) { onContinue (); } }); panel.appendChild (proceed);
            const unsubscribeContinue = this.auth.Subscribe (update); panel.dispose = () => unsubscribeContinue ();
        }
        const unsubscribe = this.auth.Subscribe (render); const dispose = panel.dispose;
        panel.dispose = () => { unsubscribe (); dispose?.(); password.value = ''; };
        render (); return panel;
    }
}
