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
    // waitForFunction does not repoll a false result from an async predicate; await each command explicitly.
    const until = async (id, ready) => {
        const deadline = Date.now () + 120000;
        for (;;) {
            const result = await call (id); if (ready (result)) { return result; }
            assert.ok (Date.now () < deadline, 'Timed out waiting for ' + id + ': ' + JSON.stringify (result));
            await page.waitForTimeout (50);
        }
    };
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
    await page.evaluate (count => {
        const descriptor = Object.getOwnPropertyDescriptor (performance, 'now'), start = performance.now ();
        const prototype = OV.Engine.ViewerMainModel.prototype, original = prototype.SetMainObject; let root = null;
        // Observe the actual scene without bypassing the API's playback busy guard or changing rendering.
        prototype.SetMainObject = function (...args) {
            const result = original.apply (this, args), candidate = args[0];
            if (candidate?.children?.length > count && candidate.children.some (child => child.name.startsWith ('Auto Pack'))) { root = candidate; }
            return result;
        };
        window.autoPackTestClock = {
            elapsed : 0,
            snapshot : () => root?.children.map (child => {
                let visible = true; for (let ancestor = child; ancestor; ancestor = ancestor.parent) { visible = visible && ancestor.visible; }
                const meshes = []; child.traverse (mesh => { const id = mesh.userData.originalMeshInstance?.GetId (); if (id) { meshes.push (id.GetKey ()); } });
                return { name : child.name, visible, meshes : meshes.sort () };
            }),
            restore : () => { prototype.SetMainObject = original; if (descriptor) { Object.defineProperty (performance, 'now', descriptor); } else { delete performance.now; } }
        };
        Object.defineProperty (performance, 'now', { configurable : true, value : () => start + window.autoPackTestClock.elapsed });
    }, before.objects.length);
    const order = ['lift', 'erect', 'bottom', 'sides', 'partitions', 'products', 'top', 'close'], seen = [];
    let sequence, generated, duringPartitions, completedGeometry;
    try {
        generated = await call ('packaging.auto.generate', { duration : 20, pads : ['bottom', 'top', 'front', 'back'], partitions : true });
        sequence = await call ('packaging.auto.sequence.inspect'); assert.deepEqual (sequence.stages.map (stage => stage.name), order); assert.equal (sequence.order.length, 6);
        for (const stage of sequence.stages) {
            const progress = (stage.start + stage.end) / 2;
            await page.evaluate (elapsed => { window.autoPackTestClock.elapsed = elapsed; }, progress * 20000);
            const sampled = await until ('packaging.auto.sequence.inspect', result => Math.abs (result.progress - progress) < 1e-8);
            assert.equal (sampled.stage, stage.name); seen.push (sampled.stage);
            if (['bottom', 'sides', 'partitions', 'products', 'top'].includes (stage.name)) { assert.ok (Math.abs (sampled.fold - .76) < 1e-9, 'lid must remain open during ' + stage.name); }
            if (stage.name === 'partitions') { duringPartitions = await page.evaluate (() => window.autoPackTestClock.snapshot ()); }
        }
        assert.deepEqual (seen, order);
        await page.evaluate (() => { window.autoPackTestClock.elapsed = 20001; });
        const playback = await until ('packaging.fefco.playback.inspect', result => ['completed', 'failed'].includes (result.state));
        assert.equal (playback.state, 'completed', playback.error);
        completedGeometry = await page.evaluate (() => window.autoPackTestClock.snapshot ());
    } finally { await page.evaluate (() => { window.autoPackTestClock.restore (); delete window.autoPackTestClock; }); }
    const packed = await call ('scene.inspect'); assert.ok (packed.objects.length > undoBefore); const carton = packed.objects.find (o => o.userData?._auto3dAutoPack);
    assert.equal (carton.userData._auto3dPackagingState, 'folded');
    assert.ok (Array.isArray (duringPartitions), 'observed the scene during partition lowering');
    assert.ok (Array.isArray (completedGeometry), 'observed the completed scene');
    assert.deepEqual (completedGeometry.map (child => child.name), packed.objects.map (object => object.name), 'the observed root is the final session scene');
    const contents = packed.objects.map ((object, index) => ({ object, index, data : JSON.parse (object.userData?._auto3dAccessory || 'null') })).filter (item => item.data);
    assert.deepEqual (contents.map (item => item.object.id).sort (), [...generated.contents.pieces].sort ());
    const partitions = contents.filter (item => item.data.kind === 'partition'), tops = contents.filter (item => item.data.position === 'top');
    assert.ok (partitions.length > 0); assert.equal (tops.length, 1);
    const sampledPiece = item => {
        const final = completedGeometry[item.index]; assert.ok (final.meshes.length > 0);
        const matches = duringPartitions.filter (child => JSON.stringify (child.meshes) === JSON.stringify (final.meshes));
        assert.equal (matches.length, 1, 'piece geometry retains a unique identity through the final scene rebuild');
        assert.equal (matches[0].name, item.object.name); return matches[0];
    };
    for (const piece of partitions) { assert.equal (sampledPiece (piece).visible, true, 'partition is rendered while lowering'); }
    assert.equal (sampledPiece (tops[0]).visible, false, 'top pad must wait until products are placed');
    // One Undo removes the carton and contents and restores the products.
    await call ('history.undo'); const restored = await call ('scene.inspect');
    assert.deepEqual (restored.objects.map (o => [o.id, o.position]), before.objects.map (o => [o.id, o.position]));

    // Accessories added to a box lower in.
    await call ('packaging.fefco.generate', { length : 400, width : 300, height : 250, closure : 'open' });
    const box = (await call ('scene.inspect')).objects.find (o => o.userData?._auto3dFefco && !o.userData?._auto3dAutoPack); await call ('object.select', { objectId : box.id });
    const pads = await call ('packaging.accessories.pads', { positions : ['bottom', 'front'] }); assert.equal (pads.dropIn.animated, true); assert.ok (pads.dropIn.seconds > 0 && pads.dropIn.seconds <= 1.8);
    assert.deepEqual (errors, []); console.log ('Auto Pack sequence (' + seen.join (' → ') + '), lid open while packing, one Undo, accessory drop-in and motion easing passed.');
} finally { await browser.close (); }
