import { BindAgentDialog } from './agentindicator.js';
import { WorkspaceDialog } from './modellibrary.js';

export function CaptureRecovery ()
{
    const hash = new URLSearchParams (window.location.hash.slice (1));
    if (hash.get ('type') !== 'recovery' && new URLSearchParams (window.location.search).get ('password') !== 'recovery') { return null; }
    const token = hash.get ('access_token');
    const recovery = { accessToken : token || null, error : hash.get ('error_description') || (!token ? 'Recovery link is expired or incomplete. Request a new link.' : null) };
    window.history.replaceState (null, '', window.location.pathname); return recovery;
}

function PasswordVisibility (password)
{
    const toggle = document.createElement ('button'); toggle.type = 'button'; toggle.className = 'password_eye'; toggle.setAttribute ('aria-label', 'Show password'); toggle.setAttribute ('aria-pressed', 'false'); toggle.title = 'Show password';
    toggle.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    toggle.addEventListener ('click', () => { const visible = password.type === 'password'; password.type = visible ? 'text' : 'password'; toggle.setAttribute ('aria-pressed', String (visible)); toggle.setAttribute ('aria-label', visible ? 'Hide password' : 'Show password'); toggle.title = visible ? 'Hide password' : 'Show password'; });
    const wrapper = document.createElement ('div'); wrapper.className = 'password_input'; wrapper.append (password, toggle); return wrapper;
}

export class AuthPanel
{
    constructor (auth, admin, agentConnection = null)
    {
        this.auth = auth; this.admin = admin; this.agentConnection = agentConnection; this.dialog = null;
        const header = document.getElementById ('header_buttons');
        this.button = document.createElement ('button'); this.button.className = 'auth_header_button';
        this.button.addEventListener ('click', () => this.Open ()); header.appendChild (this.button); const fullscreen = header.querySelector ('.header_fullscreen_button'); if (fullscreen) { header.appendChild (fullscreen); }
        auth.Subscribe (() => { this.button.textContent = auth.user ? (auth.user.name || auth.user.email?.split ('@')[0].replace (/[._-]/g, ' ').replace (/\b[a-z]/g, (letter) => letter.toUpperCase ()) || 'Account') : 'Sign in'; this.button.title = auth.user?.email || 'Sign in'; });
        this.button.textContent = 'Sign in';
    }

    Open ()
    {
        if (this.dialog?.isConnected) { this.dialog.focus (); return { opened : true }; }
        const dialog = WorkspaceDialog ('Auto3D account'); this.dialog = dialog; BindAgentDialog (dialog, this.agentConnection);
        const panel = this.Create (() => dialog.close ()); dialog.appendChild (panel);
        dialog.addEventListener ('close', () => { panel.dispose (); this.dialog = null; }, { once : true });
        panel.querySelector ('input, button')?.focus ();
        return { opened : true };
    }

