import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve ('build/pages');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); const errors = [], requests = []; page.on ('pageerror', error => errors.push (error.message)); page.on ('request', request => requests.push (request.url ()));
    await page.route ('https://auto3d.test/**', async route => {
        const url = new URL (route.request ().url ()), name = url.pathname;
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'primary-ui', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { if (process.env.PRIMARY_TEST_PROGRESS) { console.log (id); } const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, JSON.stringify (response)); return response.result; };
    const poll = async (predicate) => { for (let i = 0; i < 600; i++) { try { if (await predicate ()) { return; } } catch (error) { if (!error.message.includes ('viewer is busy')) { throw error; } } await page.waitForTimeout (100); } throw new Error ('Timed out waiting for product state.'); };
    await mkdir ('work/primary-profile-review', { recursive : true });
    await call ('ui.primary_products'); await call ('primary.designs.select', { id : 'rect-cleaner' });
    const canvas = await page.locator ('#main_viewer canvas').elementHandle ();
    await page.getByRole ('button', { name : 'Edit model', exact : true }).click ();
    const profile = page.getByRole ('region', { name : 'Live product profile', exact : true }); await profile.waitFor ();
    const initial = await call ('primary.profile.inspect'); assert.equal (initial.available, true);
    const objectId = initial.objectId;
    await call ('primary.profile.open'); assert.equal ((await call ('primary.profile.inspect')).objectId, objectId);
    assert.equal (await canvas.evaluate (el => el === document.querySelector ('#main_viewer canvas')), true);
    const left = await profile.boundingBox (), right = await page.locator ('#main_viewer').boundingBox ();
    assert.ok (right.x >= left.x + left.width - 1); assert.ok (right.width > 450); await page.screenshot ({ path : 'work/primary-profile-review/open.png' });
    assert.equal (await profile.getByRole ('button', { name : /Apply|Generate/ }).count (), 0);
    const shoulder = profile.getByRole ('spinbutton', { name : 'Profile shoulder height', exact : true });
    await shoulder.fill ('42'); assert.notEqual ((await call ('primary.profile.inspect')).draft.bottleShape?.shoulderHeightMm, 42);
    await shoulder.press ('Enter'); await poll (async () => (await call ('primary.profile.inspect')).draft.bottleShape?.shoulderHeightMm === 42);
    await poll (async () => await shoulder.isEnabled ());
    await call ('history.undo'); assert.notEqual (await shoulder.inputValue (), '42'); await call ('history.redo'); assert.equal (await shoulder.inputValue (), '42');
    const height = profile.getByRole ('spinbutton', { name : 'Profile overall height', exact : true });
    await height.fill ('2'); await height.press ('Enter'); await poll (async () => await height.getAttribute ('aria-invalid') === 'true'); assert.equal ((await call ('primary.profile.inspect')).draft.heightMm, initial.draft.heightMm);
    await height.fill ('260'); await height.press ('Enter'); await poll (async () => (await call ('primary.profile.inspect')).draft.heightMm === 260); await poll (async () => await height.isEnabled ());
    await call ('preferences.units', { units : 'standard' }); await poll (async () => Math.abs (Number (await height.inputValue ()) - 260/25.4) < .00001);
    await height.fill ('10'); await height.press ('Enter'); await poll (async () => (await call ('primary.profile.inspect')).draft.heightMm === 254); await poll (async () => await height.isEnabled ());
    await call ('view.focus', { objectId });
    const before = await call ('camera.current.inspect'); const c = await page.locator ('#main_viewer canvas').boundingBox ();
    await page.mouse.move (c.x+c.width*.65, c.y+c.height*.5); await page.mouse.down ({ button : 'right' }); await page.mouse.move (c.x+c.width*.65+75, c.y+c.height*.5+40, { steps : 12 }); await page.mouse.up ({ button : 'right' });
    assert.notDeepEqual (await call ('camera.current.inspect'), before);
    const orbit = await call ('camera.current.inspect'); await page.mouse.wheel (0, -160); await page.waitForTimeout (300); assert.notDeepEqual (await call ('camera.current.inspect'), orbit);
    await page.screenshot ({ path : 'work/primary-profile-review/desktop.png' });
    await page.setViewportSize ({ width : 390, height : 844 });
    assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false);
    const mobileLeft = await profile.boundingBox (), mobileRight = await page.locator ('#main_viewer').boundingBox (); assert.ok (mobileRight.y >= mobileLeft.y+mobileLeft.height-1);
    await page.screenshot ({ path : 'work/primary-profile-review/mobile.png' }); await page.setViewportSize ({ width : 1500, height : 1000 });
    await profile.getByRole ('button', { name : 'Close model editor' }).click (); await profile.waitFor ({ state : 'detached' });
    assert.equal (await canvas.evaluate (el => el === document.querySelector ('#main_viewer canvas')), true); assert.ok ((await page.locator ('#main_viewer').boundingBox ()).width > right.width);
    await call ('primary.designs.select', { id : 'standard-beverage' }); const can = await call ('primary.generate');
    await call ('primary.profile.open'); assert.equal (await profile.locator ('select[aria-label="Profile cross-section"]').count (), 1); assert.equal (await profile.locator ('select[aria-label="Profile cross-section"]').isVisible (), false);
    await call ('object.select', { objectId }); await poll (async () => await shoulder.isVisible ());
    await call ('object.select', { objectId : can.objectId }); await call ('object.delete', { objectId : can.objectId }); await profile.waitFor ({ state : 'detached' });
    assert.deepEqual (errors, []); console.log ('Live profile: create-on-open, same canvas, Enter updates, Undo/Redo, validation, inches, orbit/zoom, mobile, close and selection passed.');
} finally { await browser.close (); }
