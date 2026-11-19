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
    // Drive the playback's monotonic clock explicitly. Real requestAnimationFrame callbacks still
    // render each sampled state, but a slow software-rendered frame cannot skip a short stage.
    await page.evaluate (() => {
        const descriptor = Object.getOwnPropertyDescriptor (performance, 'now'), start = performance.now ();
        window.autoPackTestClock = { elapsed : 0, restore : () => { if (descriptor) { Object.defineProperty (performance, 'now', descriptor); } else { delete performance.now; } } };
        Object.defineProperty (performance, 'now', { configurable : true, value : () => start + window.autoPackTestClock.elapsed });
    });
    const order = ['lift', 'erect', 'bottom', 'sides', 'partitions', 'products', 'top', 'close'], seen = [];
    let sequence;
    try {
        await call ('packaging.auto.generate', { duration : 20, pads : ['bottom', 'top', 'front', 'back'], partitions : true });
        sequence = await call ('packaging.auto.sequence.inspect'); assert.deepEqual (sequence.stages.map (stage => stage.name), order); assert.equal (sequence.order.length, 6);
        const contents = (await call ('scene.inspect')).objects.map (object => ({ id : object.id, data : JSON.parse (object.userData?._auto3dAccessory || 'null') })).filter (item => item.data);
        const partitions = contents.filter (item => item.data.kind === 'partition'), tops = contents.filter (item => item.data.position === 'top');
        assert.ok (partitions.length > 0); assert.equal (tops.length, 1);
        for (const stage of sequence.stages) {
            const progress = (stage.start + stage.end) / 2;
            await page.evaluate (elapsed => { window.autoPackTestClock.elapsed = elapsed; }, progress * 20000);
            await page.waitForFunction (async expected => {
                const result = await Auto3D.execute ('packaging.auto.sequence.inspect');
                return result.ok && Math.abs (result.result.progress - expected) < 1e-8;
            }, progress);
            const sampled = await call ('packaging.auto.sequence.inspect'); assert.equal (sampled.stage, stage.name); seen.push (sampled.stage);
            if (['bottom', 'sides', 'partitions', 'products', 'top'].includes (stage.name)) { assert.ok (Math.abs (sampled.fold - .76) < 1e-9, 'lid must remain open during ' + stage.name); }
            if (stage.name === 'partitions') {
                for (const piece of partitions) { assert.equal ((await call ('animation.visibility.inspect', { objectId : piece.id })).renderedVisible, true, 'partition is rendered while lowering'); }
                assert.equal ((await call ('animation.visibility.inspect', { objectId : tops[0].id })).renderedVisible, false, 'top pad must wait until products are placed');
            }
        }
        assert.deepEqual (seen, order);
        await page.evaluate (() => { window.autoPackTestClock.elapsed = 20001; });
        await page.waitForFunction (async () => {
            const result = await Auto3D.execute ('packaging.fefco.playback.inspect');
            return result.ok && ['completed', 'failed'].includes (result.result.state);
        });
        const playback = await call ('packaging.fefco.playback.inspect'); assert.equal (playback.state, 'completed', playback.error);
    } finally { await page.evaluate (() => { window.autoPackTestClock.restore (); delete window.autoPackTestClock; }); }
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