    Create (onContinue = null)
    {
        if (this.recovery) { return this.CreateRecovery (); }
        const panel = document.createElement ('section'); panel.className = 'auth_panel'; panel.setAttribute ('aria-label', 'Auto3D sign in');
        const heading = document.createElement ('h2'); heading.textContent = 'Sign in to Auto3D';
        const form = document.createElement ('form');
        const emailLabel = document.createElement ('label'); emailLabel.textContent = 'Email';
        const email = document.createElement ('input'); email.type = 'email'; email.autocomplete = 'username'; email.required = true; email.maxLength = 254; emailLabel.appendChild (email);
        const passwordLabel = document.createElement ('label'); passwordLabel.textContent = 'Password';
        const password = document.createElement ('input'); password.type = 'password'; password.autocomplete = 'current-password'; password.required = true; password.maxLength = 1024; password.setAttribute ('aria-label', 'Password'); passwordLabel.appendChild (PasswordVisibility (password));
        const submit = document.createElement ('button'); submit.type = 'submit'; submit.textContent = 'Sign in';
        const status = document.createElement ('p'); status.className = 'auth_status'; status.setAttribute ('role', 'status'); status.setAttribute ('aria-live', 'polite');
        const hint = document.createElement ('p'); hint.className = 'auth_hint'; hint.textContent = 'Use the account provided by your administrator. Request an account below.';
        const signOut = document.createElement ('button'); signOut.type = 'button'; signOut.textContent = 'Sign out';
        const requestAccount = document.createElement ('button'); requestAccount.type = 'button'; requestAccount.textContent = 'Request an account';
        requestAccount.addEventListener ('click', () => this.admin.OpenRequest ());
        const forgot = document.createElement ('button'); forgot.type = 'button'; forgot.textContent = 'Forgot Password';
        let busy = false;
        const render = () => {
            const user = this.auth.user; form.hidden = Boolean (user); hint.hidden = Boolean (user); signOut.hidden = !user; forgot.hidden = Boolean (user); requestAccount.hidden = Boolean (user);
            heading.textContent = user ? 'Welcome back' : 'Sign in to Auto3D';
            if (!busy) { status.textContent = user ? 'Signed in as ' + (user.email || 'Auto3D user') : ''; }
            email.disabled = password.disabled = submit.disabled = signOut.disabled = forgot.disabled = busy;
        };
        forgot.addEventListener ('click', () => { if (!busy) { status.textContent = this.PasswordHelp ().message; } });
        form.addEventListener ('submit', async (event) => {
            event.preventDefault (); if (busy) { return; } busy = true; render (); status.textContent = 'Signing in…';
            try { await this.auth.SignIn (email.value, password.value); status.textContent = 'Signed in as ' + (this.auth.user.email || 'Auto3D user'); }
            catch (error) { status.textContent = /unavailable/i.test (error.message) ? 'Sign-in could not be completed. Please try again.' : error.message; }
            finally { password.value = ''; password.type = 'password'; busy = false; email.disabled = password.disabled = submit.disabled = signOut.disabled = forgot.disabled = false; }
        });
        signOut.addEventListener ('click', async () => {
            if (busy) { return; } busy = true; render (); status.textContent = 'Signing out…';
            let message = '';
            try { await this.auth.SignOut (); } catch (error) { message = error.message; }
            finally { busy = false; render (); status.textContent = message || 'Signed out.'; }
        });
        form.append (emailLabel, passwordLabel, submit); panel.append (heading, form, forgot, status, hint, requestAccount, signOut);
        if (onContinue) {
            const proceed = document.createElement ('button'); proceed.type = 'button'; proceed.className = 'auth_continue';
            const update = () => { proceed.textContent = 'Continue to workspace'; proceed.hidden = !this.auth.user; }; update ();
            proceed.addEventListener ('click', () => { if (this.auth.user) { onContinue (); } }); panel.appendChild (proceed);
            const unsubscribeContinue = this.auth.Subscribe (update); panel.dispose = () => unsubscribeContinue ();
        }
        let unsubscribeAgent = null;
        if (this.agentConnection) {
            const agent = document.createElement ('section'); agent.setAttribute ('aria-label', 'Agent connection');
            const title = document.createElement ('h3'); title.textContent = 'Agent connection';
            const label = document.createElement ('label'); label.textContent = 'Window name'; const input = document.createElement ('input'); input.value = this.agentConnection.label || 'Auto3D window'; input.maxLength = 80; label.appendChild (input);
            const toggle = document.createElement ('button'); toggle.type = 'button'; const agentStatus = document.createElement ('p'); agentStatus.setAttribute ('role', 'status');
            const updateAgent = () => { const state = this.agentConnection.Inspect (); agent.hidden = !this.auth.user; toggle.textContent = state.status === 'disconnected' ? 'Connect this window' : 'Disconnect'; agentStatus.textContent = state.status === 'connected' ? state.agents.length ? 'Connected: ' + state.agents.map (agent => agent.name + (agent.domain ? '' : ' (client-reported)')).join (', ') : 'Window ready for an agent' : state.status === 'connecting' ? 'Connecting…' : 'Not connected'; input.disabled = state.status !== 'disconnected'; };
            toggle.addEventListener ('click', () => { try { if (this.agentConnection.status === 'disconnected') { this.agentConnection.Connect (input.value); } else { this.agentConnection.Disconnect (); } } catch (error) { agentStatus.textContent = error.message; } });
            const grantsButton = document.createElement ('button'); grantsButton.type = 'button'; grantsButton.textContent = 'Manage agent access';
            const grants = document.createElement ('div'); grants.hidden = true; let cursor = null;
            const loadGrants = async (append = false) => {
                grantsButton.disabled = true; try {
                    const page = await this.agentConnection.ListGrants (append ? cursor : null); if (!append) { grants.replaceChildren (); } cursor = page.cursor;
                    for (const grant of page.grants) {
                        const row = document.createElement ('div'); const text = document.createElement ('span'); text.textContent = grant.clientId + ' · ' + grant.scope.join (', '); const revoke = document.createElement ('button'); revoke.type = 'button'; revoke.textContent = 'Revoke access';
                        revoke.addEventListener ('click', async () => { if (!window.confirm ('Revoke this agent’s access to your Auto3D account?')) { return; } revoke.disabled = true; try { await this.agentConnection.RevokeGrant (grant.id); row.remove (); agentStatus.textContent = 'Revocation requested. Access may take a moment to stop.'; } catch (error) { agentStatus.textContent = error.message; revoke.disabled = false; } }); row.append (text, revoke); grants.appendChild (row);
                    }
                    more.hidden = !cursor; if (!grants.children.length) { agentStatus.textContent = 'No agent authorizations found.'; }
                } catch (error) { agentStatus.textContent = error.message; } finally { grantsButton.disabled = false; }
            };
            const more = document.createElement ('button'); more.type = 'button'; more.textContent = 'Load more'; more.hidden = true; more.addEventListener ('click', () => loadGrants (true));
            grantsButton.addEventListener ('click', () => { grants.hidden = false; loadGrants (); });
            unsubscribeAgent = this.agentConnection.Subscribe (updateAgent); agent.append (title, label, toggle, agentStatus, grantsButton, grants, more); panel.appendChild (agent); updateAgent ();
            let agentOwner = this.auth.user?.id || null; const agentAuth = this.auth.Subscribe (user => { if (!user || user.id !== agentOwner) { grants.replaceChildren (); grants.hidden = true; more.hidden = true; cursor = null; agentOwner = user?.id || null; } updateAgent (); }); const oldUnsubscribe = unsubscribeAgent; unsubscribeAgent = () => { oldUnsubscribe (); agentAuth (); };
        }
        const unsubscribe = this.auth.Subscribe (render); const dispose = panel.dispose;
        panel.dispose = () => { unsubscribe (); unsubscribeAgent?.(); dispose?.(); password.value = ''; };
        render (); return panel;
    }
    PasswordHelp () { return { method : 'administrator', message : 'Ask your Auto3D account administrator to reset your password.' }; }
    CreateRecovery ()
    {
        const recovery = this.recovery;
        const panel = document.createElement ('section'); panel.className = 'auth_panel'; panel.setAttribute ('aria-label', 'Reset Auto3D password');
        const heading = document.createElement ('h2'); heading.textContent = 'Choose a new password';
        const form = document.createElement ('form');
        const label = document.createElement ('label'); label.textContent = 'New password';
        const password = document.createElement ('input'); password.type = 'password'; password.autocomplete = 'new-password'; password.minLength = 12; password.maxLength = 1024; password.required = true; password.setAttribute ('aria-label', 'New password'); label.appendChild (PasswordVisibility (password));
        const confirmLabel = document.createElement ('label'); confirmLabel.textContent = 'Confirm password';
        const confirm = document.createElement ('input'); confirm.type = 'password'; confirm.autocomplete = 'new-password'; confirm.required = true; confirm.setAttribute ('aria-label', 'Confirm password'); confirmLabel.appendChild (confirm);
        const submit = document.createElement ('button'); submit.type = 'submit'; submit.textContent = 'Change password'; submit.disabled = !recovery.accessToken;
        const status = document.createElement ('p'); status.setAttribute ('role', 'status'); status.textContent = recovery.error || 'Use at least 12 characters. Your recovery link will not open the workspace.';
        const back = document.createElement ('button'); back.type = 'button'; back.textContent = 'Return to sign in'; back.addEventListener ('click', () => { recovery.accessToken = null; window.location.replace ('/'); });
        form.addEventListener ('submit', async (event) => {
            event.preventDefault (); if (password.value !== confirm.value) { status.textContent = 'Passwords must match.'; return; }
            submit.disabled = true;
            try { const result = await this.auth.ResetPassword (recovery.accessToken, password.value); recovery.accessToken = null; await this.auth.SignOut ().catch (() => {}); status.textContent = result.message; form.hidden = true; }
            catch (error) { status.textContent = error.message; submit.disabled = false; }
            finally { password.value = confirm.value = ''; }
        });
        form.append (label, confirmLabel, submit); panel.append (heading, form, status, back); panel.dispose = () => { password.value = confirm.value = ''; recovery.accessToken = null; }; return panel;
    }

}
