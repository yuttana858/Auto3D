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
    const call = async (id, args = {}) => { const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, id + ': ' + JSON.stringify (response)); return response.result; };
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
    await until ('pulp.inspect', r => r.result?.stage === 'tray' && !r.generating);
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
    assert.deepEqual (errors, []);
    console.log ('Molded Pulp browser flow passed.');
} finally { await browser.close (); }
