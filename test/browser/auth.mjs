import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', headless : true, args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    for (const viewport of [{ width : 1440, height : 1000 }, { width : 390, height : 844 }]) {
        const page = await browser.newPage ({ viewport }); const errors = []; let user = null; let attempts = 0;
        page.on ('pageerror', (error) => errors.push (error.message));
        await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] } }));
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
        await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' });
        // The landing page holds the sign-in panel; there is no separate click-to-continue step.
        const welcome = page.locator ('#startup_splash'); await welcome.waitFor ({ state : 'visible' });
        const splash = page.locator ('#auth_gate'); const form = splash.locator ('form');
        await form.waitFor ({ state : 'visible' });
        const aligned = async panel => {
            const bounds = await panel.boundingBox ();
            for (const button of await panel.locator (':scope > button:visible, form > button:visible').all ()) {
                const box = await button.boundingBox (); assert.ok (Math.abs (box.width - bounds.width) < 1); assert.ok (Math.abs (box.x - bounds.x) < 1);
            }
        };
        await aligned (splash.locator ('.auth_panel')); assert.equal (await splash.getByRole ('button', { name : 'Sign out', exact : true }).isVisible (), false);

        await form.getByLabel ('Email', { exact : true }).fill ('member@example.com');
        await form.getByLabel ('Password', { exact : true }).fill ('browser-test-password');
        await form.getByRole ('button', { name : 'Sign in', exact : true }).click ();
        await splash.getByRole ('status').filter ({ hasText : 'incorrect' }).waitFor ();
        assert.equal (await form.getByLabel ('Password', { exact : true }).inputValue (), '');
        assert.equal (await splash.getByRole ('button', { name : 'Forgot Password', exact : true }).isEnabled (), true);
        await form.getByLabel ('Password', { exact : true }).fill ('browser-test-password');
        await form.getByRole ('button', { name : 'Sign in', exact : true }).click ();
        await splash.waitFor ({ state : 'hidden' });
        assert.equal ((await page.evaluate (() => window.Auto3D.execute ('auth.inspect', {}))).result.signedIn, true);
        assert.equal (await page.evaluate (() => JSON.stringify ({ ...localStorage }).includes ('browser-test-password')), false);
        await page.locator ('.auth_header_button').click ();
        const dialog = page.getByRole ('dialog', { name : 'Auto3D account' });
        await aligned (dialog.locator ('.auth_panel')); await page.screenshot ({ path : `work/auth-aligned-${viewport.width}.png` });
        await dialog.getByRole ('button', { name : 'Sign out', exact : true }).click ();
        await splash.waitFor ({ state : 'visible' });
        assert.equal ((await page.evaluate (() => window.Auto3D.execute ('auth.inspect', {}))).result.signedIn, false);
        assert.equal (await page.getByRole ('button', { name : 'Continue without signing in', exact : true }).count (), 0);
        assert.deepEqual (errors, []);
        await page.close ();
        console.log ('Account UI passed at ' + viewport.width + 'px');
    }
} finally { await browser.close (); }
