import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
// The landing page is also the sign-in page. This runs as a person would see it (navigator.webdriver hidden):
// the form sits on the welcome scene, signing in opens the workspace, and a saved sign-in pauses for Continue.
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext ({ viewport : { width : 1440, height : 900 } });
await context.addInitScript (() => { Object.defineProperty (Navigator.prototype, 'webdriver', { get : () => false }); });
const user = { id : 'landing-user', email : 'landing@example.com' };
await context.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] } }));
for (const path of ['personal/items', 'environments', 'accounts/**']) { await context.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
await context.route ('**/api/auth/**', async route => {
    const action = route.request ().url ().split ('/').pop (); const cookie = (await route.request ().allHeaders ()).cookie || '';
    const signedIn = action === 'login' || (action === 'session' && cookie.includes ('auto3d-test=session'));
    await route.fulfill ({ json : { user : signedIn ? user : null }, headers : action === 'login' ? { 'Set-Cookie' : 'auto3d-test=session; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800' } : action === 'logout' ? { 'Set-Cookie' : 'auto3d-test=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' } : {} });
});
const errors = [];
const open = async () => { const page = await context.newPage (); page.setDefaultTimeout (30000); page.on ('pageerror', error => errors.push (error.message)); await page.goto ('http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' }); await page.waitForFunction (() => window.Auto3D); return page; };
const locked = page => page.waitForFunction (() => document.body.classList.contains ('auth_locked'));
const unlocked = page => page.waitForFunction (() => !document.body.classList.contains ('auth_locked') && !document.getElementById ('startup_splash'));
try {
    // Signed out: one landing page with the welcome scene and the sign-in form; nothing else bypasses it.
    let page = await open (); const landing = page.locator ('#startup_splash');
    const form = landing.locator ('#auth_gate form'); await form.waitFor ({ state : 'visible' });
    assert.equal (await landing.locator ('.splash_logo').isVisible (), true); assert.equal (await page.locator ('body > #auth_gate').count (), 0);
    await landing.click ({ position : { x : 20, y : 20 } }); await page.keyboard.press ('Escape'); await page.keyboard.press ('Enter'); await locked (page);
    assert.equal (await landing.isVisible (), true); assert.equal (await landing.getByRole ('button', { name : 'Continue to workspace', exact : true }).isVisible (), false);
    const [logo, panel] = [await landing.locator ('.splash_identity').boundingBox (), await landing.locator ('#auth_gate').boundingBox ()];
    assert.ok (panel.x > logo.x + logo.width - 1, 'sign-in sits beside the identity on a wide screen');
    await page.screenshot ({ path : 'work/landing-signin.png' });
    // Signing in with the form is the user's action: the workspace opens directly.
    await form.getByLabel ('Email', { exact : true }).fill (user.email); await form.getByLabel ('Password', { exact : true }).fill ('landing-test-only');
    await form.getByRole ('button', { name : 'Sign in', exact : true }).click (); await unlocked (page);
    assert.equal ((await page.evaluate (() => Auto3D.execute ('scene.inspect', {}))).ok, true); await page.close ();
    // Saved sign-in: the landing pauses with Welcome back until Continue.
    page = await open (); const saved = page.locator ('#startup_splash');
    await saved.getByRole ('heading', { name : 'Welcome back' }).waitFor (); const proceed = saved.getByRole ('button', { name : 'Continue to workspace', exact : true }); await proceed.waitFor ();
    await page.waitForTimeout (800); assert.equal (await page.evaluate (() => document.body.classList.contains ('auth_locked')), true, 'the landing waits for the user');
    assert.equal ((await page.evaluate (() => Auto3D.execute ('auth.inspect', {}))).result.signedIn, true);
    await page.screenshot ({ path : 'work/landing-continue.png' });
    await proceed.click (); await unlocked (page);
    // After the landing closes, signing out shows the full-screen gate again.
    assert.equal ((await page.evaluate (() => Auto3D.execute ('auth.sign_out', {}))).ok, true); await locked (page);
    await page.locator ('body > #auth_gate form').waitFor ({ state : 'visible' }); await page.close ();
    // The agent command continues from the landing as well.
    page = await open (); await page.locator ('#startup_splash').getByRole ('button', { name : 'Sign in', exact : true }).waitFor ();
    assert.equal ((await page.evaluate (() => Auto3D.execute ('auth.continue', {}))).result.continued, false, 'continue needs a signed-in account');
    const signInForm = page.locator ('#startup_splash #auth_gate form'); await signInForm.getByLabel ('Email', { exact : true }).fill (user.email); await signInForm.getByLabel ('Password', { exact : true }).fill ('landing-test-only'); await signInForm.getByRole ('button', { name : 'Sign in', exact : true }).click (); await unlocked (page); await page.close ();
    page = await open (); await page.locator ('#startup_splash').getByRole ('button', { name : 'Continue to workspace', exact : true }).waitFor ();
    assert.equal ((await page.evaluate (() => Auto3D.execute ('auth.continue', {}))).result.continued, true); await unlocked (page);
    // Narrow screens stack the identity above the sign-in panel without horizontal overflow.
    await page.close (); page = await open (); await page.setViewportSize ({ width : 390, height : 844 }); await page.locator ('#startup_splash').getByRole ('button', { name : 'Continue to workspace', exact : true }).waitFor ();
    const overflow = await page.evaluate (() => document.getElementById ('startup_splash').scrollWidth - document.getElementById ('startup_splash').clientWidth); assert.ok (overflow <= 1, 'no horizontal overflow: ' + overflow);
    await page.screenshot ({ path : 'work/landing-mobile.png' });
    assert.deepEqual (errors, []); console.log ('Landing sign-in: form on the welcome scene, no bypass, form sign-in opens the workspace, saved sign-in pauses for Continue, auth.continue, sign-out gate and mobile layout passed.');
} finally { await browser.close (); }
