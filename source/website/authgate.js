import { AccountConsole } from './accountpaths.js';
// With a landing page, the gate starts embedded in it: the user signs in there, or continues
// with a saved sign-in. Once the landing closes the gate is a full-screen layer again, shown
// whenever the account locks (sign-out, revocation). Server checks remain authoritative.
export function InstallAuthGate (website, { landing = null } = {})
{
    const auth = website.auth;
    let onLanding = Boolean (landing), continued = false, restoring = false, loadedFor = null;
    const screen = document.createElement ('section'); screen.id = 'auth_gate'; screen.setAttribute ('aria-label', 'Auto3D login');
    const panel = website.authPanel.Create (landing ? () => Continue () : null); screen.appendChild (panel);
    if (onLanding) { screen.classList.add ('auth_gate_embedded'); landing.host.appendChild (screen); } else { document.body.appendChild (screen); }
    const retry = document.createElement ('button'); retry.className = 'auth_retry'; retry.textContent = 'Check saved sign-in';
    const status = document.createElement ('p'); status.setAttribute ('role', 'status'); screen.append (retry, status);
    const check = async (silent = false) => { retry.disabled = true; restoring = true; status.textContent = 'Checking saved sign-in…'; try { await auth.Restore (); if (auth.user && !website.accountReady) { await render (); } else if (!auth.user) { status.textContent = ''; } } catch { status.textContent = silent ? '' : 'Could not verify saved sign-in. Please sign in again.'; } finally { restoring = false; retry.disabled = false; } };
    // Continue from the landing page into the workspace; only meaningful while signed in.
    const Continue = async () => { if (!auth.user || !onLanding || continued) { return { continued : !onLanding && Boolean (auth.user) }; } continued = true; await render (); return { continued : true }; };
    retry.addEventListener ('click', () => check ());
    let unlocked = false;
    let generation = 0;
    website.accountReady = false;
    const render = async () => {
        const current = ++generation;
        const locked = !auth.user || Boolean (website.authPanel.recovery);
        if (!locked && unlocked) { website.accountReady = false; window.location.reload (); return; }
        if (!locked && !unlocked) {
            if (loadedFor !== auth.user.id || !website.accountReady) {
                website.accountReady = false; status.textContent = 'Loading your account preferences…';
                try { await website.preferences.LoadAccount (auth.user.id); }
                catch (error) { if (current === generation) { status.textContent = error.message; } return; }
                if (current !== generation || !auth.user) { return; }
                website.accountReady = true; loadedFor = auth.user.id; status.textContent = '';
            }
            // A saved sign-in pauses on the landing page until the user continues.
            if (onLanding && !continued) { screen.hidden = false; retry.hidden = true; return; }
        }
        document.body.classList.toggle ('auth_locked', locked); screen.hidden = !locked && !onLanding; retry.hidden = !locked || Boolean (website.authPanel.recovery);
        for (const id of ['main', 'header', 'toolbar', 'intro', 'material_drawer', 'advance_animation_panel']) { const element = document.getElementById (id); if (element) { element.inert = locked; } }
        if (locked) {
            website.accountReady = false; loadedFor = null; continued = false;
            website.preferences.LockAccount ();
            if (unlocked) { website.sessionEditor.dirty = false; }
            document.querySelectorAll ('dialog[open]').forEach ((dialog) => dialog.close ());
            website.sessionEditor.timeline?.Stop (); website.sessionEditor.controls.detach (); website.commands?.Cancel (); website.sessionEditor.polygonOptimizer?.Cancel ();
            website.sessionEditor.closeContextMenu?.();
        } else {
            unlocked = true;
            if (onLanding) { onLanding = false; screen.hidden = true; screen.classList.remove ('auth_gate_embedded'); document.body.appendChild (screen); landing.Dismiss (); }
            else { document.getElementById ('startup_splash')?.remove (); }
            if (website.sessionEditor.readOnly) { website.sessionEditor.LoadShared (); } else { website.OnHashChange (); if (!website.hashHandler.HasHash ()) { website.sessionEditor.OfferRecovery (); } }
            if (new URLSearchParams (window.location.search).get ('console') === AccountConsole) { website.accountAdmin.Open ().catch ((error) => website.sessionEditor.Status (error.message)); }
        }
    };
    // Identity refreshes must not reload an already unlocked workspace.
    let wasSignedIn = false;
    // Signing in with the form on the landing page is the user's action, so it continues straight in.
    // Automated browsers (tests, browser-driving agents) also continue once a sign-in is confirmed.
    const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
    auth.Subscribe (() => { const signedIn = Boolean (auth.user); if (signedIn && !wasSignedIn && onLanding && (!restoring || automated)) { continued = true; } if (signedIn !== wasSignedIn) { render (); } wasSignedIn = signedIn; });
    render (); if (website.authPanel.recovery) { retry.hidden = true; } else { check (true); }
    const verify = () => { if (auth.user && !document.hidden) { auth.VerifyCurrentSession ().catch (() => {}); } };
    window.setInterval (verify, 30000); window.addEventListener ('focus', verify); document.addEventListener ('visibilitychange', verify);
    const gate = { check, Continue, Inspect : () => ({ onLanding, signedIn : Boolean (auth.user), awaitingContinue : onLanding && Boolean (auth.user) && website.accountReady === true && !continued }) };
    website.authGate = gate; return gate;
}
