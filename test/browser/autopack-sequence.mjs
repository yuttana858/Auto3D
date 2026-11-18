import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Auto Pack plays the assembly sequence in order (lift, erect with the lid open, pads, partitions, products, top pad, close),
// ends packed as one Undo step; Accessories pieces drop in; the motion easing preference applies.
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1440, height : 900 } }); page.setDefaultTimeout (120000); const errors = []; page.on ('pageerror', e => errors.push (e.message));
    const saved = []; await page.route ('**/api/preferences', route => { if (route.request ().method () === 'PUT' || route.request ().method () === 'POST') { saved.push (route.request ().postDataJSON ()); } return route.fulfill ({ json : { preferences : { units : 'metric', theme : 1 }, folders : [] } }); });
    await page.route ('**/api/personal/items', route => route.fulfill ({ json : [] }));
    await page.route ('**/api/auth/**', route => route.fulfill ({ json : { user : { id : 'browser-user', email : 'browser@example.com' } } }));
    await page.route ('**/api/accounts/**', route => route.fulfill ({ json : { isAdmin : false } }));
    await page.goto ('http://127.0.0.1:8080/website/index.html'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const r = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (r.ok, true, id + ' ' + JSON.stringify (r)); return r.result; };
    const fails = async (id, args = {}) => assert.equal ((await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args })).ok, false, id);

    // Motion easing preference.
    assert.deepEqual (await call ('preferences.motion_easing', { easing : 'strong' }), { easing : 'strong' }); await fails ('preferences.motion_easing', { easing : 'bounce' });
    await call ('preferences.motion_easing', { easing : 'smooth' });

    await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl');
    await page.waitForFunction (() => /^(Added|Imported)/.test (document.querySelector ('.scene_status')?.textContent || ''));
    await call ('packaging.auto.refresh_bounds', { units : 'in' });
    await call ('object.select', { objectId : (await call ('scene.inspect')).objects[0].id });
    await call ('object.array', { width : 3, length : 2, height : 1, animate : false, autoGroup : true });
    const before = await call ('scene.inspect'); await call ('object.select', { objectId : before.objects[0].id });
    const undoBefore = (await call ('scene.inspect')).objects.length;
    await call ('packaging.auto.generate', { duration : 20, pads : ['bottom', 'top', 'front', 'back'], partitions : true });

    // Sample the running sequence: stages appear in order and the lid holds open (0.76) between erect and close.
    const seen = []; let lidOpen = false;
    for (let i = 0; i < 2000; i++) {
        const playback = await call ('packaging.fefco.playback.inspect'), s = await call ('packaging.auto.sequence.inspect');
        if (s && seen.at (-1) !== s.stage) { seen.push (s.stage); }
        if (s && ['bottom', 'sides', 'partitions', 'products', 'top'].includes (s.stage)) { assert.ok (Math.abs (s.fold - 0.76) < 1e-9, 'lid open while packing: ' + s.fold); lidOpen = true; }
        if (!['playing', 'paused'].includes (playback.state)) { break; } await page.waitForTimeout (50);
    }
    const order = ['lift', 'erect', 'bottom', 'sides', 'partitions', 'products', 'top', 'close'];
    assert.ok (seen.every ((stage, i) => !i || order.indexOf (stage) > order.indexOf (seen[i - 1])), 'stages in order: ' + seen.join (' → ')); assert.ok (seen.includes ('products') && seen.includes ('partitions'), seen.join (','));
    assert.ok (lidOpen); for (let i = 0; i < 100 && (await call ('packaging.fefco.playback.inspect')).state === 'finishing'; i++) { await page.waitForTimeout (100); }
    const sequence = await call ('packaging.auto.sequence.inspect'); assert.equal (sequence.order.length, 6); assert.deepEqual (sequence.stages.map (s => s.name), order);
    const packed = await call ('scene.inspect'); assert.ok (packed.objects.length > undoBefore); const carton = packed.objects.find (o => o.userData?._auto3dAutoPack);
    assert.equal (carton.userData._auto3dPackagingState, 'folded');
    // One Undo removes the carton and contents and restores the products.
    await call ('history.undo'); const restored = await call ('scene.inspect');
    assert.deepEqual (restored.objects.map (o => [o.id, o.position]), before.objects.map (o => [o.id, o.position]));

    // Accessories added to a box lower in.
    await call ('packaging.fefco.generate', { length : 400, width : 300, height : 250, closure : 'open' });
    const box = (await call ('scene.inspect')).objects.find (o => o.userData?._auto3dFefco && !o.userData?._auto3dAutoPack); await call ('object.select', { objectId : box.id });
    const pads = await call ('packaging.accessories.pads', { positions : ['bottom', 'front'] }); assert.equal (pads.dropIn.animated, true); assert.ok (pads.dropIn.seconds > 0 && pads.dropIn.seconds <= 1.8);
    assert.deepEqual (errors, []); console.log ('Auto Pack sequence (' + seen.join (' → ') + '), lid open while packing, one Undo, accessory drop-in and motion easing passed.');
} finally { await browser.close (); }
