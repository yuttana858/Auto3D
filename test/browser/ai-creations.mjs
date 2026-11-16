import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';

// Latest creations: hover Add/New with main-viewer download feedback, multi-select, delete and thumbnail size. Mocked provider.
const glb = await readFile ('test/testfiles/gltf/BoxTextured/glTF-Binary/BoxTextured.glb');
const png = Buffer.from ('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
await mkdir ('work/ai-review', { recursive : true });
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    const deleted = [];
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'ai-test', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    await page.route ('**/api/accounts/**', route => route.fulfill ({ json : { isAdmin : false } }));
    await page.route ('https://assets.meshy.ai/**', route => route.fulfill ({ body : png, contentType : 'image/png' }));
    await page.route ('**/api/ai/**', async route => {
        const request = route.request (), url = new URL (request.url ());
        if (url.pathname.endsWith ('/model')) { await new Promise (resolve => setTimeout (resolve, 400)); return route.fulfill ({ body : glb, contentType : 'model/gltf-binary', headers : { 'Content-Length' : String (glb.length) } }); }
        if (request.method () === 'DELETE') { deleted.push (url.pathname.split ('/').slice (-2).join ('/')); return route.fulfill ({ json : { deleted : true } }); }
        const models = [['mug', 'Ceramic mug'], ['bottle', 'Glass bottle'], ['box', 'Shipping box']].map (([id, prompt]) => ({ id, prompt, type : 'text-to-3d-preview', status : 'SUCCEEDED', thumbnail_url : 'https://assets.meshy.ai/' + id + '.png', model_urls : { glb : 'https://assets.meshy.ai/' + id + '.glb' } }));
        return route.fulfill ({ json : url.pathname.endsWith ('text-to-3d') ? models : url.pathname.endsWith ('text-to-image') ? [{ id : 'image', prompt : 'Mug photo', type : 'text-to-image', status : 'SUCCEEDED', image_urls : ['https://assets.meshy.ai/image.png'] }] : [] });
    });
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => window.Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, id + ' ' + JSON.stringify (result)); return result.result; };
    await call ('ai.creations.refresh'); await call ('ui.module.mode', { module : 'ai', mode : 'minimal' });
    const card = id => page.locator ('.ai_recent_card[data-task-id="' + id + '"]');

    // Hover shows Add / New on 3D models only; Add downloads with feedback over the main viewer and appends to this session.
    await card ('mug').hover (); const add = card ('mug').getByRole ('button', { name : 'Add Ceramic mug to the current session' });
    assert.equal (await add.isVisible (), true); assert.equal (await card ('image').locator ('.ai_thumb_overlay').count (), 0);
    await add.click ();
    const toast = page.locator ('#main_viewer .ai_viewer_toast'); await toast.waitFor ({ state : 'visible' }); assert.match (await toast.textContent (), /Downloading “Ceramic mug”/);
    await page.waitForFunction (() => document.querySelector ('#main_viewer .ai_viewer_toast')?.dataset.state === 'done');
    assert.match (await toast.textContent (), /Added “Ceramic mug” to the session/); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    await page.screenshot ({ path : 'work/ai-review/ai-add-toast.png' });

    // New opens the model in a new session tab.
    const tabs = (await call ('session.tabs.inspect')).tabs.length;
    await card ('bottle').hover (); await card ('bottle').getByRole ('button', { name : 'Open Glass bottle in a new session' }).click ();
    await page.waitForFunction (() => document.querySelector ('#main_viewer .ai_viewer_toast')?.dataset.state === 'done');
    assert.equal ((await call ('session.tabs.inspect')).tabs.length, tabs + 1); assert.equal ((await call ('scene.inspect')).objects.length, 1);

    // Multi-select and delete (the UI asks for confirmation first; cancelling deletes nothing).
    await call ('ui.module.mode', { module : 'ai', mode : 'extended' });
    await card ('box').hover (); await card ('box').getByRole ('checkbox', { name : 'Select Shipping box' }).check ();
    await card ('image').hover (); await card ('image').getByRole ('checkbox', { name : 'Select Mug photo' }).check ();
    const bar = page.locator ('.ai_selection_bar'); assert.equal (await bar.isVisible (), true); assert.equal (await bar.locator ('.ai_selection_count').textContent (), '2 selected');
    page.once ('dialog', dialog => dialog.dismiss ()); await bar.getByRole ('button', { name : 'Delete selected' }).click (); assert.deepEqual (deleted, []);
    page.once ('dialog', dialog => { assert.match (dialog.message (), /Delete 2 creations\?/); dialog.accept (); }); await bar.getByRole ('button', { name : 'Delete selected' }).click ();
    await page.waitForFunction (() => !document.querySelector ('.ai_recent_card[data-task-id="box"]'));
    assert.deepEqual (deleted.sort (), ['text-to-3d/box', 'text-to-image/image']); assert.equal (await card ('image').count (), 0); assert.equal (await bar.isVisible (), false);
    // Single delete from the card.
    await card ('bottle').hover (); page.once ('dialog', dialog => dialog.accept ()); await card ('bottle').getByRole ('button', { name : 'Delete Glass bottle' }).click ();
    await page.waitForFunction (() => !document.querySelector ('.ai_recent_card[data-task-id="bottle"]')); assert.ok (deleted.includes ('text-to-3d/bottle'));

    // Thumbnail size slider (extended view) and the shorter Latest creations bar.
    const slider = page.getByRole ('slider', { name : 'Thumbnail size' }); assert.equal (await slider.isVisible (), true);
    await call ('ai.creations.thumbnail_size', { size : 96 }); assert.ok (Math.abs ((await card ('mug').boundingBox ()).width - 96) < 2);
    await call ('ai.creations.thumbnail_size', { size : 220 }); assert.ok (Math.abs ((await card ('mug').boundingBox ()).width - 220) < 2); assert.equal (await slider.inputValue (), '220');
    const header = await page.locator ('.ai_recent_header').boundingBox (); assert.ok (header.height <= 30, 'Latest creations bar is ' + header.height + 'px');
    await page.screenshot ({ path : 'work/ai-review/ai-creations-extended.png' });
    assert.deepEqual (errors, []);
    console.log ('AI creations: hover Add/New with viewer download feedback, new session, multi-select, confirmed delete, thumbnail size and compact header passed.');
} finally { await browser.close (); }
