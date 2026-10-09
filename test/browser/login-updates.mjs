import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    for (const viewport of [{ width : 1440, height : 1000 }, { width : 390, height : 844 }]) {
        const page = await browser.newPage ({ viewport }); page.setDefaultTimeout (20000); let user = null; const recoveryCalls = []; const errors = []; page.on ('pageerror', (e) => errors.push (e.message));
        await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] } }));
        await page.route ('**/api/accounts/desk-8b4f2d71c6', (route) => route.fulfill ({ json : { isAdmin : true, requests : [] } }));
        await page.route ('**/api/auth/**', async (route) => {
            const action = route.request ().url ().split ('/').pop ();
            if (action === 'recover') { recoveryCalls.push (route.request ().postDataJSON ()); await route.fulfill ({ status : 202, json : { message : 'If this email belongs to an approved account, a password recovery link will be sent.' } }); return; }
            if (action === 'reset-password') { recoveryCalls.push (route.request ().postDataJSON ()); await route.fulfill ({ json : { message : 'Password changed. Sign in with your new password.' } }); return; }
            if (action === 'login') { user = { id : 'browser-user', email : 'user@example.com', name : 'Yuttana' }; } if (action === 'logout') { user = null; }
            await route.fulfill ({ json : { user } });
        });
        await page.goto ('http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' }); await page.waitForFunction (() => window.Auto3D);
        const gate = page.locator ('#auth_gate'); const password = gate.getByLabel ('Password', { exact : true }); await password.fill ('typed-password'); await gate.getByRole ('button', { name : 'Show password', exact : true }).click (); assert.equal (await password.getAttribute ('type'), 'text'); assert.equal (await password.inputValue (), 'typed-password'); await gate.getByRole ('button', { name : 'Hide password', exact : true }).click (); assert.equal (await password.getAttribute ('type'), 'password');
        await gate.getByLabel ('Email', { exact : true }).fill ('user@example.com'); await gate.getByRole ('button', { name : 'Forgot Password', exact : true }).click (); await page.waitForFunction (() => document.querySelector ('#auth_gate').textContent.includes ('password recovery link will be sent')); assert.deepEqual (recoveryCalls[0], { email : 'user@example.com' });
        await gate.getByRole ('button', { name : 'Sign in', exact : true }).click (); await page.waitForFunction (() => !document.body.classList.contains ('auth_locked'));
        assert.equal (await page.locator ('.auth_header_button').textContent (), 'Yuttana'); assert.equal (await page.locator ('#header_buttons > :last-child').evaluate ((e) => e.classList.contains ('header_fullscreen_button')), true);
        assert.equal (await page.locator ('#data_panel_toggle').getAttribute ('aria-expanded'), 'false'); assert.equal (await page.locator ('.scene_tools').evaluate ((e) => e.parentElement.id), 'main_right_container');
        const toggleBox = await page.locator ('#data_panel_toggle').boundingBox (); const toolsBox = await page.locator ('.scene_tools').boundingBox (); assert.ok (toolsBox.y >= toggleBox.y + toggleBox.height - 1); assert.ok (Math.abs (toolsBox.x - toggleBox.x) < 3);
        await page.locator ('.preferences_button').click (); await page.getByRole ('link', { name : 'Account administration — requests and approvals' }).click (); await page.getByRole ('dialog', { name : 'Account administration', exact : true }).waitFor (); assert.ok (page.url ().includes ('console=desk-8b4f2d71c6')); assert.ok (!page.url ().includes ('admin=')); await page.getByRole ('dialog', { name : 'Account administration', exact : true }).getByRole ('button', { name : 'Close' }).click ();
        user = null; await page.goto ('http://127.0.0.1:8080/website/index.html?password=recovery#type=recovery&access_token=fixture-recovery-token&refresh_token=never-store', { waitUntil : 'domcontentloaded' }); await page.waitForFunction (() => window.Auto3D); assert.ok (!page.url ().includes ('access_token')); assert.ok (!page.url ().includes ('refresh_token'));
        await gate.getByLabel ('New password', { exact : true }).fill ('new-strong-password'); await gate.getByLabel ('Confirm password', { exact : true }).fill ('new-strong-password'); await gate.getByRole ('button', { name : 'Change password', exact : true }).click (); await page.waitForFunction (() => document.querySelector ('#auth_gate').textContent.includes ('Password changed.'));
        assert.deepEqual (recoveryCalls[1], { accessToken : 'fixture-recovery-token', password : 'new-strong-password' }); assert.equal (await page.locator ('body').evaluate ((e) => e.classList.contains ('auth_locked')), true); assert.deepEqual (errors, []); await page.close (); console.log ('Login eye/recovery, named account, admin address, fullscreen order and collapsed panel/tool placement passed at ' + viewport.width + 'px.');
    }
} finally { await browser.close (); }
