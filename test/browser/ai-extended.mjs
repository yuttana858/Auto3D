import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const png = await readFile ('website/assets/images/3dviewer_net_logo.png').catch (() => Buffer.from ('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64'));
const animated = await readFile ('test/testfiles/animation/animated.glb');
const glb = await readFile ('test/testfiles/gltf/BoxTextured/glTF-Binary/BoxTextured.glb');
await mkdir ('work/ai-review', { recursive : true });
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
 const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); const errors = []; page.on ('pageerror', e => { errors.push (e.message); console.error ('PAGE:', e.message); }); page.on ('console', m => { if (m.type () === 'error') { console.error ('CONSOLE:', m.text ()); } }); let saved = null; let uploads = 0; let submitted = [];
 await page.route ('**/api/auth/**', r => r.fulfill ({ json : { user : { id : 'ai-test', email : 'test@example.com' } } }));
 await page.route ('**/api/preferences', r => r.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
 for (const path of ['accounts/**', 'environments']) { await page.route ('**/api/' + path, r => r.fulfill ({ json : path.startsWith ('accounts') ? { isAdmin : false } : [] })); }
 await page.route ('**/api/personal/items', async r => { if (r.request ().method () === 'POST') { uploads++; const response = new Response (r.request ().postDataBuffer (), { headers : { 'content-type' : r.request ().headers ()['content-type'] } }); const form = await response.formData (); saved = Buffer.from (await form.get ('archive').arrayBuffer ()); await r.fulfill ({ json : { id : 'saved-project', name : 'Concepts' } }); } else { await r.fulfill ({ json : [] }); } });
 await page.route ('https://assets.meshy.ai/**', r => r.fulfill ({ body : png, contentType : 'image/png' }));
 await page.route ('**/api/ai/**', async r => { const url = new URL (r.request ().url ()); if (url.pathname.endsWith ('/model')) { await r.fulfill ({ body : url.searchParams.get ('url')?.includes ('animated') ? animated : glb, contentType : 'model/gltf-binary' }); return; } if (r.request ().method () === 'POST') { submitted.push ({ route : url.pathname.split ('/').pop (), body : r.request ().postDataJSON () }); await r.fulfill ({ json : { result : 'generated-' + submitted.length } }); return; } if (url.pathname.includes ('/generated-')) { const route = url.pathname.split ('/').at (-2); await r.fulfill ({ json : { id : url.pathname.split ('/').pop (), type : route, status : 'SUCCEEDED', progress : 100, model_urls : route !== 'text-to-image' ? { glb : route === 'animations' ? 'https://assets.meshy.ai/animated.glb' : 'https://assets.meshy.ai/generated.glb' } : undefined, image_urls : route === 'text-to-image' ? ['https://assets.meshy.ai/image.png'] : undefined } }); return; } await r.fulfill ({ json : url.pathname.endsWith ('text-to-3d') ? [{ id : 'sample', prompt : 'Textured packaging concept', type : 'text-to-3d-preview', status : 'SUCCEEDED', model_urls : { glb : 'https://assets.meshy.ai/sample.glb' } }, { id : 'second', prompt : 'Second model', type : 'text-to-3d-preview', status : 'SUCCEEDED', model_urls : { glb : 'https://assets.meshy.ai/second.glb' } }] : [] }); });
 await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
 const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, JSON.stringify (r)); return r.result; };
 await call ('ui.module.mode', { module : 'ai', mode : 'extended' }); const modal = page.locator ('dialog.module_extended_view'); await modal.waitFor ({ state : 'visible' });
 assert.deepEqual (await modal.evaluate (e => [e.clientWidth, e.clientHeight]), [1500, 1000]);
 await call ('ai.creations.refresh'); await call ('ai.creation.preview', { id : 'sample' }); assert.equal (await page.locator ('.ai_preview_host canvas').count (), 1); await call ('ai.creation.scale', { scale : 2 });
 // No session mutation from preview, scale, typing or scene shortcuts behind modal.
 assert.equal ((await call ('scene.inspect')).objects.length, 0); await page.locator ('.ai_preview_host').focus (); await page.keyboard.press ('Delete'); await page.keyboard.press ('Control+s'); assert.equal (await page.locator ('dialog[open]').count (), 1);
 await page.screenshot ({ path : 'work/ai-review/ai-extended.png' });
 await call ('ai.project.save', { name : 'Concepts' }); assert.equal (uploads, 1); assert.ok (saved?.length > glb.length); await writeFile ('work/ai-review/concepts.auto3d', saved);
 // Save includes a second, unpreviewed completed model. Reopen restores both independently of signed links.
 await page.getByRole ('button', { name : 'Open AI project', exact : true }).click (); // cancel filechooser is unnecessary; setInputFiles below.
 await page.locator ('.ai_project_toolbar input[type=file]').setInputFiles ({ name : 'Concepts.auto3d', mimeType : 'application/octet-stream', buffer : saved }); await page.waitForFunction (() => document.querySelector ('.ai_status').textContent === 'AI project opened · 2 models');
 const restored = await call ('ai.workspace.inspect'); assert.equal (restored.tasks.find (t => t.id === 'sample').scale, 2);
 await call ('ai.creation.preview', { id : 'sample' }); await call ('ai.creation.add'); assert.equal ((await call ('scene.inspect')).objects.length, 1); assert.deepEqual ((await call ('scene.inspect')).objects[0].scale, [2, 2, 2]);
 await call ('ai.generate', { action : 'textimage', prompt : 'Red bottle' }); await page.waitForFunction (async () => (await Auto3D.execute ('ai.workspace.inspect')).result.tasks.some (t => t.id === 'generated-1' && t.status === 'SUCCEEDED'));
 assert.equal (submitted[0].route, 'text-to-image'); assert.equal (submitted[0].body.ai_model, 'nano-banana');
 await call ('ai.creation.preview', { id : 'generated-1' });
 for (const [index, action] of ['image3d', 'texture', 'rigging', 'animations'].entries ()) {
  await call ('ai.generate', { action, prompt : 'Blue printed paper' }); const id = 'generated-' + (index + 2);
  await page.waitForFunction (async id => (await Auto3D.execute ('ai.workspace.inspect')).result.tasks.some (t => t.id === id && t.status === 'SUCCEEDED'), id);
  const preview = await call ('ai.creation.preview', { id }); if (action === 'animations') { assert.equal (preview.animations, 2); }
 }
 assert.equal (submitted[1].body.input_task_id, 'generated-1'); assert.equal (submitted[4].body.rig_task_id, 'generated-4');
 await call ('ai.creation.add'); assert.equal ((await call ('scene.inspect')).objects.length, 2);
 await call ('ui.module.mode', { module : 'ai', mode : 'minimal' }); assert.equal (await modal.isVisible (), false); assert.equal (await page.locator ('#ai_module_panel').isVisible (), true);
 await call ('ui.module.mode', { module : 'upload', mode : 'extended' }); assert.equal (await modal.getAttribute ('data-module'), 'upload'); await page.keyboard.press ('Escape'); await modal.waitFor ({ state : 'hidden' });
 await call ('ui.module.mode', { module : 'packaging', mode : 'extended' }); assert.equal (await modal.getAttribute ('data-module'), 'packaging'); await page.getByRole ('button', { name : 'Minimal Packaging Gen panel', exact : true }).click ();
 await page.setViewportSize ({ width : 390, height : 844 }); await call ('ui.module.mode', { module : 'ai', mode : 'extended' }); assert.equal (await modal.evaluate (e => e.scrollWidth > e.clientWidth), false); await page.screenshot ({ path : 'work/ai-review/ai-mobile.png' }); assert.deepEqual (errors, []); console.log ('Full-width modal, shortcuts, AI preview, textures, scale, complete project save/reopen, add and mobile checks passed.');
} finally { await browser.close (); }
