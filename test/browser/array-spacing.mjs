import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
 const page = await browser.newPage ({ viewport : { width : 900, height : 600 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', e => errors.push (e.message));
 await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'array-fixture', email : 'fixture@example.com' } } }));
 await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'standard' }, folders : [] } }));
 for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
 await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
 const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, JSON.stringify (r)); return r.result; };
 await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl'); await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
 const original = (await call ('scene.inspect')).objects[0]; await call ('ui.array');
 const rows = await page.locator ('.array_counts').evaluateAll (rows => rows.map (row => [...row.querySelectorAll ('input')].map (input => input.getBoundingClientRect ().top))); assert.equal (rows.length, 2); assert.ok (rows.every (row => new Set (row).size === 1));
 await page.getByLabel ('Width count (W)', { exact : true }).fill ('2'); await page.getByLabel ('Height count (H)', { exact : true }).fill ('2');
 await page.getByLabel ('Width spacing (W)', { exact : true }).fill ('10'); await page.getByLabel ('Height spacing (H)', { exact : true }).fill ('5');
 await page.getByLabel ('Alternate layer rotation', { exact : true }).selectOption ('90');
 await page.getByRole ('button', { name : 'Create array', exact : true }).click (); await page.locator ('.array_dialog').waitFor ({ state : 'detached' });
 // The dialog closes when the array starts; wait for its drop-in reveal to finish before inspecting.
 for (let retry = 0; retry < 300; retry++) { const state = await page.evaluate (() => Auto3D.execute ('object.array.playback.inspect', {})); if (state.ok && !['playing', 'paused'].includes (state.result.state)) { break; } await page.waitForTimeout (100); }
 let scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 4); assert.equal (scene.groups.length, 1);
 const widthDelta = scene.objects[1].position[0] - original.position[0]; assert.ok (widthDelta > 10); assert.equal (scene.objects[2].rotation[1], 90);
 await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);
 await call ('object.array', { width : 2, length : 1, height : 1, gap : { width : 0 }, units : 'model' }); scene = await call ('scene.inspect'); const touching = scene.objects[1].position[0] - original.position[0]; assert.ok (Math.abs (widthDelta - touching - 10) < 0.001);
 assert.deepEqual (errors, []); console.log ('Array W/L/H spacing, one-line fields, rotation, grouping, shared command and Undo passed.');
} finally { await browser.close (); }
