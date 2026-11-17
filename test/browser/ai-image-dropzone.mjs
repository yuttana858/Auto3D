import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';

// Image to 3D: the viewer becomes a drop zone (click, drop, Ctrl+V paste) until a reference is chosen,
// and the finished model opens in the viewer by itself.
const png = await readFile ('website/assets/images/3dviewer_net_logo.png');
const glb = await readFile ('test/testfiles/gltf/BoxTextured/glTF-Binary/BoxTextured.glb');
await mkdir ('work/ai-review', { recursive : true });
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'ai-dropzone', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }));
    await page.route ('**/api/accounts/**', route => route.fulfill ({ json : { isAdmin : false } }));
    await page.route ('https://assets.meshy.ai/**', route => route.fulfill ({ body : png, contentType : 'image/png' }));
    let submitted = null, polls = 0;
    await page.route ('**/api/ai/**', async route => {
        const request = route.request (), url = new URL (request.url ());
        if (url.pathname.endsWith ('/model')) { return route.fulfill ({ body : glb, contentType : 'model/gltf-binary', headers : { 'Content-Length' : String (glb.length) } }); }
        if (request.method () === 'POST' && url.pathname.endsWith ('/image-to-3d')) { submitted = JSON.parse (request.postData ()); return route.fulfill ({ json : { result : 'image-task' } }); }
        if (url.pathname.endsWith ('/image-to-3d/image-task')) {
            polls++;
            return route.fulfill ({ json : polls > 1 ? { id : 'image-task', type : 'image-to-3d', status : 'SUCCEEDED', progress : 100, created_at : Date.now (), thumbnail_url : 'https://assets.meshy.ai/new.png', model_urls : { glb : 'https://assets.meshy.ai/new.glb' } } : { id : 'image-task', type : 'image-to-3d', status : 'IN_PROGRESS', progress : 50, created_at : Date.now () } });
        }
        return route.fulfill ({ json : [] });
    });
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const result = await page.evaluate (({ id, args }) => window.Auto3D.execute (id, args), { id, args }); assert.equal (result.ok, true, id + ' ' + JSON.stringify (result)); return result.result; };
    const state = () => call ('ai.workspace.inspect');
    await call ('ui.ai'); await call ('ai.creations.refresh');
    const zone = page.getByRole ('button', { name : /Upload reference image/ }), name = page.locator ('.ai_image_name');

    // Other types keep the viewer; Image to 3D turns it into the drop zone.
    await call ('ai.mode.set', { mode : 'text3d' }); assert.equal (await zone.isVisible (), false); assert.equal ((await state ()).dropZone, false);
    // A pasted image is ignored outside the image-input types.
    const paste = () => page.evaluate (async () => { const bytes = await (await fetch ('/website/assets/images/3dviewer_net_logo.png')).arrayBuffer (); const data = new DataTransfer (); data.items.add (new File ([bytes], 'image.png', { type : 'image/png' })); document.body.dispatchEvent (new ClipboardEvent ('paste', { clipboardData : data, bubbles : true, cancelable : true })); });
    await paste (); assert.equal (await name.textContent (), 'No image selected');
    await call ('ai.mode.set', { mode : 'image3d' }); await zone.waitFor (); assert.equal ((await state ()).dropZone, true);
    assert.match (await zone.textContent (), /Drop an image here.*Ctrl\+V to paste/);
    await page.locator ('#ai_module_panel').screenshot ({ path : 'work/ai-review/image3d-drop-zone.png' });

    // Ctrl+V paste sets the single reference and shows it in the viewer.
    await paste (); await page.waitForFunction (() => document.querySelector ('.ai_image_name')?.textContent.includes ('pasted image.png'));
    assert.equal (await zone.isVisible (), false); assert.equal ((await state ()).dropZone, false);
    assert.ok (await page.locator ('.ai_preview_host').evaluate (el => el.classList.contains ('showing_image')));
    // Clearing brings the drop zone back; dropping a file onto the viewer sets the reference again.
    await call ('ai.reference.clear'); await zone.waitFor ();
    await page.evaluate (async () => {
        const bytes = await (await fetch ('/website/assets/images/3dviewer_net_logo.png')).arrayBuffer (); const data = new DataTransfer (); data.items.add (new File ([bytes], 'dropped mug.png', { type : 'image/png' }));
        const host = document.querySelector ('.ai_preview_host'); host.dispatchEvent (new DragEvent ('dragover', { dataTransfer : data, bubbles : true, cancelable : true })); host.dispatchEvent (new DragEvent ('drop', { dataTransfer : data, bubbles : true, cancelable : true }));
    });
    await page.waitForFunction (() => document.querySelector ('.ai_image_name')?.textContent.includes ('dropped mug.png')); assert.equal (await zone.isVisible (), false);
    // Agents use the same path with a data URL.
    await call ('ai.reference.clear');
    const added = await call ('ai.reference.add_image', { dataUrl : 'data:image/png;base64,' + png.toString ('base64'), name : 'agent mug' });
    assert.deepEqual (added, { images : 1, source : 'agent' }); assert.match (await name.textContent (), /agent mug\.png/);
    const rejected = await page.evaluate (() => window.Auto3D.execute ('ai.reference.add_image', { dataUrl : 'data:text/plain;base64,aGVsbG8=' })); assert.equal (rejected.ok, false);

    // Generating: the finished model opens in the viewer without pressing Preview.
    await page.locator ('.ai_generate_button').click ();
    await page.waitForFunction (() => document.querySelector ('.ai_recent_card[data-task-id="image-task"]'));
    assert.ok (submitted?.image_url?.startsWith ('data:image/png;base64,'));
    await page.waitForFunction (async () => { const result = await window.Auto3D.execute ('ai.workspace.inspect'); return result.result.selected === 'image-task'; }, null, { timeout : 60000 });
    await page.waitForFunction (() => { const host = document.querySelector ('.ai_preview_host'); return host.querySelector ('canvas') && !host.classList.contains ('showing_image') && document.querySelector ('.ai_preview_message')?.hidden; }, null, { timeout : 60000 });
    assert.equal ((await state ()).dropZone, false);
    await page.locator ('#ai_module_panel').screenshot ({ path : 'work/ai-review/image3d-generated-preview.png' });
    assert.deepEqual (errors, []);
    console.log ('Image to 3D drop zone, Ctrl+V paste, drag and drop, agent data URL, mode guard and automatic preview of the generated model passed.');
} finally { await browser.close (); }
