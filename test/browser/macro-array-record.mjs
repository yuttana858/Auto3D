import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve ('build/pages');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1400, height : 900 } }); page.setDefaultTimeout (120000); const errors = [];
    page.on ('pageerror', error => errors.push (error.message));
    await page.route ('https://auto3d.test/**', async route => {
        const name = new URL (route.request ().url ()).pathname;
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'procedural-test', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric', viewportQuality : 'fast' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, id + ': ' + JSON.stringify (response)); return response.result; };
    await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl');
    await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
    const original = (await call ('scene.inspect')).objects[0].id; await call ('object.select', { objectId : original });
    const lighting = await call ('lighting.inspect');
    const macro = { version : 1, steps : [{ id : 'copies', command : 'object.array', arguments : { width : 3, length : 1, height : 1, animate : true, duration : 4 } }, { id : 'move', command : 'object.transform', arguments : { objectId : { $ref : 'copies.objectIds.0' }, position : [10, 0, 0] }, animation : { duration : 2 } }] };
    const result = await call ('animation.macro.record', { definition : JSON.stringify (macro) }); assert.equal (result.recorded, true, JSON.stringify (result)); assert.equal (result.duration, 6);
    let scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 3); const copies = scene.objects.filter (item => item.id !== original).map (item => item.id);
    await call ('animation.timeline.seek', { time : 0 }); for (const objectId of copies) { assert.equal ((await call ('animation.visibility.inspect', { objectId })).renderedVisible, false); }
    await call ('animation.timeline.seek', { time : 4 }); for (const objectId of copies) { assert.equal ((await call ('animation.visibility.inspect', { objectId })).renderedVisible, true); }
    await call ('animation.timeline.seek', { time : 5 }); scene = await call ('scene.inspect'); const first = scene.objects.find (item => item.id === copies[0]); assert.notEqual (first.position[0], 10); assert.deepEqual (await call ('lighting.inspect'), lighting);
    await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 1);
    await call ('history.redo'); assert.equal ((await call ('scene.inspect')).objects.length, 3);
    await call ('ui.save'); await page.getByLabel ('Save name', { exact : true }).fill ('Recorded array QA'); await page.getByLabel ('Save destination', { exact : true }).selectOption ('device'); await page.getByRole ('button', { name : 'Save to library', exact : true }).click (); await page.waitForFunction (() => document.body.textContent.includes ('Saved successfully to'));
    await page.keyboard.press ('Escape'); await call ('ui.library'); await page.getByRole ('button', { name : 'Device library', exact : true }).click (); await page.getByLabel ('Open Recorded array QA', { exact : true }).click (); await page.waitForFunction (() => !document.querySelector ('.library_grid'));
    await call ('animation.timeline.seek', { time : 0 }); for (const objectId of copies) { assert.equal ((await call ('animation.visibility.inspect', { objectId })).renderedVisible, false); } await call ('animation.timeline.seek', { time : 4 }); for (const objectId of copies) { assert.equal ((await call ('animation.visibility.inspect', { objectId })).renderedVisible, true); }
    assert.deepEqual (await call ('lighting.inspect'), lighting); assert.deepEqual (errors, []); console.log ('Recorded array creation, reveal, references, undo, redo and reopening passed.');
} finally { await browser.close (); }
