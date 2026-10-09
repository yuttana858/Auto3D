import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch ({ executablePath : '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1400, height : 1000 } }); page.setDefaultTimeout (120000);
    const errors = []; page.on ('pageerror', error => errors.push (error.message));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'test', email : 'test@example.com' } } }));
    await page.route ('**/api/preferences', route => route.fulfill ({ json : { preferences : { theme : 2 }, folders : [] } }));
    await page.route ('**/api/accounts/**', route => route.fulfill ({ json : { isAdmin : false, requests : [] } }));
    await page.route ('**/api/personal/items', route => route.fulfill ({ json : [] }));
    await page.route ('**/api/environments', route => route.fulfill ({ json : [] }));
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.locator ('#startup_splash').waitFor ({ state : 'detached' });
    await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl');
    await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
    const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, JSON.stringify (r)); return r.result; };
    await call ('animation.panel', { visible : true });
    await page.locator ('.timeline_camera_settings').click (); assert.equal (await page.locator ('#camera_section').getAttribute ('open'), '');
    await page.locator ('#camera_fov').fill ('60'); await page.locator ('#camera_fov').press ('Tab');
    await page.getByRole ('textbox', { name : 'New camera name', exact : true }).fill ('Overview');
    await page.getByRole ('button', { name : 'Save camera view', exact : true }).click ();
    await call ('camera.fov', { fov : 35 }); await call ('camera.create', { name : 'Detail' });
    const saved = await call ('camera.inspect'); assert.equal (saved.views.length, 2); assert.equal (saved.views[0].state.fov, 60);
    await call ('camera.activate', { id : saved.views[0].id }); assert.equal (await page.locator ('#camera_fov').inputValue (), '60');
    await call ('camera.rename', { id : saved.views[1].id, name : 'Close-up' }); assert.equal (await page.getByRole ('textbox', { name : 'Camera view name', exact : true }).nth (1).inputValue (), 'Close-up');
    await call ('lighting.effects', { shadows : true });
    await page.screenshot ({ path : 'work/session-cameras.png' });
    assert.deepEqual (errors, []); console.log ('Camera panel, timeline shortcut, manual FOV, multiple named views and activation passed.');
} finally { await browser.close (); }
