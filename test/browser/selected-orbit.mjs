import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
await mkdir ('work/orbit-review', { recursive : true });
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1480, height : 1000 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', e => errors.push (e.message));
    await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'orbit', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, JSON.stringify (r)); return r.result; };
    const labels = await page.locator ('.scene_tools button').evaluateAll (nodes => nodes.map (node => node.getAttribute ('aria-label'))); for (const text of ['Hide or show', 'Delete object', 'Model library', 'Save or open', 'Export', 'Add model']) { assert.equal (labels.some (label => label.startsWith (text)), false); }
    assert.equal (await page.locator ('.header_library_button').count () > 0, true);
    await call ('packaging.fefco.preset', { code : '0201', length : 100, width : 80, height : 60 }); await call ('object.transform', { position : [60, 20, 0] });
    // The preset's animated fit may still be moving the camera; wait until two reads agree.
    let settled = null; for (let retry = 0; retry < 100; retry++) { const next = await call ('camera.current.inspect'); if (settled && JSON.stringify (settled) === JSON.stringify (next)) { break; } settled = next; await page.waitForTimeout (100); }
    const before = await call ('camera.current.inspect'); const focus = await call ('camera.orbit.focus_selected'); assert.equal (focus.focused, true);
    // Focus keeps the camera position and aims the orbit center at the selection.
    const focused = await call ('camera.current.inspect'); assert.deepEqual (focused.eye, before.eye); assert.deepEqual (focused.center, focus.pivot); assert.equal (focused.fov, before.fov);
    const canvas = page.locator ('#main_viewer canvas').first (); const area = await canvas.boundingBox (); const point = { x : area.x + area.width * .6, y : area.y + area.height * .45 };
    await page.mouse.move (point.x, point.y); await page.mouse.down ({ button : 'right' }); await page.mouse.move (point.x + 65, point.y + 25, { steps : 8 }); await page.mouse.up ({ button : 'right' });
    const after = await call ('camera.current.inspect'); const span = camera => Math.hypot (...camera.eye.map ((v, i) => v - camera.center[i]));
    // Main viewer: horizontal right-drag pans sideways (the view center moves) and vertical drag tilts; neither changes the viewing distance.
    assert.notDeepEqual (focused.center, after.center); assert.notDeepEqual (focused.eye, after.eye); assert.ok (Math.abs (span (focused) - span (after)) < 1e-3); assert.equal (before.fov, after.fov); assert.equal (await page.locator ('.auto3d_context_menu').count (), 0);
    const scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 1); assert.deepEqual (scene.objects[0].position, [60, 20, 0]);
    await call ('ui.array'); const dialog = page.getByRole ('dialog', { name : 'Array selected model', exact : true }); await dialog.waitFor ();
    await page.waitForFunction (() => parseFloat (getComputedStyle (document.querySelector ('.array_dialog h2')).fontSize) > 18);
    const sizes = await dialog.evaluate (node => ({ title : parseFloat (getComputedStyle (node.querySelector ('h2')).fontSize), input : parseFloat (getComputedStyle (node.querySelector ('input')).fontSize), hint : parseFloat (getComputedStyle (node.querySelector ('.section_hint')).fontSize) }));
    assert.ok (Math.abs (sizes.title - 18.33) < .02, JSON.stringify (sizes)); assert.ok (Math.abs (sizes.input - 12.33) < .02, JSON.stringify (sizes)); assert.ok (Math.abs (sizes.hint - 12.33) < .02, JSON.stringify (sizes));
    await dialog.evaluate (node => { const label = document.createElement ('p'); label.id = 'late-popup-font'; label.style.fontSize = '11px'; label.textContent = 'Late dialog content'; node.appendChild (label); }); await page.waitForFunction (() => getComputedStyle (document.getElementById ('late-popup-font')).fontSize === '14px'); assert.equal (await dialog.locator ('h2').evaluate (node => getComputedStyle (node).fontSize), '18.33px');
    await page.screenshot ({ path : 'work/orbit-review/array-larger-text.png' }); await dialog.getByRole ('button', { name : 'Close Array selected model', exact : true }).click (); await dialog.waitFor ({ state : 'detached' });
    await page.setViewportSize ({ width : 390, height : 844 }); await call ('ui.array'); await page.waitForFunction (() => parseFloat (getComputedStyle (document.querySelector ('.array_dialog h2')).fontSize) > 18); assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false); assert.equal (await page.locator ('.array_dialog').evaluate (node => node.scrollWidth > node.clientWidth + 1), false); await page.screenshot ({ path : 'work/orbit-review/array-mobile.png' });
    assert.deepEqual (errors, []); console.log ('Selected pivot orbit, retained framing/zoom, reduced tool strip, exact +3px popup fonts, dynamic content and mobile checks passed.');
} finally { await browser.close (); }
