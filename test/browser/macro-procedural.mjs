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
    await page.locator ('#open_file').setInputFiles ('test/testfiles/animation/animated.glb');
    await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
    const clipObject = (await call ('scene.inspect')).objects[0].id; const clip = await call ('animation.embedded.inspect', { objectId : clipObject }); assert.ok (clip.clips.length);
    await call ('animation.embedded.playback', { objectId : clipObject, action : 'pause' });
    const box = await call ('packaging.fefco.generate', { code : '0201', length : 100, width : 80, height : 60, closure : 'closed' });
    const lighting = await call ('lighting.inspect');
    const macro = { version : 1, steps : [{ id : 'fold', command : 'packaging.fefco.animate', arguments : { objectId : box.objectId, duration : 2 } }, { id : 'clip', command : 'animation.clip.add', arguments : { objectId : clipObject, clip : 0, duration : 2 } }] };
    const recording = await call ('animation.macro.record', { definition : JSON.stringify (macro) }); assert.equal (recording.recorded, true, JSON.stringify (recording)); assert.equal (recording.duration, 4);
    let timeline = await call ('animation.timeline.inspect'); assert.equal (timeline.actions.length, 1); assert.equal (timeline.embeddedClips.length, 1); assert.equal (timeline.embeddedClips[0].time, 2);
    await call ('animation.timeline.seek', { time : 1 }); const fold = await call ('packaging.fefco.scrub.inspect'); assert.ok (fold.progress > 0 && fold.progress < 1, JSON.stringify (fold));
    await call ('animation.timeline.seek', { time : 3 }); const played = await call ('animation.embedded.inspect', { objectId : clipObject }); assert.ok (played.state.time > 0, JSON.stringify (played)); assert.deepEqual (await call ('lighting.inspect'), lighting);
    await call ('history.undo'); timeline = await call ('animation.timeline.inspect'); assert.equal (timeline.actions.length, 0); assert.equal (timeline.embeddedClips.length, 0); assert.equal ((await call ('animation.embedded.inspect', { objectId : clipObject })).state.time, clip.state.time);
    await call ('history.redo'); timeline = await call ('animation.timeline.inspect'); assert.equal (timeline.actions.length, 1); assert.equal (timeline.embeddedClips.length, 1);
    await call ('ui.save'); await page.getByLabel ('Save name', { exact : true }).fill ('Procedural macro QA'); await page.getByLabel ('Save destination', { exact : true }).selectOption ('device'); await page.getByRole ('button', { name : 'Save to library', exact : true }).click (); await page.waitForFunction (() => document.body.textContent.includes ('Saved successfully to'));
    await page.keyboard.press ('Escape'); await call ('ui.library'); await page.getByRole ('button', { name : 'Device library', exact : true }).click (); await page.getByLabel ('Open Procedural macro QA', { exact : true }).click (); await page.waitForFunction (() => !document.querySelector ('.library_grid'));
    timeline = await call ('animation.timeline.inspect'); assert.equal (timeline.actions.length, 1); assert.equal (timeline.embeddedClips.length, 1); await call ('animation.timeline.seek', { time : 3 }); assert.ok ((await call ('animation.embedded.inspect', { objectId : clipObject })).state.time > 0); assert.deepEqual (await call ('lighting.inspect'), lighting);
    await call ('ui.commands'); const dialog = page.locator ('.command_dialog'); await dialog.getByLabel ('Search commands').fill ('Add embedded clip to timeline'); await dialog.getByRole ('button', { name : 'Add embedded clip to timeline', exact : true }).click ();
    const clipInput = dialog.locator ('.command_detail').getByLabel ('Clip', { exact : true }); assert.equal (await clipInput.getAttribute ('type'), 'number'); await clipInput.fill ('0');
    await dialog.locator ('.command_detail').getByRole ('button', { name : 'Add to macro', exact : true }).click ();
    await page.waitForFunction (() => document.querySelector ('.macro_steps')?.textContent.includes ('Add embedded clip to timeline'));
    const macroCode = JSON.parse (await dialog.getByLabel ('Macro JSON').inputValue ()); assert.equal (macroCode.steps[0].arguments.clip, 0);
    assert.deepEqual (errors, []); console.log ('Procedural macro recording: fold, clip, seek, lighting, undo and redo passed.');
} finally { await browser.close (); }
