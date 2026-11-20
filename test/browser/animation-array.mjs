import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { OpenSessionArchive } from '../../source/website/sessionarchive.js';
import { MockMacroApi } from './macro-api-mock.mjs';
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
 const page = await browser.newPage ({ viewport : { width : 1200, height : 900 } }); page.setDefaultTimeout (60000); const errors = []; page.on ('pageerror', error => errors.push (error.message));
 await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'array-fixture', email : 'fixture@example.com' } } }));
 await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
 await MockMacroApi (page, { user : 'array-fixture' });
 for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, route => route.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
 await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
 const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, JSON.stringify (result)); return result.result; };
 await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl'); await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
 const before = await call ('scene.inspect');
 const checkTracks = (items, ids, key = 'objectId') => { for (const id of ids) { const item = items.find (entry => entry[key] === id); assert.ok (item, 'Missing scheduled object ' + id); assert.equal (item.keyframes.length, 3); assert.equal (item.visibilityKeys.length, 2); } };
 const macro = { version : 1, steps : [{ id : 'copies', command : 'object.array', arguments : { width : 3, length : 1, height : 1, animate : false } }, { id : 'reveal', command : 'animation.array.schedule', arguments : { objectIds : { $ref : 'copies.objectIds' }, duration : 4, dropHeight : 2 } }] };
 const result = await page.evaluate (value => Auto3D.runMacro (value), macro); assert.equal (result.ok, true, JSON.stringify (result)); let ids = result.completed[0].result.objectIds; assert.equal (ids.length, 2);
 await call ('animation.timeline.seek', { time : 0 }); for (const objectId of ids) { assert.equal ((await call ('animation.visibility.inspect', { objectId })).renderedVisible, false); }
 await call ('animation.timeline.seek', { time : 4 }); for (const objectId of ids) { assert.equal ((await call ('animation.visibility.inspect', { objectId })).renderedVisible, true); }
 checkTracks ((await call ('animation.timeline.inspect')).objects, ids);
 // A whole macro is one Undo step: both the copies and their reveal tracks disappear.
 await call ('history.undo'); assert.deepEqual ((await call ('scene.inspect')).objects, before.objects);
 assert.equal ((await call ('animation.timeline.inspect')).objects.some (item => ids.includes (item.objectId)), false);
 // Exercise the UI with fresh copies, independently of the macro's grouped history.
 await call ('animation.timeline.seek', { time : 0 }); await call ('object.select', { objectId : before.selectedObjectId });
 const copies = await call ('object.array', { width : 3, length : 1, height : 1, animate : false }); ids = copies.objectIds; assert.equal (ids.length, 2);
 await call ('object.select', { objectId : copies.selectedObjectId }); await call ('ui.module.toggle', { module : 'animation' }); const arrayPanel = page.locator ('#animation_module_panel .animation_array_section'); await arrayPanel.locator ('summary').click (); await arrayPanel.getByText ('2 objects will be scheduled.', { exact : false }).waitFor (); assert.equal (await arrayPanel.getByLabel ('Keep active object in place').isChecked (), true); await arrayPanel.getByRole ('button', { name : 'Schedule reveal' }).click (); await arrayPanel.getByText ('Array reveal scheduled.').waitFor (); checkTracks ((await call ('animation.timeline.inspect')).objects, ids);
 await call ('ui.save'); await page.getByLabel ('Save name', { exact : true }).fill ('Array timeline QA'); await page.getByLabel ('Save destination', { exact : true }).selectOption ('device'); await page.getByRole ('button', { name : 'Save to library', exact : true }).click (); await page.waitForFunction (() => document.body.textContent.includes ('Saved successfully to'));
 const bytes = await page.evaluate (async () => { const db = await new Promise (resolve => { const r = indexedDB.open ('sw-auto3d-library-array-fixture', 1); r.onsuccess = () => resolve (r.result); }); const items = await new Promise (resolve => { const r = db.transaction ('saves').objectStore ('saves').getAll (); r.onsuccess = () => resolve (r.result); }); db.close (); return Array.from (new Uint8Array (await items.find (item => item.name === 'Array timeline QA').archive.arrayBuffer ())); }); const saved = OpenSessionArchive (new Uint8Array (bytes)); checkTracks (saved.document.objects, ids, 'id');
 await page.keyboard.press ('Escape'); await call ('ui.library'); await page.getByRole ('button', { name : 'Device library', exact : true }).click (); await page.getByLabel ('Open Array timeline QA', { exact : true }).click (); await page.waitForFunction (() => !document.querySelector ('.library_grid')); const reopened = await call ('animation.timeline.inspect'); checkTracks (reopened.objects, ids);
 assert.deepEqual (errors, []); console.log ('Array macro creates copies and schedules a reversible timeline reveal.');
} finally { await browser.close (); }
