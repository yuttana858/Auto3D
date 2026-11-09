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
    await page.goto ('https://auto3d.test/'); await page.getByRole ('button', { name : 'Welcome to Auto3D. Continue to sign in.' }).click ({ timeout : 3000 }).catch (() => {}); // automated browsers skip the welcome screen await page.waitForFunction (() => window.Auto3D && !document.body.classList.contains ('auth_locked'));
    const call = async (id, args = {}) => { const response = await page.evaluate (({ id, args }) => Auto3D.execute (id, args), { id, args }); assert.equal (response.ok, true, JSON.stringify (response)); return response.result; };
    const group = page.getByRole ('group', { name : 'Generation modules', exact : true });
    assert.deepEqual (await group.getByRole ('button').evaluateAll (nodes => nodes.map (node => node.getAttribute ('aria-label'))), ['AI Generative', 'Packaging design', 'Primary Products']);
    assert.notEqual (await group.evaluate (node => getComputedStyle (node).borderTopStyle), 'none');
    assert.equal (requests.some (url => url.includes ('primary-products.module')), false);
    await page.locator ('#open_file').setInputFiles ('test/testfiles/gltf/BoxTextured/glTF-Binary/BoxTextured.glb');
    // Wait for asynchronous import and render completion, not a truthy Promise.
    let imported = false;
    for (let attempt = 0; attempt < 150; attempt++) {
        const result = await page.evaluate (() => Auto3D.execute ('scene.inspect'));
        if (result.ok && result.result.objects.length === 1) { imported = true; break; }
        await page.waitForTimeout (100);
    }
    assert.equal (imported, true, 'Fixture model must finish importing before the baseline is captured');
    const before = await call ('scene.inspect'), camera = await call ('camera.current.inspect');
    await group.getByRole ('button', { name : 'Primary Products', exact : true }).click ();
    const panel = page.getByRole ('region', { name : 'Primary Products', exact : true }); await panel.getByRole ('button', { name : 'Choose bottle' }).waitFor ();
    assert.equal ((await call ('primary.inspect')).generationAvailable, true); assert.equal (await panel.getByRole ('button', { name : 'Generate', exact : true }).isDisabled (), false);
    assert.equal (await panel.getByRole ('button', { name : 'Generate', exact : true }).evaluate (node => getComputedStyle (node).opacity), '1');
    const dims = await panel.locator ('.pp_dimension_row input').evaluateAll (nodes => nodes.map (n => ({ y : n.getBoundingClientRect ().y, label : n.getAttribute ('aria-label') })));
    assert.equal (dims.length, 3); assert.ok (dims.every (d => Math.abs (d.y - dims[0].y) < 1));
    const width = panel.getByRole ('spinbutton', { name : 'Product width', exact : true }); await width.fill ('70'); await width.press ('Tab');
    assert.equal (await panel.getByRole ('spinbutton', { name : 'Product depth', exact : true }).inputValue (), '70');
    await call ('primary.configure', { diameterMm : 65 });
    const height = panel.getByRole ('spinbutton', { name : 'Product height', exact : true }); await height.fill ('220'); await height.press ('Tab'); assert.equal ((await call ('primary.inspect')).heightMm, 220);
    await panel.getByRole ('slider', { name : 'Product roughness', exact : true }).focus (); await page.keyboard.press ('Delete'); assert.deepEqual (await call ('scene.inspect'), before);
    await panel.getByRole ('button', { name : 'Wrap label', exact : true }).click (); await mkdir ('work/primary-products-review', { recursive : true });
    await panel.evaluate (node => { node.scrollTop = 0; });
    await page.screenshot ({ path : 'work/primary-products-review/minimal.png' });
    await page.getByRole ('button', { name : 'Extended Primary Products panel', exact : true }).click ();
    const extended = page.getByRole ('dialog', { name : 'Primary Products extended workspace' }); await extended.waitFor ({ state : 'visible' });
    assert.deepEqual (await extended.evaluate (node => [node.clientWidth, node.clientHeight]), [1500, 1000]);
    await panel.getByRole ('button', { name : 'Choose can' }).click (); await height.fill ('150'); await height.press ('Tab');
    await page.screenshot ({ path : 'work/primary-products-review/extended.png' });
    await page.getByRole ('button', { name : 'Minimal Primary Products panel', exact : true }).click (); await extended.waitFor ({ state : 'hidden' });
    await page.getByRole ('button', { name : 'Close Primary Products panel', exact : true }).click ();
    assert.ok (await panel.evaluate (node => node.getAnimations ().some (animation => animation.playState === 'running')), 'Exit must animate before the panel is hidden');
    await page.waitForFunction (() => document.getElementById ('main_right_container').dataset.panelMode === 'closed');
    await call ('ui.primary_products'); assert.equal ((await call ('primary.inspect')).heightMm, 150); assert.equal ((await call ('primary.inspect')).family, 'can');
    await call ('preferences.units', { units : 'standard' }); assert.ok (Math.abs (Number (await height.inputValue ()) - 150 / 25.4) < .001);
    await call ('preferences.units', { units : 'metric' });
    const invalid = await page.evaluate (() => Auto3D.execute ('primary.configure', { heightMm : 0 })); assert.equal (invalid.ok, false); assert.equal ((await call ('primary.inspect')).heightMm, 150);
    // Rapid UI transitions must honor the latest action and not resurrect the modal.
    await page.getByRole ('button', { name : 'Extended Primary Products panel', exact : true }).click ();
    await page.getByRole ('button', { name : 'Close Primary Products panel', exact : true }).click ();
    await page.waitForFunction (() => document.getElementById ('main_right_container').dataset.panelMode === 'closed'); assert.equal (await extended.isVisible (), false);
    await page.emulateMedia ({ reducedMotion : 'reduce' }); await call ('ui.primary_products');
    assert.equal (await panel.evaluate (node => node.getAnimations ().length), 0);
    await page.setViewportSize ({ width : 390, height : 844 }); await call ('ui.module.mode', { module : 'primary-products', mode : 'extended' });
    assert.equal (await panel.evaluate (node => node.scrollWidth > node.clientWidth + 1), false); assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot ({ path : 'work/primary-products-review/mobile.png' });
    await call ('ui.module.mode', { module : 'primary-products', mode : 'closed' }); await call ('ui.module.mode', { module : 'data', mode : 'minimal' });
    assert.deepEqual (await call ('scene.inspect'), before); assert.deepEqual (await call ('camera.current.inspect'), camera); assert.deepEqual (errors, []);
    assert.equal (requests.filter (url => url.includes ('primary-products.module.js')).length, 1);
    // Real generation and update via the same services used by commands.
    await page.setViewportSize ({ width : 1500, height : 1000 }); await call ('ui.primary_products');
    await call ('primary.configure', { family : 'bottle', heightMm : 190, diameterMm : 65 });
    await panel.getByRole ('button', { name : 'Generate', exact : true }).click ();
    let generated;
    for (let attempt = 0; attempt < 200; attempt++) {
        const result = await page.evaluate (() => Auto3D.execute ('scene.inspect'));
        if (result.ok && result.result.objects.length === 2) { generated = result.result.objects.find (o => !before.objects.some (old => old.id === o.id)); break; }
        await page.waitForTimeout (100);
    }
    assert.ok (generated, 'UI must add the generated bottle');
    // A completed strict read also establishes the editor has left its render lock.
    await call ('primary.selected.load');
    assert.equal ((await call ('primary.inspect')).heightMm, 190);
    await call ('primary.configure', { heightMm : 250, color : '#cc5522', roughness : 0.2 });
    const changed = await call ('primary.update'); assert.equal (changed.objectId, generated.id); assert.equal (changed.updated, true);
    await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 250);
    await call ('history.undo'); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 190);
    await call ('history.redo'); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 250);
    await call ('primary.configure', { material : 'glass' }); assert.equal ((await call ('primary.inspect')).generationAvailable, false);
    assert.equal (await panel.getByRole ('button', { name : 'Generate', exact : true }).isDisabled (), true);
    const rejected = await page.evaluate (() => Auto3D.execute ('primary.generate')); assert.equal (rejected.ok, false);
    assert.equal ((await call ('scene.inspect')).objects.length, 2); assert.deepEqual (errors, []);
    await panel.getByRole ('button', { name : 'Choose pouch' }).click ();
    assert.equal (await panel.getByRole ('spinbutton', { name : 'Product diameter', exact : true }).isVisible (), false);
    const pouchWidth = panel.getByRole ('spinbutton', { name : 'Product width', exact : true }); await pouchWidth.fill ('180'); await pouchWidth.press ('Tab');
    assert.equal ((await call ('primary.inspect')).widthMm, 180);
    await panel.getByRole ('button', { name : 'Back label', exact : true }).click ();
    assert.equal (await panel.getByRole ('button', { name : 'Wrap label', exact : true }).isVisible (), false);
    await panel.getByRole ('button', { name : 'Generate', exact : true }).click ();
    let pouchReady = false;
    for (let attempt = 0; attempt < 200; attempt++) {
        const result = await page.evaluate (() => Auto3D.execute ('scene.inspect'));
        if (result.ok && result.result.objects.length === 3) { pouchReady = true; break; }
        await page.waitForTimeout (100);
    }
    assert.equal (pouchReady, true); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).family, 'pouch');
    assert.equal (await panel.getByRole ('button', { name : 'Generate', exact : true }).isDisabled (), false);
    await panel.getByRole ('combobox', { name : 'Product material', exact : true }).selectOption ('foil');
    await panel.locator ('input[type=color]').evaluate (node => { node.value = '#aa7733'; node.dispatchEvent (new Event ('input', { bubbles : true })); });
    assert.equal ((await call ('primary.inspect')).color, '#aa7733');
    const chooser = page.waitForEvent ('filechooser'); await panel.getByRole ('button', { name : 'Import label image', exact : true }).click (); await (await chooser).setFiles ('test/testfiles/obj/texture.png');
    let importedArt = false;
    for (let attempt = 0; attempt < 100; attempt++) { if ((await call ('primary.inspect')).artwork.length === 1) { importedArt = true; break; } await page.waitForTimeout (100); }
    assert.equal (importedArt, true); assert.equal (await panel.getByRole ('img', { name : 'Imported label artwork' }).isVisible (), true);
    const applied = await call ('primary.update'); assert.ok (applied.components.includes ('label-back'));
    const materials = await call ('material.list'); assert.ok (materials.some (m => m.name.startsWith ('Primary label') && m.metalness === 0 && m.maps.diffuseMap));
    assert.ok (materials.some (m => m.name === 'Primary Products · body' && m.metalness === 1 && m.roughness === 0.28));
    await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).artwork[0].name, 'texture.png');
    const beforeBad = (await call ('primary.inspect')).widthMm;
    const invalidResize = await page.evaluate (() => Auto3D.execute ('primary.configure', { widthMm : 10, depthMm : 2 })); assert.equal (invalidResize.ok, false); assert.equal ((await call ('primary.inspect')).widthMm, beforeBad);
    await call ('ui.module.mode', { module : 'primary-products', mode : 'extended' });
    await page.screenshot ({ path : 'work/primary-products-review/pouch-extended.png' });
    await page.setViewportSize ({ width : 390, height : 844 });
    assert.equal (await panel.evaluate (node => node.scrollWidth > node.clientWidth + 1), false);
    await page.screenshot ({ path : 'work/primary-products-review/pouch-mobile.png' });
    assert.deepEqual (errors, []);
    // Show the actual decorated 3D object with earlier test fixtures hidden.
    await page.setViewportSize ({ width : 1500, height : 1000 }); await call ('ui.module.mode', { module : 'primary-products', mode : 'minimal' });
    for (const o of (await call ('scene.inspect')).objects) { if (o.id !== applied.objectId) { await call ('object.visibility', { objectId : o.id, visible : false }); } }
    await call ('object.select', { objectId : applied.objectId }); await call ('object.transform', { objectId : applied.objectId, rotation : [0, 180, 0] }); await call ('view.focus', { objectId : applied.objectId });
    await page.waitForTimeout (800); await page.screenshot ({ path : 'work/primary-products-review/artwork-model.png' });
    console.log ('H × W × D, material swatch, local image import, rendered labels and physical-fit validation passed.');
    console.log ('Generate readiness and pillow-pouch generation/layout passed.');
    console.log ('Primary Products scene flow passed: UI generation, strict update/load, identity, Undo/Redo and glass rejection.');
    console.log ('Primary Products desktop/mobile passed: module order/outline, lazy loading, draft controls, minimal/extended/close motion, rapid transitions, reduced motion, unit conversion and unchanged scene/camera.');
} finally { await browser.close (); }
