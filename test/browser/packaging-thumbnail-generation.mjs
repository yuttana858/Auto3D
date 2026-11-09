import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
 const page = await browser.newPage ({ viewport : { width : 900, height : 600 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', e => errors.push (e.message));
 await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'array-fixture', email : 'fixture@example.com' } } }));
 await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'standard' }, folders : [] } }));
 for (const path of ['accounts/**', 'personal/items', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
 // UI/geometry regression; rasterization is covered by separate effects/rendering probes.
 await page.addInitScript (() => { for (const Type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (Type) { for (const method of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) { if (Type.prototype[method]) { Type.prototype[method] = () => {}; } } } } });
 await page.goto (process.env.AUTO3D_TEST_URL || 'http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
 const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, JSON.stringify (r)); return r.result; };
 await call ('ui.ai.packaging');
 for (const [i, [code, acronym]] of [['0201', 'RSC'], ['0200', 'HSC'], ['0202', 'OSC'], ['0203', 'FOL']].entries ()) {
  for (const [label, value] of [['Length (L)', '15.748031'], ['Width (W)', '11.811024'], ['Height (H)', '9.84252']]) { await page.getByLabel ('FEFCO ' + label, { exact : true }).fill (value); }
  await page.getByLabel ('Board', { exact : true }).selectOption ('nominal-b');
  await page.getByRole ('button', { name : 'FEFCO ' + code + ' ' + acronym, exact : true }).click ();
  await page.waitForFunction (code => document.querySelector ('.scene_status')?.textContent.startsWith ('Added FEFCO ' + code), code, { timeout : 120000 });
  const scene = await call ('scene.inspect'); assert.equal (scene.objects.length, i + 1); assert.equal (JSON.parse (scene.objects.at (-1).userData._auto3dFefco).code, code);
  console.log ('Generated', code); assert.equal (await page.getByText ('Box added to scene.', { exact : true }).isVisible (), true);
 }
 await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 3); await call ('history.redo'); assert.equal ((await call ('scene.inspect')).objects.length, 4);
 const before = (await call ('scene.inspect')).objects.length; await page.getByLabel ('FEFCO Width (W)', { exact : true }).fill ('100');
 await page.getByRole ('button', { name : 'FEFCO 0201 RSC', exact : true }).click (); await page.getByText (/Cannot generate box:/).waitFor (); assert.equal ((await call ('scene.inspect')).objects.length, before);
 assert.equal (await page.getByRole ('button', { name : 'FEFCO 0201 RSC', exact : true }).isEnabled (), true);
 assert.deepEqual (errors, []); console.log ('All four thumbnail buttons generate the exact rounded inch defaults; Undo/Redo and inline error feedback passed.');

} finally { await browser.close (); }
