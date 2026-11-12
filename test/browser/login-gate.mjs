import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext ({ viewport : { width : 1440, height : 1000 } });
const user = { id : 'browser-user', email : 'user@example.com' }; let offlineLogout = false;
await context.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] } }));
await context.route ('**/api/auth/**', async (route) => {
    const action = route.request ().url ().split ('/').pop ();
    const cookie = (await route.request ().allHeaders ()).cookie || '';
    if (action === 'logout' && offlineLogout) { await route.abort (); return; }
    const signedIn = action === 'login' || (action === 'session' && cookie.includes ('auto3d-test=session'));
    await route.fulfill ({ json : { user : signedIn ? user : null }, headers : action === 'login' ? { 'Set-Cookie' : 'auto3d-test=session; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800' } : action === 'logout' ? { 'Set-Cookie' : 'auto3d-test=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' } : {} });
});
await context.route ('**/api/accounts/admin', (route) => route.fulfill ({ status : 403, json : { error : 'Admin required.' } }));
const errors = [];
const open = async () => { const page = await context.newPage (); page.setDefaultTimeout (20000); page.on ('pageerror', (error) => errors.push (error.message)); await page.goto ('http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' }); await page.waitForFunction (() => window.Auto3D); return page; };
const locked = async (page) => page.waitForFunction (() => document.body?.classList.contains ('auth_locked'));
const unlocked = async (page) => page.waitForFunction (() => document.body && !document.body.classList.contains ('auth_locked'));
const login = async (page) => { const gate = page.locator ('#auth_gate'); await gate.getByLabel ('Email', { exact : true }).fill (user.email); await gate.getByLabel ('Password', { exact : true }).fill ('browser-test-only'); await gate.locator ('form').getByRole ('button', { name : 'Sign in', exact : true }).click (); await unlocked (page); };
const call = (page, id) => page.evaluate ((id) => Auto3D.execute (id, {}), id);
try {
    let page = await open (); await locked (page);
    assert.equal ((await call (page, 'scene.inspect')).ok, false);
    await page.keyboard.press ('Escape'); await page.locator ('#auth_gate').click ({ position : { x : 20, y : 20 } }); await locked (page);
    assert.equal (await page.getByText ('Continue without signing in', { exact : true }).count (), 0);
    await login (page); assert.equal ((await call (page, 'scene.inspect')).ok, true);
    await page.close (); page = await open (); await unlocked (page);
    const other = await open (); await unlocked (other);
    assert.equal ((await call (page, 'auth.sign_out')).ok, true); await locked (page); await locked (other);
    await page.reload ({ waitUntil : 'domcontentloaded' }); await page.waitForFunction (() => window.Auto3D); await locked (page);
    assert.equal ((await call (page, 'scene.inspect')).ok, false);
    await login (page); await unlocked (other);
    offlineLogout = true; assert.equal ((await call (page, 'auth.sign_out')).ok, false); await locked (page); await locked (other);
    await page.reload ({ waitUntil : 'domcontentloaded' }); await page.waitForFunction (() => window.Auto3D); await locked (page);
    await page.getByRole ('button', { name : 'Check saved sign-in' }).click (); await locked (page);
    assert.equal ((await call (page, 'auth.inspect')).result.signedIn, false);
    offlineLogout = false; await login (page); assert.equal ((await call (page, 'auth.inspect')).result.signedIn, true);
    assert.deepEqual (errors, []); console.log ('Mandatory login, no click/Escape bypass, cookie restore after tab close, cross-tab logout and failed-logout anti-restore passed.');
} finally { await browser.close (); }
