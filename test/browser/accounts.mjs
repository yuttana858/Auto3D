import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } }); page.setDefaultTimeout (20000);
    const errors = []; page.on ('pageerror', (error) => errors.push (error.message));
    let signedIn = false; const submissions = []; const reviews = [];
    const user = { id : 'admin', email : 'yuttana.chiaravalloti@smurfitwestrock.com' };
    const request = { id : '12345678-1234-1234-1234-123456789abc', name : 'New User', email : 'new@example.com', reason : 'Project access', status : 'pending' };
    await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] } }));
    await page.route ('**/api/auth/**', async (route) => {
        console.log ('auth request', route.request ().url ());
        if (route.request ().url ().endsWith ('/login')) { signedIn = true; }
        await route.fulfill ({ json : { user : signedIn ? user : null } });
    });
    await page.route ('**/api/accounts/**', async (route) => {
        const action = route.request ().url ().split ('/').pop ();
        if (action === 'request') { submissions.push (route.request ().postDataJSON ()); await route.fulfill ({ status : 202, json : { message : 'Request received. An administrator will review it.' } }); return; }
        if (action.startsWith ('users')) { await route.fulfill ({ json : { users : [{ ...user, name : 'Administrator', isAdmin : true, disabled : false }], hasMore : false } }); return; }
        if (action === 'review') { reviews.push (route.request ().postDataJSON ()); request.status = 'approved'; await route.fulfill ({ json : { request, message : 'Account created.' } }); return; }
        await route.fulfill ({ status : signedIn ? 200 : 401, json : signedIn ? { isAdmin : true, requests : [request] } : { error : 'Sign in.' } });
    });
    await page.goto ('http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' });
    await page.waitForFunction (() => window.Auto3D);
    const call = async (id) => { const result = await page.evaluate ((id) => Auto3D.execute (id, {}), id); assert.equal (result.ok, true, JSON.stringify (result)); };
    await call ('auth.open'); await page.locator ('#auth_gate').getByRole ('button', { name : 'Request an account', exact : true }).click ();
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
    const login = page.locator ('#auth_gate'); await login.getByLabel ('Email', { exact : true }).fill (user.email); await login.getByLabel ('Password', { exact : true }).fill ('browser-test-only');
    await login.getByRole ('button', { name : 'Sign in', exact : true }).click ();
    await page.evaluate (async () => { /* async predicates make waitForFunction resolve at once, so poll in the page */ const end = Date.now () + 120000; while (!((await Auto3D.execute ('auth.inspect')).result?.signedIn)) { if (Date.now () > end) { throw new Error ('Timed out waiting for page state'); } await new Promise (resolve => setTimeout (resolve, 100)); } });
    await page.waitForFunction (() => !document.body.classList.contains ('auth_locked'));
    console.log ('Signed in');
    await page.keyboard.press ('Escape'); await page.getByRole ('button', { name : 'Preferences', exact : true }).click ();
    await page.getByRole ('link', { name : 'Account administration — requests and approvals' }).click ();
    const admin = page.getByRole ('dialog', { name : 'Account administration', exact : true });
    await admin.getByRole ('link', { name : 'Supabase user administration' }).waitFor (); /* the dialog opens after the account refresh */
    assert.equal (await admin.getByRole ('link', { name : 'Supabase user administration' }).count (), 1);
    await admin.getByText ('Administrator · ' + user.email).waitFor ();
    await admin.getByLabel ('Initial password', { exact : true }).fill ('browser-temporary-password');
    await admin.getByRole ('button', { name : 'Approve account', exact : true }).click ();
    await page.waitForFunction (() => document.body.textContent.includes ('Status: approved'));
    assert.equal (reviews.length, 1); assert.equal (reviews[0].decision, 'approve');
    assert.deepEqual (errors, []); console.log ('Browser account request, login, admin preferences link and approval flow passed.');
} finally { await browser.close (); }
