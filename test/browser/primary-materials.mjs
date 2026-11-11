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
    await mkdir ('work/primary-products-review', { recursive : true });
    await call ('ui.primary_products');
    const panel = page.getByRole ('region', { name : 'Primary Products', exact : true });
    assert.equal (await panel.getByRole ('button', { name : 'Clamshells · retail', exact : true }).count (), 0);
    assert.equal (await panel.getByRole ('button', { name : 'Clamshells · food', exact : true }).count (), 0);
    await panel.getByRole ('button', { name : 'Choose clamshell', exact : true }).click ();
    const drawer = page.getByRole ('region', { name : 'Product designs', exact : true }); await drawer.waitFor ();
    assert.equal (await drawer.locator ('.pp_design_card').count (), 8);
    assert.equal (await drawer.locator ('.pp_design_preview').first ().evaluate (n => getComputedStyle (n).color), 'rgb(69, 139, 155)');
    await page.screenshot ({ path : 'work/primary-products-review/clamshell-cyan-drawer-final.png' });
    const designs = await call ('primary.designs.list', { category : 'clamshells' }); assert.ok (designs.every (d => d.category === 'clamshells')); assert.equal ((await call ('primary.designs.list', { category : 'clamshell-food' })).length, 4);
    await call ('primary.designs.select', { id : 'food-deli' }); await call ('primary.configure', { material : 'petClear' });
    await call ('primary.designs.open', { category : 'clamshells', open : false });
    const shell = await call ('primary.generate'); await call ('primary.materials.open');
    const editor = page.locator ('#material_drawer_content'), art = page.getByRole ('region', { name : 'Product label artwork', exact : true }); await art.waitFor ();
    assert.equal (await panel.getByRole ('button', { name : 'Import label image', exact : true }).count (), 0);
    assert.equal (await editor.getByRole ('spinbutton', { name : 'Index of refraction', exact : true }).inputValue (), '1.575');
    const roughness = editor.getByRole ('slider', { name : 'Roughness', exact : true }); await roughness.fill ('0.22'); await roughness.dispatchEvent ('change');
    const chooser = page.waitForEvent ('filechooser'); await art.getByRole ('button', { name : 'Import label image', exact : true }).click (); await (await chooser).setFiles ('test/testfiles/obj/texture.png');
    let imported = false; for (let i = 0; i < 100; i++) { if ((await call ('primary.inspect')).artwork.length === 1) { imported = true; break; } await page.waitForTimeout (100); } assert.equal (imported, true);
    await call ('primary.artwork.apply'); const surfaces = await call ('material.list'); assert.ok (surfaces.some (m => m.transmission === 1 && m.roughness === .22)); assert.ok (surfaces.some (m => m.name.startsWith ('Primary label') && m.transmission === 0));
    await page.screenshot ({ path : 'work/primary-products-review/advanced-label-art-final.png' });
    await page.setViewportSize ({ width : 390, height : 844 }); assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot ({ path : 'work/primary-products-review/advanced-label-mobile.png' }); await page.setViewportSize ({ width : 1500, height : 1000 });
    await page.locator ('#material_drawer_close').click ();
    await call ('primary.artwork.remove', { zone : 'front' }); await call ('primary.configure', { family : 'bottle', material : 'glass' });
    const bottle = await call ('primary.generate'); await call ('object.visibility', { objectId : shell.objectId, visible : false }); await call ('view.focus', { objectId : bottle.objectId });
    await call ('primary.callouts.set', { visible : false }); await page.waitForTimeout (500);
    await page.screenshot ({ path : 'work/primary-products-review/clear-glass-model-final.png' });
    assert.deepEqual (errors, []); console.log ('Unified cyan clamshell catalog, advanced label editor, material preservation, clear PET/glass rendering and mobile layout passed.');
} finally { await browser.close (); }
