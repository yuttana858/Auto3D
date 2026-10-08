import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', headless : true, args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    for (const viewport of [{ width : 1440, height : 1000 }, { width : 390, height : 844 }]) {
        const page = await browser.newPage ({ viewport }); const errors = []; let user = null; let attempts = 0;
        page.on ('pageerror', (error) => errors.push (error.message));
        await page.route ('**/api/auth/**', async (route) => {
            const path = new URL (route.request ().url ()).pathname;
            if (path.endsWith ('login')) {
                attempts++;
                if (attempts === 1) { await route.fulfill ({ status : 401, json : { error : 'Email or password is incorrect, or the account is not confirmed.' } }); return; }
                user = { id : 'browser-user', email : 'member@example.com' };
            }
            if (path.endsWith ('logout')) { user = null; }
            await route.fulfill ({ json : { user } });
        });
        await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html');
        const splash = page.locator ('#startup_splash'); const form = splash.locator ('form');
        await form.waitFor ({ state : 'visible' });
        await form.getByLabel ('Email', { exact : true }).fill ('member@example.com');
        await form.getByLabel ('Password', { exact : true }).fill ('browser-test-password');
        await form.getByRole ('button', { name : 'Sign in', exact : true }).click ();
        await splash.getByRole ('status').filter ({ hasText : 'incorrect' }).waitFor ();
        assert.equal (await form.getByLabel ('Password', { exact : true }).inputValue (), '');
        await form.getByLabel ('Password', { exact : true }).fill ('browser-test-password');
        await form.getByRole ('button', { name : 'Sign in', exact : true }).click ();
        await splash.getByRole ('button', { name : 'Continue to workspace', exact : true }).click ();
        await splash.waitFor ({ state : 'detached' });
        assert.equal ((await page.evaluate (() => window.Auto3D.execute ('auth.inspect', {}))).result.signedIn, true);
        assert.equal (await page.evaluate (() => JSON.stringify ({ ...localStorage }).includes ('browser-test-password')), false);
        await page.getByRole ('button', { name : 'Account', exact : true }).click ();
        const dialog = page.getByRole ('dialog', { name : 'Auto3D account' });
        await dialog.getByRole ('button', { name : 'Sign out', exact : true }).click ();
        await dialog.getByRole ('button', { name : 'Sign in', exact : true }).waitFor ();
        assert.equal ((await page.evaluate (() => window.Auto3D.execute ('auth.inspect', {}))).result.signedIn, false);
        await dialog.getByRole ('button', { name : 'Continue without signing in', exact : true }).click ();
        assert.deepEqual (errors, []);
        await page.close ();
        console.log ('Account UI passed at ' + viewport.width + 'px');
    }
} finally { await browser.close (); }
