import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 1000 } });
    page.setDefaultTimeout (20000);
    const errors = []; page.on ('pageerror', (error) => errors.push (error.stack));
    await page.route ('**/api/preferences', (route) => route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : ['Uncategorized'] } }));
    await page.route ('**/api/personal/items', (route) => route.fulfill ({ json : [] }));
    await page.route ('**/api/auth/session', (route) => route.fulfill ({ json : { user : { id : 'browser-user', email : 'browser@example.com' } } }));
await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html', { waitUntil : 'domcontentloaded' });
    await page.waitForFunction (() => window.Auto3D);
    await page.waitForFunction (() => !document.querySelector ('#startup_splash'));
    assert.equal (await page.getByText ('Open model URL', { exact : true }).count (), 0);
    assert.equal (await page.getByText ('Load sample model', { exact : true }).count (), 0);
    await page.waitForFunction (() => !document.body.classList.contains ('auth_locked'));
await page.locator ('#open_file').setInputFiles ('test/testfiles/animation/animated.glb');
    await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Added '));
    const call = async (id, args = {}) => {
        const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args });
        assert.equal (result.ok, true, JSON.stringify (result)); return result.result;
    };
    console.log ('Model imported');
    const initial = (await call ('scene.inspect')).objects[0];
    await call ('preferences.units', { units : 'standard' });
    if (await page.locator ('#data_panel_toggle').getAttribute ('aria-expanded') === 'false') { await page.locator ('#data_panel_toggle').click (); }
    /* Details starts minimized; expand it to reach the W/L/H inputs. */
    const detailsToggle = page.locator ('.details_collapse'); if (await detailsToggle.getAttribute ('aria-expanded') === 'false') { await detailsToggle.click (); }
    assert.equal (await detailsToggle.getAttribute ('aria-expanded'), 'true');
    const width = page.getByLabel ('W dimension in inches', { exact : true });
    const before = Number (await width.inputValue ()); assert.ok (before > 0);
    await width.fill (String (before * 2)); await width.dispatchEvent ('change');
    const resized = (await call ('scene.inspect')).objects[0];
    assert.ok (Math.abs (resized.scale[0] / initial.scale[0] - 2) < 0.0001);
    await call ('preferences.units', { units : 'metric' });
    const mm = Number (await page.getByLabel ('W dimension in mm', { exact : true }).inputValue ());
    assert.ok (Math.abs (mm - before * 2 * 25.4) < 0.001);
    await call ('history.undo');
    assert.deepEqual ((await call ('scene.inspect')).objects[0].scale, initial.scale);
    await call ('history.redo');
    assert.deepEqual ((await call ('scene.inspect')).objects[0].scale, resized.scale);
    const canvas = page.locator ('#main_viewer canvas').first (); const box = await canvas.boundingBox (); assert.ok (box);
    await page.mouse.click (box.x + box.width / 2, box.y + box.height / 2, { button : 'right' });
    assert.equal (await page.locator ('.auto3d_context_menu').count (), 1);
    /* The context menu lists every shared model tool (same actions as the tool strip and toolbar); object tools are enabled for the selected model. */
    assert.deepEqual (await page.locator ('.auto3d_context_menu button').allTextContents (), ['AI Generative', 'Packaging design', 'Primary Products', 'Select (V)', 'Move (W)', 'Rotate (E)', 'Scale (R)', 'Dimensions · drag an edge', 'Duplicate object (Ctrl+D)', 'Array selected object', 'Drop selected object to floor', 'Hide or show object (H)', 'Delete object', 'Focus object (F)', 'Fit all objects to screen', 'Update selected model', 'Undo object edit (Ctrl+Z)', 'Redo object edit (Ctrl+Shift+Z)', 'Add model', 'Save or open session (Ctrl+S)', 'Export', 'Model library']);
    for (const name of ['Move (W)', 'Rotate (E)', 'Scale (R)', 'Focus object (F)', 'Duplicate object (Ctrl+D)', 'Hide or show object (H)', 'Delete object']) { assert.equal (await page.getByRole ('menuitem', { name, exact : true }).isDisabled (), false, name); }
    assert.equal (await page.locator ('.ov_popup').count (), 0);
    await page.keyboard.press ('Escape');
    assert.equal (await page.locator ('.auto3d_context_menu').count (), 0);
    await page.mouse.move (box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down ({ button : 'right' });
    await page.mouse.move (box.x + box.width / 2 + 70, box.y + box.height / 2 + 30, { steps : 5 });
    await page.mouse.up ({ button : 'right' });
    assert.equal (await page.locator ('.auto3d_context_menu').count (), 0);
    assert.deepEqual (errors, []);
    console.log ('Single context menu, orbit suppression, removed controls and editable inch/mm dimensions passed.');
} finally { await browser.close (); }
