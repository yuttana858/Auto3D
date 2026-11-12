import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    for (const viewport of [{ width : 1440, height : 1000 }, { width : 390, height : 844 }]) {
        const page = await browser.newPage ({ viewport, reducedMotion : 'reduce' }); const errors = []; let authReads = 0, requests = 0;
        page.on ('pageerror', error => errors.push (error.message));
        await page.route ('**/api/**', route => { const path = new URL (route.request ().url ()).pathname; if (path.includes ('/auth/')) { authReads++; } if (path.endsWith ('/accounts/request')) { requests++; } return route.fulfill ({ json : { user : null, message : 'Request received for review.' } }); });
        await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html');
        const entry = page.locator ('#auth_gate'); await entry.locator ('.entry_pitch').waitFor ();
        assert.equal (await entry.locator ('.auth_panel form').isVisible (), true);
        await page.waitForFunction (() => !document.querySelector ('.auth_retry').disabled); assert.equal (authReads, 1); assert.equal (await page.locator ('#main').evaluate (element => element.inert), true);
        const execute = (id, args = {}) => page.evaluate (([command, input]) => window.Auto3D.execute (command, input), [id, args]);
        let state = (await execute ('landing.inspect')).result; assert.equal (state.playing, false); assert.equal (state.stage, 3);
        const initial = state.time; await page.waitForTimeout (120); state = (await execute ('landing.inspect')).result; assert.equal (state.time, initial);
        assert.equal ((await execute ('landing.demo.stage', { stage : 4 })).ok, false);
        await entry.locator ('[data-stage="1"]').click (); assert.equal ((await execute ('landing.inspect')).result.stage, 1);
        assert.equal (await entry.locator ('[data-stage="1"]').getAttribute ('aria-pressed'), 'true');
        await execute ('landing.demo.playback', { action : 'restart' }); state = (await execute ('landing.inspect')).result; assert.equal (state.playing, true);
        await execute ('landing.demo.playback', { action : 'pause' });
        const macro = await page.evaluate (() => window.Auto3D.runMacro ({ version : 1, steps : [{ id : 'review', command : 'landing.demo.stage', arguments : { stage : 3 } }] }));
        assert.equal (macro.ok, true); assert.equal ((await execute ('object.transform', { position : [1, 2, 3] })).ok, false);
        await execute ('auth.open'); await entry.locator ('.entry_login').waitFor (); assert.equal (await entry.locator ('input[type="email"]').evaluate (e => e === document.activeElement), true);
        await entry.getByRole ('button', { name : 'Request an account', exact : true }).click ();
        const dialog = page.getByRole ('dialog', { name : 'Request an Auto3D account' }); await dialog.waitFor (); assert.equal (requests, 0);
        await dialog.getByLabel ('Name', { exact : true }).fill ('Preview engineer'); await dialog.getByLabel ('Email', { exact : true }).fill ('engineer@example.com');
        await dialog.getByRole ('button', { name : 'Submit account request', exact : true }).click (); await dialog.getByRole ('status').filter ({ hasText : 'received' }).waitFor (); assert.equal (requests, 1);
        await page.keyboard.press ('Escape'); await execute ('landing.open');
        assert.equal (await entry.evaluate (e => e.scrollWidth > e.clientWidth), false);
        await page.screenshot ({ path : `work/landing-verified-${viewport.width}.png` }); assert.deepEqual (errors, []); await page.close ();
        console.log ('Landing interaction, reduced motion, request and auth boundaries passed at ' + viewport.width + 'px');
    }
    const recoveryPage = await browser.newPage (); await recoveryPage.route ('**/api/**', route => route.fulfill ({ json : { user : null } }));
    await recoveryPage.goto ((process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html') + '?password=recovery');
    await recoveryPage.getByRole ('heading', { name : 'Choose a new password' }).waitFor ();
    assert.equal (await recoveryPage.getByRole ('button', { name : 'Change password', exact : true }).isDisabled (), true);
    assert.equal (await recoveryPage.locator ('#main').evaluate (element => element.inert), true); await recoveryPage.close ();
} finally { await browser.close (); }
