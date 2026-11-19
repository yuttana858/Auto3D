import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { MockMacroApi } from './macro-api-mock.mjs';

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
    await MockMacroApi (page, { user : 'procedural-test' });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, id + ': ' + JSON.stringify (response)); return response.result; };
    await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl');
    await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
    const object = (await call ('scene.inspect')).objects[0].id; await call ('object.select', { objectId : object });
    await call ('lighting.effects', { ambientIntensity : 0.7, ambientColor : '#b6c8e0', shadows : true }); const lighting = await call ('lighting.inspect');
    const macro = { version : 1, steps : [{ id : 'move', command : 'object.transform', arguments : { objectId : object, position : [2, 0, 0] }, animation : { duration : 0.25 } }] };
    await call ('macro.save', { name : 'Demo', definition : JSON.stringify (macro) }); await call ('ui.module.mode', { module : 'animation', mode : 'minimal' });
    const panel = page.getByRole ('region', { name : 'Animation', exact : true }); const choice = panel.getByLabel ('Saved macro'); await page.waitForFunction (() => [...document.querySelectorAll ('#animation_module_panel select[aria-label="Saved macro"] option')].some (option => option.value === 'Demo'));
    await choice.selectOption ('Demo'); await panel.getByRole ('button', { name : 'Run and record', exact : true }).click (); await panel.getByText ('Recorded 0.25 s. Review the timeline, then render the video.', { exact : true }).waitFor ();
    assert.equal ((await call ('animation.timeline.inspect')).rangeEnd, 0.25); assert.equal (await page.locator ('.advance_animation_panel').isVisible (), true);
    await call ('history.undo'); const typed = await call ('commands.text', { text : 'run Demo macro and record the main viewer' }); assert.equal (typed.ok, true); assert.equal (typed.completed[0].command, 'animation.workflow.record');
    assert.equal ((await call ('animation.timeline.inspect')).rangeEnd, 0.25); await panel.getByLabel ('Video size').selectOption ('720p'); await panel.getByLabel ('Frame rate').selectOption ('24'); await panel.getByLabel ('Format').selectOption ('webm');
    await panel.getByRole ('button', { name : 'Export video', exact : true }).click (); let state; for (let i = 0; i < 1200; i++) { state = await call ('animation.video.inspect'); if (['completed', 'failed'].includes (state.status)) { break; } await page.waitForTimeout (100); }
    assert.equal (state.status, 'completed', JSON.stringify (state)); assert.equal (state.video.frames, 7); assert.equal (state.video.width, 1280); assert.equal (state.video.height, 720); assert.equal (state.video.container, 'webm'); assert.deepEqual (await call ('lighting.inspect'), lighting);
    const [download] = await Promise.all ([page.waitForEvent ('download'), panel.getByRole ('button', { name : 'Download video', exact : true }).click ()]); assert.ok ((await readFile (await download.path ())).length > 1000);
    await page.route ('**/api/macros', route => route.fulfill ({ status : 503, json : { error : 'Offline' } })); await panel.getByRole ('button', { name : 'Refresh macros', exact : true }).click (); await panel.getByText ('Shared macro library unavailable. Browser-only macros are still listed.', { exact : true }).waitFor ();
    assert.deepEqual (errors, []);
    console.log ('Saved macro recorded through panel and typed command; seven 720p frames rendered with lighting preserved.');
} finally { await browser.close (); }
