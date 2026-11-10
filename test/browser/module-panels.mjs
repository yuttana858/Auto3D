import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
await mkdir ('work/module-review', { recursive : true });
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1600, height : 1050 } }); page.setDefaultTimeout (120000); const errors = []; const requests = []; page.on ('pageerror', e => errors.push (e.message)); page.on ('request', r => requests.push (r.url ()));
    await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'panels', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, JSON.stringify (r)); return r.result; };
    assert.deepEqual (await page.locator ('.scene_tools button').evaluateAll (buttons => buttons.slice (0, 2).map (b => b.getAttribute ('aria-label'))), ['AI Generative', 'Packaging design']);
    assert.equal (requests.some (url => url.includes ('packaging.module.js')), false);
    await page.locator ('.scene_tools').getByRole ('button', { name : 'AI Generative', exact : true }).click (); await page.getByLabel ('AI generation prompt').waitFor (); assert.equal (await page.locator ('#packaging_module_panel').isVisible (), false);
    await page.getByRole ('button', { name : 'Extended AI Generative panel', exact : true }).click (); const wideAI = await page.locator ('.module_extended_view').evaluate (e => e.clientWidth); assert.ok (wideAI > 500);
    await call ('ui.module.mode', { module : 'ai', mode : 'minimal' });
    await page.locator ('.scene_tools').getByRole ('button', { name : 'Packaging design', exact : true }).click (); await page.locator ('#packaging_module_panel .fefco_catalog').waitFor (); assert.equal (await page.getByLabel ('AI generation prompt').isVisible (), false); assert.equal (await page.getByRole ('tablist').count (), 0);
    const narrow = await page.locator ('#main_right_container').evaluate (e => e.clientWidth); assert.ok (narrow < wideAI);
    await call ('packaging.fefco.preset', { code : '0201', length : 100, width : 80, height : 60 }); const generated = await call ('scene.inspect'); let camera = await call ('camera.current.inspect');
    await page.getByRole ('button', { name : 'Extended Packaging Gen panel', exact : true }).click (); assert.ok (await page.locator ('.module_extended_view').evaluate (e => e.clientWidth) > narrow);
    await page.emulateMedia ({ reducedMotion : 'reduce' });
    const geometry = await page.locator ('.module_extended_view').evaluate (root => { const top = root.querySelector ('#header').getBoundingClientRect (), panel = root.querySelector ('.module_panel_header').getBoundingClientRect (); return { toolbarBottom : top.bottom, panelTop : panel.top }; }); assert.ok (geometry.panelTop >= geometry.toolbarBottom - 1);
    const undo = page.getByRole ('button', { name : 'Undo object edit (Ctrl+Z)' }); const redo = page.getByRole ('button', { name : 'Redo object edit (Ctrl+Shift+Z)' }); assert.equal (await undo.isVisible (), true); await undo.click (); await page.waitForFunction (() => !document.querySelector ('[aria-label="Undo object edit (Ctrl+Z)"]').hasAttribute ('aria-busy')); assert.equal ((await call ('scene.inspect')).objects.length, 0); await redo.click (); await page.waitForFunction (() => !document.querySelector ('[aria-label="Redo object edit (Ctrl+Shift+Z)"]').hasAttribute ('aria-busy')); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    camera = await call ('camera.current.inspect');
    const left = await page.locator ('#rendering_section summary').evaluate (e => getComputedStyle (e).fontSize); const right = await page.getByLabel ('Box dimension basis', { exact : true }).evaluate (e => parseFloat (getComputedStyle (e).fontSize) - 3 + 'px'); assert.equal (left, right); assert.equal (right, '12px');
    await page.screenshot ({ path : 'work/module-review/packaging-extended.png' });
    await page.getByRole ('button', { name : 'Minimal Packaging Gen panel', exact : true }).click (); assert.ok (await page.locator ('#main_right_container').evaluate (e => e.clientWidth) < wideAI); await page.screenshot ({ path : 'work/module-review/packaging-minimal.png' });
    await page.getByRole ('button', { name : 'Close Packaging Gen panel', exact : true }).click (); assert.equal (await page.locator ('#main_right_container').getAttribute ('data-panel-mode'), 'closed');
    await call ('ui.module.mode', { module : 'ai', mode : 'extended' }); assert.equal (await page.locator ('#main_right_container').getAttribute ('data-panel-mode'), 'extended'); await page.screenshot ({ path : 'work/module-review/ai-extended.png' }); assert.deepEqual ((await call ('scene.inspect')).objects.map (object => [object.id, object.userData]), generated.objects.map (object => [object.id, object.userData])); assert.deepEqual (await call ('camera.current.inspect'), camera);
    assert.equal (await page.getByRole ('button', { name : 'Extended Model upload panel' }).count (), 0); assert.equal ((await page.evaluate (() => Auto3D.execute ('ui.module.mode', { module : 'upload', mode : 'extended' }))).ok, false); await call ('ui.module.mode', { module : 'upload', mode : 'minimal' });
    await page.setViewportSize ({ width : 390, height : 844 }); await call ('ui.packaging'); await call ('ui.module.mode', { module : 'packaging', mode : 'extended' }); assert.equal (await page.locator ('#main_left_container').getAttribute ('data-panel-mode'), 'closed'); assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal (await page.locator ('#packaging_module_panel').evaluate (e => e.scrollWidth > e.clientWidth + 1), false); await page.screenshot ({ path : 'work/module-review/packaging-mobile.png' });
    await call ('ui.module.mode', { module : 'data', mode : 'minimal' }); assert.equal (await page.locator ('#packaging_module_panel').isVisible (), false); assert.equal (await page.locator ('#data_panel_content').isVisible (), true); assert.equal (await page.locator ('#data_panel_content').evaluate (e => e.scrollWidth > e.clientWidth + 1), false);
    assert.deepEqual (errors, []); console.log ('Independent AI/Packaging, lazy load, toolbar order, module modes, typography, generated-model preservation and mobile checks passed.');
} finally { await browser.close (); }
