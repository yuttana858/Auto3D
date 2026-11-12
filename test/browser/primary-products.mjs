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
    assert.equal (await panel.getByRole ('spinbutton', { name : 'Product length', exact : true }).inputValue (), '70'); /* round products share one diameter for W and L */
    await call ('primary.configure', { diameterMm : 65 });
    const height = panel.getByRole ('spinbutton', { name : 'Product height', exact : true }); await height.fill ('220'); await height.press ('Tab'); assert.equal ((await call ('primary.inspect')).heightMm, 220);
    await panel.getByRole ('slider', { name : 'Product roughness', exact : true }).focus (); await page.keyboard.press ('Delete'); assert.deepEqual (await call ('scene.inspect'), before);
    await call ('primary.configure', { labelZone : 'wrap' }); await mkdir ('work/primary-products-review', { recursive : true });
    await panel.evaluate (node => { node.scrollTop = 0; });
    await page.screenshot ({ path : 'work/primary-products-review/minimal.png' });
    await page.getByRole ('button', { name : 'Extended Primary Products panel', exact : true }).click ();
    const extended = page.getByRole ('dialog', { name : 'Primary Products extended workspace' }); await extended.waitFor ({ state : 'visible' });
    assert.deepEqual (await extended.evaluate (node => [node.clientWidth, node.clientHeight]), [1500, 1000]);
    await panel.getByRole ('button', { name : 'Choose can' }).click (); await call ('primary.designs.open', { category : 'cans', open : false }); await height.fill ('150'); await height.press ('Tab');
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
    for (const [name,value] of [['Neck diameter','24'],['Shoulder height','30'],['Neck height','20'],['Cap height','20']]) { const input=panel.getByRole('spinbutton',{name,exact:true}); await input.fill(value); await input.press('Tab'); }
    const authoredShape=(await call('primary.inspect')).bottleShape; assert.deepEqual(authoredShape,{neckDiameterMm:24,shoulderHeightMm:30,neckHeightMm:20,capHeightMm:20});
    await call('preferences.units',{units:'standard'}); assert.ok(Math.abs(Number(await panel.getByRole('spinbutton',{name:'Neck diameter',exact:true}).inputValue())-24/25.4)<.000001); await call('preferences.units',{units:'metric'});
    await page.screenshot({path:'work/primary-products-review/bottle-shape.png'});
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
    assert.equal ((await call ('primary.inspect')).heightMm, 190); assert.deepEqual((await call('primary.inspect')).bottleShape,authoredShape);
    await call ('primary.configure', { heightMm : 250, color : '#cc5522', roughness : 0.2 });
    const changed = await call ('primary.update'); assert.equal (changed.objectId, generated.id); assert.equal (changed.updated, true);
    await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 250);
    await call ('history.undo'); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 190);
    await call ('history.redo'); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 250);
    await call ('primary.configure', { material : 'glass' }); assert.equal ((await call ('primary.inspect')).generationAvailable, true);
    await call ('primary.update'); assert.ok ((await call ('material.list')).some (m => m.transmission === 1 && m.ior === 1.5));
    await call ('primary.materials.open');
    const opticalEditor = page.locator ('#material_drawer_content');
    assert.equal (await opticalEditor.getByRole ('spinbutton', { name : 'Index of refraction', exact : true }).inputValue (), '1.5');
    await page.screenshot ({ path : 'work/primary-products-review/clear-glass-materials.png' });
    await page.locator ('#material_drawer_close').click ();
    assert.equal ((await call ('scene.inspect')).objects.length, 2); assert.deepEqual (errors, []);
    await panel.getByRole ('button', { name : 'Choose pouch' }).click (); await call ('primary.designs.open', { category : 'pouches', open : false });
    assert.equal (await panel.getByRole ('spinbutton', { name : 'Product diameter', exact : true }).isVisible (), false);
    const pouchWidth = panel.getByRole ('spinbutton', { name : 'Product width', exact : true }); await pouchWidth.fill ('180'); await pouchWidth.press ('Tab');
    assert.equal ((await call ('primary.inspect')).widthMm, 180);
    await call ('primary.configure', { labelZone : 'back' });
    assert.equal (await panel.getByRole ('button', { name : 'Import label image', exact : true }).count (), 0);
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
    await call ('primary.update'); await call ('primary.materials.open');
    const artworkEditor = page.getByRole ('region', { name : 'Product label artwork' }); await artworkEditor.waitFor ();
    const roughnessEditor = page.locator ('#material_drawer_content').getByRole ('slider', { name : 'Roughness', exact : true });
    await roughnessEditor.fill ('0.37'); await roughnessEditor.dispatchEvent ('change');
    const chooser = page.waitForEvent ('filechooser'); await artworkEditor.getByRole ('button', { name : 'Import label image', exact : true }).click (); await (await chooser).setFiles ('test/testfiles/obj/texture.png');
    let importedArt = false;
    for (let attempt = 0; attempt < 100; attempt++) { if ((await call ('primary.inspect')).artwork.length === 1) { importedArt = true; break; } await page.waitForTimeout (100); }
    assert.equal (importedArt, true); assert.equal (await artworkEditor.getByRole ('img', { name : 'Imported label artwork' }).isVisible (), true);
    await page.screenshot ({ path : 'work/primary-products-review/advanced-label-art.png' });
    const applied = await call ('primary.artwork.apply');
    await page.locator ('#material_drawer_close').click (); assert.ok (applied.components.includes ('label-back'));
    const materials = await call ('material.list'); assert.ok (materials.some (m => m.name.startsWith ('Primary label') && m.metalness === 0 && m.maps.diffuseMap));
    assert.ok (materials.some (m => m.name === 'Primary Products · body' && m.metalness === 1 && m.roughness === 0.37));
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
    await call ('primary.artwork.remove', { zone : 'back' });
    await panel.getByRole ('button', { name : 'Choose clamshell', exact : true }).click ();
    const drawer = page.getByRole ('region', { name : 'Product designs', exact : true }); await drawer.waitFor ({ state : 'visible' });
    const objectCountReaches = async count => { for (const end = Date.now () + 120000; Date.now () < end; await page.waitForTimeout (100)) { const r = await page.evaluate (() => Auto3D.execute ('scene.inspect')); if (r.ok && r.result.objects.length === count) { return; } } throw new Error ('Scene never reached ' + count + ' objects: ' + await drawer.locator ('.pp_status').textContent ()); };
    assert.equal (await drawer.locator ('.pp_design_card').count (), 8);
    assert.equal (await drawer.locator ('.pp_design_preview').first ().evaluate (node => getComputedStyle (node).color), 'rgb(69, 139, 155)');
    await page.screenshot ({ path : 'work/primary-products-review/clamshell-cyan-drawer.png' }); const beforeCard = (await call ('scene.inspect')).objects.length; await drawer.getByRole ('button', { name : 'Generate Deli shell' }).click ();
    await objectCountReaches (beforeCard + 1); /* design cards generate their product */
    assert.equal ((await call ('primary.inspect')).family, 'clamshell'); await drawer.getByRole ('button', { name : 'Close designs' }).click (); await drawer.waitFor ({ state : 'hidden' });
    const shell = await call ('primary.generate'); assert.deepEqual (shell.components, ['base', 'lid']);
    await call ('primary.materials.open'); await artworkEditor.waitFor ();
    const shellChooser = page.waitForEvent ('filechooser'); await artworkEditor.getByRole ('button', { name : 'Import label image', exact : true }).click (); await (await shellChooser).setFiles ('test/testfiles/obj/texture.png');
    let shellArtReady = false;
    for (let attempt = 0; attempt < 100; attempt++) { const draft = await call ('primary.inspect'); if (draft.artwork.length === 1 && draft.artwork[0].zone === 'front') { shellArtReady = true; break; } await page.waitForTimeout (100); }
    assert.equal (shellArtReady, true, 'Clamshell image import must finish before Apply');
    const shellArt = await call ('primary.artwork.apply');
    await page.locator ('#material_drawer_close').click (); assert.ok (shellArt.components.includes ('label-front'));
    const noFit = await page.evaluate (() => Auto3D.execute ('primary.configure', { widthMm : 10, depthMm : 10 })); assert.equal (noFit.ok, false);
    await call ('primary.designs.open', { category : 'beverages', open : true }); await page.setViewportSize ({ width : 390, height : 844 });
    assert.equal (await page.evaluate (() => document.documentElement.scrollWidth > innerWidth), false); await page.screenshot ({ path : 'work/primary-products-review/design-drawer-mobile.png' });
    await page.keyboard.press ('Escape'); await drawer.waitFor ({ state : 'hidden' }); assert.deepEqual (errors, []);
    console.log ('Catalog drawer, food clamshell generation, top artwork and rejected invalid resize passed.');
    /* Design drawer: equal cards, at most ten per row, 30% shorter, W/L/H callouts, card click generates, Enter resizes live. */
    await call ('primary.artwork.remove', { zone : 'front' }); /* a clamshell top label cannot fit a can, so cards would correctly refuse to switch */
    await page.setViewportSize ({ width : 2400, height : 1000 }); await call ('primary.designs.open', { category : 'beverages', open : true }); await drawer.waitFor ({ state : 'visible' });
    const grid = drawer.locator ('.pp_design_grid'); assert.equal (await grid.evaluate (node => getComputedStyle (node).gridTemplateColumns.split (' ').length), 10);
    const cardBoxes = await drawer.locator ('.pp_design_card').evaluateAll (nodes => nodes.map (node => { const r = node.getBoundingClientRect (); return [Math.round (r.width), Math.round (r.height)]; }));
    assert.equal (cardBoxes.length, 7); assert.ok (cardBoxes.every (box => box[0] === cardBoxes[0][0] && box[1] === cardBoxes[0][1]), JSON.stringify (cardBoxes));
    assert.ok ((await drawer.boundingBox ()).height <= 1000 * .315 + 1, 'drawer is at most 31.5% of the viewport');
    assert.equal (await drawer.locator ('.pp_design_card .pp_callout').count (), 0); /* thumbnails carry no dimension brackets; the caption keeps W × L × H */
    const headerBox = await drawer.locator ('.pp_drawer_header').boundingBox (), sizeBox = await drawer.locator ('.pp_drawer_size').boundingBox (), titleBox = await drawer.locator ('.pp_drawer_header h3').boundingBox ();
    assert.ok (sizeBox.x - headerBox.x < 2, 'W/L/H inputs start at the left of the drawer'); assert.ok (titleBox.x > sizeBox.x + sizeBox.width, 'category name follows the inputs'); assert.ok (headerBox.height <= 40, 'compact one-line header: ' + headerBox.height);
    assert.match (await drawer.locator ('.pp_design_card .pp_design_size').first ().textContent (), /^66 × 66 × 122 mm$/);
    const beforeCan = (await call ('scene.inspect')).objects.length; await drawer.getByRole ('button', { name : 'Generate Standard beverage can' }).click ();
    await objectCountReaches (beforeCan + 1);
    const can = (await call ('scene.inspect')).objects.at (-1); assert.equal ((await call ('primary.selected.load')).family, 'can'); assert.equal ((await call ('primary.inspect')).heightMm, 122);
    /* The generated can carries W × L × H callout brackets on the 3D model. */
    const calloutsFor = async id => { for (const end = Date.now () + 120000; ; await page.waitForTimeout (100)) { const r = await page.evaluate (() => Auto3D.execute ('dimensions.inspect')); if (r.ok) { return r.result.dimensions.filter (d => d.objectId === id); } assert.ok (/busy/.test (r.error?.message) && Date.now () < end, JSON.stringify (r)); } }; /* the viewer reports busy while a product rebuilds */
    /* A newly generated product is framed to fit the window: the camera centers on its envelope (0, H/2, 0) once the fit animation settles. */
    const halfHeight = (await calloutsFor (can.id)).find (d => d.axis === 'height').length / 2; /* in model units, which may be meters */
    for (const end = Date.now () + 120000; ; await page.waitForTimeout (100)) { const r = await page.evaluate (() => Auto3D.execute ('camera.current.inspect')); if (r.ok && Math.hypot (r.result.center[0] - can.position[0], r.result.center[1] - (can.position[1] + halfHeight), r.result.center[2] - can.position[2]) < halfHeight * .01) { break; } assert.ok (Date.now () < end, 'camera did not frame the new product: ' + JSON.stringify (r.result?.center)); }
    assert.equal ((await calloutsFor (can.id)).length, 3); await page.waitForFunction (() => ['W · 66 mm', 'L · 66 mm', 'H · 122 mm'].every (label => [...document.querySelectorAll ('[data-dimension-id] text')].some (node => node.textContent === label)), null, { timeout : 120000 });
    const designHeight = drawer.getByRole ('spinbutton', { name : 'Design height', exact : true }); assert.equal (await designHeight.inputValue (), '122');
    await designHeight.fill ('150'); await designHeight.press ('Enter');
    await page.waitForFunction (() => document.querySelector ('.pp_design_drawer .pp_status')?.textContent.startsWith ('Resized selected product to 66 × 66 × 150 mm'), null, { timeout : 120000 });
    assert.equal ((await call ('scene.inspect')).objects.at (-1).id, can.id); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 150);
    await page.waitForFunction (() => [...document.querySelectorAll ('[data-dimension-id] text')].some (node => node.textContent === 'H · 150 mm'), null, { timeout : 120000 }); /* callouts follow the live resize */
    await call ('history.undo'); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 122); await call ('history.redo');
    const heightCallout = (await calloutsFor (can.id)).find (d => d.axis === 'height'); await call ('dimensions.value', { id : heightCallout.id, valueMm : 160 }); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 160);
    await call ('history.undo'); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 150);
    const toggle = panel.getByRole ('checkbox', { name : 'Show W × L × H on model', exact : true }); assert.equal (await toggle.isChecked (), true); await toggle.uncheck ();
    for (const end = Date.now () + 120000; (await calloutsFor (can.id)).length; await page.waitForTimeout (100)) { assert.ok (Date.now () < end, 'callouts were not removed'); } /* other products keep theirs */
    assert.ok ((await call ('dimensions.inspect')).dimensions.some (d => d.objectId !== can.id));
    const restored = await call ('primary.callouts.set', { visible : true }); assert.equal (restored.changed, true); assert.equal ((await calloutsFor (can.id)).length, 3);
    const productWidth = panel.getByRole ('spinbutton', { name : 'Product width', exact : true }); await productWidth.fill ('60'); await productWidth.press ('Tab');
    assert.equal ((await call ('primary.inspect')).diameterMm, 60); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).diameterMm, 66); /* Tab changes only the draft */
    const resized = await call ('primary.dimensions.set', { widthMm : 58, heightMm : 140 }); assert.equal (resized.updated, true); assert.equal (resized.objectId, can.id); assert.deepEqual ([resized.widthMm, resized.lengthMm, resized.heightMm], [58, 58, 140]);
    const draftOnly = await call ('primary.dimensions.set', { heightMm : 160, apply : false }); assert.equal (draftOnly.updated, false); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 140);
    const mismatch = await page.evaluate (() => Auto3D.execute ('primary.dimensions.set', { widthMm : 58, lengthMm : 70 })); assert.equal (mismatch.ok, false); assert.match (mismatch.error.message, /one diameter/);
    const generatedDesign = await call ('primary.designs.generate', { id : 'mini-beverage' }); assert.equal (generatedDesign.design, 'mini-beverage'); await call ('primary.selected.load'); assert.equal ((await call ('primary.inspect')).heightMm, 92);
    /* Non-round bottles: choose a rounded-rectangle section, generate, then Enter on Length resizes the depth live. */
    await call ('primary.designs.open', { category : 'beverages', open : false }); await drawer.waitFor ({ state : 'hidden' }); await page.setViewportSize ({ width : 1500, height : 1000 });
    await call ('primary.configure', { family : 'bottle', heightMm : 220, diameterMm : 80 }); await panel.getByRole ('combobox', { name : 'Bottle cross-section', exact : true }).selectOption ('rectangle');
    let rect = await call ('primary.inspect'); assert.equal (rect.bottleSection.shape, 'rectangle'); assert.equal (rect.bottleSection.depthMm, 48); assert.equal (await panel.getByRole ('spinbutton', { name : 'Product length', exact : true }).inputValue (), '48');
    const corner = panel.getByRole ('spinbutton', { name : 'Corner radius', exact : true }); await corner.fill ('6'); await corner.press ('Tab'); assert.equal ((await call ('primary.inspect')).bottleSection.cornerRadiusMm, 6);
    const rectangular = await call ('primary.generate'); assert.equal ((await calloutsFor (rectangular.objectId)).find (d => d.axis === 'length').lengthMm, 48);
    const productLength = panel.getByRole ('spinbutton', { name : 'Product length', exact : true }); await productLength.fill ('55'); await productLength.press ('Enter');
    for (const end = Date.now () + 120000; (await calloutsFor (rectangular.objectId)).find (d => d.axis === 'length').lengthMm !== 55; await page.waitForTimeout (100)) { assert.ok (Date.now () < end, 'depth did not update live'); }
    await call ('primary.selected.load'); assert.deepEqual ((await call ('primary.inspect')).bottleSection, { shape : 'rectangle', depthMm : 55, cornerRadiusMm : 6 }); assert.equal ((await call ('primary.inspect')).diameterMm, 80);
    const ovalDesign = await call ('primary.designs.generate', { id : 'oval-shampoo' }); assert.equal ((await calloutsFor (ovalDesign.objectId)).find (d => d.axis === 'length').lengthMm, 42);
    /* Stand-up pouches: a catalog card in Pouches generates a gusseted pouch; the style select and gusset field drive the draft. */
    const standup = await call ('primary.designs.generate', { id : 'standup-snack' }); assert.equal ((await calloutsFor (standup.objectId)).find (d => d.axis === 'length').lengthMm, 80);
    assert.ok ((await call ('scene.inspect')).objects.some (o => o.id === standup.objectId && o.name === 'Stand-up pouch'));
    await call ('primary.selected.load'); assert.deepEqual ((await call ('primary.inspect')).pouchShape, { style : 'standup', gussetMm : 40 });
    assert.equal (await panel.getByRole ('combobox', { name : 'Pouch construction', exact : true }).inputValue (), 'standup');
    const gusset = panel.getByRole ('spinbutton', { name : 'Gusset height', exact : true }); assert.equal (await gusset.inputValue (), '40'); await gusset.fill ('30'); await gusset.press ('Tab');
    assert.equal ((await call ('primary.inspect')).pouchShape.gussetMm, 30);
    const pouchLength = panel.getByRole ('spinbutton', { name : 'Product length', exact : true }); await pouchLength.fill ('24'); await pouchLength.press ('Enter');
    for (const end = Date.now () + 120000; (await calloutsFor (standup.objectId)).find (d => d.axis === 'length').lengthMm !== 24; await page.waitForTimeout (100)) { assert.ok (Date.now () < end, 'pouch depth did not update live'); }
    await call ('primary.selected.load'); assert.deepEqual ((await call ('primary.inspect')).pouchShape, { style : 'standup', gussetMm : 24 }); /* the gusset is clamped to the new depth */
    const badGusset = await page.evaluate (() => Auto3D.execute ('primary.configure', { pouchShape : { style : 'standup', gussetMm : 500 } })); assert.equal (badGusset.ok, false);
    await panel.getByRole ('combobox', { name : 'Pouch construction', exact : true }).selectOption ('pillow'); assert.equal ((await call ('primary.inspect')).pouchShape, undefined);
    await call ('view.focus', { objectId : standup.objectId }); await page.waitForTimeout (800); await page.screenshot ({ path : 'work/primary-products-review/standup-pouch.png' });
    await call ('view.focus', { objectId : rectangular.objectId }); await page.waitForTimeout (800); await page.screenshot ({ path : 'work/primary-products-review/rectangular-bottle.png' });
    await call ('primary.designs.open', { category : 'beverages', open : true }); await drawer.waitFor ({ state : 'visible' });
    await page.screenshot ({ path : 'work/primary-products-review/design-drawer-wide.png' });
    await call ('primary.designs.open', { category : 'beverages', open : false }); await drawer.waitFor ({ state : 'hidden' }); assert.deepEqual (errors, []);
    console.log ('Design drawer: ten-column equal cards, 30% shorter, W/L/H callouts, card generation, Enter live resize with Undo, Tab draft-only and primary.dimensions.set passed.');
    console.log ('W × L × H, material swatch, local image import, rendered labels and physical-fit validation passed.');
    console.log ('Generate readiness and pillow-pouch generation/layout passed.');
    console.log ('Primary Products scene flow passed: UI generation, strict update/load, identity, Undo/Redo and clear glass generation.');
    console.log ('Primary Products desktop/mobile passed: module order/outline, lazy loading, draft controls, minimal/extended/close motion, rapid transitions, reduced motion, unit conversion and unchanged scene/camera.');
} finally { await browser.close (); }
