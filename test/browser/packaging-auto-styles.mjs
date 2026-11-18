import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
// Auto Pack on a unitless model (STL): the Auto tab explains the missing units, Refresh bounds assigns them (one Undo
// step) and re-measures; every Packaging generator style is offered, and a non-RSC style folds around the product with
// the generator's carton presentation.
const root = path.resolve ('build/pages');
const types = { '.html' : 'text/html', '.js' : 'text/javascript', '.css' : 'text/css', '.json' : 'application/json', '.svg' : 'image/svg+xml', '.png' : 'image/png', '.woff' : 'font/woff', '.ttf' : 'font/ttf', '.wasm' : 'application/wasm' };
const browser = await chromium.launch ({ executablePath : process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args : ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
    const page = await browser.newPage ({ viewport : { width : 1500, height : 1000 } }); const errors = [];
    page.on ('pageerror', error => errors.push (error.message));
    await page.route ('https://auto3d.test/**', async route => {
        const name = new URL (route.request ().url ()).pathname;
        if (name.startsWith ('/api/auth/')) { return route.fulfill ({ json : { user : { id : 'auto-pack-styles', email : 'test@example.com' } } }); }
        if (name === '/api/preferences') { return route.fulfill ({ json : { preferences : { theme : 2, units : 'metric' }, folders : [] } }); }
        if (name.startsWith ('/api/accounts/')) { return route.fulfill ({ json : { isAdmin : false } }); }
        if (name === '/api/packaging/boards') { return route.fulfill ({ status : 404, json : { error : 'No saved board catalog' } }); }
        if (name.startsWith ('/api/')) { return route.fulfill ({ json : [] }); }
        try { const file = path.resolve (root, '.' + (name === '/' ? '/index.html' : name)); assert.ok (file.startsWith (root + path.sep)); return route.fulfill ({ body : await readFile (file), contentType : types[path.extname (file)] || 'application/octet-stream' }); }
        catch { return route.fulfill ({ status : 404, body : 'Missing fixture asset' }); }
    });
    await page.goto ('https://auto3d.test/'); await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { let response; for (let i = 0; i < 100; i++) { response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); if (response.ok || !/busy/.test (response.error?.message || '')) { break; } await page.waitForTimeout (100); } assert.equal (response.ok, true, id + ': ' + JSON.stringify (response)); return response.result; };
    const raw = (id, args = {}) => page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args });

    // A unitless STL: Auto Pack explains how to continue instead of only refusing.
    await page.locator ('#open_file').setInputFiles ('test/testfiles/stl/cube_meshlab_binary.stl');
    let objects = []; for (let i = 0; i < 150 && objects.length < 1; i++) { const r = await raw ('scene.inspect'); objects = r.ok ? r.result.objects : []; if (!objects.length) { await page.waitForTimeout (100); } }
    const cube = objects[0]; await call ('object.select', { objectId : cube.id });
    await call ('packaging.tab', { tab : 'auto' });
    const auto = page.getByRole ('region', { name : 'Packaging Generative', exact : true }).getByRole ('tabpanel', { name : 'Auto', exact : true }); await auto.waitFor ();
    const blocked = await call ('packaging.auto.inspect'); assert.equal (blocked.available, false); assert.equal (blocked.unitsUnknown, true); assert.match (blocked.reason, /Refresh bounds/);
    assert.equal (await auto.getByRole ('combobox', { name : 'Model units', exact : true }).isVisible (), true);
    await auto.getByRole ('combobox', { name : 'Model units', exact : true }).selectOption ('in');
    await auto.getByRole ('button', { name : 'Assign units and refresh bounds', exact : true }).click ();
    const measured = await (async () => { for (let i = 0; i < 100; i++) { const r = await call ('packaging.auto.inspect'); if (r.available) { return r; } await page.waitForTimeout (100); } throw new Error ('Refresh bounds did not make the STL measurable'); }) ();
    assert.equal (measured.unitsUnknown, false); assert.ok (measured.productMm.width > 20, 'the cube is measured in the assigned inches: ' + JSON.stringify (measured.productMm));
    assert.equal (await auto.getByRole ('combobox', { name : 'Model units', exact : true }).isVisible (), false);
    const again = await call ('packaging.auto.refresh_bounds'); assert.equal (again.available, true); assert.equal (again.unitsAssigned, null);
    assert.equal ((await raw ('packaging.auto.refresh_bounds', { units : 'mm' })).ok, false, 'a scene with units cannot be reassigned');

    // Undo restores the unitless scene; Redo assigns the units again.
    await call ('history.undo'); assert.equal ((await call ('packaging.auto.inspect')).unitsUnknown, true); await call ('history.redo'); assert.equal ((await call ('packaging.auto.inspect')).available, true);

    // Every generator style is offered; a full-overlap 0203 folds around the product.
    const styles = (await call ('packaging.auto.styles')).styles; assert.deepEqual (styles.map (s => s.code), ['0201', '0200', '0202', '0203']);
    const select = auto.getByRole ('combobox', { name : 'Box style', exact : true }); assert.equal (await select.inputValue (), '0201');
    await select.selectOption ('0203'); { const r = await call ('packaging.auto.inspect'); assert.equal (r.code, '0203'); assert.equal (r.available, true, r.reason); }
    const rsc = (await call ('packaging.auto.style', { code : '0201' }), await call ('packaging.auto.inspect')).scoreMm, fol = (await call ('packaging.auto.style', { code : '0203' }), await call ('packaging.auto.inspect')).scoreMm;
    assert.ok (fol.height > rsc.height, 'full-overlap flaps reserve a deeper flap stack: ' + rsc.height + ' → ' + fol.height);
    await call ('packaging.auto.generate', { duration : 2 });
    for (let i = 0; i < 1800; i++) { const s = await call ('packaging.fefco.playback.inspect'); if (s.state === 'completed' || s.state === 'idle' && i > 5) { break; } assert.notEqual (s.state, 'failed', s.error); await page.waitForTimeout (100); }
    const carton = (await call ('scene.inspect')).objects.find (o => o.userData?._auto3dAutoPack !== undefined);
    assert.ok (carton, 'the carton was added'); assert.equal (JSON.parse (carton.userData._auto3dFefco).code, '0203');
    await mkdir ('work/auto-pack-review', { recursive : true }); await call ('view.fit'); await page.waitForTimeout (300); await page.screenshot ({ path : 'work/auto-pack-review/styles-0203.png' });
    assert.deepEqual (errors, []);
    console.log ('Auto Pack units and styles passed: unitless STL guidance, Refresh bounds unit assignment with Undo/Redo, generator styles, 0203 fold.');
} finally { await browser.close (); }
