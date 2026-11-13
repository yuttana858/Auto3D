import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Typing a decimal point into live size/scale fields must not be erased by the live update.
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } }); const errors = []; page.on ('pageerror', (error) => errors.push (error.message));
    await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] } }));
    await page.route ('**/api/personal/items', (route) => route.fulfill ({ json : [] }));
    await page.route ('**/api/auth/**', (route) => route.fulfill ({ json : { user : { id : 'browser-user', email : 'browser@example.com' } } }));
    await page.route ('**/api/accounts/**', (route) => route.fulfill ({ json : { isAdmin : false } }));
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl');
    await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    const object = () => call ('scene.inspect').then (scene => scene.objects[0]);
    await call ('object.select', { objectId : (await object ()).id }); await call ('object.tool', { mode : 'scale' });
    const type = async (locator, text) => { await locator.click (); await locator.press ('Control+a'); await locator.pressSequentially (text, { delay : 40 }); };

    // Transform panel: the focused field keeps what is typed, the live result applies, and leaving shows the rounded value.
    const sizeX = page.getByLabel ('Size X', { exact : true }); const baseWidth = Number (await sizeX.inputValue ());
    await type (sizeX, '1.5'); assert.equal (await sizeX.inputValue (), '1.5');
    assert.ok (Math.abs ((await object ()).scale[0] - 1.5 / baseWidth) < 1e-6, 'live size uses 1.5');
    await sizeX.press ('Tab'); assert.equal (await sizeX.inputValue (), '1.5');
    const positionX = page.getByLabel ('Position X', { exact : true }); await type (positionX, '2.25'); assert.equal (await positionX.inputValue (), '2.25');
    await positionX.press ('Tab'); assert.ok (Math.abs ((await object ()).position[0] - 2.25) < 1e-6);
    const rotationY = page.getByLabel ('Rotation (°) Y', { exact : true }); await type (rotationY, '12.5'); assert.equal (await rotationY.inputValue (), '12.5'); await rotationY.press ('Tab');

    // Details panel W/L/H and Scale percentage.
    if (await page.locator ('#data_panel_toggle').getAttribute ('aria-expanded') === 'false') { await page.locator ('#data_panel_toggle').click (); }
    const detailsToggle = page.locator ('.details_collapse'); if (await detailsToggle.getAttribute ('aria-expanded') === 'false') { await detailsToggle.click (); }
    const width = page.getByLabel (/^W dimension in /); await type (width, '3.75'); assert.equal (await width.inputValue (), '3.75'); await width.press ('Tab');
    assert.equal (Number (await width.inputValue ()), 3.75);
    const percent = page.getByLabel ('Scale percentage', { exact : true }); await type (percent, '50.5'); assert.equal (await percent.inputValue (), '50.5'); await percent.press ('Tab');
    assert.ok (Math.abs (Number (await width.inputValue ()) - 3.75 * 0.505) < 1e-4, 'percentage applied to the 3.75 width');
    assert.deepEqual (errors, []); console.log ('Decimal points stay while typing in transform Size/Position/Rotation, Details W/L/H and Scale percentage, and apply live.');
} finally { await browser.close (); }
