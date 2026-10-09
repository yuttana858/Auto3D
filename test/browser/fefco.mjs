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
    assert.equal ((await call ('app.version.inspect')).version, '0.29.0'); console.log ('Opening catalog'); await call ('ui.ai.packaging'); assert.equal (await page.locator ('.fefco_card').count (), 4);
    await page.waitForFunction (() => [...document.querySelectorAll ('.fefco_card img')].every (img => img.complete && img.naturalWidth > 0), null, { timeout : 20000 });
    assert.equal (await page.locator ('.fefco_card img').evaluateAll (images => images.every (img => img.complete && img.naturalWidth > 0)), true);
    await page.screenshot ({ path : 'work/fefco-catalog.png' });
    await page.getByRole ('button', { name : 'FEFCO 0200 HSC', exact : true }).click (); assert.equal (await page.getByLabel ('FEFCO top flaps').isVisible (), false);
    await page.getByLabel ('FEFCO Height (H)').fill ('200'); await page.getByLabel ('FEFCO Height (H)').dispatchEvent ('change'); await page.getByRole ('button', { name : 'Generate HSC · 3D box', exact : true }).click ();
    await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Added FEFCO 0200'), null, { timeout : 20000 });
    let scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 1); assert.equal (JSON.parse (scene.objects[0].userData._auto3dFefco).height, 200);
    console.log ('HSC generated'); await page.screenshot ({ path : 'work/fefco-hsc.png' });
    // Save through the real archive/download flow, then reopen to verify texture persistence.
    await page.evaluate (() => { window.showSaveFilePicker = undefined; }); await call ('ui.save'); await page.getByLabel ('Save name').fill ('FEFCO HSC'); const downloadPromise = page.waitForEvent ('download'); await page.getByRole ('button', { name : 'Save session file', exact : true }).click (); const download = await downloadPromise; const bytes = await readFile (await download.path ()); const saved = OpenSessionArchive (bytes).document;
    assert.equal (JSON.parse (saved.objects[0].userData._auto3dFefco).code, '0200'); assert.ok (saved.model.materials[0].diffuseMap.buffer.byteLength > 100); await page.getByRole ('button', { name : 'Close Save session', exact : true }).click ();
    console.log ('Archive downloaded'); await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 0); await call ('history.redo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    await call ('object.array', { width : 2, length : 1, height : 1 }); const array = await call ('scene.inspect'); assert.equal (array.objects.length, 2); assert.equal (JSON.parse (array.objects[1].userData._auto3dFefco).code, '0200'); await call ('history.undo');
    await page.getByRole ('button', { name : 'FEFCO 0201 RSC', exact : true }).click (); assert.equal (await page.getByLabel ('FEFCO top flaps').isVisible (), true);
    await page.getByRole ('button', { name : 'Generate RSC · 3D box', exact : true }).click (); await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Added FEFCO 0201'), null, { timeout : 20000 }).catch (async error => { console.log ('Generation status:', await page.locator ('.scene_status').textContent ()); throw error; });
    scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 2); await call ('object.visibility', { objectId : scene.objects[0].id, visible : false }); await call ('view.focus');
    console.log ('RSC open generated'); await page.screenshot ({ path : 'work/fefco-rsc-open.png' });
    await call ('history.undo'); await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    console.log ('Choosing closed flaps'); await page.getByLabel ('FEFCO top flaps').selectOption ('closed'); await page.getByRole ('button', { name : 'Generate RSC · 3D box', exact : true }).click (); await page.waitForFunction (() => document.querySelector ('.scene_status')?.textContent.startsWith ('Added FEFCO 0201'), null, { timeout : 20000 }).catch (async error => { console.log ('Generation status:', await page.locator ('.scene_status').textContent ()); throw error; });
    scene = await call ('scene.inspect'); await call ('object.visibility', { objectId : scene.objects[0].id, visible : false }); await call ('view.focus'); console.log ('RSC closed generated'); await page.screenshot ({ path : 'work/fefco-rsc-closed.png' });
    await page.getByRole ('button', { name : 'FEFCO 0202 OSC', exact : true }).click (); assert.equal (await page.getByLabel ('FEFCO Flap overlap').isVisible (), true);
    await page.getByLabel ('FEFCO Flap overlap').fill ('300'); await page.getByLabel ('FEFCO Flap overlap').dispatchEvent ('change'); await page.waitForFunction (() => /overlap must/.test (document.querySelector ('.scene_status')?.textContent || '')); assert.equal ((await call ('packaging.fefco.inspect')).overlap, 25);
    await call ('preferences.units', { units : 'standard' }); assert.ok (Math.abs (Number (await page.getByLabel ('FEFCO Length (L)').inputValue ()) - 400 / 25.4) < 0.000001); await call ('preferences.units', { units : 'metric' });
    await page.setViewportSize ({ width : 390, height : 844 }); await call ('ui.ai.packaging'); assert.equal (await page.locator ('.ai_workspace_panel').evaluate (node => node.scrollWidth <= node.clientWidth + 1), true); await page.screenshot ({ path : 'work/fefco-mobile.png' });
    assert.deepEqual (errors, []); console.log ('v0.29.0: FEFCO thumbnails, real HSC/RSC generation, open/closed flaps, archive textures, Undo/Redo, validation, inches and mobile panel passed.');
} finally { await browser.close (); }
