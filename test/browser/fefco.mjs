import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import { OpenSessionArchive } from '../../source/website/sessionarchive.js';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 950 } }); page.setDefaultTimeout (20000); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'fefco-test', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 1, units : 'metric' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    console.log ('Loading local site'); await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'), null, { timeout : 20000 });
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
    assert.equal ((await call ('app.version.inspect')).version, JSON.parse (await readFile ('package.json', 'utf8')).version); console.log ('Opening catalog'); await call ('ui.ai.packaging'); assert.equal (await page.locator ('.fefco_card').count (), 4);
    await page.waitForFunction (() => [...document.querySelectorAll ('.fefco_card img')].every (img => img.complete && img.naturalWidth > 0), null, { timeout : 20000 });
    assert.equal (await page.locator ('.fefco_card img').evaluateAll (images => images.every (img => img.complete && img.naturalWidth > 0)), true);
    await page.screenshot ({ path : 'work/fefco-catalog.png' });
    // Inside/outside targets need a converter allowance; this catalog test generates score-to-score CAD.
    await page.getByLabel ('New box dimension basis').selectOption ('score');
    await page.getByLabel ('FEFCO Height (H)').fill ('200'); await page.getByLabel ('FEFCO Height (H)').dispatchEvent ('change'); await page.getByRole ('button', { name : 'FEFCO 0200 HSC', exact : true }).click ();
    // The card generates asynchronously; the panel hides top flaps once the 0200 box is the selected style.
    await page.waitForFunction (() => document.querySelector ('[aria-label="FEFCO 0200 HSC"]')?.getAttribute ('aria-pressed') === 'true'); assert.equal (await page.getByLabel ('FEFCO top flaps').isVisible (), false);
    await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Added FEFCO 0200'), null, { timeout : 20000 });
    let scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 1); assert.equal (JSON.parse (scene.objects[0].userData._auto3dFefco).height, 200);
    console.log ('HSC generated'); await page.screenshot ({ path : 'work/fefco-hsc.png' });
    // Save through the real archive/download flow, then reopen to verify texture persistence.
    await page.evaluate (() => { window.showSaveFilePicker = undefined; }); await call ('ui.save'); await page.getByLabel ('Save name').fill ('FEFCO HSC'); const downloadPromise = page.waitForEvent ('download'); await page.getByRole ('button', { name : 'Save session file', exact : true }).click (); const download = await downloadPromise; const bytes = await readFile (await download.path ()); const saved = OpenSessionArchive (bytes).document;
    assert.equal (JSON.parse (saved.objects[0].userData._auto3dFefco).code, '0200'); assert.ok (saved.model.materials[0].diffuseMap.buffer.byteLength > 100); await page.getByRole ('button', { name : 'Close Save session', exact : true }).click ();
    console.log ('Archive downloaded'); await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 0); await call ('history.redo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    await call ('object.array', { width : 2, length : 1, height : 1 }); const array = await call ('scene.inspect'); assert.equal (array.objects.length, 2); assert.equal (JSON.parse (array.objects[1].userData._auto3dFefco).code, '0200'); await call ('history.undo');
    await call ('packaging.fefco.configure', { closure : 'open' }); await page.getByRole ('button', { name : 'FEFCO 0201 RSC', exact : true }).click (); await page.waitForFunction (() => document.querySelector ('[aria-label="FEFCO 0201 RSC"]')?.getAttribute ('aria-pressed') === 'true'); assert.equal (await page.getByLabel ('FEFCO top flaps').isVisible (), true);
    await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Added FEFCO 0201'), null, { timeout : 20000 }).catch (async error => { console.log ('Generation status:', await page.locator ('.scene_status').textContent ()); throw error; });
    scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 2); await call ('object.visibility', { objectId : scene.objects[0].id, visible : false }); await call ('view.focus');
    console.log ('RSC open generated'); await page.screenshot ({ path : 'work/fefco-rsc-open.png' });
    await call ('history.undo'); await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    console.log ('Choosing closed flaps'); await page.getByLabel ('FEFCO top flaps').selectOption ('closed'); /* style cards generate directly; there is no separate Generate button */ await page.getByRole ('button', { name : 'FEFCO 0201 RSC', exact : true }).click (); await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Added FEFCO 0201'), null, { timeout : 20000 }).catch (async error => { console.log ('Generation status:', await page.locator ('.scene_status').textContent ()); throw error; });
    scene = await call ('scene.inspect'); await call ('object.visibility', { objectId : scene.objects[0].id, visible : false }); await call ('view.focus'); console.log ('RSC closed generated'); await page.screenshot ({ path : 'work/fefco-rsc-closed.png' });
    await page.getByRole ('button', { name : 'FEFCO 0202 OSC', exact : true }).click (); await page.waitForFunction (() => document.querySelector ('[aria-label="FEFCO 0202 OSC"]')?.getAttribute ('aria-pressed') === 'true'); assert.equal (await page.getByLabel ('FEFCO Flap overlap').isVisible (), true);
    /* An overlap at or beyond the box width is rejected and leaves the configuration unchanged. Style cards instead fall back to a valid default overlap. */ const rejected = await page.evaluate (() => Auto3D.execute ('packaging.fefco.configure', { overlap : 1000 })); assert.equal (rejected.ok, false); assert.match (rejected.error.message, /overlap must/); assert.equal ((await call ('packaging.fefco.inspect')).overlap, 25);
    const lengthMm = (await call ('packaging.fefco.inspect')).length; await call ('preferences.units', { units : 'standard' }); assert.ok (Math.abs (Number (await page.getByLabel ('FEFCO Length (L)').inputValue ()) - lengthMm / 25.4) < 0.000001, 'length shown in inches'); await call ('preferences.units', { units : 'metric' });
    await page.setViewportSize ({ width : 390, height : 844 }); await call ('ui.ai.packaging'); assert.equal (await page.locator ('#packaging_module_panel').evaluate (node => node.scrollWidth <= node.clientWidth + 1), true); await page.screenshot ({ path : 'work/fefco-mobile.png' });
    assert.deepEqual (errors, []); console.log ('FEFCO thumbnails, real HSC/RSC generation, open/closed flaps, archive textures, Undo/Redo, validation, inches and mobile panel passed.');
} finally { await browser.close (); }
