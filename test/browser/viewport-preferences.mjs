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
        const url = process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8082/';
        await page.goto (url); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        const inspect = () => page.evaluate (async () => (await Auto3D.execute ('preferences.viewport.quality.inspect')).result);
        assert.equal ((await inspect ()).mode, 'fast'); assert.equal ((await inspect ()).pixelRatio, 1);
        await page.getByRole ('button', { name : 'Preferences', exact : true }).click ();
        await page.getByLabel ('Viewport quality', { exact : true }).selectOption ('quality');
        await page.waitForFunction (async () => (await Auto3D.execute ('preferences.viewport.quality.inspect')).result?.mode === 'quality');
        for (let i = 0; i < 30 && profiles[account].viewportQuality !== 'quality'; i++) { await page.waitForTimeout (50); }
        assert.equal (profiles[account].viewportQuality, 'quality');
        await page.reload (); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        assert.equal ((await inspect ()).mode, 'quality'); assert.equal ((await inspect ()).pixelRatio, 3);
        account = 'quality-user-b'; await page.reload (); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        assert.equal ((await inspect ()).mode, 'auto'); assert.equal ((await inspect ()).pixelRatio, 2);
        assert.deepEqual (errors, []); await page.close ();
    }
    console.log ('Desktop/mobile Preferences selector, account persistence, reload and account-isolated Auto default passed.');
} finally { await browser.close (); }
