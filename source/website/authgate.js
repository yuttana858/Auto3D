import { AccountConsole } from './accountpaths.js';
import { CreateEngineeringLanding } from './engineeringlanding.js';
import { AppVersion } from './preferences.js';

// The presentation hosts the existing account form and saved-session Continue flow.
// Workspace access still waits for server identity and account preferences.
export function InstallAuthGate (website)
{
    const auth = website.auth;
    let onLanding = true, continued = false, restoring = false, loadedFor = null, started = false;
    const screen = document.createElement ('section'); screen.id = 'auth_gate'; screen.setAttribute ('aria-label', 'Auto3D login');
    const panel = website.authPanel.Create (() => Continue ()); document.body.appendChild (screen);
    const landing = CreateEngineeringLanding (screen, { panel, onSignIn : () => showSignIn (), onRequest : () => website.accountAdmin.OpenRequest (), version : 'v' + AppVersion });
    document.getElementById ('startup_splash')?.remove ();
    const retry = document.createElement ('button'); retry.className = 'auth_retry'; retry.textContent = 'Check saved sign-in';
    const status = document.createElement ('p'); status.setAttribute ('role', 'status'); landing.session.append (retry, status);
    const check = async (silent = false) => { started = true; retry.disabled = true; restoring = true; status.textContent = 'Checking saved sign-in…'; try { await auth.Restore (); if (auth.user && !website.accountReady) { await render (); } else if (!auth.user) { status.textContent = ''; } } catch { status.textContent = silent ? '' : 'Could not verify saved sign-in. Please sign in again.'; } finally { restoring = false; retry.disabled = false; } };
    const Continue = async () => { if (!auth.user || !onLanding || continued) { return { continued : !onLanding && Boolean (auth.user) }; } continued = true; await render (); return { continued : screen.hidden }; };
    retry.addEventListener ('click', () => check ());
    panel.addEventListener ('submit', () => { started = true; });
    const showSignIn = () => { const result = landing.show ('signin'); if (!started && !website.authPanel.recovery) { check (true); } return result; };
    let unlocked = false, generation = 0;
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
            // Saved sign-in waits for Continue; submitting credentials enters directly.
            if (onLanding && !continued) { screen.hidden = false; retry.hidden = true; return; }
        }
        document.body.classList.toggle ('auth_locked', locked); screen.hidden = !locked; retry.hidden = !locked || Boolean (website.authPanel.recovery);
        for (const id of ['main', 'header', 'toolbar', 'intro', 'material_drawer', 'advance_animation_panel']) { const element = document.getElementById (id); if (element) { element.inert = locked; } }
        if (locked) {
            website.accountReady = false; loadedFor = null; continued = false;
            website.preferences.LockAccount (); landing.resume ();
            if (unlocked) { website.sessionEditor.dirty = false; landing.show ('signin'); }
            document.querySelectorAll ('dialog[open]').forEach ((dialog) => dialog.close ());
            website.sessionEditor.timeline?.Stop (); website.sessionEditor.controls.detach (); website.commands?.Cancel (); website.sessionEditor.polygonOptimizer?.Cancel ();
            website.sessionEditor.closeContextMenu?.();
        } else {
            unlocked = true; onLanding = false; landing.suspend ();
            if (website.sessionEditor.readOnly) { website.sessionEditor.LoadShared (); } else { website.OnHashChange (); if (!website.hashHandler.HasHash ()) { website.sessionEditor.OfferRecovery (); } }
            if (new URLSearchParams (window.location.search).get ('console') === AccountConsole) { website.accountAdmin.Open ().catch ((error) => website.sessionEditor.Status (error.message)); }
        }
    };
    let wasSignedIn = false;
    // Preserve the existing automation path for browser-driving agents and regression fixtures.
    const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
    auth.Subscribe (() => { const signedIn = Boolean (auth.user); if (signedIn && !wasSignedIn && onLanding && (!restoring || automated)) { continued = true; } if (signedIn !== wasSignedIn) { render (); } wasSignedIn = signedIn; });
    render (); if (website.authPanel.recovery) { retry.hidden = true; showSignIn (); } else { check (true); }
    const verify = () => { if (auth.user && !document.hidden) { auth.VerifyCurrentSession ().catch (() => {}); } };
    window.setInterval (verify, 30000); window.addEventListener ('focus', verify); document.addEventListener ('visibilitychange', verify);
    const gate = { check, Continue, Started : () => started, ShowSignIn : showSignIn, ShowLanding : () => landing.show ('home'), Demo : (action, stage) => landing.demo (action, stage), Inspect : () => ({ ...landing.inspect (), onLanding, signedIn : Boolean (auth.user), awaitingContinue : onLanding && Boolean (auth.user) && website.accountReady === true && !continued }) };
    website.authGate = gate; return gate;
}
