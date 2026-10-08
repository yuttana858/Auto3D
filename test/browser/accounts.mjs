import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } }); page.setDefaultTimeout (20000);
    const errors = []; page.on ('pageerror', (error) => errors.push (error.message));
    let signedIn = false; const submissions = []; const reviews = [];
    const user = { id : 'admin', email : 'yuttana.chiaravalloti@smurfitwestrock.com' };
    const request = { id : '12345678-1234-1234-1234-123456789abc', name : 'New User', email : 'new@example.com', reason : 'Project access', status : 'pending' };
    await page.route ('**/api/auth/**', async (route) => {
        console.log ('auth request', route.request ().url ());
        if (route.request ().url ().endsWith ('/login')) { signedIn = true; }
        await route.fulfill ({ json : { user : signedIn ? user : null } });
    });
    await page.route ('**/api/accounts/**', async (route) => {
        const action = route.request ().url ().split ('/').pop ();
        if (action === 'request') { submissions.push (route.request ().postDataJSON ()); await route.fulfill ({ status : 202, json : { message : 'Request received. An administrator will review it.' } }); return; }
        if (action === 'review') { reviews.push (route.request ().postDataJSON ()); request.status = 'approved'; await route.fulfill ({ json : { request, message : 'Account created.' } }); return; }
        await route.fulfill ({ status : signedIn ? 200 : 401, json : signedIn ? { isAdmin : true, requests : [request] } : { error : 'Sign in.' } });
    });
    await page.goto ('http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' });
    await page.waitForFunction (() => window.Auto3D);
    await page.locator ('#startup_splash canvas').click ({ position : { x : 50, y : 50 } });
    await page.waitForFunction (() => !document.querySelector ('#startup_splash'));
    const call = async (id) => { const result = await page.evaluate ((id) => Auto3D.execute (id, {}), id); assert.equal (result.ok, true, JSON.stringify (result)); };
    await call ('auth.open'); await page.getByRole ('button', { name : 'Request an account', exact : true }).click ();
    const requestDialog = page.getByRole ('dialog').last ();
    await requestDialog.getByLabel ('Name', { exact : true }).fill ('New User');
    await requestDialog.getByLabel ('Email', { exact : true }).fill ('new@example.com');
    await requestDialog.getByLabel ('Reason for access', { exact : true }).fill ('Project access');
    await requestDialog.getByRole ('button', { name : 'Submit account request' }).click ();
    await page.waitForFunction (() => document.body.textContent.includes ('Request received.'));
    assert.deepEqual (submissions, [{ name : 'New User', email : 'new@example.com', reason : 'Project access' }]);
    await page.keyboard.press ('Escape');
    await page.waitForFunction (() => !document.querySelector ('dialog[aria-label="Request an Auto3D account"]'));
    await call ('auth.open');
    const login = page.getByRole ('dialog', { name : 'Auto3D account', exact : true }); await login.getByLabel ('Email', { exact : true }).fill (user.email); await login.getByLabel ('Password', { exact : true }).fill ('browser-test-only');
    await login.getByRole ('button', { name : 'Sign in', exact : true }).click ();
    await page.waitForFunction (async () => (await Auto3D.execute ('auth.inspect')).result?.signedIn);
    console.log ('Signed in');
    await page.keyboard.press ('Escape'); await page.getByRole ('button', { name : 'Preferences', exact : true }).click ();
    await page.getByRole ('link', { name : 'Account administration — requests and approvals' }).click ();
    const admin = page.getByRole ('dialog', { name : 'Account administration', exact : true });
    assert.equal (await admin.getByRole ('link', { name : 'Supabase user administration' }).count (), 1);
    await admin.getByLabel ('Initial password', { exact : true }).fill ('browser-temporary-password');
    await admin.getByRole ('button', { name : 'Approve account', exact : true }).click ();
    await page.waitForFunction (() => document.body.textContent.includes ('Status: approved'));
    assert.equal (reviews.length, 1); assert.equal (reviews[0].decision, 'approve');
    assert.deepEqual (errors, []); console.log ('Browser account request, login, admin preferences link and approval flow passed.');
} finally { await browser.close (); }
