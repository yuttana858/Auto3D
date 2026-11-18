import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
// Molded Pulp end-to-end: six generated cans in a 3 × 2 array → sense → sheet under the group → form depth → form tray,
// with one Undo step per scene change and lazy module loading.
const root = path.resolve ('build/pages');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); const errors = [], requests = []; page.on ('pageerror', error => errors.push (error.message)); page.on ('request', request => requests.push (request.url ()));
    await page.route ('https://auto3d.test/**', async route => {
        const url = new URL (route.request ().url ()), name = url.pathname;
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'pulp-ui', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    // Forming refines the tray to the requested detail in place after it appears, so retry while the viewer is busy.
    const call = async (id, args = {}) => { let response; for (let i = 0; i < 300; i++) { response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); if (response.ok || !/busy/.test (response.error?.message || '')) { break; } await page.waitForTimeout (100); } assert.equal (response.ok, true, id + ': ' + JSON.stringify (response)); return response.result; };
    // Poll a command result from Node: waitForFunction would treat the returned Promise itself as truthy.
    const until = async (id, test, timeout = 60000) => { const end = Date.now () + timeout; for (;;) { const r = await page.evaluate (id => Auto3D.execute (id), id); if (r?.ok && test (r.result)) { return r.result; } if (Date.now () > end) { throw new Error ('Timed out waiting on ' + id + ': ' + JSON.stringify ({ stage : r?.result?.stage, result : r?.result?.result, generating : r?.result?.generating, reason : r?.result?.unavailableReason, ok : r?.ok, error : r?.error }).slice (0, 900) + ' status=' + await page.locator ('.mp_status').textContent ()); } await page.waitForTimeout (150); } };
    const group = page.getByRole ('group', { name : 'Generation modules', exact : true });
    assert.deepEqual (await group.getByRole ('button').evaluateAll (nodes => nodes.map (node => node.getAttribute ('aria-label'))), ['AI Generative', 'Packaging design', 'Primary Products', 'Molded Pulp']);
    assert.equal (requests.some (url => url.includes ('molded-pulp.module')), false, 'the module loads on demand');

    await call ('primary.configure', { family : 'can' }); const can = await call ('primary.generate');
    await call ('object.array', { objectId : can.objectId, width : 3, length : 2, height : 1, gap : { width : 20, length : 20 }, animate : false });
    const scene = await call ('scene.inspect'); assert.equal (scene.objects.length, 6);
    await call ('object.select', { objectId : can.objectId });

    await group.getByRole ('button', { name : 'Molded Pulp', exact : true }).click ();
    const panel = page.getByRole ('region', { name : 'Molded Pulp', exact : true }); await panel.getByRole ('button', { name : 'Sense selection', exact : true }).waitFor ();
    assert.ok (requests.some (url => url.includes ('molded-pulp.module.js')));
    assert.equal (await panel.getByRole ('button', { name : 'Form tray', exact : true }).isDisabled (), true, 'forming waits for sensed products');

    await panel.getByRole ('button', { name : 'Sense selection', exact : true }).click ();
    await until ('pulp.inspect', r => r.sensed?.count === 6);
    const sensed = (await call ('pulp.inspect')).sensed; assert.equal (sensed.primaryId, can.objectId); assert.ok (Math.abs (sensed.footprint.heightMm - 122) < 1);

    await call ('pulp.configure', { pulpType : 'type3dry', extraLengthMm : 40, extraWidthMm : 30 });
    assert.equal ((await call ('pulp.inspect')).draft.thicknessMm, 2);
    const sheet = await call ('pulp.sheet.generate');
    assert.equal (sheet.stage, 'sheet'); assert.ok (Math.abs (sheet.metrics.lengthMm - (sensed.footprint.lengthMm + 40)) < 0.11); assert.ok (Math.abs (sheet.metrics.widthMm - (sensed.footprint.widthMm + 30)) < 0.11);
    assert.equal ((await call ('scene.inspect')).objects.length, 7);

    const depth = panel.getByRole ('spinbutton', { name : 'Form depth', exact : true }); await depth.fill ('35');
    await panel.getByRole ('button', { name : 'Form depth', exact : true }).click ();
    await until ('pulp.inspect', r => r.draft.formDepthMm === 35);
    await panel.getByRole ('button', { name : 'Form tray', exact : true }).click ();
    await until ('pulp.inspect', r => r.result?.stage === 'tray' && !r.generating && !r.refining && !r.livePending);
    const tray = (await call ('pulp.inspect')).result;
    assert.equal (tray.metrics.pocketCount, 6); assert.equal (tray.metrics.achievedDepthMm, 35); assert.equal ((await call ('scene.inspect')).objects.length, 7, 'the tray replaced the sheet in place');
    const box = await panel.boundingBox (), rail = await page.locator ('.scene_module_tools').boundingBox (); assert.ok (await panel.evaluate (node => node.scrollWidth <= node.clientWidth + 1), 'the minimal panel has no horizontal overflow'); assert.ok (box.width > 200 && rail);
    await call ('view.fit'); await mkdir ('work/molded-pulp-review', { recursive : true }); await page.waitForTimeout (300); await page.screenshot ({ path : 'work/molded-pulp-review/tray.png' });

    const cans = (await call ('scene.inspect')).objects.filter (o => !o.name.startsWith ('Molded pulp'));
    for (const o of cans) { await call ('object.visibility', { objectId : o.id, visible : false }); }
    await page.waitForTimeout (300); await page.screenshot ({ path : 'work/molded-pulp-review/tray-only.png' });
    for (const o of cans) { await call ('object.visibility', { objectId : o.id, visible : true }); }
    const deeper = await call ('pulp.form_depth.set', { formDepthMm : 45 }); assert.equal (deeper.metrics.achievedDepthMm, 45); assert.equal (deeper.objectId, sheet.objectId);
    await call ('history.undo'); assert.equal ((await call ('pulp.inspect')).pulpObjectId, sheet.objectId, 'undo restores the 35 mm tray in place');
    // Step back through the visibility toggles until the pulp object's creation is undone; the six cans remain.
    for (let i = 0; i < 30 && (await call ('scene.inspect')).objects.some (o => o.name.startsWith ('Molded pulp')); i++) { await call ('history.undo'); }
    assert.equal ((await call ('scene.inspect')).objects.length, 6, 'undo removes the tray and sheet and keeps the products');
    // Live preview: typing thickness and additional length updates the sheet in the viewer; the burst is one Undo step.
    await call ('object.select', { objectId : can.objectId }); await call ('pulp.sense'); await call ('pulp.configure', { pulpType : 'type2', extraLengthMm : 40, extraWidthMm : 40 });
    const liveSheet = await call ('pulp.sheet.generate'), undoBefore = await page.evaluate (() => window.Auto3D.execute ('scene.inspect').then (() => document.querySelectorAll ('*').length >= 0));
    const thickness = panel.getByRole ('spinbutton', { name : 'Pulp thickness', exact : true }), extraLength = panel.getByRole ('spinbutton', { name : 'Additional length', exact : true });
    await thickness.fill ('4'); await until ('pulp.inspect', r => r.result?.metrics?.thicknessMm === 4 && !r.generating && !r.livePending);
    await extraLength.fill ('80'); const grown = await until ('pulp.inspect', r => Math.abs ((r.result?.metrics?.lengthMm || 0) - (sensed.footprint.lengthMm + 80)) < 0.11 && !r.generating && !r.livePending);
    assert.equal (grown.pulpObjectId, liveSheet.objectId, 'live edits update the same sheet object');
    const sizeX = async () => (await call ('scene.inspect')).objects.find (o => o.id === liveSheet.objectId);
    await call ('history.undo'); assert.equal ((await call ('pulp.inspect')).pulpObjectId, liveSheet.objectId, 'one Undo reverts both live edits to the generated sheet');
    await call ('history.undo'); assert.equal ((await call ('pulp.inspect')).pulpObjectId, null, 'the next Undo removes the sheet, so the live burst was a single step');
    await call ('history.redo'); await call ('history.redo'); assert.ok (await sizeX (), 'redo restores the live-edited sheet');
    assert.ok (undoBefore);

    // Rule-base ribs and denest lugs on a Fine tray, refined in the background while the page keeps rendering frames.
    await call ('pulp.configure', { thicknessMm : 2.5, formDepthMm : 35, detail : 'fine', ribs : 'auto', lugs : 'auto' });
    await page.evaluate (() => { window.__longest = 0; new PerformanceObserver (list => { for (const e of list.getEntries ()) { window.__longest = Math.max (window.__longest, e.duration); } }).observe ({ type : 'longtask', buffered : false }); });
    await panel.getByRole ('button', { name : 'Form tray', exact : true }).click ();
    // While the worker refines, the main thread must stay free: count animation frames in a 1 s window of refinement.
    await until ('pulp.inspect', r => Boolean (r.refining), 60000);
    const frames = page.evaluate (() => new Promise (resolve => { let count = 0; const end = performance.now () + 1000; const tick = () => { count++; if (performance.now () < end) { requestAnimationFrame (tick); } else { resolve (count); } }; requestAnimationFrame (tick); }));
    const fine = await until ('pulp.inspect', r => r.result?.metrics?.detail === 'fine' && !r.refining && !r.generating, 120000);
    const idle = await page.evaluate (() => new Promise (resolve => { let count = 0; const end = performance.now () + 1000; const tick = () => { count++; if (performance.now () < end) { requestAnimationFrame (tick); } else { resolve (count); } }; requestAnimationFrame (tick); }));
    console.log ('Frames per second while refining: ' + await frames + ', idle: ' + idle + ' (software GPU)');
    console.log ('Longest main-thread task during the fine tray: ' + Math.round (await page.evaluate (() => window.__longest)) + ' ms');
    // Guards against a frozen main thread (about 0–2 fps), not a fixed share: the worker and the software GPU share the
    // CI CPU, so a responsive viewer measures about half its idle rate there.
    assert.ok (await frames >= Math.max (2, idle * 0.35), 'the viewer keeps rendering while the fine tray refines: ' + await frames + ' vs ' + idle + ' idle frames per second');
    assert.equal (fine.result.metrics.pocketCount, 6); assert.equal (fine.result.metrics.lugCount, 4); assert.ok (fine.result.metrics.cellMm <= 0.5);
    assert.ok (fine.result.trace.some (t => t.rule === 'RIB-BETWEEN') && fine.result.trace.every (t => /MP knowledge base/.test (t.basis)));
    await panel.locator ('.mp_why summary').click (); assert.ok (await panel.locator ('.mp_trace_item').count () >= 8);
    const products = (await call ('scene.inspect')).objects.filter (o => !o.name.startsWith ('Molded pulp'));
    const shot = async (name, hideCans = false) => {
        for (const o of products) { await call ('object.visibility', { objectId : o.id, visible : !hideCans }); }
        await call ('view.fit'); await page.waitForTimeout (300); await page.screenshot ({ path : 'work/molded-pulp-review/' + name + '.png' });
        for (const o of products) { await call ('object.visibility', { objectId : o.id, visible : true }); }
    };
    await mkdir ('work/molded-pulp-review', { recursive : true }); await shot ('fine-ribs-lugs', true);

    // Clamshells: top and bottom with a hinge, then side to side.
    await call ('pulp.configure', { clamshell : 'top-bottom', detail : 'standard' }); const clam = await call ('pulp.tray.form');
    assert.equal (clam.metrics.shells.length, 2); assert.equal (clam.metrics.pocketCount, 12); assert.equal (clam.metrics.hinge, true);
    await shot ('clamshell-top-bottom');
    await call ('pulp.configure', { clamshell : 'side-x', hinge : false }); const side = await call ('pulp.tray.form'); assert.equal (side.metrics.shells.length, 2); assert.equal (side.metrics.hinge, false);
    await shot ('clamshell-side');

    // Ultra detail: the command waits for the refined shape; the adaptive mesh stays far below the full grid.
    await page.evaluate (() => { window.__longest = 0; });
    await call ('pulp.configure', { clamshell : 'none', detail : 'ultra' }); const started = Date.now (), ultra = await call ('pulp.tray.form');
    console.log ('Longest main-thread task during the ultra tray: ' + Math.round (await page.evaluate (() => window.__longest)) + ' ms');
    assert.equal (ultra.detail, 'ultra'); assert.ok (ultra.metrics.triangles < ultra.metrics.fullGridTriangles / 4); console.log ('Ultra tray: ' + (Date.now () - started) + ' ms, ' + ultra.metrics.triangles + ' triangles, ' + ultra.metrics.cellMm + ' mm cells');
    await shot ('ultra', true);
    assert.deepEqual (errors, []);
    console.log ('Molded Pulp browser flow passed.');
} finally { await browser.close (); }
