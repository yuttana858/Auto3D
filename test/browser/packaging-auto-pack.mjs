import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve ('build/pages');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); const errors = [];
    page.on ('pageerror', error => errors.push (error.message));
    await page.route ('https://auto3d.test/**', async route => {
        const name = new URL (route.request ().url ()).pathname;
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'auto-pack-ui', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name === '/api/packaging/boards') { return route.fulfill ({ status : 404, json : { error : 'No saved board catalog' } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { if (process.env.PRIMARY_TEST_PROGRESS) { console.log (id); } const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, JSON.stringify (response)); return response.result; };
    const waitPlayback = async states => {
        const deadline = Date.now () + 180000;
        while (Date.now () < deadline) {
            const state = await call ('packaging.fefco.playback.inspect');
            if (states.includes (state.state)) { return state; }
            assert.notEqual (state.state, 'failed', state.error || 'Auto Pack playback failed');
            if (state.state === 'idle' && await auto.getByRole ('button', { name : 'Auto Pack', exact : true }).isEnabled ()) { throw new Error (await auto.locator ('[aria-live=polite]').textContent () || 'Auto Pack stopped before playback.'); }
            await page.waitForTimeout (100);
        }
        throw new Error ('Auto Pack playback did not reach ' + states.join ('/'));
    };
    await mkdir ('work/auto-pack-review', { recursive : true });
    await call ('primary.designs.select', { id : 'rect-cleaner' }); const product = await call ('primary.generate');
    await call ('primary.callouts.set', { visible : false });
    await call ('object.transform', { objectId : product.objectId, position : [20, 45, -15], rotation : [0, 20, 0] });
    const before = await call ('scene.inspect'), original = before.objects.find (item => item.id === product.objectId);
    await call ('packaging.tab', { tab : 'packaging' });
    const panel = page.getByRole ('region', { name : 'Packaging Generative', exact : true });
    await panel.getByRole ('tab', { name : 'Auto', exact : true }).click ();
    const auto = panel.getByRole ('tabpanel', { name : 'Auto', exact : true }); await auto.waitFor ();
    assert.equal (await panel.getByRole ('tab', { name : 'Auto', exact : true }).getAttribute ('aria-selected'), 'true');
    assert.equal (await panel.getByRole ('tabpanel', { name : 'Packaging', exact : true }).isVisible (), false);
    assert.equal (await auto.getByRole ('region', { name : 'Selected object · bounding box' }).count (), 0); assert.equal (await auto.getByRole ('region', { name : 'Score size' }).count (), 0);
    const flute = auto.getByLabel ('Flute', { exact : true }); const grade = auto.getByLabel ('Board grade', { exact : true });
    await flute.selectOption ('E'); await page.waitForFunction (() => document.querySelector ('[aria-label="Board grade"]')?.value === 'nominal-e'); assert.match (await auto.textContent (), /Board thickness: 1\.5 mm/); assert.equal ((await call ('packaging.auto.inspect')).thicknessMm, 1.5);
    await flute.selectOption ('B'); await page.waitForFunction (() => document.querySelector ('[aria-label="Board grade"]')?.value === 'nominal-b'); assert.match (await auto.textContent (), /Board thickness: 3 mm/); assert.equal ((await call ('packaging.auto.inspect')).thicknessMm, 3); assert.equal (await grade.inputValue (), 'nominal-b');
    const fit = await call ('packaging.auto.inspect'); assert.equal (fit.available, true); assert.equal (fit.objectId, product.objectId); assert.equal (fit.clearanceMm, .0254);
    const glueAxis = fit.productMm.width > fit.productMm.length ? 'width' : 'length';
    for (const key of ['width', 'length', 'height']) { assert.ok (fit.productMm[key] > 0); assert.ok (Math.abs (fit.insideMm[key] - fit.productMm[key] - .0508 - (key === glueAxis ? fit.thicknessMm : 0)) < 1e-8); }
    assert.match (await auto.getByRole ('region', { name : 'Inside Dimensions' }).textContent (), /mm/);
    await call ('preferences.units', { units : 'standard' });
    assert.match (await auto.getByRole ('region', { name : 'Inside Dimensions' }).textContent (), /in/);
    await call ('preferences.units', { units : 'metric' });
    await page.setViewportSize ({ width : 390, height : 844 }); assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false); await page.setViewportSize ({ width : 1500, height : 1000 });
    // Pause and cancel remain available as agent commands while the panel uses a timeline.
    await page.evaluate (() => { window.autoPackPauseFixture = new Promise (resolve => {
        const check = async () => { const state = (await Auto3D.execute ('packaging.fefco.playback.inspect')).result; if (state?.state === 'playing') { await Auto3D.execute ('packaging.fefco.playback', { action : 'pause' }); resolve (); } else { setTimeout (check, 10); } }; check ();
    }); });
    await auto.getByRole ('button', { name : 'Auto Pack', exact : true }).click ();
    await waitPlayback (['paused']); await page.evaluate (() => window.autoPackPauseFixture); await call ('packaging.fefco.playback', { action : 'cancel' }); const cancelled = await waitPlayback (['cancelled']);
    const flatScene = await call ('scene.inspect'), carton = flatScene.objects.find (item => item.id === cancelled.objectId);
    assert.equal (flatScene.objects.length, before.objects.length + 1); assert.ok (carton); assert.equal (carton.userData._auto3dPackagingState, 'flat');
    assert.deepEqual (flatScene.objects.find (item => item.id === product.objectId), original);
    assert.equal (JSON.parse (carton.userData._auto3dAutoPack).productId, product.objectId);
    // The carton is a standard generated box: the dimension tools read the same inside size as the fit.
    const dimensions = await call ('packaging.dimensions.inspect'), other = glueAxis === 'width' ? 'length' : 'width';
    for (const [rsc, world] of [['length', glueAxis], ['width', other], ['height', 'height']]) { assert.ok (Math.abs (dimensions.inside[rsc] - fit.insideMm[world]) < 1e-6, rsc + ' ' + dimensions.inside[rsc] + ' != ' + fit.insideMm[world]); }
    assert.equal (fit.basis, 'engineering-inside'); assert.ok (fit.scoreMm.height > fit.insideMm.height);
    const savedFit = await call ('packaging.auto.inspect'); assert.equal (savedFit.available, false); assert.deepEqual (savedFit.productMm, fit.productMm); assert.deepEqual (savedFit.insideMm, fit.insideMm);
    await call ('view.fit'); await page.screenshot ({ path : 'work/auto-pack-review/flat-beneath-product.png' });
    await auto.getByRole ('button', { name : 'Fold carton', exact : true }).click ();
    await waitPlayback (['completed']); const finalScene = await call ('scene.inspect'), closed = finalScene.objects.find (item => item.id === carton.id);
    assert.equal (closed.userData._auto3dPackagingState, 'folded'); assert.equal (JSON.parse (closed.userData._auto3dFefco).closure, 'closed');
    assert.deepEqual (finalScene.objects.find (item => item.id === product.objectId), original);
    assert.equal (await auto.getByRole ('button', { name : 'Unfold carton', exact : true }).isEnabled (), true);
    const timeline = auto.getByRole ('slider', { name : 'Auto Pack fold timeline' }); await timeline.waitFor (); assert.equal (await timeline.isEnabled (), true);
    for (const position of ['0.25', '0.75']) { await timeline.fill (position); await page.waitForFunction (expected => Math.abs (Number (document.querySelector ('[aria-label="Auto Pack fold timeline"]')?.value) - expected) < 0.001, Number (position)); await (async () => { for (let i = 0; i < 100; i++) { const pose = await call ('packaging.fefco.scrub.inspect'); if (Math.abs (pose.progress - Number (position)) < .001) { return; } await page.waitForTimeout (100); } throw new Error ('Fold timeline did not reach ' + position); }) (); }
    await call ('history.undo'); await call ('history.undo');
    await page.screenshot ({ path : 'work/auto-pack-review/closed-around-product.png' });
    await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.find (item => item.id === carton.id).userData._auto3dPackagingState, 'flat');
    await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, before.objects.length);
    assert.deepEqual ((await call ('scene.inspect')).objects.find (item => item.id === product.objectId), original);
    // An array is packed as one product: selecting any member selects the group and enables Auto Pack.
    await call ('object.array', { objectId : product.objectId, width : 3, length : 1, height : 1, animate : false });
    await call ('object.select', { objectId : product.objectId }); await auto.getByRole ('button', { name : 'Refresh bounds', exact : true }).click ();
    const group = await call ('packaging.auto.inspect'); assert.equal (group.available, true, group.reason); assert.equal (group.objectIds.length, 3);
    assert.ok (group.productMm.width > fit.productMm.width * 2.5, 'combined bounds cover the array');
    assert.equal (await auto.getByRole ('button', { name : 'Auto Pack', exact : true }).isEnabled (), true); assert.match (await auto.textContent (), /3 products/);
    // Packed contents: partitions between the array members and top/bottom pads, previewed then packed.
    await auto.getByText ('Pads and Partitions', { exact : true }).click ();
    await auto.getByLabel ('Partitions between products', { exact : true }).check (); await auto.getByLabel ('Top pad', { exact : true }).check (); await auto.getByLabel ('Bottom pad', { exact : true }).check ();
    await auto.getByLabel ('Contents flute', { exact : true }).selectOption ('nominal-e');
    assert.match (await auto.locator ('details.packaging_auto_contents').textContent (), /3 × 1 × 1 products .* 2 partition strips .* 2 pads/);
    const beforeContents = (await call ('scene.inspect')).objects.length;
    // Start observing before the click returns: software rendering can consume the animation while Playwright waits.
    await page.evaluate (() => { window.autoPackContentsPause = new Promise ((resolve, reject) => { const started = Date.now (); let seen = false; const check = async () => { const s = (await Auto3D.execute ('packaging.fefco.playback.inspect')).result; if (s.state === 'playing') { seen = true; } if (s.state === 'playing' && s.progress > .3) { await Auto3D.execute ('packaging.fefco.playback', { action : 'pause' }); resolve (); } else if (Date.now () - started > 180000 || (seen && s.state === 'completed')) { reject (new Error ('Fold did not pause mid-way: ' + s.state)); } else { setTimeout (check, 5); } }; check (); }); });
    await auto.getByRole ('button', { name : 'Auto Pack', exact : true }).click ();
    await page.evaluate (() => window.autoPackContentsPause);
    await page.screenshot ({ path : 'work/auto-pack-review/array-contents-mid-fold.png' });
    await call ('packaging.fefco.playback', { action : 'resume' }); await waitPlayback (['completed']);
    const packedScene = await call ('scene.inspect'); assert.equal (packedScene.objects.length, beforeContents + 2 + 2 + 1);
    const packedCarton = packedScene.objects.find (item => item.userData?._auto3dAutoPack); assert.equal (JSON.parse (packedCarton.userData._auto3dAutoPack).productIds.length, 3 + 4);
    await call ('view.fit'); await page.screenshot ({ path : 'work/auto-pack-review/array-with-partitions-and-pads.png' });
    await call ('history.undo'); await call ('history.undo'); await call ('history.undo'); assert.equal ((await call ('scene.inspect')).objects.length, beforeContents);
    assert.deepEqual (errors, []);
    console.log ('Auto Pack tabs, array group selection, packed partitions and pads, live bounds/units, exact fit clearance, cancel to flat, replay to closed, product preservation, Undo and mobile layout passed.');
} finally { await browser.close (); }
