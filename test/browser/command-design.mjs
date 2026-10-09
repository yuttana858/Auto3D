import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    for (const width of [1440, 390]) {
        const page = await browser.newPage ({ viewport : { width, height : 1000 } }); const errors = []; page.on ('pageerror', (error) => errors.push (error.message));
        await page.route ('**/api/auth/**', (route) => route.fulfill ({ json : { user : { id : 'browser-user', email : 'user@example.com' } } }));
        await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { theme : 1, units : 'metric' }, folders : [] } }));
        await page.route ('**/api/accounts/**', (route) => route.fulfill ({ json : { isAdmin : false } }));
        await page.route ('**/api/personal/items', (route) => route.fulfill ({ json : [] }));
        await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
        assert.equal (await page.locator ('#toolbar [title="Dark mode"], #toolbar [title="Light mode"]').count (), 0);
        await page.locator ('.preferences_button').click (); await page.getByRole ('button', { name : 'Commands and macros', exact : true }).click ();
        const dialog = page.getByRole ('dialog', { name : 'Commands and macros', exact : true }); await dialog.waitFor ();
        assert.equal (await dialog.getByLabel ('Macro JSON').isVisible (), false);
        await dialog.locator ('.command_detail').getByLabel ('Width', { exact : true }).fill ('2'); await dialog.locator ('.command_detail').getByLabel ('Length', { exact : true }).fill ('3'); await dialog.locator ('.command_detail').getByLabel ('Height', { exact : true }).fill ('6');
        await dialog.getByRole ('button', { name : 'Add to macro', exact : true }).click (); await dialog.getByText ('1. Array (2 W × 3 L × 6 H)', { exact : true }).waitFor ();
        await dialog.getByLabel ('Search commands', { exact : true }).fill ('object.transform'); await dialog.locator ('.command_list').getByRole ('button', { name : 'Transform object' }).click (); await dialog.getByRole ('button', { name : 'Add to macro', exact : true }).click (); await dialog.getByText ('2. Move (0, 0, 0)', { exact : true }).click ();
        await dialog.locator ('.macro_step').nth (1).getByRole ('button', { name : 'Move up' }).click (); await dialog.getByText ('1. Move (0, 0, 0)', { exact : true }).waitFor ();
        await dialog.getByRole ('button', { name : 'Save macro on this device' }).click (); await dialog.getByText ('Macro saved on this device.', { exact : true }).waitFor ();
        await dialog.getByLabel ('Search commands', { exact : true }).fill ('nonsense-no-match'); await dialog.getByText ('No commands match your search.', { exact : true }).waitFor ();
        assert.deepEqual (errors, []); await page.close (); console.log ('Visual macro editing, search and hidden code passed at ' + width + 'px.');
    }
} finally { await browser.close (); }
