import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    for (const viewport of [{ width : 1440, height : 1000 }, { width : 390, height : 844 }]) {
        const page = await browser.newPage ({ viewport, deviceScaleFactor : 3 }); const errors = []; page.on ('pageerror', error => errors.push (error.message));
        let account = 'quality-user-a'; const profiles = { 'quality-user-a' : { units : 'metric', theme : 1, viewportQuality : 'fast' }, 'quality-user-b' : { units : 'standard', theme : 2 } };
        await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : account, email : 'fixture@example.com' } } }));
        await page.route ('**/api/accounts/**', route => route.fulfill ({ json : { isAdmin : false, requests : [] } }));
        await page.route ('**/api/personal/items**', route => route.fulfill ({ json : [] }));
        await page.route ('**/api/preferences', async route => {
            assert.equal (route.request ().headers ()['x-auto3d-account'], account);
            if (route.request ().method () === 'PUT') { profiles[account] = route.request ().postDataJSON ().preferences; }
            await route.fulfill ({ json : { preferences : profiles[account], folders : ['Uncategorized'] } });
        });
        const url = process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html';
        await page.goto (url); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        const inspect = () => page.evaluate (async () => (await Auto3D.execute ('preferences.viewport.quality.inspect')).result);
        assert.equal ((await inspect ()).mode, 'fast'); assert.equal ((await inspect ()).pixelRatio, 1);
        await page.getByRole ('button', { name : 'Preferences', exact : true }).click ();
        await page.getByLabel ('Viewport quality', { exact : true }).selectOption ('quality');
        await page.evaluate (async () => { /* async predicates make waitForFunction resolve at once, so poll in the page */ const end = Date.now () + 120000; while (!((await Auto3D.execute ('preferences.viewport.quality.inspect')).result?.mode === 'quality')) { if (Date.now () > end) { throw new Error ('Timed out waiting for page state'); } await new Promise (resolve => setTimeout (resolve, 100)); } });
        for (let i = 0; i < 30 && profiles[account].viewportQuality !== 'quality'; i++) { await page.waitForTimeout (50); }
        assert.equal (profiles[account].viewportQuality, 'quality');
        await page.reload (); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        assert.equal ((await inspect ()).mode, 'quality'); assert.equal ((await inspect ()).pixelRatio, 3);
        account = 'quality-user-b'; await page.reload (); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        /* Auto drops to 1x for 250 ms after camera movement (startup camera restore counts); check the settled ratio. */
        let auto = await inspect (); for (let i = 0; i < 40 && auto.interacting; i++) { await page.waitForTimeout (50); auto = await inspect (); }
        assert.equal (auto.mode, 'auto'); assert.equal (auto.interacting, false); assert.equal (auto.pixelRatio, 2);
        assert.deepEqual (errors, []); await page.close ();
    }
    console.log ('Desktop/mobile Preferences selector, account persistence, reload and account-isolated Auto default passed.');
} finally { await browser.close (); }
