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
    const original = (await call ('scene.inspect')).objects[0].id; await call ('object.select', { objectId : original }); const lighting = await call ('lighting.inspect');
    const ordinary = process.env.TEST_DUPLICATE === '1';
    const macro = { version : 1, steps : [{ id : 'copy', command : ordinary ? 'object.duplicate' : 'object.duplicate_at', arguments : ordinary ? { objectId : original } : { objectId : original, position : [3, 0, 0] } }, { id : 'remove', command : 'object.delete', arguments : { objectId : { $ref : ordinary ? 'copy.id' : 'copy.objectIds.0' } } }] };
    const result = await call ('animation.macro.record', { definition : JSON.stringify (macro) }); assert.equal (result.recorded, true, JSON.stringify (result)); assert.equal (result.duration, 4); const copy = result.completed[0].objectIds[0]; assert.deepEqual (result.completed[1].objectIds, [copy]);
    assert.equal ((await call ('scene.inspect')).objects.length, 2);
    for (const [time, visible] of [[0, false], [2, true], [3, true], [4, false], [1, false]]) { await call ('animation.timeline.seek', { time }); assert.equal ((await call ('animation.visibility.inspect', { objectId : copy })).renderedVisible, visible, 'time ' + time); assert.equal ((await call ('scene.inspect')).objects.find (item => item.id === copy).effectiveVisible, visible, 'scene inspection at ' + time); }
    assert.deepEqual (await call ('lighting.inspect'), lighting); await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, 1); await call ('history.redo'); assert.equal ((await call ('scene.inspect')).objects.length, 2);
    await call ('ui.save'); await page.getByLabel ('Save name', { exact : true }).fill ('Object lifetime QA'); await page.getByLabel ('Save destination', { exact : true }).selectOption ('device'); await page.getByRole ('button', { name : 'Save to library', exact : true }).click (); await page.waitForFunction (() => document.body.textContent.includes ('Saved successfully to'));
    await page.keyboard.press ('Escape'); await call ('ui.library'); await page.getByRole ('button', { name : 'Device library', exact : true }).click (); await page.getByLabel ('Open Object lifetime QA', { exact : true }).click (); await page.waitForFunction (() => !document.querySelector ('.library_grid'));
    await call ('animation.timeline.seek', { time : 3 }); assert.equal ((await call ('animation.visibility.inspect', { objectId : copy })).renderedVisible, true); await call ('animation.timeline.seek', { time : 4 }); assert.equal ((await call ('animation.visibility.inspect', { objectId : copy })).renderedVisible, false);
    assert.deepEqual (await call ('lighting.inspect'), lighting); assert.deepEqual (errors, []); console.log ('Recorded object duplication, removal, seek, undo and save/reopen passed.');
} finally { await browser.close (); }
