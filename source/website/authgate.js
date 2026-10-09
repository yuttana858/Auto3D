import { AccountConsole } from './accountpaths.js';
export function InstallAuthGate (website)
{
    const auth = website.auth;
    const screen = document.createElement ('section'); screen.id = 'auth_gate'; screen.setAttribute ('aria-label', 'Auto3D login');
    const panel = website.authPanel.Create (); screen.appendChild (panel); document.body.appendChild (screen);
    const retry = document.createElement ('button'); retry.textContent = 'Check saved sign-in';
    const status = document.createElement ('p'); status.setAttribute ('role', 'status'); screen.append (retry, status);
    const check = async () => { retry.disabled = true; status.textContent = 'Checking saved sign-in…'; try { await auth.Restore (); if (auth.user && !website.accountReady) { await render (); } } catch (error) { status.textContent = error.message; } finally { retry.disabled = false; } };
    retry.addEventListener ('click', check);
    let unlocked = false;
    let generation = 0;
    website.accountReady = false;
    const render = async () => {
        const current = ++generation;
        const locked = !auth.user || Boolean (website.authPanel.recovery);
        if (!locked && unlocked) { website.accountReady = false; window.location.reload (); return; }
        if (!locked && !unlocked) {
            website.accountReady = false; status.textContent = 'Loading your account preferences…';
            try { await website.preferences.LoadAccount (auth.user.id); }
            catch (error) { if (current === generation) { status.textContent = error.message; } return; }
            if (current !== generation || !auth.user) { return; }
            website.accountReady = true;
        }
        document.body.classList.toggle ('auth_locked', locked); screen.hidden = !locked;
        for (const id of ['main', 'header', 'toolbar', 'intro', 'material_drawer', 'advance_animation_panel']) { const element = document.getElementById (id); if (element) { element.inert = locked; } }
        if (locked) {
            website.accountReady = false;
            if (unlocked) { website.sessionEditor.dirty = false; }
            document.querySelectorAll ('dialog[open]').forEach ((dialog) => dialog.close ());
            website.sessionEditor.timeline?.Stop (); website.sessionEditor.controls.detach (); website.commands?.Cancel ();
            website.sessionEditor.closeContextMenu?.();
        } else {
            unlocked = true;
            document.getElementById ('startup_splash')?.remove ();
            if (website.sessionEditor.readOnly) { website.sessionEditor.LoadShared (); } else { website.OnHashChange (); if (!website.hashHandler.HasHash ()) { website.sessionEditor.OfferRecovery (); } }
            if (new URLSearchParams (window.location.search).get ('console') === AccountConsole) { website.accountAdmin.Open ().catch ((error) => website.sessionEditor.Status (error.message)); }
        }
    };
    // Identity refreshes must not reload an already unlocked workspace.
    let wasSignedIn = false;
    auth.Subscribe (() => { const signedIn = Boolean (auth.user); if (signedIn !== wasSignedIn) { render (); } wasSignedIn = signedIn; });
    render (); if (website.authPanel.recovery) { retry.hidden = true; } else { check (); }
    return { check };
}
