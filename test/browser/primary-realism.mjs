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
    const poll = async (predicate) => { for (let i = 0; i < 100; i++) { if (await predicate ()) { return; } await page.waitForTimeout (100); } throw new Error ('Timed out waiting for product state.'); };
    await mkdir ('work/primary-realism-review', { recursive : true });
    await call ('ui.primary_products'); await call ('view.background', { preset : 'light' }); await call ('lighting.restore', { mode : 'hdri', environment : 'studio_small_09', brightness : 1, background : false }); await call ('primary.designs.select', { id : 'boston-inspired' });
    await call ('primary.configure', { material : 'frostedGlass' }); const bottle = await call ('primary.generate'); await call ('primary.callouts.set', { visible : false });
    assert.equal ((await call ('primary.inspect')).details.shoulder, 'rounded');
    await call ('primary.materials.open');
    const art = page.getByRole ('region', { name : 'Product label artwork', exact : true }); await art.waitFor ();
    const chooser = page.waitForEvent ('filechooser'); await art.getByRole ('button', { name : 'Import label image', exact : true }).click (); await (await chooser).setFiles ('test/testfiles/obj/texture.png');
    await poll (async () => (await call ('primary.inspect')).artwork.length === 1);
    await call ('primary.artwork.mapping', { zone : 'front', widthMm : 30, heightMm : 35, offsetXmm : 2, offsetYmm : 2, finish : 'glossFilm' }); await call ('primary.artwork.apply');
    let materials = await call ('material.list'); assert.ok (materials.some (m => m.transmission === .94 && m.maps.bumpMap)); assert.ok (materials.some (m => m.name.startsWith ('Primary label') && m.clearcoat === 1));
    await page.locator ('#material_drawer_close').click ();
    const scale = await call ('primary.scale', { factor : 1.15, scaleArtwork : true }); assert.equal (scale.objectId, bottle.objectId);
    const resized = await call ('primary.inspect'); assert.equal (resized.artwork[0].widthMm, 34.5); assert.equal (resized.artwork[0].offsetXmm, 2.3); assert.equal (resized.heightMm, 172.5);
    await call ('history.undo'); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 150); await call ('history.redo'); await call ('primary.selected.load');
    await call ('view.focus', { objectId : bottle.objectId }); await page.waitForTimeout (300); await page.screenshot ({ path : 'work/primary-realism-review/frosted-bottle-label.png' });
    await call ('primary.materials.open'); await art.getByRole ('combobox', { name : 'Label finish', exact : true }).selectOption ('foil'); await art.getByRole ('button', { name : 'Apply label artwork', exact : true }).click ();
    await poll (async () => (await call ('material.list')).some (m => m.name.startsWith ('Primary label') && m.metalness === 1));
    await page.setViewportSize ({ width : 390, height : 844 }); assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot ({ path : 'work/primary-realism-review/materials-mobile.png' }); await page.setViewportSize ({ width : 1500, height : 1000 });
    await page.locator ('#material_drawer_close').click (); await call ('primary.artwork.remove', { zone : 'front' });
    let previous = bottle.objectId;
    for (const [id, material] of [['standard-beverage', 'aluminum'], ['flat-bottom-coffee', 'kraftFilm'], ['food-deli', 'petClear'], ['rect-cleaner', 'naturalHDPE']]) {
        await call ('object.visibility', { objectId : previous, visible : false }); await call ('primary.designs.select', { id }); await call ('primary.configure', { material });
        const result = await call ('primary.generate'); previous = result.objectId; await call ('primary.callouts.set', { visible : false }); await call ('view.focus', { objectId : result.objectId });
        if (id === 'standard-beverage') { assert.ok (result.components.includes ('pull-tab')); }
        if (id === 'food-deli') { assert.ok (result.components.includes ('hinge')); }
        materials = await call ('material.list'); assert.ok (materials.some (m => m.maps.roughnessMap && m.maps.bumpMap));
        await page.waitForTimeout (400); await page.screenshot ({ path : 'work/primary-realism-review/' + id + '.png' });
    }
    await call ('primary.details.set', { closure : 'fliptop', textureStrength : .8 }); await call ('primary.update');
    const panel = page.getByRole ('region', { name : 'Primary Products', exact : true }); assert.equal (await panel.getByRole ('combobox', { name : 'Closure style', exact : true }).inputValue (), 'fliptop');
    const invalid = await page.evaluate (() => Auto3D.execute ('primary.details.set', { wallMm : 999 })); assert.equal (invalid.ok, false);
    assert.deepEqual (errors, []); console.log ('Realistic products, frosted/translucent textures, label finishes/offsets, scaling, Undo and mobile controls passed.');
} finally { await browser.close (); }
